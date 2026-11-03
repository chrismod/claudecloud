// Myzel – Spielablauf: Laden, Titel mit Beitreten, Spiel, Pause; Streaming der endlosen Welt.
import * as THREE from 'three';
import { CHUNK, DAY_LENGTH, WIN } from './config.js';
import { createField } from './world/field.js';
import { createStore, lastSeed } from './world/store.js';
import { createSim } from './world/sim.js';
import { U, createVitalityTexture, createRotTexture } from './render/shared.js';
import { createStage } from './render/stage.js';
import { createSky } from './render/sky.js';
import { createTerrain } from './render/terrain.js';
import { createWater } from './render/water.js';
import { createVegetation } from './render/vegetation.js';
import { createMotherTrees } from './render/motherTrees.js';
import { createNests } from './render/nests.js';
import { createFauna } from './render/fauna.js';
import { createCreatureViews } from './render/creatures.js';
import { WispView, Thread } from './render/wisps.js';
import { Effects, Ambient } from './render/particles.js';
import { createInput } from './game/input.js';
import { createCameraRig } from './game/cameraRig.js';
import { Player, boonsFor, BOONS, COST, NAMES } from './game/players.js';
import { createProgress, RANKS } from './game/progress.js';
import { createEncounters } from './game/encounters.js';
import { audio } from './audio.js';
import { smoothstep } from './noise.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// --- Welt wählen -----------------------------------------------------------------------------
function pickSeed() {
  if (params.has('seed')) return Number(params.get('seed')) >>> 0;
  try {
    const next = localStorage.getItem('myzel:next');
    if (next) {
      localStorage.removeItem('myzel:next');
      return Number(next) >>> 0;
    }
  } catch {
    /* kein Speicher */
  }
  return lastSeed() ?? (Math.random() * 1e6) >>> 0;
}
const seed = pickSeed();
const field = createField(seed);
const store = createStore(seed);
const meta = Object.assign(
  { created: Date.now(), dayTime: 0.29, awake: [], consumed: [], purged: [], healed: {}, players: null, playTime: 0, yaw: 0.35, progress: null, nights: 0 },
  store.loadMeta() || {},
);
const awake = new Set(['0,0', ...meta.awake]);
const purged = new Set(meta.purged);

// --- Darstellung -----------------------------------------------------------------------------
const stage = createStage($('stage'));
const { scene, camera, renderer } = stage;
const vit = createVitalityTexture();
const rotTex = createRotTexture();
const sky = createSky(scene, renderer);
const terrain = createTerrain(scene, field, store);
const water = createWater(scene);
const veg = createVegetation(scene, field);
veg.setConsumed(meta.consumed);
const trees = createMotherTrees(scene, field);
const nests = createNests(scene, field);
const effects = new Effects(scene);
const ambient = new Ambient(scene);
const sim = createSim(field, store, { nestAlive: (id) => !purged.has(id) });
const fauna = createFauna(scene, field, sim);
const enc = createEncounters({ field, sim });
const creatures = createCreatureViews(scene, field);
const powers = {}; // id → Ende (Spielzeit)
let awakeSites = [];
let firstNightMod = false;
const progress = createProgress(meta.progress, onProgress);
meta.progress = progress.state;
const input = createInput();
const rig = createCameraRig(camera);
rig.yaw = meta.yaw ?? 0.35;
const wispViews = [new WispView(scene, 0), new WispView(scene, 1)];
wispViews.forEach((w) => (w.group.visible = false));
const thread = new Thread(scene);

// --- Spielzustand ----------------------------------------------------------------------------
let mode = 'loading';
const players = [null, null];
const joinedAt = [0, 0];
let time = 0;
let dayTime = meta.dayTime;
let simAcc = 0;
let glowAcc = 0;
let treePulse = 0;
let saveT = 0;
let statT = 0;
let mapT = 0;
let ritual = { site: null, progress: 0, ready: false, coverage: 0, checkT: 0 };
let awakening = null;
let newWorldArm = 0;
let compassFlash = 0;
let pingTarget = null;
let purify = { nest: null, t: 0 };
let rotT = 0;
let rotInfo = { rot: 0, threat: 0, nearest: null };
let lastPhase = null;
let duskHealed = 0;
let comboShown = 0;
const active = () => players.filter(Boolean);
const boons = () => {
  const b = boonsFor(awake.size - 1);
  b.maxSpores += progress.perks.maxSpores;
  return b;
};

function updateProtectors() {
  awakeSites = [...awake].map((id) => {
    const [gx, gz] = id.split(',').map(Number);
    return field.site(gx, gz);
  });
  sim.setProtectors(awakeSites);
}
updateProtectors();

function stream(focus, immediate = false) {
  const ccx = Math.floor(focus.x / CHUNK);
  const ccz = Math.floor(focus.z / CHUNK);
  sim.ensureWindow(ccx, ccz, immediate);
  U.uWinCenter.value.set((ccx + 0.5) * CHUNK, (ccz + 0.5) * CHUNK);
  terrain.setCenter(ccx, ccz, immediate);
  veg.setCenter(ccx, ccz);
}

function updateSources(focus) {
  sim.setSources(field.nestsNear(focus.x, focus.z, 170).filter((n) => !purged.has(n.id)));
}

function spawnPos(i) {
  const saved = meta.players?.[i];
  if (saved && Number.isFinite(saved.x)) return saved;
  const other = players[1 - i];
  if (other) return { x: other.x + (i ? 3 : -3), z: other.z + 2 };
  return { x: i ? 5 : -5, z: 15 };
}

function addPlayer(i, binding) {
  const p = new Player(i, binding);
  const s = spawnPos(i);
  p.x = s.x;
  p.z = s.z;
  p.y = field.height(p.x, p.z) + 2;
  p.max = boons().maxSpores;
  p.spores = Math.min(p.max, meta.players?.[i]?.spores ?? 70);
  players[i] = p;
  joinedAt[i] = time;
  wispViews[i].group.visible = true;
  effects.emit({ x: p.x, y: p.y, z: p.z, count: 60, speed: 6, color: wispViews[i].color.clone().multiplyScalar(2), life: 1.4, size: 0.5 });
  audio.join(i);
  input.rumble(binding, 0.4, 0.6, 180);
}

// --- Laden -----------------------------------------------------------------------------------
function boot() {
  const focus = new THREE.Vector3(0, 0, 0);
  rig.mode = 'title';
  rig.update(0.016, [], field, 0);
  updateSources(focus);
  stream(focus, true);
  while (veg.pump(1000) > 0);
  veg.rebuild();
  sim.writeTexture(vit.data);
  vit.tex.needsUpdate = true;
  sim.writeTexture2(rotTex.data);
  rotTex.tex.needsUpdate = true;
  sky.update(dayTime, rig.focus, 10);
  renderTitle();
  mode = 'title';
  requestAnimationFrame(() => $('loading').classList.add('out'));
}

// --- Titel -----------------------------------------------------------------------------------
function renderTitle() {
  for (let i = 0; i < 2; i++) {
    const el = $('slot' + i);
    const p = players[i];
    el.classList.toggle('joined', !!p);
    const kb = i === 0 ? 'Leertaste' : 'Enter';
    el.querySelector('.sstate').innerHTML = p
      ? `Bereit · ${p.binding.type === 'pad' ? 'Gamepad ' + (p.binding.index + 1) : 'Tastatur'}`
      : `<span class="btn a">A</span> oder <kbd>${kb}</kbd> zum Beitreten`;
  }
  const any = active().length > 0;
  $('titlehints').innerHTML = any
    ? `<span class="btn a">A</span> / <span class="btn">Start</span> Losgehen<span class="sep">·</span><span class="btn b">B</span> / <kbd>H</kbd> Steuerung<span class="sep">·</span><span class="btn y">Y</span> / <kbd>N</kbd> Neue Welt`
    : `Zu zweit mit zwei Gamepads – oder geteilter Tastatur<span class="sep">·</span><span class="btn b">B</span> / <kbd>H</kbd> Steuerung`;
  const n = awake.size - 1;
  const area = totalHealed();
  $('worldinfo').textContent =
    newWorldArm > 0
      ? 'Wirklich eine neue Welt erschaffen? Nochmal drücken. (Diese Welt bleibt gespeichert.)'
      : `Welt ${seed} · ${fmtArea(area)} belebt · ${n} ${n === 1 ? 'Mutterbaum' : 'Mutterbäume'} erweckt`;
}

function titleUpdate(dt) {
  const req = input.joinRequests(players.map((p) => p?.binding));
  for (const b of req) {
    audio.unlock();
    const i = players.findIndex((p) => !p);
    if (i < 0) break;
    addPlayer(i, b);
    renderTitle();
  }
  newWorldArm = Math.max(0, newWorldArm - dt);
  const m = input.menu();
  let start = false;
  for (let i = 0; i < 2; i++) {
    const p = players[i];
    if (!p) continue;
    const s = input.read(p.binding);
    if ((s.confirmDown && time - joinedAt[i] > 0.25) || s.startDown) start = true;
  }
  const keyH = m.cancel || keyPressed('KeyH');
  if (keyH) return openHelp('title');
  const keyN = keyPressed('KeyN') || anyPadEdge(3);
  if (keyN) {
    audio.unlock();
    if (newWorldArm > 0) return newWorld();
    newWorldArm = 3;
    audio.ui();
    renderTitle();
  }
  if (start) startGame();
  // Geister schweben auf dem Titelbild schon vor dem Heimatbaum
  for (const p of active()) {
    p.move({ mx: 0, my: 0, boost: 0 }, dt, { yaw: rig.yaw, field, boons: boons(), trees: [] });
  }
}

// Browser geben Ton erst nach einer Klick- oder Tasteneingabe frei (Gamepad zählt nicht)
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio.unlock());

const pressedKeys = new Set();
window.addEventListener('keydown', (e) => !e.repeat && pressedKeys.add(e.code));
const keyPressed = (code) => pressedKeys.has(code);
const padPrev = new Map();
function anyPadEdge(btn) {
  let hit = false;
  for (const p of navigator.getGamepads?.() ?? []) {
    if (!p) continue;
    const was = padPrev.get(p.index + ':' + btn);
    const is = !!p.buttons[btn]?.pressed;
    if (is && !was) hit = true;
  }
  return hit;
}
function endPadEdges() {
  for (const p of navigator.getGamepads?.() ?? []) {
    if (!p) continue;
    for (const b of [1, 3]) padPrev.set(p.index + ':' + b, !!p.buttons[b]?.pressed);
  }
  pressedKeys.clear();
}

function startGame() {
  mode = 'play';
  rig.mode = 'play';
  $('title').classList.add('out');
  setTimeout(() => $('title').classList.add('hidden'), 1300);
  $('hud').classList.remove('hidden');
  rig.snap(active(), field);
  showToast('Wo ihr gleitet, wächst Myzel', 'Weckt die Mutterbäume – und hütet euch vor der Fäulnis der Nacht');
  renderQuests();
  saveNow();
}

function newWorld() {
  saveNow();
  try {
    localStorage.setItem('myzel:next', String((Math.random() * 1e6) >>> 0));
  } catch {
    /* ohne Speicher wird die Seite einfach neu geladen */
  }
  $('fade').classList.add('on');
  setTimeout(() => location.reload(), 900);
}

// --- Pause & Hilfe ---------------------------------------------------------------------------
let menuSel = 0;
let helpReturn = 'pause';
let confirmNew = false;
function pauseItems() {
  const items = [{ id: 'resume', label: 'Weiterspielen' }, { id: 'help', label: 'Steuerung & Spielidee' }];
  items.push({ id: 'volume', label: 'Lautstärke', value: Math.round(audio.volume * 100) + ' %' });
  items.push({ id: 'quality', label: 'Bildqualität', value: qualityLabel() });
  if (players[1] && players[0]) items.push({ id: 'leave', label: 'Keim verlässt das Spiel' });
  items.push({ id: 'new', label: confirmNew ? 'Wirklich? Diese Welt bleibt gespeichert.' : 'Neue Welt erschaffen' });
  return items;
}
let quality = 1;
const qualityLabel = () => ['Schnell', 'Schön', 'Prachtvoll'][quality];
function applyQuality() {
  const s = sky.sun.shadow;
  s.mapSize.set(quality === 2 ? 4096 : quality === 1 ? 2048 : 1024, quality === 2 ? 4096 : quality === 1 ? 2048 : 1024);
  s.map?.dispose();
  s.map = null;
  stage.bloom.enabled = quality > 0;
}

function renderPause() {
  const items = pauseItems();
  menuSel = Math.max(0, Math.min(items.length - 1, menuSel));
  $('pausemenu').innerHTML = items
    .map((it, i) => `<li class="${i === menuSel ? 'sel' : ''}">${it.label}${it.value ? `<small>◂ ${it.value} ▸</small>` : ''}</li>`)
    .join('');
}

function openPause() {
  mode = 'pause';
  menuSel = 0;
  confirmNew = false;
  $('pause').classList.remove('hidden');
  renderPause();
  saveNow();
}

function closePause() {
  mode = 'play';
  $('pause').classList.add('hidden');
}

function openHelp(from) {
  helpReturn = from;
  mode = 'help';
  $('help').classList.remove('hidden');
  if (from === 'pause') $('pause').classList.add('hidden');
}

function pauseUpdate() {
  const m = input.menu();
  const items = pauseItems();
  if (m.navY) {
    menuSel = (menuSel + m.navY + items.length) % items.length;
    audio.ui();
    renderPause();
  }
  const it = items[menuSel];
  if (m.navX && it.id === 'volume') {
    audio.setVolume(Math.max(0, Math.min(1, audio.volume + m.navX * 0.1)));
    audio.ui();
    renderPause();
  }
  if (m.navX && it.id === 'quality') {
    quality = (quality + m.navX + 3) % 3;
    applyQuality();
    renderPause();
  }
  if (m.start || m.cancel) return closePause();
  if (!m.confirm) return;
  audio.ui();
  if (it.id === 'resume') closePause();
  else if (it.id === 'help') openHelp('pause');
  else if (it.id === 'leave') {
    wispViews[1].group.visible = false;
    players[1] = null;
    closePause();
  } else if (it.id === 'new') {
    if (confirmNew) newWorld();
    confirmNew = true;
    renderPause();
  }
}

function helpUpdate() {
  const m = input.menu();
  if (m.confirm || m.cancel || m.start || keyPressed('KeyH')) {
    $('help').classList.add('hidden');
    mode = helpReturn;
    if (helpReturn === 'pause') {
      $('pause').classList.remove('hidden');
      renderPause();
    }
  }
}

// --- Spiel -----------------------------------------------------------------------------------
function nearestDormant(x, z) {
  const list = field.sitesNear(x, z, 900).filter((s) => !awake.has(s.id));
  let best = null;
  let bd = Infinity;
  for (const s of list) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best ? { site: best, dist: bd } : null;
}

function rumbleAll(strong, weak, ms) {
  for (const p of active()) input.rumble(p.binding, strong, weak, ms);
}

function panOf(x, z) {
  const v = new THREE.Vector3(x, 0, z).project(camera);
  return Math.max(-1, Math.min(1, v.x));
}

function playUpdate(dt) {
  const b = boons();
  const perks = { ...progress.perks, weaveCost: powers.weaver > time ? 0 : 1, storm: powers.storm > time };
  if (powers.wind > time) b.speed *= 1.45;
  // Spieler können jederzeit dazukommen
  for (const req of input.joinRequests(players.map((p) => p?.binding))) {
    const i = players.findIndex((p) => !p);
    if (i < 0) break;
    addPlayer(i, req);
    showToast(`${NAMES[i]} ist erwacht`, i ? 'Der Samengeist schließt sich an' : 'Der Pilzgeist schließt sich an');
  }
  const list = active();
  const trunks = field.sitesNear(rig.focus.x, rig.focus.z, 80);
  let rx = 0;
  const inputs = [];
  for (const p of list) {
    const inp = input.read(p.binding);
    inputs[p.i] = inp;
    if (inp.startDown) return openPause();
    if (inp.backDown) return openHelp('play');
    rx += inp.rx;
    p.move(inp, dt, { yaw: rig.yaw, field, boons: b, trees: trunks });
  }
  // Faden: hält die beiden zusammen und spinnt, wenn beide weben
  let threadState = { visible: false, weaving: false, strain: 0 };
  if (list.length === 2) {
    const [a, c] = list;
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const d = Math.hypot(dx, dz);
    const max = b.tether;
    if (d > max) {
      const ex = (d - max) / 2 / d;
      a.x += dx * ex;
      a.z += dz * ex;
      c.x -= dx * ex;
      c.z -= dz * ex;
      // Bewegung voneinander weg wird vom Faden aufgefangen
      const nx = dx / d;
      const nz = dz / d;
      const va = a.vx * nx + a.vz * nz;
      if (va < 0) (a.vx -= va * nx), (a.vz -= va * nz);
      const vc = c.vx * nx + c.vz * nz;
      if (vc > 0) (c.vx -= vc * nx), (c.vz -= vc * nz);
    }
    const strain = smoothstep(max * 0.8, max, d);
    const bothWeave = inputs[0].weave > 0.3 && inputs[1].weave > 0.3 && a.spores > 0.5 && c.spores > 0.5;
    threadState = { visible: true, weaving: bothWeave, strain };
    if (bothWeave) {
      const h0 = sim.counters.healed;
      const added = sim.paintLine(a.x, a.z, c.x, c.z, 1.6 * b.radius, 0.92, 0.5, 0.8);
      const threadHealed = sim.counters.healed - h0;
      if (threadHealed) progress.event('thread', threadHealed);
      a.spores = Math.max(0, a.spores - added * COST.thread * 0.5);
      c.spores = Math.max(0, c.spores - added * COST.thread * 0.5);
    }
  }

  // Mutterbaum in der Nähe?
  const dormant = nearestDormant(rig.focus.x, rig.focus.z);
  pingTarget = dormant;
  ritual.checkT -= dt;
  if (dormant && dormant.dist < 70) {
    if (ritual.site !== dormant.site) ritual = { site: dormant.site, progress: 0, ready: false, coverage: 0, checkT: 0 };
    if (ritual.checkT <= 0) {
      ritual.checkT = 0.4;
      ritual.coverage = sim.coverage(dormant.site.x, dormant.site.z, 16, 0.45);
      ritual.ready = ritual.coverage >= 0.6;
    }
  } else ritual.site = null;

  let holders = 0;
  for (const p of list) {
    const inp = inputs[p.i];
    const sample = p.act(inp, dt, { sim, boons: b, perks });
    p.sample = sample;
    const nearRitual = ritual.site && ritual.ready && Math.hypot(p.x - ritual.site.x, p.z - ritual.site.z) < 13;
    p.ritual = nearRitual && inp.pulse;
    if (p.ritual) {
      holders++;
      if (Math.random() < 0.7)
        effects.emit({ x: p.x, y: p.y, z: p.z, count: 2, speed: 2, color: wispViews[p.i].color.clone().multiplyScalar(2.5), life: 2, size: 0.45, target: { x: ritual.site.x, y: field.height(ritual.site.x, ritual.site.z) + 9, z: ritual.site.z }, gravity: 0, drag: 2 });
    } else if (inp.pulseDown && !nearRitual) {
      if (p.tryPulse(sim, b, perks)) {
        handleEncounters(enc.pulse(p.x, p.z, p.lastPulseR + 1, p.i));
        const col = wispViews[p.i].color.clone().multiplyScalar(2.2);
        effects.emit({ x: p.x, y: p.y - 0.8, z: p.z, count: 90, speed: 9, up: 0.15, color: col, life: 1.1, size: 0.4, gravity: -1, drag: 2.2 });
        audio.pulse(panOf(p.x, p.z), p.hue);
        input.rumble(p.binding, 0.25, 0.5, 140);
      } else if (p.denyCd <= 0) {
        p.denyCd = 0.4;
        audio.denied();
      }
    }
    // Zersetzen: Totholz in Sporen verwandeln – oder ein Moderherz läutern
    const nest = nearestNest(p.x, p.z, 8.5);
    p.purifying = false;
    if (inp.decompose && nest) {
      p.purifying = true;
      p.decompose = null;
      if (purify.nest !== nest) purify = { nest, t: 0 };
    } else if (inp.decompose) {
      const near = veg.nearby('log', p.x, p.z, 5).find((n) => n.e.w >= 1e8);
      if (near) {
        const e = near.e;
        if (!p.decompose || p.decompose.e !== e) p.decompose = { e, t: 0 };
        p.decompose.t += dt / 1.5;
        if (Math.random() < 0.8)
          effects.emit({ x: e.x + (Math.random() - 0.5) * 3, y: e.y + 0.6, z: e.z + (Math.random() - 0.5) * 2, count: 2, speed: 1.5, color: new THREE.Color(1.6, 0.9, 0.4), life: 1.5, size: 0.35, target: p, gravity: 0, drag: 1 });
        if (Math.random() < 0.35) audio.crackle(panOf(e.x, e.z));
        input.rumble(p.binding, 0.05, 0.2, 60);
        if (p.decompose.t >= 1) {
          veg.consumeLog(e, time);
          meta.consumed.push(e.id);
          p.spores = Math.min(p.max, p.spores + 40);
          sim.paint(e.x, e.z, 6.5 * b.radius, 1, p.hue, 1);
          sim.bloom(e.x, e.z, 5, 0.9);
          sim.excite(e.x, e.z, 2);
          effects.emit({ x: e.x, y: e.y + 0.5, z: e.z, count: 120, speed: 5, color: new THREE.Color(1.2, 1.4, 0.6), life: 1.6, size: 0.45, gravity: 0.3 });
          audio.decomposed(panOf(e.x, e.z));
          input.rumble(p.binding, 0.7, 0.5, 300);
          p.decompose = null;
          progress.event('log', 1, e);
        }
      } else p.decompose = null;
    } else if (p.decompose) {
      p.decompose.t = Math.max(0, p.decompose.t - dt);
      if (p.decompose.t <= 0) p.decompose = null;
    }
    // Boviste platzen beim Durchfliegen und verstreuen Sporen
    for (const { e } of veg.nearby('puff', p.x, p.z, 1.9)) {
      if (time - e.w < 40) continue;
      const s = sim.sample(e.x, e.z);
      if (s.L < e.th + 0.12) continue;
      veg.burstPuff(e, time);
      p.spores = Math.min(p.max, p.spores + 9);
      sim.paint(e.x, e.z, 4.5, 0.88, p.hue, 1);
      sim.excite(e.x, e.z, 1.5);
      effects.emit({ x: e.x, y: e.y + 0.4, z: e.z, count: 70, speed: 4, up: 1.2, color: new THREE.Color(1.3, 1.2, 0.85), life: 2.2, size: 0.5, gravity: 0.15, drag: 2.5 });
      audio.puff(panOf(e.x, e.z));
      input.rumble(p.binding, 0.15, 0.35, 90);
      progress.event('puff', 1, e);
    }
    if (inp.pingDown) {
      compassFlash = 2;
      audio.ping(panOf(p.x, p.z));
      if (dormant) {
        const dx = dormant.site.x - p.x;
        const dz = dormant.site.z - p.z;
        const d = Math.hypot(dx, dz);
        const tgt = { x: p.x + (dx / d) * 30, y: p.y + 3, z: p.z + (dz / d) * 30 };
        effects.emit({ x: p.x, y: p.y, z: p.z, count: 40, speed: 2, color: new THREE.Color(2, 1.7, 1), life: 2.5, size: 0.5, target: tgt, gravity: 0, drag: 1 });
      }
    }
  }

  // Ritual
  if (ritual.site && ritual.ready) {
    if (holders > 0) {
      ritual.progress += dt * 0.42 * (holders / list.length);
      audio.ritual(ritual.progress);
      rumbleAll(0.05 + ritual.progress * 0.3, 0.1 + ritual.progress * 0.3, 60);
    } else ritual.progress = Math.max(0, ritual.progress - dt * 0.5);
    if (ritual.progress >= 1) awaken(ritual.site);
  }
  const t = trees.trees.get(ritual.site?.id);
  if (t) t.stir += ((ritual.ready ? 0.4 + ritual.progress * 0.8 : 0) - t.stir) * Math.min(1, dt * 3);

  // Erwachen: Welle aus Leben
  if (awakening) {
    awakening.t += dt;
    const k = Math.min(1, awakening.t / 4.5);
    const r = 46 * (1 - (1 - k) ** 2);
    const s = awakening.site;
    const c0 = { ...sim.counters };
    sim.paint(s.x, s.z, r, 1, 0.5, 0.3);
    sim.bloom(s.x, s.z, r * 0.85, 0.88);
    sim.cleanse(s.x, s.z, r, 1);
    Object.assign(sim.counters, c0);
    if ((awakening.pulse -= dt) <= 0) {
      awakening.pulse = 0.5;
      sim.excite(s.x, s.z, 4);
    }
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = s.x + Math.cos(a) * r;
      const z = s.z + Math.sin(a) * r;
      effects.emit({ x, y: field.height(x, z) + 0.5, z, count: 1, speed: 2, up: 2, color: new THREE.Color(1.6, 1.5, 0.9), life: 2.5, size: 0.6, gravity: 0.6 });
    }
    if (awakening.t > 4.8) awakening = null;
  }

  // Moderherz läutern: wer Ⓧ hält, zehrt Sporen auf und brennt das Herz aus
  const purifiers = list.filter((p) => p.purifying && p.spores > 0.5);
  if (purify.nest && purifiers.length) {
    purify.t += dt * 0.13 * purifiers.length;
    for (const p of purifiers) {
      p.spores = Math.max(0, p.spores - 7 * dt);
      input.rumble(p.binding, 0.15 + purify.t * 0.4, 0.3, 60);
      if (Math.random() < 0.8)
        effects.emit({ x: p.x, y: p.y, z: p.z, count: 2, speed: 2, color: new THREE.Color(2.2, 1.9, 1.2), life: 1.4, size: 0.4, target: { x: purify.nest.x, y: purify.nest.y + 1.5, z: purify.nest.z }, gravity: 0, drag: 1.5 });
    }
    sim.cleanse(purify.nest.x, purify.nest.z, 4 + purify.t * 10, dt * 2);
    audio.purifying(purify.t);
    if (purify.t >= 1) purgeNest(purify.nest);
  } else if (purify.nest) {
    purify.t = Math.max(0, purify.t - dt * 0.15);
    if (purify.t <= 0) purify.nest = null;
  }
  const no = purify.nest && nests.nests.get(purify.nest.id);
  if (no) no.purify = purify.t;

  // Fäulnis-Lage: bedrohtes Myzel melden
  rotT -= dt;
  if (rotT <= 0) {
    rotT = 1;
    rotInfo = sim.rotStats(rig.focus.x, rig.focus.z);
  }

  // Tiere kehren zurück
  const returned = fauna.update(dt, { focus: rig.focus, players: list, time, night: U.uNight.value, day: U.uNight.value < 0.3 });
  const liveNests = field.nestsNear(rig.focus.x, rig.focus.z, 170).filter((n) => !purged.has(n.id));
  handleEncounters(
    enc.update(dt, {
      players: list,
      focus: rig.focus,
      night: U.uNight.value,
      nights: meta.nights || 0,
      nests: liveNests,
      awakeSites,
      thread: threadState.weaving ? { a: list[0], b: list[1] } : null,
    }),
  );
  if (returned) progress.event('animal', returned);

  // Erfahrung aus dem, was die Spieler bewirken
  const healedNow = sim.counters.healed;
  const cleansedNow = sim.counters.cleansed;
  sim.counters.healed = 0;
  sim.counters.cleansed = 0;
  if (healedNow) progress.healed(healedNow, list[0]);
  if (cleansedNow > 0.5) progress.event('rot', cleansedNow);
  progress.update(dt, {
    dayTime,
    night: U.uNight.value,
    players: list.length,
    hasNest: field.nestsNear(rig.focus.x, rig.focus.z, 250).some((n) => !purged.has(n.id)),
    hasTree: !!dormant && dormant.dist < 400,
  });
  dayPhase();

  // Die erwachten Mutterbäume senden Lichtwellen durchs Netz
  treePulse -= dt;
  if (treePulse <= 0) {
    treePulse = 6.5;
    for (const s of field.sitesNear(rig.focus.x, rig.focus.z, 110)) if (awake.has(s.id)) sim.excite(s.x + 3, s.z + 3, 3.5);
  }

  rig.update(dt, list, field, rx);
  meta.playTime += dt;
  for (let i = 0; i < 2; i++) {
    const p = players[i] ?? list[0];
    if (p) U.uPlayers.value[i].set(p.x, p.y, p.z);
    else U.uPlayers.value[i].set(1e5, -1e5, 1e5);
  }
  wispViews.forEach((w, i) => {
    const p = players[i];
    if (p) w.update(p, dt, U.uNight.value);
  });
  thread.update(list[0] ?? { x: 0, y: 0, z: 0 }, list[1] ?? { x: 0, y: 0, z: 0 }, camera, { ...threadState, height: field.height }, dt);
}

function awaken(site) {
  awake.add(site.id);
  meta.awake = [...awake].filter((id) => id !== '0,0');
  ritual.progress = 0;
  ritual.ready = false;
  awakening = { site, t: 0, pulse: 0 };
  const t = trees.trees.get(site.id);
  if (t) {
    t.burst = 1;
    t.stir = 0;
  }
  const n = awake.size - 1;
  const boon = BOONS[Math.min(n, BOONS.length) - 1];
  const b = boons();
  for (const p of active()) {
    p.max = b.maxSpores;
    p.spores = p.max;
  }
  showToast('Ein Mutterbaum erwacht', `Gabe: ${boon.name} – ${boon.text} · Sein Hain ist vor Fäulnis geschützt`, 6);
  updateProtectors();
  progress.event('tree', 1, site);
  audio.awaken();
  rig.shake = 1.1;
  stage.grade.uniforms.uFlash.value = 0.75;
  rumbleAll(1, 1, 900);
  const y = field.height(site.x, site.z);
  effects.emit({ x: site.x, y: y + 6, z: site.z, count: 400, speed: 16, up: 0.6, color: new THREE.Color(1.8, 1.5, 0.8), life: 2.6, size: 0.7, gravity: -0.4, drag: 1.2 });
  saveNow();
}

// Begegnungen → Belohnung, Anzeige, Klang
let eatSoundT = 0;
function handleEncounters(events) {
  for (const e of events) {
    switch (e.type) {
      case 'wispSpawn':
        audio.wispCall(e.w.x, e.w.y, e.w.z);
        break;
      case 'wispFreed':
        popup('Licht befreit', e.w, 'gold');
        audio.wispFreed(e.w.x, e.w.y, e.w.z);
        break;
      case 'wispJoin':
        popup(`Ein Licht folgt ${NAMES[e.p.i]}`, e.w, '');
        audio.wispJoin(e.w.x, e.w.y, e.w.z, e.w.hue);
        input.rumble(players[e.p.i]?.binding, 0.15, 0.3, 120);
        if (!meta.seenWisp) {
          meta.seenWisp = true;
          showToast('Ein verirrtes Licht folgt euch', 'Bringt es zu einem erwachten Mutterbaum – meidet die Fäulnis', 5);
        }
        break;
      case 'wispLost':
        popup('Ein Licht ist der Fäulnis entglitten', e.w, 'bad');
        audio.wispLost(e.w.x, e.w.y, e.w.z);
        break;
      case 'wispHome': {
        progress.event('wisp', 1, e.w);
        for (const p of active()) p.spores = Math.min(p.max, p.spores + 25);
        const y = field.height(e.site.x, e.site.z);
        effects.emit({ x: e.site.x, y: y + 12, z: e.site.z, count: 140, speed: 7, color: new THREE.Color().setHSL(e.w.hue, 0.8, 0.7).multiplyScalar(2.2), life: 2.2, size: 0.55, gravity: -0.2 });
        sim.excite(e.site.x + 3, e.site.z + 3, 4);
        popup('Ein Licht ist heimgekehrt', e.w, 'gold');
        audio.wispHome(e.site.x, y + 10, e.site.z);
        meta.wispsHome = (meta.wispsHome || 0) + 1;
        break;
      }
      case 'moderSpawn':
        audio.moderSpawn(e.m.x, field.height(e.m.x, e.m.z), e.m.z);
        if (!firstNightMod) {
          firstNightMod = true;
          showToast('Moderlinge kriechen aus den Herzen', 'Sie fressen euer Myzel – vertreibt sie mit dem Sporenpuls oder dem gespannten Faden', 5);
        }
        break;
      case 'moderEat':
        if ((eatSoundT -= 0.016) <= 0) {
          eatSoundT = 0.5;
          audio.moderEat(e.m.x, field.height(e.m.x, e.m.z), e.m.z);
        }
        break;
      case 'moderBite': {
        const p = e.p;
        p.spores = Math.max(0, p.spores - 6);
        input.rumble(p.binding, 0.6, 0.4, 220);
        effects.emit({ x: p.x, y: p.y, z: p.z, count: 30, speed: 4, color: new THREE.Color(0.9, 0.2, 1.3), life: 0.8, size: 0.35 });
        popup('−6 Sporen', p, 'bad');
        audio.moderBite(p.x, p.y, p.z);
        break;
      }
      case 'moderKilled': {
        const m = e.m;
        const y = field.height(m.x, m.z) + 0.6;
        progress.event('moderling', 1, { x: m.x, y, z: m.z });
        const killer = players[e.by];
        for (const p of killer ? [killer] : active()) p.spores = Math.min(p.max, p.spores + 6);
        effects.emit({ x: m.x, y, z: m.z, count: 60, speed: 5, color: new THREE.Color(0.8, 0.25, 1.4), life: 1.1, size: 0.4, gravity: 0.5 });
        effects.emit({ x: m.x, y, z: m.z, count: 30, speed: 3, up: 1.5, color: new THREE.Color(1.6, 1.4, 0.9), life: 1.6, size: 0.4, gravity: 0.3 });
        sim.cleanse(m.x, m.z, 3, 1);
        audio.moderDie(m.x, y, m.z);
        break;
      }
      case 'starIncoming':
        showToast('Eine Sternspore fällt!', 'Fangt sie, bevor sie verglüht', 3.5);
        audio.starFall(e.s.x, e.s.gy, e.s.z);
        break;
      case 'starLanded':
        effects.emit({ x: e.s.x, y: e.s.gy + 1, z: e.s.z, count: 160, speed: 9, up: 0.5, color: new THREE.Color(2, 1.7, 1), life: 1.4, size: 0.5, gravity: -0.6 });
        audio.starLand(e.s.x, e.s.gy, e.s.z);
        rig.shake = Math.max(rig.shake, 0.35);
        break;
      case 'starCaught': {
        const pw = e.power;
        const p = e.p;
        progress.event('star', 1, p);
        if (pw.id === 'bloom') {
          const c0 = { ...sim.counters };
          sim.cleanse(p.x, p.z, 24, 1);
          sim.paint(p.x, p.z, 22, 1, p.hue, 0.6);
          sim.bloom(p.x, p.z, 18, 0.9);
          sim.excite(p.x, p.z, 3);
          Object.assign(sim.counters, c0);
        } else powers[pw.id] = time + pw.dur;
        for (const q of active()) q.spores = Math.min(q.max, q.spores + 20);
        showToast(`Sternspore: ${pw.name}`, pw.dur ? `${pw.text} – ${pw.dur} Sekunden lang` : pw.text, 4);
        effects.emit({ x: p.x, y: p.y, z: p.z, count: 200, speed: 10, color: new THREE.Color(2.2, 1.9, 1.1), life: 1.8, size: 0.55, gravity: -0.4 });
        audio.starCatch();
        rumbleAll(0.5, 0.8, 400);
        break;
      }
      case 'starLost':
        popup('Die Sternspore ist verglüht', { x: e.s.x, y: e.s.gy, z: e.s.z }, 'bad');
        audio.starLost(e.s.x, e.s.gy, e.s.z);
        break;
    }
  }
}

function nearestNest(x, z, r) {
  let best = null;
  let bd = r;
  for (const n of field.nestsNear(x, z, r)) {
    if (purged.has(n.id)) continue;
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bd) (bd = d), (best = n);
  }
  return best;
}

function purgeNest(n) {
  const c0 = { ...sim.counters };
  purged.add(n.id);
  meta.purged = [...purged];
  purify = { nest: null, t: 0 };
  updateSources(rig.focus);
  sim.cleanse(n.x, n.z, 26, 1);
  sim.paint(n.x, n.z, 12, 1, 0.5, 1);
  sim.bloom(n.x, n.z, 9, 0.85);
  sim.excite(n.x, n.z, 3);
  Object.assign(sim.counters, c0); // die Läuterungswelle selbst gibt keine Erfahrung
  for (const p of active()) {
    p.spores = Math.min(p.max, p.spores + 50);
    input.rumble(p.binding, 1, 1, 700);
  }
  effects.emit({ x: n.x, y: n.y + 2, z: n.z, count: 350, speed: 12, up: 0.8, color: new THREE.Color(2, 1.8, 1.2), life: 2.4, size: 0.6, gravity: -0.3, drag: 1.4 });
  effects.emit({ x: n.x, y: n.y + 1, z: n.z, count: 160, speed: 5, up: 1.5, color: new THREE.Color(0.8, 0.2, 1.2), life: 2.8, size: 0.5, gravity: 0.6, drag: 2 });
  stage.grade.uniforms.uFlash.value = 0.5;
  rig.shake = 0.8;
  audio.purified();
  showToast('Ein Moderherz ist geläutert', 'Die Fäulnis weicht – hier kann wieder Leben wachsen', 5);
  progress.event('nest', 1, n);
  saveNow();
}

// Abend, Nacht und Morgen: die Fäulnis-Welle
function dayPhase() {
  const ph = dayTime > 0.69 && dayTime < 0.75 ? 'dusk' : U.uNight.value > 0.5 ? 'night' : dayTime > 0.26 && dayTime < 0.69 ? 'day' : lastPhase;
  if (ph === lastPhase) return;
  const prev = lastPhase;
  lastPhase = ph;
  if (prev === null) return;
  if (ph === 'dusk') {
    showToast('Die Dämmerung naht', 'Bald erwacht die Fäulnis – sucht Schutz bei den Mutterbäumen oder läutert ihre Herzen', 5);
    audio.horn(false);
  } else if (ph === 'night') {
    duskHealed = totalHealed();
    showToast('Die Nacht der Fäulnis', 'Die Moderherzen schlagen schneller – verteidigt euren Wald', 5);
    audio.horn(true);
    rumbleAll(0.4, 0.2, 400);
  } else if (ph === 'day' && prev === 'night') {
    meta.nights = (meta.nights || 0) + 1;
    for (const [k, c] of sim.chunkCounts()) meta.healed[k] = c;
    const diff = totalHealed() - duskHealed;
    const msg = diff >= 0 ? `Euer Wald ist sogar um ${fmtArea(diff)} gewachsen` : `Die Fäulnis hat ${fmtArea(-diff)} gefressen`;
    showToast(`Der Morgen graut – Nacht ${meta.nights} überstanden`, msg, 5);
    progress.addXP(80 + Math.max(0, diff) * 0.1, 'dawn');
    audio.dawn();
  }
}

// Ereignisse aus dem Fortschritt → Anzeige und Klang
let xpBatch = 0;
let xpBatchT = 0;
function onProgress(type, d) {
  if (type === 'xp') {
    if (d.reason === 'heal' || d.reason === 'rot' || d.reason === 'thread') {
      xpBatch += d.amount;
    } else popup(`+${Math.round(d.amount)}`, d.pos ?? active()[0], d.reason === 'objective' ? 'gold' : '');
  } else if (type === 'rank') {
    showToast(`Neuer Rang: ${d.name}`, d.perk ? `Vorteil: ${d.perk}` : 'Der Wald erkennt euch an', 5.5);
    audio.rank();
    for (const p of active()) {
      p.max = boons().maxSpores;
      p.spores = p.max;
    }
    rumbleAll(0.6, 0.8, 500);
  } else if (type === 'objective') {
    audio.objective();
    for (const p of active()) p.spores = Math.min(p.max, p.spores + d.spores);
    popup(`Auftrag erfüllt · +${d.reward}`, active()[0], 'gold');
    renderQuests(d.o.id);
  } else if (type === 'failed') {
    popup('Auftrag verpasst', active()[0], 'bad');
    renderQuests();
  } else if (type === 'changed') renderQuests();
  else if (type === 'first') {
    const first = {
      animal: ['Die Tiere kehren zurück', 'Wo der Wald gesund ist, kommen Hirsche, Hasen und Vögel'],
      rot: ['Fäulnis geläutert', 'Weben und der Sporenpuls brennen die Fäulnis aus'],
    }[d.kind];
    if (first) showToast(...first, 4.5);
  }
}

// --- Speichern & Statistik -------------------------------------------------------------------
function totalHealed() {
  let s = 0;
  for (const k in meta.healed) s += meta.healed[k];
  return s;
}
const fmtArea = (m2) => (m2 >= 10000 ? (m2 / 10000).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' ha' : Math.round(m2).toLocaleString('de-DE') + ' m²');

function saveNow() {
  sim.persist();
  for (const [k, c] of sim.chunkCounts()) meta.healed[k] = c;
  meta.dayTime = dayTime;
  meta.yaw = rig.yaw;
  meta.players = players.map((p, i) => (p ? { x: p.x, z: p.z, spores: p.spores } : meta.players?.[i] ?? null));
  meta.progress = progress.state;
  store.saveMeta(meta);
}
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => document.hidden && mode !== 'loading' && saveNow());

// --- HUD -------------------------------------------------------------------------------------
let toastT = 0;
function showToast(a, b, secs = 4.5) {
  $('toast').querySelector('.t1').textContent = a;
  $('toast').querySelector('.t2').textContent = b;
  $('toast').classList.add('show');
  toastT = secs;
}

const labelPool = [];
function label(i) {
  let el = labelPool[i];
  if (!el) {
    el = document.createElement('div');
    el.className = 'label';
    $('labels').appendChild(el);
    labelPool[i] = el;
  }
  el.style.display = '';
  return el;
}
const proj = new THREE.Vector3();
function toScreen(x, y, z) {
  proj.set(x, y, z).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, on: proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05, ndc: proj.clone() };
}

let lastStats = '';
const POWER_NAMES = { weaver: 'Sternenweber', storm: 'Lichtsturm', wind: 'Windgeist' };
const markerPool = [];
function drawMarkers(list) {
  const root = $('markers');
  list.forEach((m, i) => {
    let el = markerPool[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'marker';
      el.innerHTML = '<div class="arrow"></div><span></span>';
      root.appendChild(el);
      markerPool[i] = el;
    }
    el.style.display = '';
    el.style.setProperty('--c', m.color);
    el.classList.toggle('urgent', !!m.urgent);
    const sc = toScreen(m.x, m.y, m.z);
    let nx = sc.ndc.x;
    let ny = sc.ndc.y;
    if (sc.ndc.z > 1) (nx = -nx), (ny = -ny);
    const inside = sc.on && Math.abs(nx) < 0.85 && Math.abs(ny) < 0.8;
    const arrow = el.firstChild;
    if (inside) {
      el.style.left = sc.x + 'px';
      el.style.top = sc.y + 'px';
      arrow.style.transform = 'rotate(180deg)';
      el.classList.add('on');
    } else {
      const a = Math.atan2(ny, nx);
      let x = innerWidth / 2 + Math.cos(a) * (innerWidth / 2 - 90);
      const y = innerHeight / 2 - Math.sin(a) * (innerHeight / 2 - 110);
      if (y < 560 && x < 360) x = 360;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      arrow.style.transform = `rotate(${90 - (a * 180) / Math.PI}deg)`;
      el.classList.remove('on');
    }
    el.lastChild.textContent = `${m.text} · ${Math.round(m.d)} m`;
  });
  for (let i = list.length; i < markerPool.length; i++) markerPool[i].style.display = 'none';
}
let questT = 0;
function popup(text, at, cls = '') {
  if (!at) return;
  const sc = toScreen(at.x, (at.y ?? field.height(at.x, at.z)) + 2.5, at.z);
  if (!sc.on) return;
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = sc.x + (Math.random() - 0.5) * 40 + 'px';
  el.style.top = sc.y + 'px';
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

let questHtml = '';
function renderQuests() {
  const list = progress.state.objectives;
  let html = '<div class="head">Ruf des Waldes</div>';
  for (const o of list) {
    let left = '';
    let urgent = false;
    if (o.timed && !o.done) {
      const rem = progress.timeLeft(o, dayTime);
      const secs = (rem * DAY_LENGTH) / (U.uNight.value > 0.5 ? 1.7 : 1);
      urgent = secs < 45;
      left = `<span class="left">noch ${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}</span>`;
    }
    const have = Math.floor(o.have).toLocaleString('de-DE');
    const goal = Math.round(o.goal).toLocaleString('de-DE');
    html += `<div class="q${o.timed ? ' timed' : ''}${o.done ? ' done' : ''}${urgent ? ' urgent' : ''}"><div>${o.text}</div><div class="qbar"><i style="width:${(o.have / o.goal) * 100}%"></i></div><div class="qn"><span>${o.done ? 'Erfüllt' : `${have} / ${goal}`}</span>${left}</div></div>`;
  }
  if (html !== questHtml) $('quests').innerHTML = questHtml = html;
}
function hudUpdate(dt) {
  const b = boons();
  for (let i = 0; i < 2; i++) {
    const card = $('pc' + i);
    const p = players[i];
    card.classList.toggle('empty', !p);
    if (!p) continue;
    card.querySelector('.fill').style.width = (p.spores / p.max) * 100 + '%';
    const tick = card.querySelector('.tick');
    const tp = (COST.pulse / p.max) * 100;
    tick.style[i === 0 ? 'left' : 'right'] = tp + '%';
    let st = '';
    if (p.purifying) st = p.spores > 0.5 ? `Läutert das Moderherz · ${Math.round(purify.t * 100)} %` : 'Keine Sporen mehr zum Läutern';
    else if (p.ritual) st = 'Weckt den Mutterbaum …';
    else if (p.inRot) st = 'Die Fäulnis zehrt an euren Sporen – webt, um sie zu läutern';
    else if (p.decompose) st = `Zersetzt Totholz · ${Math.round(p.decompose.t * 100)} %`;
    else if (p.weaving) st = 'Webt Myzel';
    else if (p.spores < COST.pulse) st = 'Sporen erschöpft – sammelt auf lebendigem Boden';
    else if (p.boosting) st = 'Gleitet';
    const f = enc.followers(p.i);
    if (f && !p.purifying && !p.ritual) st = `${f} ${f === 1 ? 'Licht folgt' : 'Lichter folgen'} dir${st ? ' · ' + st : ''}`;
    const ps = card.querySelector('.pstate');
    ps.textContent = st;
    ps.classList.toggle('rot', !!(p.inRot || p.purifying));
  }
  // Statistik
  statT -= dt;
  if (statT <= 0) {
    statT = 1;
    for (const [k, c] of sim.chunkCounts()) meta.healed[k] = c;
    const n = awake.size - 1;
    const night = U.uNight.value > 0.5;
    const left = night ? (((0.25 - dayTime + 1) % 1) * DAY_LENGTH) / 1.7 : ((0.72 - dayTime + 1) % 1) * DAY_LENGTH;
    const mm = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    const s =
      `<div><b>${fmtArea(totalHealed())}</b><span>belebt</span></div>` +
      `<div><b>${n}</b><span>${n === 1 ? 'Mutterbaum' : 'Mutterbäume'}</span></div>` +
      `<div><b>${purged.size}</b><span>${purged.size === 1 ? 'Moderherz' : 'Moderherzen'} geläutert</span></div>` +
      `<div class="${night ? 'warn' : ''}"><b>${mm}</b><span>${night ? 'bis zum Morgen' : 'bis zur Nacht'}</span></div>`;
    if (s !== lastStats) $('stats').innerHTML = lastStats = s;
  }
  // Labels
  let li = 0;
  if (ritual.site) {
    const s = ritual.site;
    const sc = toScreen(s.x, field.height(s.x, s.z) + 7, s.z);
    if (sc.on) {
      const el = label(li++);
      el.classList.add('big');
      const cov = Math.min(1, ritual.coverage / 0.6);
      el.innerHTML = ritual.ready
        ? `Haltet ${active().length > 1 ? 'gemeinsam ' : ''}<span class="btn a">A</span> – weckt den Mutterbaum<div class="meter"><i style="width:${ritual.progress * 100}%"></i></div>`
        : `Schlafender Mutterbaum<div style="font:13px var(--sans);color:var(--dim)">Belebt den Boden ringsum · ${Math.round(cov * 100)} %</div><div class="meter"><i style="width:${cov * 100}%"></i></div>`;
      el.style.left = sc.x + 'px';
      el.style.top = sc.y + 'px';
    }
  }
  for (const p of active()) {
    const near = veg.nearby('log', p.x, p.z, 5).find((n) => n.e.w >= 1e8);
    if (!near || nearestNest(p.x, p.z, 8.5)) continue;
    const e = near.e;
    const sc = toScreen(e.x, e.y + 1.8, e.z);
    if (!sc.on) continue;
    const el = label(li++);
    el.classList.remove('big');
    const prog = p.decompose?.e === e ? p.decompose.t : 0;
    el.innerHTML = `${p.binding.type === 'pad' ? '<span class="btn x">X</span>' : `<kbd>${p.i === 0 ? 'E' : 'Ü'}</kbd>`} halten: Totholz zersetzen${prog ? `<div class="meter"><i style="width:${prog * 100}%"></i></div>` : ''}`;
    el.style.left = sc.x + 'px';
    el.style.top = sc.y + 'px';
  }
  for (const n of field.nestsNear(rig.focus.x, rig.focus.z, 40)) {
    if (purged.has(n.id)) continue;
    const near = active().some((p) => Math.hypot(p.x - n.x, p.z - n.z) < 14);
    if (!near) continue;
    const sc = toScreen(n.x, n.y + 6, n.z);
    if (!sc.on) continue;
    const el = label(li++);
    el.classList.remove('big');
    el.classList.add('nest');
    const prog = purify.nest === n ? purify.t : 0;
    const pad = active().some((p) => p.binding.type === 'pad');
    el.innerHTML = `Moderherz · ${pad ? '<span class="btn x">X</span>' : '<kbd>E</kbd> / <kbd>Ü</kbd>'} halten zum Läutern${active().length > 1 ? ' – zu zweit schneller' : ''}<div class="meter"><i style="width:${prog * 100}%"></i></div>`;
    el.style.left = sc.x + 'px';
    el.style.top = sc.y + 'px';
  }
  for (let i = 0; i < li; i++) if (!labelPool[i].innerHTML.startsWith('Moderherz')) labelPool[i].classList.remove('nest');
  for (let i = li; i < labelPool.length; i++) labelPool[i].style.display = 'none';

  // Rang, Erfahrung, Fluss
  const info = progress.info;
  const rk = $('rank');
  const rn = `${info.name}<small>Rang ${info.level + 1}</small>`;
  if (rk.dataset.n !== rn) {
    rk.dataset.n = rn;
    rk.querySelector('.rname').innerHTML = rn;
  }
  rk.querySelector('.xpbar i').style.width = Math.max(0, Math.min(1, info.frac)) * 100 + '%';
  const mult = progress.multiplier;
  const combo = rk.querySelector('.combo');
  combo.classList.toggle('on', mult > 1);
  if (mult !== comboShown) {
    combo.textContent = mult > 1 ? `Fluss ×${mult}` : '';
    if (mult > comboShown) {
      combo.classList.add('bump');
      setTimeout(() => combo.classList.remove('bump'), 160);
      if (mult > 1) audio.flow(mult);
    }
    comboShown = mult;
  }
  questT -= dt;
  if (questT <= 0) {
    questT = 0.25;
    renderQuests();
  }
  xpBatchT -= dt;
  if (xpBatchT <= 0) {
    xpBatchT = 0.8;
    if (xpBatch >= 1) popup(`+${Math.round(xpBatch)}`, active()[0], 'small');
    xpBatch = 0;
  }

  // aktive Kräfte der Sternsporen
  const pw = Object.entries(powers)
    .filter(([, t]) => t > time)
    .map(([id, t]) => `<span class="power">${POWER_NAMES[id]} <b>${Math.ceil(t - time)} s</b></span>`)
    .join('');
  const pwEl = $('powers');
  if (pwEl.innerHTML !== pw) pwEl.innerHTML = pw;

  // Markierungen: verirrte Lichter, Sternspore, Heimweg mit Lichtern
  const marks = [];
  for (const w of enc.wisps) {
    if (w.state !== 'lost' && w.state !== 'trapped') continue;
    const d = Math.hypot(w.x - rig.focus.x, w.z - rig.focus.z);
    if (d > 170) continue;
    const col = new THREE.Color().setHSL(w.hue, 0.8, 0.72).getStyle();
    marks.push({ x: w.x, y: w.y + 1.5, z: w.z, d, color: col, text: w.state === 'trapped' ? 'Gefangenes Licht – läutert die Fäulnis' : 'Verirrtes Licht' });
  }
  const s = enc.star;
  if (s) {
    const left = s.state === 'landed' ? Math.max(0, Math.ceil(s.life - s.t)) : null;
    marks.push({ x: s.x, y: s.gy + 3, z: s.z, d: Math.hypot(s.x - rig.focus.x, s.z - rig.focus.z), color: '#ffe8a8', text: left != null ? `Sternspore · ${left} s` : 'Sternspore fällt …', urgent: left != null && left < 12 });
  }
  const carrying = active().some((p) => enc.followers(p.i) > 0);
  if (carrying && awakeSites.length) {
    let best = null;
    let bd = Infinity;
    for (const t of awakeSites) {
      const d = Math.hypot(t.x - rig.focus.x, t.z - rig.focus.z);
      if (d < bd) (bd = d), (best = t);
    }
    if (best && bd > 25) marks.push({ x: best.x, y: field.height(best.x, best.z) + 14, z: best.z, d: bd, color: '#ffd98a', text: 'Heimweg der Lichter' });
  }
  drawMarkers(marks);

  // Warnung: die Fäulnis frisst euer Myzel
  const th = $('threat');
  if (rotInfo.threat > 25 && rotInfo.nearest) {
    const q = rotInfo.nearest;
    const sc = toScreen(q.x, field.height(q.x, q.z) + 1, q.z);
    const dist = Math.round(Math.hypot(q.x - rig.focus.x, q.z - rig.focus.z));
    let nx = sc.ndc.x;
    let ny = sc.ndc.y;
    if (sc.ndc.z > 1) (nx = -nx), (ny = -ny);
    const inside = sc.on && Math.abs(nx) < 0.8 && Math.abs(ny) < 0.75;
    const a = Math.atan2(ny, nx);
    th.style.opacity = 1;
    if (inside) {
      th.style.left = sc.x + 'px';
      th.style.top = sc.y - 30 + 'px';
      th.querySelector('.arrow').style.transform = 'rotate(180deg)';
    } else {
      th.style.left = innerWidth / 2 + Math.cos(a) * (innerWidth / 2 - 110) + 'px';
      th.style.top = innerHeight / 2 - Math.sin(a) * (innerHeight / 2 - 120) + 'px';
      th.querySelector('.arrow').style.transform = `rotate(${90 - (a * 180) / Math.PI}deg)`;
    }
    th.querySelector('.dist').textContent = `Fäulnis frisst Myzel · ${dist} m`;
  } else th.style.opacity = 0;

  // Kompass zum nächsten schlafenden Mutterbaum
  const cp = $('compass');
  compassFlash = Math.max(0, compassFlash - dt);
  cp.classList.toggle('flash', compassFlash > 0);
  if (pingTarget && !(ritual.site && toScreen(ritual.site.x, field.height(ritual.site.x, ritual.site.z) + 10, ritual.site.z).on)) {
    const s = pingTarget.site;
    const sc = toScreen(s.x, field.height(s.x, s.z) + 10, s.z);
    let nx = sc.ndc.x;
    let ny = sc.ndc.y;
    if (sc.ndc.z > 1) {
      nx = -nx;
      ny = -ny;
    }
    const a = Math.atan2(ny, nx);
    const rx = innerWidth / 2 - 70;
    const ry = innerHeight / 2 - 90;
    cp.style.opacity = 1;
    let cx = innerWidth / 2 + Math.cos(a) * rx;
    const cyy = innerHeight / 2 - Math.sin(a) * ry;
    if (cyy < 560 && cx < 360) cx = 360; // nicht über der Auftragsliste
    cp.style.left = cx + 'px';
    cp.style.top = cyy + 'px';
    cp.querySelector('.arrow').style.transform = `rotate(${90 - (a * 180) / Math.PI}deg)`;
    cp.querySelector('.dist').textContent = Math.round(pingTarget.dist) + ' m';
  } else cp.style.opacity = 0;

  toastT -= dt;
  if (toastT <= 0) $('toast').classList.remove('show');
  mapT -= dt;
  if (mapT <= 0) {
    mapT = 0.2;
    drawMap();
  }
}

function clockText() {
  const h = Math.floor(dayTime * 24);
  const m = Math.floor((dayTime * 24 * 60) % 60 / 10) * 10;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Minikarte: Vitalität direkt aus der Simulation, an der Kamera ausgerichtet
const mapCanvas = $('minimap');
const mctx = mapCanvas.getContext('2d');
const mapImg = mctx.createImageData(mapCanvas.width, mapCanvas.height);
function drawMap() {
  const W = mapCanvas.width;
  const half = W / 2;
  const scale = 95 / half;
  const cy = Math.cos(rig.yaw);
  const sy = Math.sin(rig.yaw);
  const fx = rig.focus.x;
  const fz = rig.focus.z;
  const d = mapImg.data;
  const p1 = U.uP1.value;
  const p2 = U.uP2.value;
  for (let v = 0; v < W; v++)
    for (let u = 0; u < W; u++) {
      const du = (u - half) * scale;
      const dv = (v - half) * scale;
      const wx = fx + cy * du + sy * dv;
      const wz = fz - sy * du + cy * dv;
      const ix = Math.floor(wx);
      const iz = Math.floor(wz);
      const o = (v * W + u) * 4;
      if (!sim.isLoaded(ix, iz)) {
        d[o] = 12;
        d[o + 1] = 14;
        d[o + 2] = 12;
        d[o + 3] = 255;
        continue;
      }
      const i = sim.idx(ix, iz);
      const L = sim.L[i];
      const M = sim.M[i];
      const H = sim.H[i];
      let r;
      let g;
      let b;
      if (sim.W[i]) {
        r = 20 + L * -10;
        g = 40 + L * 50;
        b = 60 + L * 60;
      } else {
        r = 70 - L * 45;
        g = 60 + L * 40;
        b = 44 - L * 20;
      }
      const m = smoothstep(0.35, 0.9, M) * 0.5;
      r += ((p1.r * (1 - H) + p2.r * H) * 255 - r) * m * 0.6;
      g += ((p1.g * (1 - H) + p2.g * H) * 255 - g) * m * 0.6;
      b += ((p1.b * (1 - H) + p2.b * H) * 255 - b) * m * 0.6;
      const rot = sim.B[i];
      if (rot > 0.15) {
        const k = Math.min(1, (rot - 0.15) * 1.6);
        r += (95 - r) * k;
        g += (20 - g) * k;
        b += (120 - b) * k;
      }
      const glow = Math.max(sim.G[i], sim.F[i]);
      d[o] = r + glow * 120;
      d[o + 1] = g + glow * 120;
      d[o + 2] = b + glow * 100;
      d[o + 3] = 255;
    }
  mctx.putImageData(mapImg, 0, 0);
  const toMap = (x, z) => {
    const dx = x - fx;
    const dz = z - fz;
    return [half + (cy * dx - sy * dz) / scale, half + (sy * dx + cy * dz) / scale];
  };
  for (const s of field.sitesNear(fx, fz, 140)) {
    const [mx, my] = toMap(s.x, s.z);
    mctx.beginPath();
    mctx.arc(mx, my, 6, 0, Math.PI * 2);
    if (awake.has(s.id)) {
      mctx.fillStyle = '#ffd98a';
      mctx.shadowColor = '#ffcf70';
      mctx.shadowBlur = 10;
      mctx.fill();
    } else {
      mctx.strokeStyle = '#d8d0c0';
      mctx.lineWidth = 2;
      mctx.shadowBlur = 0;
      mctx.stroke();
    }
  }
  for (const n of field.nestsNear(fx, fz, 140)) {
    if (purged.has(n.id)) continue;
    const [mx, my] = toMap(n.x, n.z);
    mctx.fillStyle = '#c45cff';
    mctx.shadowColor = '#b040ff';
    mctx.shadowBlur = 8;
    mctx.beginPath();
    mctx.arc(mx, my, 4 + Math.sin(time * 6) * 1, 0, Math.PI * 2);
    mctx.fill();
  }
  for (const w of enc.wisps) {
    const [mx, my] = toMap(w.x, w.z);
    mctx.fillStyle = mctx.shadowColor = `hsl(${w.hue * 360}, 80%, 72%)`;
    mctx.shadowBlur = 8;
    mctx.beginPath();
    mctx.arc(mx, my, 3.5, 0, Math.PI * 2);
    mctx.fill();
  }
  for (const m of enc.moderlings) {
    if (m.state === 'dead') continue;
    const [mx, my] = toMap(m.x, m.z);
    mctx.fillStyle = '#e07cff';
    mctx.shadowBlur = 0;
    mctx.fillRect(mx - 2, my - 2, 4, 4);
  }
  if (enc.star) {
    const [mx, my] = toMap(enc.star.x, enc.star.z);
    mctx.fillStyle = mctx.shadowColor = '#fff0b0';
    mctx.shadowBlur = 12;
    mctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 3 : 7;
      const a = (k / 10) * Math.PI * 2 + time;
      mctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r);
    }
    mctx.fill();
  }
  mctx.shadowBlur = 8;
  for (const p of active()) {
    const [mx, my] = toMap(p.x, p.z);
    mctx.fillStyle = mctx.shadowColor = p.i === 0 ? '#ffb347' : '#3ff5c8';
    mctx.beginPath();
    mctx.arc(mx, my, 4.5, 0, Math.PI * 2);
    mctx.fill();
  }
  mctx.shadowBlur = 0;
}

// --- Hauptschleife ---------------------------------------------------------------------------
let last = performance.now();
let srcT = 0;
const smoothFocus = new THREE.Vector3();
let waterNear = 0;
let waterT = 0;
function nestProximity() {
  if (mode !== 'play') return audio.nest(0);
  const n = nearestNest(rig.focus.x, rig.focus.z, 60);
  if (!n) return audio.nest(0);
  audio.nest(1 - Math.hypot(n.x - rig.focus.x, n.z - rig.focus.z) / 60, n.x, n.y + 1, n.z);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  if (mode === 'loading') return;
  tick(dt, true);
}

function tick(dt, draw) {
  input.poll();
  time += dt;
  U.uTime.value = time;
  U.uWind.value = 0.8 + 0.4 * Math.sin(time * 0.21);
  // die Nacht vergeht schneller als der Tag
  const nightSpeed = U.uNight.value > 0.5 ? 1.7 : 1;
  dayTime = (dayTime + (dt / DAY_LENGTH) * nightSpeed * (mode === 'play' ? 1 : mode === 'title' ? 0.6 : 0)) % 1;
  sim.night = mode === 'play' ? U.uNight.value : 0;

  if (mode === 'title') {
    titleUpdate(dt);
    rig.update(dt, [], field, 0);
    wispViews.forEach((w, i) => players[i] && w.update(players[i], dt, U.uNight.value));
  } else if (mode === 'play') playUpdate(dt);
  else if (mode === 'pause') pauseUpdate();
  else if (mode === 'help') helpUpdate();

  if (mode !== 'pause' && mode !== 'help') {
    simAcc += dt;
    let n = 0;
    while (simAcc >= 0.2 && n++ < 2) {
      sim.step(0.2);
      simAcc -= 0.2;
    }
    if (simAcc > 0.6) simAcc = 0;
    glowAcc += dt;
    n = 0;
    while (glowAcc >= 1 / 15 && n++ < 3) {
      sim.stepGlow(1 / 15);
      glowAcc -= 1 / 15;
    }
  }

  // Welt um die Kamera nachladen
  smoothFocus.copy(rig.focus);
  stream(smoothFocus);
  sim.pump(3);
  terrain.pump(4);
  veg.pump(4);

  sim.writeTexture(vit.data);
  vit.tex.needsUpdate = true;
  sim.writeTexture2(rotTex.data);
  rotTex.tex.needsUpdate = true;
  srcT -= dt;
  if (srcT <= 0) {
    srcT = 1;
    updateSources(rig.focus);
  }
  nests.update(rig.focus, (id) => !purged.has(id), dt, time);
  creatures.sync(enc, dt, time);
  nestProximity();
  sky.update(dayTime, rig.focus, dt);
  water.update(rig.focus);
  trees.update(rig.focus, (id) => awake.has(id), dt, time);
  ambient.update(rig.focus, field.height(rig.focus.x, rig.focus.z));
  const h = renderer.domElement.height * 1.12;
  effects.setViewport(h);
  ambient.setViewport(h);
  effects.update(dt);
  const g = stage.grade.uniforms;
  g.uFlash.value = Math.max(0, g.uFlash.value - dt * 0.6);

  // Klang
  let life = 0;
  let act = 0;
  let weave = 0;
  const list = active();
  if (mode === 'play' && list.length) {
    for (const p of list) {
      life += p.sample?.L ?? 0;
      act += p.activity;
      weave = Math.max(weave, p.weaving ? 1 : 0);
    }
    life /= list.length;
    act /= list.length;
  } else life = 0.7;
  const rotHere = mode === 'play' && list.length ? Math.max(...list.map((p) => p.sample?.B ?? 0)) : 0;
  // Wassernähe für Plätschern und Frösche
  waterT -= dt;
  if (waterT <= 0) {
    waterT = 0.5;
    let w = 0;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (field.height(rig.focus.x + Math.cos(a) * 18, rig.focus.z + Math.sin(a) * 18) < 0) w++;
    }
    waterNear = w / 12;
  }
  const danger =
    mode === 'play'
      ? Math.min(1, enc.moderlings.filter((m) => m.state === 'hunt' && Math.hypot(m.x - rig.focus.x, m.z - rig.focus.z) < 35).length / 3 + (purify.nest ? 0.4 : 0))
      : 0;
  const speed = list.length ? list.reduce((a, p) => a + Math.hypot(p.vx, p.vy ?? 0, p.vz), 0) / list.length : 0;
  audio.setListener(camera);
  audio.update({ life, night: U.uNight.value, activity: Math.min(1, act), weave, rot: rotHere, danger, water: waterNear, speed, play: mode === 'play' });

  if (mode === 'play' || mode === 'pause' || mode === 'help') {
    if (mode === 'play') hudUpdate(dt);
    saveT += dt;
    if (saveT > 12) {
      saveT = 0;
      saveNow();
    }
  }
  if (mode === 'title' && newWorldArm > 0 && newWorldArm - dt <= 0) renderTitle();

  if (draw) stage.render(dt);
  input.endFrame();
  endPadEdges();
}

// Testmodus (?manual): keine eigene Schleife, Bilder werden von außen angestoßen
const manual = params.has('manual');
window.__myzel = {
  field, sim, store, players, rig, meta, veg, U, stage, startGame, addPlayer, trees, terrain, sky, water, nests, fauna, progress, purged, enc, powers, audio,
  get mode() {
    return mode;
  },
  // n Simulationsschritte, danach ein Bild
  step(n = 1, dt = 1 / 30) {
    for (let i = 0; i < n; i++) tick(dt, i === n - 1);
  },
  setDayTime(t) {
    dayTime = t;
  },
};

setTimeout(() => {
  boot();
  if (!manual) requestAnimationFrame(frame);
}, 30);
