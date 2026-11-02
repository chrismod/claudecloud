// Myzel – Spielablauf: Laden, Titel mit Beitreten, Spiel, Pause; Streaming der endlosen Welt.
import * as THREE from 'three';
import { CHUNK, DAY_LENGTH, WIN } from './config.js';
import { createField } from './world/field.js';
import { createStore, lastSeed } from './world/store.js';
import { createSim } from './world/sim.js';
import { U, createVitalityTexture } from './render/shared.js';
import { createStage } from './render/stage.js';
import { createSky } from './render/sky.js';
import { createTerrain } from './render/terrain.js';
import { createWater } from './render/water.js';
import { createVegetation } from './render/vegetation.js';
import { createMotherTrees } from './render/motherTrees.js';
import { WispView, Thread } from './render/wisps.js';
import { Effects, Ambient } from './render/particles.js';
import { createInput } from './game/input.js';
import { createCameraRig } from './game/cameraRig.js';
import { Player, boonsFor, BOONS, COST, NAMES } from './game/players.js';
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
  { created: Date.now(), dayTime: 0.29, awake: [], consumed: [], healed: {}, players: null, playTime: 0, yaw: 0.35 },
  store.loadMeta() || {},
);
const awake = new Set(['0,0', ...meta.awake]);

// --- Darstellung -----------------------------------------------------------------------------
const stage = createStage($('stage'));
const { scene, camera, renderer } = stage;
const vit = createVitalityTexture();
const sky = createSky(scene, renderer);
const terrain = createTerrain(scene, field, store);
const water = createWater(scene);
const veg = createVegetation(scene, field);
veg.setConsumed(meta.consumed);
const trees = createMotherTrees(scene, field);
const effects = new Effects(scene);
const ambient = new Ambient(scene);
const sim = createSim(field, store);
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
const active = () => players.filter(Boolean);
const boons = () => boonsFor(awake.size - 1);

function stream(focus, immediate = false) {
  const ccx = Math.floor(focus.x / CHUNK);
  const ccz = Math.floor(focus.z / CHUNK);
  sim.ensureWindow(ccx, ccz, immediate);
  U.uWinCenter.value.set((ccx + 0.5) * CHUNK, (ccz + 0.5) * CHUNK);
  terrain.setCenter(ccx, ccz, immediate);
  veg.setCenter(ccx, ccz);
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
  stream(focus, true);
  while (veg.pump(1000) > 0);
  veg.rebuild();
  sim.writeTexture(vit.data);
  vit.tex.needsUpdate = true;
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
  showToast('Wo ihr gleitet, wächst Myzel', 'Weckt die schlafenden Mutterbäume');
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
      const added = sim.paintLine(a.x, a.z, c.x, c.z, 1.6 * b.radius, 0.92, 0.5, 0.8);
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
    const sample = p.act(inp, dt, { sim, boons: b });
    p.sample = sample;
    const nearRitual = ritual.site && ritual.ready && Math.hypot(p.x - ritual.site.x, p.z - ritual.site.z) < 13;
    p.ritual = nearRitual && inp.pulse;
    if (p.ritual) {
      holders++;
      if (Math.random() < 0.7)
        effects.emit({ x: p.x, y: p.y, z: p.z, count: 2, speed: 2, color: wispViews[p.i].color.clone().multiplyScalar(2.5), life: 2, size: 0.45, target: { x: ritual.site.x, y: field.height(ritual.site.x, ritual.site.z) + 9, z: ritual.site.z }, gravity: 0, drag: 2 });
    } else if (inp.pulseDown && !nearRitual) {
      if (p.tryPulse(sim, b)) {
        const col = wispViews[p.i].color.clone().multiplyScalar(2.2);
        effects.emit({ x: p.x, y: p.y - 0.8, z: p.z, count: 90, speed: 9, up: 0.15, color: col, life: 1.1, size: 0.4, gravity: -1, drag: 2.2 });
        audio.pulse(panOf(p.x, p.z), p.hue);
        input.rumble(p.binding, 0.25, 0.5, 140);
      } else if (p.denyCd <= 0) {
        p.denyCd = 0.4;
        audio.denied();
      }
    }
    // Zersetzen: Totholz in Sporen verwandeln
    if (inp.decompose) {
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
    sim.paint(s.x, s.z, r, 1, 0.5, 1);
    sim.bloom(s.x, s.z, r * 0.85, 0.88);
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
  showToast('Ein Mutterbaum erwacht', `Gabe: ${boon.name} – ${boon.text}`, 6);
  audio.awaken();
  rig.shake = 1.1;
  stage.grade.uniforms.uFlash.value = 0.75;
  rumbleAll(1, 1, 900);
  const y = field.height(site.x, site.z);
  effects.emit({ x: site.x, y: y + 6, z: site.z, count: 400, speed: 16, up: 0.6, color: new THREE.Color(1.8, 1.5, 0.8), life: 2.6, size: 0.7, gravity: -0.4, drag: 1.2 });
  saveNow();
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
    if (p.ritual) st = 'Weckt den Mutterbaum …';
    else if (p.decompose) st = `Zersetzt Totholz · ${Math.round(p.decompose.t * 100)} %`;
    else if (p.weaving) st = 'Webt Myzel';
    else if (p.spores < COST.pulse) st = 'Sporen erschöpft – sammelt auf lebendigem Boden';
    else if (p.boosting) st = 'Gleitet';
    card.querySelector('.pstate').textContent = st;
  }
  // Statistik
  statT -= dt;
  if (statT <= 0) {
    statT = 1;
    for (const [k, c] of sim.chunkCounts()) meta.healed[k] = c;
    const n = awake.size - 1;
    const s = `<div><b>${fmtArea(totalHealed())}</b><span>belebt</span></div><div><b>${n}</b><span>${n === 1 ? 'Mutterbaum' : 'Mutterbäume'} erweckt</span></div><div><b>${clockText()}</b><span>${U.uNight.value > 0.5 ? 'Nacht' : 'Tag'}</span></div>`;
    if (s !== lastStats) $('stats').innerHTML = lastStats = s;
  }
  // Labels
  let li = 0;
  if (ritual.site) {
    const s = ritual.site;
    const sc = toScreen(s.x, field.height(s.x, s.z) + 21, s.z);
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
    if (!near) continue;
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
  for (let i = li; i < labelPool.length; i++) labelPool[i].style.display = 'none';

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
    cp.style.left = innerWidth / 2 + Math.cos(a) * rx + 'px';
    cp.style.top = innerHeight / 2 - Math.sin(a) * ry + 'px';
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
const smoothFocus = new THREE.Vector3();
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
  dayTime = (dayTime + dt / DAY_LENGTH * (mode === 'play' ? 1 : mode === 'title' ? 0.6 : 0)) % 1;

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
  audio.update({ life, night: U.uNight.value, activity: Math.min(1, act), weave });

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
  field, sim, store, players, rig, meta, veg, U, stage, startGame, addPlayer, trees, terrain, sky, water,
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
