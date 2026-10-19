import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import * as THREE from 'three';

import { initPhysics, Race, DT, MAX_TICKS } from '../shared/sim.js';
import { buildTrack, trackById } from '../shared/track.js';
import { CHEESES } from '../shared/cheeses.js';
import { botInput } from '../shared/bot.js';
import { encodeInputs, encodeFrames, decodeFrames } from '../shared/inputs.js';
import { createScene } from './render/scene.js';
import { buildWorld } from './render/terrain.js';
import { createCheese, createGhost, createBale } from './render/cheese.js';
import { createParticles } from './render/particles.js';
import { createChaseCam } from './render/camera.js';
import { createInput } from './input.js';
import { audio } from './audio.js';
import { api, local } from './api.js';
import { $, fmt, renderTracks, renderCheeses, renderBoard, toast, center, show } from './ui.js';

// ---------- Zustand ----------
const app = {
  state: 'loading', // menu | countdown | race | paused | finish
  tracks: [],
  trackId: local.get('track', 'coopers-hill'),
  cheese: local.get('cheese', 'gloucester'),
  name: local.get('name', `Laib ${Math.floor(1000 + Math.random() * 9000)}`),
  ghostMode: local.get('ghostMode', 'best'),
  ghostPick: null, // gezielt aus der Bestenliste gewählter Ghost
  boardCheese: null,
};
local.set('name', app.name);

const view = createScene($('#stage'));
const cam = createChaseCam(view.camera);
const particles = createParticles(view.scene);
const input = createInput({ onKey });

let track = null;
let world = null;
const trackCache = new Map();

// Laufende Sitzung (Rennen oder Menü-Vorführung)
let race = null;
let cheeseMesh = null;
let baleMeshes = [];
let ghost = null; // { mesh, frames, splits, timeMs, name }
let log = [];
let frames = [];
let splits = [];
let demo = false;
let countdownAt = 0;
let finishInfo = null;
const prev = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
const cur = { p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3() };

// ---------- Strecke laden ----------
function useTrack(id) {
  if (track?.id === id) return;
  if (!trackCache.has(id)) trackCache.set(id, buildTrack(trackById(id)));
  track = trackCache.get(id);
  world?.dispose();
  world = buildWorld(view.scene, track);
}

function clearSession() {
  if (race) race.free();
  race = null;
  if (cheeseMesh) view.scene.remove(cheeseMesh);
  for (const m of baleMeshes) view.scene.remove(m);
  baleMeshes = [];
  if (ghost) view.scene.remove(ghost.mesh);
  ghost = null;
  particles.clear();
}

function newSession({ isDemo }) {
  clearSession();
  demo = isDemo;
  race = new Race(track, app.cheese);
  cheeseMesh = createCheese(CHEESES[app.cheese]);
  view.scene.add(cheeseMesh);
  baleMeshes = track.bales.map((b) => {
    const m = createBale(b);
    view.scene.add(m);
    return m;
  });
  log = [];
  frames = [];
  splits = [];
  finishInfo = null;
  input.reset();
  cam.reset();
  snapshot();
  prev.p.copy(cur.p);
  prev.q.copy(cur.q);
  syncBales();
}

function snapshot() {
  const { p, q, v } = race.transform();
  prev.p.copy(cur.p);
  prev.q.copy(cur.q);
  cur.p.set(p.x, p.y, p.z);
  cur.q.set(q.x, q.y, q.z, q.w);
  cur.v.set(v.x, v.y, v.z);
}

function syncBales() {
  race.bales.forEach((b, i) => {
    const t = b.translation();
    const r = b.rotation();
    baleMeshes[i].position.set(t.x, t.y, t.z);
    baleMeshes[i].quaternion.set(r.x, r.y, r.z, r.w);
  });
}

// ---------- Ghost ----------
function ghostSplits(fr) {
  // Zeit, zu der der Ghost jeden Kontrollpunkt passiert (Frame k liegt bei Tick 2(k+1))
  const out = [];
  let k = 0;
  for (const cp of track.checkpoints) {
    while (k * 7 < fr.length && fr[k * 7 + 2] < cp.z) k++;
    out.push(k * 7 < fr.length ? (k + 1) * 2 * DT : null);
  }
  return out;
}

async function loadGhost() {
  if (app.ghostMode === 'off' && !app.ghostPick) return null;
  try {
    let g = null;
    if (app.ghostPick && app.ghostPick.track === track.id) {
      g = await api.ghost(app.ghostPick.id);
    } else if (app.ghostMode === 'own') {
      const b = local.best(track.id, app.cheese) ?? local.bestAny(track.id);
      if (b?.frames) g = { frames: b.frames, name: 'Du', own: true, cheese: b.cheese ?? app.cheese, timeMs: b.timeMs };
    } else {
      g = await api.topGhost(track.id).catch(() => null);
      if (!g) {
        const b = local.bestAny(track.id);
        if (b?.frames) g = { frames: b.frames, name: 'Du', own: true, cheese: b.cheese, timeMs: b.timeMs };
      }
    }
    if (!g) return null;
    const fr = decodeFrames(g.frames);
    return { frames: fr, name: g.name, own: !!g.own, cheese: g.cheese, timeMs: g.timeMs, splits: ghostSplits(fr) };
  } catch {
    return null;
  }
}

function placeGhost(tick) {
  if (!ghost) return;
  const fr = ghost.frames;
  const n = fr.length / 7;
  const f = Math.max(0, Math.min(n - 1, tick / 2 - 1));
  const a = Math.floor(f);
  const b = Math.min(n - 1, a + 1);
  const t = f - a;
  const m = ghost.mesh;
  m.position.set(fr[a * 7] + (fr[b * 7] - fr[a * 7]) * t, fr[a * 7 + 1] + (fr[b * 7 + 1] - fr[a * 7 + 1]) * t, fr[a * 7 + 2] + (fr[b * 7 + 2] - fr[a * 7 + 2]) * t);
  const qa = new THREE.Quaternion(fr[a * 7 + 3], fr[a * 7 + 4], fr[a * 7 + 5], fr[a * 7 + 6]);
  const qb = new THREE.Quaternion(fr[b * 7 + 3], fr[b * 7 + 4], fr[b * 7 + 5], fr[b * 7 + 6]);
  m.quaternion.slerpQuaternions(qa, qb, t);
  // Nah am eigenen Käse ausblenden, damit er nicht die Sicht verdeckt
  const d = m.position.distanceTo(cheeseMesh.position);
  m.material.opacity = 0.38 * Math.min(1, Math.max(0, (d - 0.8) / 2.5));
  m.visible = tick > 0 || d > 1;
  ghost.z = m.position.z;
}

const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- Ablauf ----------
let raceToken = 0;
async function startRace() {
  const token = ++raceToken;
  audio.unlock();
  app.state = 'countdown';
  show('#menu', false);
  show('#finish', false);
  show('#pause', false);
  show('#hud');
  input.showTouch(true);
  useTrack(app.trackId);
  newSession({ isDemo: false });
  const g = await loadGhost();
  if (token !== raceToken) return;
  if (g) {
    ghost = { ...g, mesh: createGhost(CHEESES[g.cheese] ?? CHEESES.gloucester) };
    view.scene.add(ghost.mesh);
    placeGhost(0);
  }
  $('#hud-track-name').textContent = track.name;
  $('#hud-time').textContent = fmt(0);
  $('#hud-delta').className = 'delta';
  $('#hud-respawns').textContent = '';
  $('#hud-ghost-progress').style.display = ghost ? 'block' : 'none';
  countdownAt = performance.now();
  chantStep = -1;
}

const CHANT = [
  ['One', 'to be ready'],
  ['Two', 'to be steady'],
  ['Three', 'to prepare'],
  ['Four', 'to be off!'],
];
let chantStep = -1;
function updateCountdown(now) {
  const t = (now - countdownAt) / 1000;
  const step = Math.floor(t / 0.75);
  if (step !== chantStep && step < CHANT.length) {
    chantStep = step;
    center(...CHANT[step]);
    audio.beep(step === CHANT.length - 1);
    if (step === CHANT.length - 1) audio.cheer(0.6);
  }
  if (t >= 0.75 * (CHANT.length - 1) + 0.25 && app.state === 'countdown') {
    app.state = 'race';
    acc = 0;
    setTimeout(() => app.state === 'race' && center(''), 700);
  }
}

function finishRace() {
  app.state = 'finish';
  input.showTouch(false);
  const timeMs = Math.round(race.finishTime * 1000);
  audio.cheer(1.4);
  const prevBest = local.best(track.id, app.cheese);
  const isPb = !prevBest || timeMs < prevBest.timeMs;
  if (isPb) local.setBest(track.id, app.cheese, { timeMs, cheese: app.cheese, frames: encodeFrames(frames), splits });
  finishInfo = { timeMs, isPb, vsGhost: ghost?.timeMs != null ? timeMs - ghost.timeMs : null };
  setTimeout(() => showFinish(timeMs, isPb), 900);
}

async function showFinish(timeMs, isPb) {
  if (app.state !== 'finish') return;
  show('#finish');
  $('#finish-time').textContent = fmt(timeMs);
  $('#finish-kicker').textContent = `${track.name} · ${CHEESES[app.cheese].name}`;
  const meta = [];
  if (isPb) meta.push('<span class="hot">Persönliche Bestzeit</span>');
  if (finishInfo.vsGhost != null) {
    const d = finishInfo.vsGhost;
    const who = ghost.own ? 'eigener Ghost' : `Ghost ${ghost.name}`;
    const label = Math.abs(d) < 5 ? `Gleichauf mit ${who}` : `${who} ${fmt(d, { sign: true })}`;
    meta.push(`<span${d < 0 ? ' class="hot"' : ''}>${escapeHtml(label)}</span>`);
  }
  if (race.respawns) meta.push(`<span>${race.respawns}× zurückgesetzt</span>`);
  const metaEl = $('#finish-meta');
  metaEl.innerHTML = meta.join('');
  const board = $('#finish-board');
  board.innerHTML = '<li class="gap">Lauf wird geprüft …</li>';
  try {
    const res = await api.submit({ track: track.id, cheese: app.cheese, name: app.name, inputs: encodeInputs(log), timeMs });
    metaEl.insertAdjacentHTML('afterbegin', `<span class="hot">Platz ${res.rank}</span>`);
    if (res.desync) metaEl.insertAdjacentHTML('beforeend', `<span>Server: ${fmt(res.timeMs)}</span>`);
    const lb = await api.leaderboard(track.id, { name: app.name, limit: 50 });
    renderBoard(board, lb.entries, { me: app.name, limit: 8, personalBestMs: lb.personalBestMs });
    refreshTracks();
  } catch (err) {
    board.innerHTML = `<li class="gap">${err.status ? err.message : 'Offline – Zeit nur lokal gespeichert'}</li>`;
  }
}

function toMenu() {
  app.state = 'menu';
  show('#hud', false);
  show('#finish', false);
  show('#pause', false);
  show('#menu');
  input.showTouch(false);
  center('');
  audio.silence();
  useTrack(app.trackId);
  newSession({ isDemo: true });
  refreshBoard();
}

function togglePause() {
  if (app.state === 'race') {
    app.state = 'paused';
    show('#pause');
    audio.silence();
  } else if (app.state === 'paused') {
    app.state = 'race';
    show('#pause', false);
    acc = 0;
  }
}

function onKey(code, e) {
  if (code === 'Escape') {
    if (app.state === 'race' || app.state === 'paused') togglePause();
    else if (app.state === 'finish') toMenu();
  } else if (code === 'Enter' || code === 'GamepadStart') {
    if (app.state === 'menu') {
      e?.target?.blur?.();
      startRace();
    } else if (app.state === 'finish') startRace();
    else if (app.state === 'paused') togglePause();
  } else if (code === 'Backspace') {
    if (app.state === 'race' || app.state === 'paused' || app.state === 'finish') startRace();
  }
}

for (const el of document.querySelectorAll('[data-act]')) {
  el.addEventListener('click', () => {
    const a = el.dataset.act;
    if (a === 'resume') togglePause();
    else if (a === 'restart') startRace();
    else if (a === 'menu') toMenu();
  });
}
$('#start').onclick = () => startRace();

// ---------- Menü ----------
const nameEl = $('#name');
nameEl.value = app.name;
nameEl.addEventListener('input', () => {
  const v = nameEl.value.replace(/\s+/g, ' ').trim();
  if (v) {
    app.name = v;
    local.set('name', v);
  }
});
const ghostEl = $('#ghost-mode');
ghostEl.value = app.ghostMode;
ghostEl.addEventListener('change', () => {
  if (ghostEl.value.startsWith('pick')) return;
  app.ghostPick = null;
  ghostEl.querySelector('option[value^="pick"]')?.remove();
  app.ghostMode = ghostEl.value;
  local.set('ghostMode', app.ghostMode);
});

function pickGhost(entry) {
  app.ghostPick = { id: entry.id, track: app.trackId };
  ghostEl.querySelector('option[value^="pick"]')?.remove();
  const o = document.createElement('option');
  o.value = `pick-${entry.id}`;
  o.textContent = `Ghost: ${entry.name} (${fmt(entry.timeMs)})`;
  ghostEl.appendChild(o);
  ghostEl.value = o.value;
}

async function refreshTracks() {
  const data = await api.tracks();
  app.tracks = data.tracks;
  if (!app.tracks.some((t) => t.id === app.trackId)) app.trackId = app.tracks[0].id;
  drawTracks();
}

function drawTracks() {
  renderTracks($('#track-list'), app.tracks, app.trackId, (id) => local.bestAny(id), (id) => {
    if (id === app.trackId) return;
    app.trackId = id;
    local.set('track', id);
    app.ghostPick = null;
    ghostEl.querySelector('option[value^="pick"]')?.remove();
    ghostEl.value = app.ghostMode;
    drawTracks();
    useTrack(id);
    newSession({ isDemo: true });
    refreshBoard();
  });
}

function drawCheeses() {
  renderCheeses($('#cheese-list'), app.cheese, (id) => {
    app.cheese = id;
    local.set('cheese', id);
    drawCheeses();
    newSession({ isDemo: true });
  });
}

async function refreshBoard() {
  const t = app.tracks.find((x) => x.id === app.trackId);
  $('#board-title').textContent = t ? t.name : 'Bestenliste';
  const filter = $('#board-filter');
  filter.innerHTML = '';
  for (const [id, label] of [[null, 'Alle'], ...Object.values(CHEESES).map((c) => [c.id, c.name])]) {
    const b = document.createElement('button');
    b.textContent = label;
    if (id === app.boardCheese) b.className = 'selected';
    b.onclick = () => ((app.boardCheese = id), refreshBoard());
    filter.appendChild(b);
  }
  const status = $('#board-status');
  const board = $('#board');
  try {
    const lb = await api.leaderboard(app.trackId, { cheese: app.boardCheese, name: app.name, limit: 50 });
    renderBoard(board, lb.entries, { me: app.name, onGhost: pickGhost, limit: 12, personalBestMs: lb.personalBestMs });
    status.textContent = lb.entries.length ? 'Jeder Lauf wird auf dem Server nachgefahren und geprüft.' : 'Noch niemand im Ziel. Sei der Erste!';
  } catch {
    board.innerHTML = '';
    status.textContent = 'Server nicht erreichbar – Bestzeiten werden nur lokal gespeichert.';
  }
}

// ---------- Hauptschleife ----------
let acc = 0;
let last = performance.now();
const clock0 = performance.now();
const tmpV = new THREE.Vector3();

function stepOnce() {
  let inp;
  if (demo) {
    inp = botInput(race, { aggression: 0.9 });
  } else {
    inp = app.autopilot ? botInput(race) : input.sample(DT);
    log.push(inp);
  }
  race.step(inp.steer, inp.flags);
  if (!demo && race.tick % 2 === 0) {
    const { p, q } = race.transform();
    frames.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
  }
  snapshot();
  handleEvents();
  // Rollspur: Gras fliegt
  if (race.grounded && Math.random() < Math.min(1, cur.v.length() / 30)) {
    tmpV.set(cur.p.x, cur.p.y - race.cheese.radius + 0.1, cur.p.z);
    particles.emit(tmpV, cur.v, 1, 0.8);
  }
  if (demo && (race.finished || race.tick > 60 * 45)) newSession({ isDemo: true });
  else if (!demo && race.finished) finishRace();
  else if (!demo && race.tick >= MAX_TICKS) {
    toast('Zeit abgelaufen', 2500);
    toMenu();
  }
}

function handleEvents() {
  for (const e of race.events) {
    if (e.type === 'impact') {
      if (!demo) {
        audio.impact(e.strength);
        cam.bump(e.strength);
      }
      if (e.strength > 4) particles.emit({ x: e.x, y: e.y - 0.3, z: e.z }, cur.v, Math.min(30, e.strength * 2), 2);
    } else if (demo) continue;
    else if (e.type === 'jump' || e.type === 'flip') {
      input.jumped();
      audio.whoosh();
      if (e.type === 'flip') toast('Aufgestellt!');
    } else if (e.type === 'respawn') {
      toast('Zurückgesetzt');
      $('#hud-respawns').textContent = `↺ ${race.respawns}`;
      cam.reset();
      prev.p.copy(cur.p);
      prev.q.copy(cur.q);
    } else if (e.type === 'checkpoint') {
      splits[e.index] = race.tick * DT;
      const ref = ghost?.splits?.[e.index];
      if (ref != null) {
        const d = (race.tick * DT - ref) * 1000;
        const el = $('#hud-delta');
        el.textContent = fmt(d, { sign: true });
        el.className = `delta show ${d <= 0 ? 'ahead' : 'behind'}`;
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 2500);
      }
      audio.cheer(0.3);
    }
  }
  race.events.length = 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = (now - clock0) / 1000;

  if (app.state === 'countdown') updateCountdown(now);

  const running = race && (app.state === 'race' || (app.state === 'menu' && demo));
  if (running) {
    acc += dt;
    let n = 0;
    while (acc >= DT && n++ < 8) {
      acc -= DT;
      stepOnce();
      if (app.state !== 'race' && !(app.state === 'menu' && demo)) break;
    }
    if (acc > DT * 8) acc = 0;
  } else if (race && app.state === 'finish') {
    // Nach dem Ziel rollt der Käse frei aus (gehört nicht mehr zum gewerteten Lauf)
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      race.world.step();
      snapshot();
    }
  }

  if (race && cheeseMesh) {
    const alpha = running || app.state === 'finish' ? Math.min(1, acc / DT) : 1;
    cheeseMesh.position.lerpVectors(prev.p, cur.p, alpha);
    cheeseMesh.quaternion.slerpQuaternions(prev.q, cur.q, alpha);
    syncBales();
    placeGhost(race.tick + (running ? alpha : 0));
    const groundAt = world.groundAt;
    cam.update(dt, cheeseMesh.position, cur.v, groundAt, app.state === 'menu' ? 'orbit' : 'chase', time);
    view.followSun(cheeseMesh.position);
    const speed = cur.v.length();
    world.update(time, cheeseMesh.position, speed);
    particles.update(dt);

    if (app.state === 'race' || app.state === 'countdown' || app.state === 'finish') {
      const t = app.state === 'finish' ? race.finishTime : race.tick * DT;
      $('#hud-time').textContent = fmt(t * 1000);
      $('#hud-speed').textContent = app.state === 'countdown' ? 0 : Math.round(speed * 3.6);
      const span = track.finishZ - track.start.z;
      $('#hud-progress').style.width = `${Math.max(0, Math.min(1, (cur.p.z - track.start.z) / span)) * 100}%`;
      if (ghost) $('#hud-ghost-progress').style.left = `${Math.max(0, Math.min(1, (ghost.z - track.start.z) / span)) * 100}%`;
      const crowdLevel = Math.min(1, speed / 25) * (track.finishZ - cur.p.z < 40 ? 1 : 0.5);
      if (app.state === 'race') audio.update({ speed, grounded: race.grounded, crowdLevel });
      else if (app.state === 'finish') audio.update({ speed: speed * 0.5, grounded: race.grounded, crowdLevel: 0.6 });
    }
  }

  view.renderer.render(view.scene, view.camera);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.state === 'race') togglePause();
});

// ---------- Start ----------
async function boot() {
  await Promise.all([initPhysics(), document.fonts?.load('800 40px "Barlow Condensed"').catch(() => {})]);
  await refreshTracks();
  drawCheeses();
  toMenu();
  requestAnimationFrame(frame);
  $('#loading').classList.add('done');
  setTimeout(() => $('#loading').remove(), 600);
}

// Für automatisierte Tests im Browser
window.__glide = {
  get state() {
    return app.state;
  },
  get race() {
    return race;
  },
  app,
  startRace,
  toMenu,
};

boot().catch((err) => {
  console.error(err);
  $('#loading p').textContent = `Fehler beim Laden: ${err.message}`;
});
