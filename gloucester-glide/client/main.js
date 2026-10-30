import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import * as THREE from 'three';

import { initPhysics, Race, DT, MAX_TICKS, SURFACES } from '../shared/sim.js';
import { buildTrack, trackById } from '../shared/track.js';
import { CHEESES } from '../shared/cheeses.js';
import { botInput } from '../shared/bot.js';
import { encodeInputs, encodeFrames, decodeFrames } from '../shared/inputs.js';
import { createScene } from './render/scene.js';
import { buildWorld } from './render/terrain.js';
import { buildEverestWorld } from './render/everest.js';
import { createCheese, createGhost, createBale, damageCheese, createShards, disposeCheese } from './render/cheese.js';
import { createParticles } from './render/particles.js';
import { createChaseCam } from './render/camera.js';
import { createInput } from './input.js';
import { audio } from './audio.js';
import { api, local } from './api.js';
import { $, fmt, renderTracks, renderCheeses, renderBoard, toast, center, show } from './ui.js';

const randomName = () => `Laib ${Math.floor(1000 + Math.random() * 9000)}`;

// ---------- Zustand ----------
const app = {
  state: 'loading', // menu | countdown | race | paused | finish
  tracks: [],
  trackId: local.get('track', 'coopers-hill'),
  mode: local.get('mode', 1), // 1 oder 2 Spieler
  slot: 0, // für welchen Spieler im Menü der Käse gewählt wird
  players: [
    { name: local.get('name', randomName()), cheese: local.get('cheese', 'gloucester') },
    { name: local.get('name2', randomName()), cheese: local.get('cheese2', 'emmentaler') },
  ],
  ghostMode: local.get('ghostMode', 'best'),
  ghostPick: null, // gezielt aus der Bestenliste gewählter Ghost
  boardCheese: null,
};
local.set('name', app.players[0].name);
local.set('name2', app.players[1].name);

// Auf Handys weniger Gras, Bäume und Schattenauflösung
const quality = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700 ? 0.5 : 1;
const stage = $('#stage');
const view = createScene(stage, { quality });
const particles = createParticles(view.scene);
const input = createInput({ onKey });

let track = null;
let world = null;
const trackCache = new Map();

let players = []; // laufende Sitzung: ein oder zwei Spieler (im Menü: ein Bot)
let demo = false;
let ghost = null; // nur im Einzelspieler: { mesh, frames, every, splits, timeMs, name }
let countdownAt = 0;
let acc = 0;

// ---------- Strecke laden ----------
function useTrack(id) {
  if (track?.id === id) return;
  if (!trackCache.has(id)) trackCache.set(id, buildTrack(trackById(id)));
  track = trackCache.get(id);
  world?.dispose();
  const theme = view.setTheme(track.theme);
  world = track.theme === 'everest' ? buildEverestWorld(view.scene, track, { quality }) : buildWorld(view.scene, track, { quality });
  view.camera.far = theme.far;
  view.camera.updateProjectionMatrix();
}

// ---------- Spieler ----------
const hudTemplate = $('#hud-player');

function makeHud(slot) {
  const el = hudTemplate.content.firstElementChild.cloneNode(true);
  el.dataset.slot = slot;
  $('#hud-players').appendChild(el);
  const q = (c) => el.querySelector(c);
  return {
    el,
    name: q('.h-name'),
    zone: q('.h-zone'),
    progress: q('.h-progress'),
    other: q('.h-other'),
    time: q('.h-time'),
    delta: q('.h-delta'),
    respawns: q('.h-respawns'),
    surface: q('.h-surface'),
    speed: q('.h-speed'),
    integrity: q('.h-integrity'),
    toast: q('.h-toast'),
    banner: q('.h-banner'),
  };
}

class Player {
  constructor(slot, cfg, { isDemo, scheme, split }) {
    this.slot = slot;
    this.name = cfg.name;
    this.cheeseId = cfg.cheese;
    this.race = new Race(track, cfg.cheese);
    this.mesh = createCheese(CHEESES[cfg.cheese]);
    view.scene.add(this.mesh);
    // Jede Simulation hat eigene, bewegliche Ballen – gezeigt werden in jeder Ansicht die eigenen
    this.bales = track.bales.map((b) => {
      const m = createBale(b);
      view.scene.add(m);
      return m;
    });
    this.camera = split ? new THREE.PerspectiveCamera(66, 1, 0.3, view.theme.far) : view.camera;
    this.cam = createChaseCam(this.camera, { fov: split ? 68 : 60 });
    this.input = isDemo ? null : input.createSampler(scheme);
    this.hud = isDemo ? null : makeHud(slot);
    this.state = 'racing'; // racing | finished | broken | timeout
    this.prev = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.cur = { p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3() };
    this.log = [];
    this.frames = [];
    this.splits = [];
    this.shards = null;
    this.zone = null;
    this.result = null;
    this.snapshot();
    this.prev.p.copy(this.cur.p);
    this.prev.q.copy(this.cur.q);
    this.syncBales();
    if (this.hud) {
      this.hud.name.textContent = split ? `${slot + 1} · ${cfg.name}` : track.name;
      this.setIntegrity(1, false);
    }
  }

  snapshot() {
    const { p, q, v } = this.race.transform();
    this.prev.p.copy(this.cur.p);
    this.prev.q.copy(this.cur.q);
    this.cur.p.set(p.x, p.y, p.z);
    this.cur.q.set(q.x, q.y, q.z, q.w);
    this.cur.v.set(v.x, v.y, v.z);
  }

  syncBales() {
    this.race.bales.forEach((b, i) => {
      const t = b.translation();
      const r = b.rotation();
      this.bales[i].position.set(t.x, t.y, t.z);
      this.bales[i].quaternion.set(r.x, r.y, r.z, r.w);
    });
  }

  setIntegrity(value, flash) {
    const el = this.hud?.integrity;
    if (!el) return;
    const pct = Math.round(value * 100);
    el.querySelector('b').style.width = `${pct}%`;
    el.querySelector('span').textContent = `${pct} %`;
    el.dataset.level = pct > 60 ? 'ok' : pct > 30 ? 'warn' : 'bad';
    if (flash) {
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }
  }

  get done() {
    return this.state !== 'racing';
  }

  dispose() {
    this.race.free();
    view.scene.remove(this.mesh);
    disposeCheese(this.mesh);
    for (const m of this.bales) view.scene.remove(m);
    this.shards?.dispose();
    this.input?.dispose();
    this.hud?.el.remove();
  }
}

function clearSession() {
  for (const p of players) p.dispose();
  players = [];
  if (ghost) view.scene.remove(ghost.mesh);
  ghost = null;
  particles.clear();
}

function newSession({ isDemo }) {
  clearSession();
  demo = isDemo;
  const count = isDemo ? 1 : app.mode;
  const split = count > 1;
  document.body.classList.toggle('mode-2', app.mode === 2);
  document.body.classList.toggle('mode-1', app.mode !== 2);
  for (let i = 0; i < count; i++) {
    const scheme = split ? `p${i + 1}` : 'solo';
    players.push(new Player(i, app.players[i], { isDemo, scheme, split }));
  }
  show('#split-line', split && !isDemo);
  layoutCameras();
}

function layoutCameras() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  for (const p of players) {
    p.camera.aspect = players.length > 1 ? w / 2 / h : w / h;
    p.camera.far = view.theme.far;
    p.camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', layoutCameras);

// ---------- Ghost (nur Einzelspieler) ----------
function ghostSplits(fr, every) {
  // Zeit, zu der der Ghost jeden Kontrollpunkt passiert (Frame k liegt bei Tick every·(k+1))
  const out = [];
  let k = 0;
  for (const cp of track.checkpoints) {
    while (k * 7 < fr.length && fr[k * 7 + 2] < cp.z) k++;
    out.push(k * 7 < fr.length ? (k + 1) * every * DT : null);
  }
  return out;
}

async function loadGhost() {
  if (app.ghostMode === 'off' && !app.ghostPick) return null;
  const cheese = app.players[0].cheese;
  const fromLocal = (b) => (b?.frames ? { frames: b.frames, every: b.every ?? track.ghostEvery, name: 'Du', own: true, cheese: b.cheese ?? cheese, timeMs: b.timeMs } : null);
  try {
    let g = null;
    if (app.ghostPick && app.ghostPick.track === track.id) g = await api.ghost(app.ghostPick.id);
    else if (app.ghostMode === 'own') g = fromLocal(local.best(track.id, cheese) ?? local.bestAny(track.id));
    else g = (await api.topGhost(track.id).catch(() => null)) ?? fromLocal(local.bestAny(track.id));
    if (!g) return null;
    const fr = decodeFrames(g.frames);
    const every = g.every ?? 2;
    return { frames: fr, every, name: g.name, own: !!g.own, cheese: g.cheese, timeMs: g.timeMs, splits: ghostSplits(fr, every) };
  } catch {
    return null;
  }
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
function placeGhost(tick) {
  if (!ghost) return;
  const fr = ghost.frames;
  const n = fr.length / 7;
  const f = Math.max(0, Math.min(n - 1, tick / ghost.every - 1));
  const a = Math.floor(f);
  const b = Math.min(n - 1, a + 1);
  const t = f - a;
  const m = ghost.mesh;
  m.position.set(fr[a * 7] + (fr[b * 7] - fr[a * 7]) * t, fr[a * 7 + 1] + (fr[b * 7 + 1] - fr[a * 7 + 1]) * t, fr[a * 7 + 2] + (fr[b * 7 + 2] - fr[a * 7 + 2]) * t);
  _qa.set(fr[a * 7 + 3], fr[a * 7 + 4], fr[a * 7 + 5], fr[a * 7 + 6]);
  _qb.set(fr[b * 7 + 3], fr[b * 7 + 4], fr[b * 7 + 5], fr[b * 7 + 6]);
  m.quaternion.slerpQuaternions(_qa, _qb, t);
  // Nah am eigenen Käse ausblenden, damit er nicht die Sicht verdeckt
  const d = m.position.distanceTo(players[0].mesh.position);
  m.material.opacity = 0.38 * Math.min(1, Math.max(0, (d - 0.8) / 2.5));
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
  input.showTouch(app.mode === 1);
  useTrack(app.trackId);
  newSession({ isDemo: false });
  center('');
  countdownAt = Infinity; // erst nach dem Laden des Ghosts loszählen
  if (app.mode === 1) {
    const g = await loadGhost();
    if (token !== raceToken) return;
    if (g) {
      ghost = { ...g, mesh: createGhost(CHEESES[g.cheese] ?? CHEESES.gloucester) };
      view.scene.add(ghost.mesh);
      placeGhost(0);
    }
  }
  for (const p of players) {
    const other = app.mode === 2 ? players[1 - p.slot] : null;
    p.hud.other.style.display = ghost || other ? 'block' : 'none';
    p.hud.other.classList.toggle('other', !!other);
    p.hud.other.title = other ? other.name : ghost ? `Ghost ${ghost.name}` : '';
  }
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
  if (t < 0) return;
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

// Ein Spieler ist im Ziel
function playerFinished(p) {
  p.state = 'finished';
  const timeMs = Math.round(p.race.finishTime * 1000);
  p.result = { timeMs, integrity: p.race.integrity, respawns: p.race.respawns };
  audio.cheer(1.4);
  if (app.mode === 1) {
    const prevBest = local.best(track.id, p.cheeseId);
    p.result.isPb = !prevBest || timeMs < prevBest.timeMs;
    if (p.result.isPb) local.setBest(track.id, p.cheeseId, { timeMs, cheese: p.cheeseId, frames: encodeFrames(p.frames), every: track.ghostEvery, splits: p.splits });
    p.result.vsGhost = ghost?.timeMs != null ? timeMs - ghost.timeMs : null;
  } else {
    const other = players[1 - p.slot];
    const first = !other.result || other.state !== 'finished';
    p.hud.banner.innerHTML = `${first ? 'Erster!' : 'Im Ziel'}<small>${fmt(timeMs)}</small>`;
  }
  // Lauf einreichen (der Server fährt ihn nach)
  p.submission = api
    .submit({ track: track.id, cheese: p.cheeseId, name: p.name, inputs: encodeInputs(p.log), timeMs })
    .then((res) => (p.result.server = res))
    .catch((err) => (p.result.error = err.status ? err.message : 'Offline – Zeit nur lokal gespeichert'));
  checkAllDone();
}

function playerBroken(p) {
  p.state = 'broken';
  p.result = { broken: true, timeMs: Math.round(p.race.tick * DT * 1000), dist: p.cur.p.z - track.start.z };
  audio.crack(1);
  audio.cheer(0.5);
  p.cam.bump(30);
  p.shards = createShards(view.scene, p.mesh, p.cur.v, world.groundAt);
  p.mesh.visible = false;
  for (let i = 0; i < 3; i++) particles.emit(p.cur.p, p.cur.v, 40, 3, CHEESES[p.cheeseId].paste);
  const msg = `nach ${Math.round(p.result.dist)} m`;
  if (app.mode === 1) center('Zerbrochen!', msg);
  else p.hud.banner.innerHTML = `Zerbrochen!<small>${msg}</small>`;
  checkAllDone();
}

function playerTimeout(p) {
  p.state = 'timeout';
  p.result = { broken: true, timeout: true, timeMs: MAX_TICKS * DT * 1000, dist: p.cur.p.z - track.start.z };
  if (p.hud) p.hud.banner.innerHTML = 'Zeit abgelaufen';
  checkAllDone();
}

function checkAllDone() {
  if (!players.every((p) => p.done)) return;
  app.state = 'finish';
  input.showTouch(false);
  const token = raceToken;
  setTimeout(() => token === raceToken && app.state === 'finish' && (app.mode === 1 ? showSolo(players[0]) : showDuel()), app.mode === 1 && players[0].state === 'finished' ? 900 : 1600);
}

async function showSolo(p) {
  show('#finish');
  show('#finish-duel', false);
  const timeEl = $('#finish-time');
  const metaEl = $('#finish-meta');
  const board = $('#finish-board');
  $('#finish-kicker').textContent = `${track.name} · ${CHEESES[p.cheeseId].name}`;
  if (p.state !== 'finished') {
    center('');
    timeEl.textContent = p.result.timeout ? 'Zeit abgelaufen' : 'Laib zerbrochen';
    timeEl.classList.add('small');
    metaEl.innerHTML = `<span>nach ${fmt(p.result.timeMs)}</span><span>${Math.round((p.result.dist / (track.finishZ - track.start.z)) * 100)} % der Strecke</span>`;
    board.innerHTML = '<li class="gap">Tipp: Felsen und Ballen kosten am meisten. Flach aufschlagen auch – lieber rechtzeitig aufstellen.</li>';
    return;
  }
  const r = p.result;
  timeEl.textContent = fmt(r.timeMs);
  timeEl.classList.remove('small');
  const meta = [];
  if (r.isPb) meta.push('<span class="hot">Persönliche Bestzeit</span>');
  if (r.vsGhost != null) {
    const who = ghost.own ? 'eigener Ghost' : `Ghost ${ghost.name}`;
    const label = Math.abs(r.vsGhost) < 5 ? `Gleichauf mit ${who}` : `${who} ${fmt(r.vsGhost, { sign: true })}`;
    meta.push(`<span${r.vsGhost < 0 ? ' class="hot"' : ''}>${escapeHtml(label)}</span>`);
  }
  meta.push(`<span${r.integrity > 0.95 ? ' class="hot"' : ''}>Laib ${Math.round(r.integrity * 100)} %${r.integrity > 0.95 ? ' – fast wie neu' : ''}</span>`);
  if (r.respawns) meta.push(`<span>${r.respawns}× zurückgesetzt</span>`);
  metaEl.innerHTML = meta.join('');
  board.innerHTML = '<li class="gap">Lauf wird geprüft …</li>';
  await p.submission;
  if (r.error) return (board.innerHTML = `<li class="gap">${escapeHtml(r.error)}</li>`);
  metaEl.insertAdjacentHTML('afterbegin', `<span class="hot">Platz ${r.server.rank}</span>`);
  if (r.server.desync) metaEl.insertAdjacentHTML('beforeend', `<span>Server: ${fmt(r.server.timeMs)}</span>`);
  await showBoard(board, [p.name]);
}

async function showDuel() {
  show('#finish');
  const [a, b] = players;
  // Sieger: wer im Ziel ist und schneller war; sonst wer weiter kam
  const score = (p) => (p.state === 'finished' ? 1e9 - p.result.timeMs : p.result.dist);
  const diff = score(a) - score(b);
  const winner = Math.abs(diff) < 1e-6 ? null : diff > 0 ? a : b;
  $('#finish-kicker').textContent = track.name;
  const timeEl = $('#finish-time');
  timeEl.textContent = winner ? `${winner.name} gewinnt!` : 'Unentschieden!';
  timeEl.classList.add('small');
  const gap = a.state === 'finished' && b.state === 'finished' ? Math.abs(a.result.timeMs - b.result.timeMs) : null;
  $('#finish-meta').innerHTML = gap != null ? `<span class="hot">Vorsprung ${fmt(gap)}</span>` : '';
  const duel = $('#finish-duel');
  show('#finish-duel');
  const card = (p) => {
    const r = p.result;
    const C = CHEESES[p.cheeseId];
    const line =
      p.state === 'finished'
        ? `<div class="t">${fmt(r.timeMs)}</div><small>Laib ${Math.round(r.integrity * 100)} % · ${C.name}</small><small class="rank">Lauf wird geprüft …</small>`
        : `<div class="t">${p.state === 'timeout' ? 'Zeit um' : 'Zerbrochen'}</div><small>nach ${Math.round(r.dist)} m · ${C.name}</small>`;
    return `<div class="${p === winner ? 'win' : ''}"><strong>Spieler ${p.slot + 1} · ${escapeHtml(p.name)}</strong>${line}</div>`;
  };
  duel.innerHTML = card(a) + card(b);
  const board = $('#finish-board');
  board.innerHTML = '';
  await Promise.all(players.map((p) => p.submission));
  players.forEach((p, i) => {
    const el = duel.children[i]?.querySelector('.rank');
    if (!el) return;
    el.textContent = p.result.error ? p.result.error : `Platz ${p.result.server.rank} in der Bestenliste`;
  });
  await showBoard(board, players.map((p) => p.name));
}

async function showBoard(board, names) {
  try {
    const lb = await api.leaderboard(track.id, { name: names[0], limit: 50 });
    renderBoard(board, lb.entries, { me: names, limit: 8, personalBestMs: names.length === 1 ? lb.personalBestMs : null });
    refreshTracks();
  } catch {
    board.innerHTML = '';
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
    else if (app.state === 'paused' || (code === 'GamepadStart' && app.state === 'race')) togglePause();
  } else if (code === 'Backspace') {
    if (['race', 'paused', 'finish'].includes(app.state)) startRace();
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
const nameEls = [$('#name'), $('#name2')];
nameEls.forEach((el, i) => {
  el.value = app.players[i].name;
  el.addEventListener('input', () => {
    const v = el.value.replace(/\s+/g, ' ').trim();
    if (!v) return;
    app.players[i].name = v;
    local.set(i ? 'name2' : 'name', v);
  });
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

function setMode(mode) {
  app.mode = mode;
  local.set('mode', mode);
  if (mode === 1) app.slot = 0;
  document.body.classList.toggle('mode-2', mode === 2);
  document.body.classList.toggle('mode-1', mode !== 2);
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('selected', Number(b.dataset.mode) === mode));
  $('#start').firstChild.textContent = mode === 2 ? 'Los – zu zweit! ' : 'Los! ';
  drawCheeses();
}
document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(Number(b.dataset.mode))));
document.querySelectorAll('#slot-tabs [data-slot]').forEach(
  (b) =>
    (b.onclick = (e) => {
      e.preventDefault();
      app.slot = Number(b.dataset.slot);
      document.querySelectorAll('#slot-tabs [data-slot]').forEach((x) => x.classList.toggle('selected', x === b));
      drawCheeses();
    }),
);

function pickGhost(entry) {
  app.ghostPick = { id: entry.id, track: app.trackId };
  ghostEl.querySelector('option[value^="pick"]')?.remove();
  const o = document.createElement('option');
  o.value = `pick-${entry.id}`;
  o.textContent = `Ghost: ${entry.name} (${fmt(entry.timeMs)})`;
  ghostEl.appendChild(o);
  ghostEl.value = o.value;
  if (app.mode !== 1) setMode(1);
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
  const picks = app.mode === 2 ? app.players.map((p) => p.cheese) : [app.players[0].cheese];
  renderCheeses($('#cheese-list'), picks, app.slot, (id) => {
    app.players[app.slot].cheese = id;
    local.set(app.slot ? 'cheese2' : 'cheese', id);
    drawCheeses();
    if (app.slot === 0 && app.state === 'menu') newSession({ isDemo: true });
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
  const names = app.players.slice(0, app.mode).map((p) => p.name);
  try {
    const lb = await api.leaderboard(app.trackId, { cheese: app.boardCheese, name: names[0], limit: 50 });
    renderBoard(board, lb.entries, { me: names, onGhost: pickGhost, limit: 12, personalBestMs: lb.personalBestMs });
    status.textContent = lb.entries.length ? 'Jeder Lauf wird auf dem Server nachgefahren und geprüft.' : 'Noch niemand im Ziel. Sei der Erste!';
  } catch {
    board.innerHTML = '';
    status.textContent = 'Server nicht erreichbar – Bestzeiten werden nur lokal gespeichert.';
  }
}

// ---------- Hauptschleife ----------
let last = performance.now();
const clock0 = performance.now();
const tmpV = new THREE.Vector3();
const speedFx = $('#speedfx');

function stepPlayer(p) {
  const race = p.race;
  if (p.state === 'finished') {
    // Nach dem Ziel rollt der Käse frei aus (gehört nicht mehr zum gewerteten Lauf)
    race.world.step();
    p.snapshot();
    return;
  }
  if (p.state !== 'racing') return;
  let inp;
  if (demo) inp = botInput(race, { aggression: 0.9 });
  else {
    inp = app.autopilot ? botInput(race) : p.input.sample(DT);
    p.log.push(inp);
  }
  race.step(inp.steer, inp.flags);
  if (!demo && race.tick % track.ghostEvery === 0) {
    const { p: pos, q } = race.transform();
    p.frames.push(pos.x, pos.y, pos.z, q.x, q.y, q.z, q.w);
  }
  p.snapshot();
  handleEvents(p);
  // Rollspur: Gras, Schnee oder Kies fliegt
  if (race.grounded && Math.random() < Math.min(1, p.cur.v.length() / 30)) {
    tmpV.set(p.cur.p.x, p.cur.p.y - race.cheese.radius + 0.1, p.cur.p.z);
    particles.emit(tmpV, p.cur.v, 1, 0.8, world.dustColor?.(race.surface));
  }
  if (demo) {
    if (race.finished || race.broken || race.tick > 60 * 45) newSession({ isDemo: true });
    return;
  }
  if (race.finished) playerFinished(p);
  else if (race.broken) playerBroken(p);
  else if (race.tick >= MAX_TICKS) playerTimeout(p);
}

function handleEvents(p) {
  const race = p.race;
  for (const e of race.events) {
    if (e.type === 'impact') {
      if (!demo) {
        audio.impact(e.strength / players.length);
        p.cam.bump(e.strength);
      }
      if (e.strength > 4) particles.emit({ x: e.x, y: e.y - 0.3, z: e.z }, p.cur.v, Math.min(30, e.strength * 2), 2, world.dustColor?.(race.surface));
      if (e.damage > 0.004) {
        // Delle und Krümel an der Stelle, die den Boden bzw. das Hindernis getroffen hat
        p.mesh.position.copy(p.cur.p);
        p.mesh.quaternion.copy(p.cur.q);
        damageCheese(p.mesh, { x: e.nx, y: e.ny, z: e.nz }, e.damage);
        const R = race.cheese.radius;
        particles.emit({ x: e.x - e.nx * R, y: e.y - e.ny * R, z: e.z - e.nz * R }, p.cur.v, Math.round(6 + e.damage * 160), 1.6, race.cheese.paste);
        if (!demo) {
          audio.crack(e.damage);
          p.setIntegrity(race.integrity, true);
          if (e.damage > 0.06) toast(p.hud.toast, `Autsch! −${Math.round(e.damage * 100)} %`);
        }
      }
    } else if (demo) continue;
    else if (e.type === 'jump' || e.type === 'flip') {
      p.input.jumped();
      audio.whoosh();
      if (e.type === 'flip') toast(p.hud.toast, 'Aufgestellt!');
    } else if (e.type === 'crevasse') {
      toast(p.hud.toast, 'In die Spalte gefallen!', 2000);
    } else if (e.type === 'respawn') {
      if (!p.hud.toast.classList.contains('show')) toast(p.hud.toast, 'Zurückgesetzt');
      p.hud.respawns.textContent = `↺ ${race.respawns}`;
      p.cam.reset();
      p.prev.p.copy(p.cur.p);
      p.prev.q.copy(p.cur.q);
    } else if (e.type === 'checkpoint') {
      const t = race.tick * DT;
      p.splits[e.index] = t;
      if (ghost) {
        const ref = ghost.splits?.[e.index];
        if (ref != null) showDelta(p, (t - ref) * 1000);
      } else if (players.length > 1) {
        // Abstand zum anderen Spieler am selben Kontrollpunkt
        const other = players[1 - p.slot];
        const ref = other.splits[e.index];
        if (ref != null) {
          showDelta(p, (t - ref) * 1000);
          showDelta(other, (ref - t) * 1000);
        }
      }
      audio.cheer(0.3);
    }
  }
  race.events.length = 0;
}

function showDelta(p, ms) {
  const el = p.hud.delta;
  el.textContent = fmt(ms, { sign: true });
  el.className = `h-delta delta show ${ms <= 0 ? 'ahead' : 'behind'}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

function updateHud(p, time) {
  const h = p.hud;
  const race = p.race;
  const speed = p.cur.v.length();
  const t = p.state === 'finished' ? race.finishTime : race.tick * DT;
  h.time.textContent = fmt(t * 1000);
  h.speed.textContent = app.state === 'countdown' ? 0 : Math.round(speed * 3.6);
  const span = track.finishZ - track.start.z;
  const frac = (z) => `${Math.max(0, Math.min(1, (z - track.start.z) / span)) * 100}%`;
  h.progress.style.width = frac(p.cur.p.z);
  if (ghost) h.other.style.left = frac(ghost.z);
  else if (players.length > 1) h.other.style.left = frac(players[1 - p.slot].cur.p.z);
  // Expedition: Abschnitt und Höhe über dem Meer
  const zone = track.zoneAt(p.cur.p.z);
  if (zone) {
    const alt = Math.round(track.altitudeAt(p.cur.p.y));
    h.zone.textContent = `${zone.name} · ${alt.toLocaleString('de-DE')} m`;
    if (p.zone && p.zone !== zone && p.state === 'racing') toast(h.toast, zone.name, 2200);
    p.zone = zone;
  }
  // Untergrund-Hinweis (Eis, Schnee, Geröll)
  const s = track.surfaceAt && race.grounded && p.state === 'racing' && app.state === 'race' ? race.surface : 0;
  h.surface.classList.toggle('show', s !== 0);
  if (s !== 0) {
    h.surface.dataset.s = s;
    h.surface.textContent = SURFACES[s].name;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = (now - clock0) / 1000;
  input.poll();

  if (app.state === 'countdown') updateCountdown(now);

  const running = players.length && (app.state === 'race' || app.state === 'finish' || (app.state === 'menu' && demo));
  if (running) {
    acc += dt;
    let n = 0;
    const maxSteps = app.maxSteps ?? 8; // Tests im Software-Renderer drehen das hoch
    while (acc >= DT && n++ < maxSteps) {
      acc -= DT;
      const session = players;
      for (const p of session) stepPlayer(p);
      if (session !== players) break; // Demo neu gestartet
    }
    if (acc > DT * maxSteps) acc = 0;
  }
  if (!players.length) return;

  const alpha = running ? Math.min(1, acc / DT) : 1;
  let maxSpeed = 0;
  let grounded = false;
  let crowd = 0;
  const foci = [];
  for (const p of players) {
    p.mesh.position.lerpVectors(p.prev.p, p.cur.p, alpha);
    p.mesh.quaternion.slerpQuaternions(p.prev.q, p.cur.q, alpha);
    p.syncBales();
    p.shards?.update(dt);
    p.cam.update(dt, p.mesh.position, p.cur.v, world.groundAt, app.state === 'menu' ? 'orbit' : 'chase', time);
    const speed = p.cur.v.length();
    foci.push({ p: p.mesh.position, speed });
    if (p.state === 'racing') {
      maxSpeed = Math.max(maxSpeed, speed);
      grounded ||= p.race.grounded;
    }
    crowd = Math.max(crowd, Math.min(1, speed / 25) * (track.finishZ - p.cur.p.z < 40 ? 1 : 0.5));
    if (p.hud && app.state !== 'menu') updateHud(p, time);
  }
  if (ghost) placeGhost(players[0].race.tick + (app.state === 'race' ? alpha : 0));
  world.update(time, foci);
  particles.update(dt, players[0].camera.position);

  const fx = app.state === 'race' && players.length === 1 ? Math.max(0, Math.min(1, (maxSpeed * 3.6 - 55) / 50)) : 0;
  speedFx.style.opacity = fx.toFixed(2);
  if (fx > 0) speedFx.style.transform = `rotate(${(Math.random() * 6).toFixed(1)}deg) scale(1.1)`;
  if (app.state === 'race') audio.update({ speed: maxSpeed, grounded, crowdLevel: crowd });
  else if (app.state === 'finish') audio.update({ speed: maxSpeed * 0.5, grounded, crowdLevel: 0.6 });

  renderViews();
}

// Eine Ansicht je Spieler; jede zeigt die eigenen Ballen, Schatten folgen dem jeweiligen Käse
function renderViews() {
  const r = view.renderer;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const prepare = (p) => {
    for (const q of players) for (const m of q.bales) m.visible = q === p;
    world.prepareView(p.camera.position);
    view.followSun(p.mesh.position, p.cam.dir, p.camera);
  };
  if (players.length === 1) {
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    prepare(players[0]);
    r.render(view.scene, players[0].camera);
    return;
  }
  r.setScissorTest(true);
  players.forEach((p, i) => {
    const x = Math.round((i * w) / 2);
    r.setViewport(x, 0, Math.round(w / 2), h);
    r.setScissor(x, 0, Math.round(w / 2), h);
    prepare(p);
    r.render(view.scene, p.camera);
  });
  r.setScissorTest(false);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.state === 'race') togglePause();
});

// ---------- Start ----------
async function boot() {
  await Promise.all([initPhysics(), document.fonts?.load('800 40px "Barlow Condensed"').catch(() => {})]);
  await refreshTracks();
  setMode(app.mode);
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
    return players[0]?.race;
  },
  get players() {
    return players;
  },
  get world() {
    return world;
  },
  view,
  debug: { THREE, createCheese, damageCheese, CHEESES },
  app,
  startRace,
  toMenu,
  setMode,
};

boot().catch((err) => {
  console.error(err);
  $('#loading p').textContent = `Fehler beim Laden: ${err.message}`;
});
