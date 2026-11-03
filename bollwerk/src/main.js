// Bollwerk – Spielablauf, Eingabe und Verdrahtung von Simulation, Darstellung und Oberfläche.
import './style.css';
import * as THREE from 'three';
import { Stage } from './render/stage.js';
import { Board, tileTop } from './render/board.js';
import { TowerViews, buildTowerModel } from './render/towers.js';
import { EnemyViews } from './render/enemies.js';
import { Fx } from './render/fx.js';
import { Overlay } from './render/overlay.js';
import { renderSnapshots } from './render/thumbs.js';
import { Sound } from './audio.js';
import { Game } from './game/game.js';
import { MAPS } from './game/maps.js';
import { TOWERS, TOWER_ORDER, ENEMIES, ENEMY_UNLOCK, ABILITIES, TARGETING } from './game/data.js';
import { Hud } from './ui/hud.js';
import { renderMapList, renderCodex, showEnd } from './ui/screens.js';

const $ = (id) => document.getElementById(id);

// ---------- Fortschritt ----------
const STORE = 'bollwerk.progress';
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(STORE) || '{}');
    return { maps: {}, unlockAll: false, numbers: true, quality: 'high', ...p };
  } catch {
    return { maps: {}, unlockAll: false, numbers: true, quality: 'high' };
  }
}
const progress = loadProgress();
function saveProgress() {
  try {
    localStorage.setItem(STORE, JSON.stringify(progress));
  } catch {
    /* privates Fenster o. ä. */
  }
}
function recordBest(def, wave, won) {
  const r = (progress.maps[def.id] ||= {});
  r.best = Math.max(r.best || 0, wave);
  if (won) r.won = true;
  saveProgress();
}

// ---------- Darstellung ----------
const settings = { quality: progress.quality };
const stage = new Stage($('stage'), settings);
const board = new Board(stage);
const towerViews = new TowerViews(board);
const enemyViews = new EnemyViews(board);
const fx = new Fx(board, towerViews, enemyViews);
const overlay = new Overlay($('overlay'), stage, enemyViews);
const sound = new Sound();
fx.setScale(window.innerHeight);
window.addEventListener('resize', () => fx.setScale(window.innerHeight));

const thumbs = renderSnapshots(TOWER_ORDER, Object.keys(ENEMIES));

// ---------- Zustand ----------
const ui = { mode: 'menu', speed: 1, paused: false, buildType: null, selected: null, ability: null, muted: sound.muted, keepBuild: false };
let game = null;
let def = null;
let ghost = null;
let hover = null;
let modal = null;
const seenTypes = new Set();

const hud = new Hud(
  {
    callWave,
    togglePause: () => setPaused(!ui.paused),
    toggleMute: () => (ui.muted = sound.toggleMute()),
    openPause,
    resetView: () => stage.resetView(),
    setSpeed: (s) => ((ui.speed = s), sound.click()),
    selectBuild,
    ability: armAbility,
    deselect: () => select(null),
    upgrade: (t) => (game.upgrade(t) ? sound.upgrade() : sound.deny()),
    sell: (t) => {
      game.sell(t);
      sound.sell();
      select(null);
    },
    setTargeting: (t, m) => (game.setTargeting(t, m), sound.click()),
    chooseModule: (t, i) => (game.chooseModule(t, i), sound.upgrade()),
  },
  thumbs,
);

function setPaused(p) {
  ui.paused = p;
}

// ---------- Karten laden ----------
function loadMap(mapDef, play) {
  def = mapDef;
  game = new Game(mapDef, { towers: progress.unlockAll ? TOWER_ORDER : mapDef.towers });
  const theme = stage.applyTheme(mapDef.theme);
  board.build(game, theme);
  stage.frame(game.map.W, game.map.H);
  towerViews.clear();
  enemyViews.clear();
  fx.clear();
  overlay.clear();
  clearGhost();
  ui.buildType = null;
  ui.selected = null;
  ui.ability = null;
  ui.paused = false;
  seenTypes.clear();
  const c = stage.controls;
  if (play) {
    ui.mode = 'play';
    c.autoRotate = false;
    c.enabled = true;
    $('hud').classList.remove('hidden');
    $('menu').classList.add('hidden');
    hud.setGame(game);
    if (!progress.seenHelp) {
      progress.seenHelp = true;
      saveProgress();
      hud.toast('Wähle unten einen Turm und klicke auf eine helle Plattform. <b>Leertaste</b> startet die erste Welle.');
    }
  } else {
    ui.mode = 'menu';
    c.autoRotate = true;
    c.autoRotateSpeed = 0.35;
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
    c.enabled = false;
    $('hud').classList.add('hidden');
  }
}

function openMenu() {
  closeModal();
  if (game && def && ui.mode === 'play') recordBest(def, game.stats.bestWave, game.state === 'won' || game.endless);
  renderMapList(progress, (m) => (sound.unlock(), sound.click(), loadMap(m, true)), (m) => m !== def && loadMap(m, false));
  $('menu').classList.remove('hidden');
  const first = MAPS.find((m, i) => !progress.maps[m.id]?.won && (i === 0 || progress.maps[MAPS[i - 1].id]?.won)) || MAPS[0];
  loadMap(def && ui.mode === 'menu' ? def : first, false);
}

// ---------- Modale Fenster ----------
function openModal(id) {
  closeModal();
  modal = id;
  $(id).classList.remove('hidden');
}
function closeModal() {
  if (modal) $(modal).classList.add('hidden');
  modal = null;
}
function openPause() {
  if (ui.mode !== 'play') return;
  openModal('pause');
}

$('btn-resume').onclick = () => closeModal();
$('btn-restart').onclick = () => (closeModal(), recordBest(def, game.stats.bestWave, false), loadMap(def, true));
$('btn-quit').onclick = () => openMenu();
let codexReturn = null;
const openCodex = (from) => {
  codexReturn = from;
  openModal('codex');
  renderCodex('towers', thumbs);
};
$('btn-codex').onclick = () => openCodex(null);
$('btn-codex2').onclick = () => openCodex('pause');
$('btn-codex-close').onclick = () => (codexReturn ? openModal(codexReturn) : closeModal());
for (const b of $('codex-tabs').querySelectorAll('button')) b.onclick = () => renderCodex(b.dataset.tab, thumbs);
$('btn-help').onclick = () => openModal('help');
$('btn-help-close').onclick = () => closeModal();
$('btn-settings').onclick = () => {
  $('opt-quality').value = progress.quality;
  $('opt-unlock').checked = progress.unlockAll;
  $('opt-numbers').checked = progress.numbers;
  openModal('settings');
};
$('btn-settings-close').onclick = () => {
  progress.quality = $('opt-quality').value;
  progress.unlockAll = $('opt-unlock').checked;
  progress.numbers = $('opt-numbers').checked;
  saveProgress();
  stage.setQuality(progress.quality);
  closeModal();
  openMenu();
};
$('btn-reset').onclick = () => {
  if (!confirm('Fortschritt wirklich löschen?')) return;
  progress.maps = {};
  saveProgress();
  closeModal();
  openMenu();
};

// ---------- Aktionen ----------
function callWave() {
  if (!game || ui.mode !== 'play') return;
  sound.unlock();
  if (game.callWave()) sound.click();
}

function selectBuild(type) {
  if (!game || !game.allowed.has(type)) return;
  sound.unlock();
  ui.ability = null;
  if (ui.buildType === type) {
    ui.buildType = null;
    clearGhost();
    hud.hint('');
    return;
  }
  select(null);
  ui.buildType = type;
  clearGhost();
  ghost = buildTowerModel(type, 1, null, true);
  ghost.root.visible = false;
  stage.scene.add(ghost.root);
  sound.click();
  hud.hint(`<b>${TOWERS[type].name}</b> (${TOWERS[type].cost}) – Plattform wählen · <kbd>Shift</kbd> für mehrere · <kbd>Esc</kbd> abbrechen`);
  updateHover();
}

function clearGhost() {
  if (ghost) stage.scene.remove(ghost.root);
  ghost = null;
}

function select(t) {
  ui.selected = t;
  if (t) {
    ui.buildType = null;
    clearGhost();
    hud.hint('');
  }
  updateHover();
}

function armAbility(key) {
  if (!game || ui.mode !== 'play') return;
  sound.unlock();
  if (!game.abilityReady(key)) {
    sound.deny();
    if (game.state === 'ready') hud.toast('Fähigkeiten gibt es ab der ersten Welle.');
    return;
  }
  if (ABILITIES[key].needsTarget) {
    ui.ability = ui.ability === key ? null : key;
    ui.buildType = null;
    clearGhost();
    hud.hint(ui.ability ? `<b>${ABILITIES[key].name}</b> – Ziel auf der Karte wählen · <kbd>Esc</kbd> abbrechen` : '');
    updateHover();
    return;
  }
  game.useAbility(key);
}

// ---------- Zeiger ----------
const el = stage.renderer.domElement;
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
let pointer = null;
let down = null;

function pickCell(cx, cy) {
  if (!game) return null;
  const r = el.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, stage.camera);
  let res = null;
  // erst auf Plattformhöhe, dann auf der Höhe des getroffenen Felds verfeinern
  for (const h of [0.3, null]) {
    const hh = h ?? (res ? tileTop(game.map.tileAt(res.cx, res.cy)) : 0.3);
    plane.constant = -hh;
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    const x = hit.x + game.map.W / 2;
    const y = hit.z + game.map.H / 2;
    res = { x, y, cx: Math.floor(x), cy: Math.floor(y) };
  }
  if (res.cx < 0 || res.cy < 0 || res.cx >= game.map.W || res.cy >= game.map.H) return { ...res, out: true };
  return res;
}

function updateHover() {
  if (!game || ui.mode !== 'play') {
    board.showCursor(null);
    board.showRange(null);
    return;
  }
  hover = pointer ? pickCell(pointer.x, pointer.y) : null;
  const inside = hover && !hover.out;
  if (ui.ability === 'meteor') {
    board.showCursor(null);
    if (hover) board.showRange(hover.x, hover.y, ABILITIES.meteor.radius, '.', '#ff8a3d');
    else board.showRange(null);
    return;
  }
  if (ui.buildType) {
    if (!inside) {
      board.showCursor(null);
      board.showRange(null);
      if (ghost) ghost.root.visible = false;
      return;
    }
    const tile = game.map.tileAt(hover.cx, hover.cy);
    const ok = game.canBuild(ui.buildType, hover.cx, hover.cy).ok;
    board.showCursor(hover.cx, hover.cy, ok, tile);
    const s = game.levelStats(ui.buildType, 1, null);
    const range = (s.range || 0) * (tile === 'R' ? 1.2 : 1);
    board.showRange(hover.cx + 0.5, hover.cy + 0.5, game.map.isBuildable(hover.cx, hover.cy) ? range : 0, tile, ok ? '#8dffb0' : '#ff8a8a', s.minRange || 0);
    if (ghost) {
      ghost.root.visible = game.map.isBuildable(hover.cx, hover.cy) && !game.towerAtCell(hover.cx, hover.cy);
      ghost.root.position.set(board.wx(hover.cx + 0.5), tileTop(tile), board.wz(hover.cy + 0.5));
    }
    return;
  }
  const t = ui.selected;
  if (t && t.alive) {
    board.showRange(t.x, t.y, t.stats.range, t.tile, t.def.kind === 'support' ? '#ffe7a3' : '#ffffff', t.stats.minRange || 0);
  } else board.showRange(null);
  if (inside && (game.towerAtCell(hover.cx, hover.cy) || game.map.isBuildable(hover.cx, hover.cy))) {
    board.showCursor(hover.cx, hover.cy, true, game.map.tileAt(hover.cx, hover.cy));
  } else board.showCursor(null);
}

el.addEventListener('pointermove', (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  updateHover();
});
el.addEventListener('pointerleave', () => {
  pointer = null;
  updateHover();
});
el.addEventListener('pointerdown', (e) => {
  sound.unlock();
  pointer = { x: e.clientX, y: e.clientY };
  down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button, shift: e.shiftKey };
});
el.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (down.button === 0 && moved < 8 && performance.now() - down.t < 700) click(e.clientX, e.clientY, down.shift || e.shiftKey);
  else if (down.button === 2 && moved < 6) cancel();
  down = null;
});
el.addEventListener('contextmenu', (e) => e.preventDefault());

function click(x, y, shift) {
  if (!game || ui.mode !== 'play') return;
  pointer = { x, y };
  const c = pickCell(x, y);
  if (!c) return;
  if (ui.ability === 'meteor') {
    if (game.useAbility('meteor', c.x, c.y)) {
      ui.ability = null;
      hud.hint('');
    }
    updateHover();
    return;
  }
  if (c.out) return select(null);
  const existing = game.towerAtCell(c.cx, c.cy);
  if (ui.buildType) {
    if (existing) return select(existing);
    const res = game.canBuild(ui.buildType, c.cx, c.cy);
    if (!res.ok) {
      sound.deny();
      hud.hint(`<b>${res.reason}</b>`);
      setTimeout(() => ui.buildType && hud.hint(`<b>${TOWERS[ui.buildType].name}</b> – Plattform wählen · <kbd>Shift</kbd> für mehrere · <kbd>Esc</kbd> abbrechen`), 1100);
      return;
    }
    game.build(ui.buildType, c.cx, c.cy);
    if (!shift || game.coins < TOWERS[ui.buildType].cost) {
      ui.buildType = null;
      clearGhost();
      hud.hint('');
    }
    updateHover();
    return;
  }
  select(existing || null);
  if (existing) sound.click();
}

function cancel() {
  if (ui.ability) ui.ability = null;
  else if (ui.buildType) {
    ui.buildType = null;
    clearGhost();
  } else if (ui.selected) ui.selected = null;
  else return false;
  hud.hint('');
  updateHover();
  return true;
}

// ---------- Tastatur ----------
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const k = e.key;
  if (k === 'Escape') {
    if (modal) {
      if (modal === 'codex' && codexReturn) openModal(codexReturn);
      else closeModal();
      return;
    }
    if (ui.mode === 'play' && !cancel()) openPause();
    return;
  }
  if (ui.mode !== 'play' || modal) return;
  sound.unlock();
  const lower = k.toLowerCase();
  if (k === ' ') {
    e.preventDefault();
    callWave();
  } else if (/^[0-9]$/.test(k) || k === 'ß') {
    const i = k === '0' ? 9 : k === 'ß' ? 10 : Number(k) - 1;
    const type = hud.keyType(i);
    if (type) selectBuild(type);
  } else if (lower === 'p') setPaused(!ui.paused);
  else if (lower === 'f') ui.speed = (ui.speed % 3) + 1;
  else if (lower === 'm') ui.muted = sound.toggleMute();
  else if (lower === 'c') stage.resetView();
  else if (lower === 'q') armAbility('meteor');
  else if (lower === 'w') armAbility('blizzard');
  else if (lower === 'e') armAbility('overdrive');
  else if (lower === 'u' && ui.selected) {
    if (game.upgrade(ui.selected)) sound.upgrade();
    else sound.deny();
  } else if (lower === 't' && ui.selected && ui.selected.def.kind !== 'support' && ui.selected.def.kind !== 'economy') {
    const i = TARGETING.findIndex((m) => m.key === ui.selected.targeting);
    game.setTargeting(ui.selected, TARGETING[(i + 1) % TARGETING.length].key);
    sound.click();
  } else if ((k === 'Delete' || k === 'Backspace') && ui.selected) {
    game.sell(ui.selected);
    sound.sell();
    select(null);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && ui.mode === 'play' && game?.state === 'running') setPaused(true);
});

// ---------- Ereignisse aus der Simulation ----------
function processEvents() {
  const evs = game.events;
  if (!evs.length) return;
  for (const e of evs) {
    fx.handle(e, game);
    switch (e.type) {
      case 'shot':
        towerViews.shot(e.id);
        sound.shot(e.tower);
        break;
      case 'explosion':
        sound.explosion(e.big);
        break;
      case 'death':
        sound.death(e.boss);
        if (progress.numbers) overlay.text(board.wx(e.x), e.flying ? 1.2 : 0.55, board.wz(e.y), `+${e.bounty}`, '#ffd25e', e.boss ? 20 : 12);
        break;
      case 'leak':
        sound.leak();
        hud.flash('lives', 'flash');
        overlay.text(board.wx(game.map.base.x + 0.5), 1.3, board.wz(game.map.base.y + 0.5), `−${e.amount}`, '#ff6b7d', 18);
        break;
      case 'income':
        overlay.text(board.wx(e.x), 0.9, board.wz(e.y), `+${e.amount}`, '#ffd25e', 16);
        sound.coin();
        break;
      case 'early':
        hud.toast(`Früh gerufen: <b>+${e.amount}</b> Münzen`);
        sound.coin();
        break;
      case 'build':
        sound.build();
        break;
      case 'rank':
        overlay.text(board.wx(e.x), 1.1, board.wz(e.y), `Rang ${e.rank}`, '#c9a4ff', 13);
        break;
      case 'wave': {
        sound.wave(e.boss);
        const w = game.waveDef(e.n);
        if (e.boss) {
          const b = w.groups.find((g) => ENEMIES[g.type].boss);
          hud.toast(`Welle ${e.n}: <b>${ENEMIES[b.type].name}</b> naht! ${ENEMIES[b.type].blurb.replace('Boss. ', '')}`, 'boss');
        }
        for (const g of w.groups) {
          if (ENEMY_UNLOCK[g.type] === e.n && !seenTypes.has(g.type)) {
            seenTypes.add(g.type);
            hud.toast(`Neu: <b>${ENEMIES[g.type].name}</b> – ${ENEMIES[g.type].blurb}`);
          }
        }
        break;
      }
      case 'ability':
        sound.ability(e.key);
        break;
      case 'victory': {
        sound.victory();
        const idx = MAPS.indexOf(def);
        const wasWon = progress.maps[def.id]?.won;
        recordBest(def, game.wave, true);
        const nextMap = MAPS[idx + 1];
        const extra = nextMap && !wasWon && !progress.unlockAll ? `Neue Karte freigeschaltet: <b>${nextMap.name}</b>` : '';
        setTimeout(() => {
          openModal('end');
          showEnd('victory', game, def, extra, [
            ['Zur Kartenwahl', 'ghost', () => openMenu()],
            ['Endlos weiterspielen', 'primary', () => (game.continueEndless(), closeModal())],
          ]);
        }, 900);
        break;
      }
      case 'defeat': {
        sound.defeat();
        const before = progress.maps[def.id]?.best || 0;
        recordBest(def, Math.max(0, game.wave - 1), false);
        const extra = game.wave - 1 > before && before > 0 ? 'Neuer Rekord!' : before ? `Rekord: Welle ${before}` : '';
        setTimeout(() => {
          openModal('end');
          showEnd('defeat', game, def, extra, [
            ['Zur Kartenwahl', 'ghost', () => openMenu()],
            ['Nochmal', 'primary', () => (closeModal(), loadMap(def, true))],
          ]);
        }, 1200);
        break;
      }
      default:
    }
  }
  if (evs.some((e) => e.type === 'death' || e.type === 'income' || e.type === 'early')) {
    if (evs.some((e) => e.type === 'income' || e.type === 'early')) hud.flash('coins', 'gain');
  }
  if (evs.some((e) => e.type === 'sell' || e.type === 'build' || e.type === 'upgrade' || e.type === 'module')) updateHover();
  evs.length = 0;
}

// ---------- Hauptschleife ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let gdt = 0;
  if (game && ui.mode === 'play' && !ui.paused && !modal) {
    gdt = rdt * ui.speed;
    game.step(gdt);
  }
  if (game) {
    processEvents();
    towerViews.sync(game);
    towerViews.update(ui.mode === 'menu' ? rdt : gdt);
    enemyViews.update(gdt, game);
    fx.update(gdt, game);
    if (ui.selected && !ui.selected.alive) select(null);
  }
  board.update(rdt, game);
  stage.update(rdt);
  stage.render(rdt);
  overlay.draw(ui.paused || modal ? 0 : rdt, ui.mode === 'play' ? game : null, board);
  if (game && ui.mode === 'play') hud.update(game, ui);
  if (ghost) ghost.root.rotation.y += rdt * 0.6;
}

openMenu();
requestAnimationFrame(frame);

// Für Tests und Neugierige
window.bollwerk = { get game() {
  return game;
}, stage, loadMap: (i) => loadMap(MAPS[i], true), screenOf: (x, y, h = 0.3) => {
  const v = new THREE.Vector3(board.wx(x), h, board.wz(y)).project(stage.camera);
  return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight];
} };
