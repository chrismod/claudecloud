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
import { canResearch, crystalsFor, spentOn } from './game/research.js';
import { Hud } from './ui/hud.js';
import { renderMapList, renderCodex, renderResearch, renderHelp, showEnd } from './ui/screens.js';
import { t, tower, enemy, setLang, applyI18n } from './i18n.js';

const $ = (id) => document.getElementById(id);

// ---------- Fortschritt ----------
const STORE = 'bollwerk.progress';
const DEFAULTS = { maps: {}, unlockAll: false, numbers: true, quality: 'high', lang: 'en', crystals: 0, research: {} };
function loadProgress() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') };
  } catch {
    return { ...DEFAULTS };
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
function recordBest(mapDef, wave, won) {
  const r = (progress.maps[mapDef.id] ||= {});
  r.best = Math.max(r.best || 0, wave);
  if (won) r.won = true;
  saveProgress();
}
setLang(progress.lang);
applyI18n();
renderHelp();

// ---------- Darstellung ----------
const settings = { quality: progress.quality };
const stage = new Stage($('stage'), settings);
const board = new Board(stage);
const towerViews = new TowerViews(board);
const enemyViews = new EnemyViews(board);
const fx = new Fx(board, towerViews, enemyViews);
enemyViews.fx = fx;
const overlay = new Overlay($('overlay'), stage, enemyViews);
const sound = new Sound();
fx.setScale(window.innerHeight);
window.addEventListener('resize', () => fx.setScale(window.innerHeight));

const thumbs = renderSnapshots(TOWER_ORDER, Object.keys(ENEMIES));

// ---------- Zustand ----------
const ui = { mode: 'menu', speed: 1, paused: false, buildType: null, selected: null, ability: null, muted: sound.muted };
let game = null;
let def = null;
let ghost = null;
let hover = null;
let modal = null;
let run = null; // laufende Partie: { won, firstWin, finished }
const seenTypes = new Set();

const hud = new Hud(
  {
    callWave,
    togglePause: () => setPaused(!ui.paused),
    toggleMute: () => (ui.muted = sound.toggleMute()),
    openPause,
    resetView: () => stage.resetView(),
    setSpeed: (sp) => ((ui.speed = sp), sound.click()),
    selectBuild,
    ability: armAbility,
    deselect: () => select(null),
    upgrade: (tw) => (game.upgrade(tw) ? sound.upgrade() : sound.deny()),
    sell: (tw) => {
      game.sell(tw);
      sound.sell();
      select(null);
    },
    setTargeting: (tw, m) => (game.setTargeting(tw, m), sound.click()),
    chooseModule: (tw, i) => (game.chooseModule(tw, i), sound.upgrade()),
  },
  thumbs,
);

function setPaused(p) {
  ui.paused = p;
}

// ---------- Partien und Kristalle ----------
function wavesSurvived() {
  if (!game) return 0;
  if (game.state === 'lost') return Math.max(0, game.wave - 1);
  // eine Welle zählt als überstanden, wenn keine ihrer Gegner mehr unterwegs ist
  const open = game.enemies.some((e) => e.n === game.wave) || game.spawnQueue.some((q) => q.n === game.wave);
  return Math.max(0, open ? game.wave - 1 : game.wave);
}
function pendingCrystals() {
  if (!run || run.finished) return 0;
  return crystalsFor(MAPS.indexOf(def), wavesSurvived(), run.won, run.firstWin);
}
// Partie abschließen: Rekord und Kristalle gutschreiben (genau einmal)
function finishRun() {
  if (!run || run.finished || !game) return 0;
  const n = pendingCrystals();
  run.finished = true;
  recordBest(def, wavesSurvived(), run.won);
  progress.crystals += n;
  saveProgress();
  return n;
}

// ---------- Karten laden ----------
function loadMap(mapDef, play) {
  def = mapDef;
  game = new Game(mapDef, { towers: progress.unlockAll ? TOWER_ORDER : mapDef.towers, research: play ? progress.research : {} });
  const theme = stage.applyTheme(mapDef.theme);
  board.build(game, theme);
  stage.frame(game.map.W, game.map.H);
  towerViews.clear();
  enemyViews.clear();
  fx.clear();
  fx.setAmbient(mapDef.theme, game.map.W, game.map.H);
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
    run = { won: false, firstWin: false, finished: false };
    c.autoRotate = false;
    c.enabled = true;
    $('hud').classList.remove('hidden');
    $('menu').classList.add('hidden');
    hud.setGame(game);
    if (!progress.seenHelp) {
      progress.seenHelp = true;
      saveProgress();
      hud.toast(t('ui.hud.firstHelp'));
    }
  } else {
    ui.mode = 'menu';
    run = null;
    c.autoRotate = true;
    c.autoRotateSpeed = 0.35;
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
    c.enabled = false;
    $('hud').classList.add('hidden');
  }
}

function renderMenu() {
  renderMapList(progress, (m) => (sound.unlock(), sound.click(), loadMap(m, true)), (m) => m !== def && loadMap(m, false));
  $('menu-crystals').textContent = progress.crystals;
}

function openMenu() {
  closeModal();
  finishRun();
  renderMenu();
  $('menu').classList.remove('hidden');
  const first = MAPS.find((m, i) => !progress.maps[m.id]?.won && (i === 0 || progress.maps[MAPS[i - 1].id]?.won)) || MAPS[0];
  loadMap(def && ui.mode === 'menu' ? def : first, false);
}

// ---------- Modale Fenster ----------
let modalReturn = null;
function openModal(id, from = null) {
  closeModal();
  modal = id;
  modalReturn = from;
  $(id).classList.remove('hidden');
}
function closeModal() {
  if (modal) $(modal).classList.add('hidden');
  modal = null;
}
function backFromModal() {
  const back = modalReturn;
  closeModal();
  if (back) openModal(back);
}
function openPause() {
  if (ui.mode !== 'play') return;
  openModal('pause');
}

$('btn-resume').onclick = () => closeModal();
$('btn-restart').onclick = () => (closeModal(), finishRun(), loadMap(def, true));
$('btn-quit').onclick = () => openMenu();
const openCodex = (from) => {
  openModal('codex', from);
  renderCodex('towers', thumbs);
};
$('btn-codex').onclick = () => openCodex(null);
$('btn-codex2').onclick = () => openCodex('pause');
$('btn-codex-close').onclick = backFromModal;
for (const b of $('codex-tabs').querySelectorAll('button')) b.onclick = () => renderCodex(b.dataset.tab, thumbs);
$('btn-help').onclick = () => openModal('help');
$('btn-help-close').onclick = () => closeModal();

// Forschung
function openResearch() {
  sound.unlock();
  openModal('research');
  drawResearch();
}
function drawResearch() {
  renderResearch(progress, (id) => {
    const chk = canResearch(progress.research, progress.crystals, id);
    if (!chk.ok) return sound.deny();
    progress.crystals -= chk.cost;
    progress.research[id] = (progress.research[id] || 0) + 1;
    saveProgress();
    sound.upgrade();
    drawResearch();
  });
  $('menu-crystals').textContent = progress.crystals;
}
$('btn-research').onclick = openResearch;
$('btn-research-top').onclick = openResearch;
$('btn-research-close').onclick = () => closeModal();
armedButton($('btn-research-refund'), 'ui.research.refund', 'ui.research.refundConfirm', () => {
  progress.crystals += spentOn(progress.research);
  progress.research = {};
  saveProgress();
  sound.sell();
  drawResearch();
});

// Einstellungen
$('btn-settings').onclick = () => {
  $('opt-lang').value = progress.lang;
  $('opt-quality').value = progress.quality;
  $('opt-unlock').checked = progress.unlockAll;
  $('opt-numbers').checked = progress.numbers;
  openModal('settings');
};
$('opt-lang').onchange = () => {
  progress.lang = $('opt-lang').value;
  saveProgress();
  setLang(progress.lang);
  applyI18n();
  renderHelp();
  hud.relabel();
  renderMenu();
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
// Knopf mit eingebauter Rückfrage (zweimal klicken)
function armedButton(b, key, confirmKey, action) {
  b.onclick = () => {
    if (!b.dataset.armed) {
      b.dataset.armed = '1';
      b.textContent = t(confirmKey);
      b.classList.add('danger');
      setTimeout(() => {
        delete b.dataset.armed;
        b.textContent = t(key);
        b.classList.remove('danger');
      }, 3000);
      return;
    }
    delete b.dataset.armed;
    b.textContent = t(key);
    b.classList.remove('danger');
    action();
  };
}
armedButton($('btn-reset'), 'ui.settings.reset', 'ui.settings.resetConfirm', () => {
  progress.maps = {};
  progress.research = {};
  progress.crystals = 0;
  saveProgress();
  closeModal();
  openMenu();
});

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
  hud.hint(t('ui.hud.buildHint', { name: tower(type).name, cost: game.costOf(type) }));
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
    if (game.state === 'ready') hud.toast(t('ui.hud.abilitiesLater'));
    return;
  }
  if (ABILITIES[key].needsTarget) {
    ui.ability = ui.ability === key ? null : key;
    ui.buildType = null;
    clearGhost();
    hud.hint(ui.ability ? t('ui.hud.abilityHint', { name: t(`ability.${key}.name`) }) : '');
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
  const pickedId = towerViews.pick(ray);
  const picked = pickedId != null ? game.towers.find((t) => t.id === pickedId) : null;
  if (c.out && !picked) return select(null);
  const existing = picked || game.towerAtCell(c.cx, c.cy);
  if (ui.buildType) {
    if (existing) return select(existing);
    const res = game.canBuild(ui.buildType, c.cx, c.cy);
    if (!res.ok) {
      sound.deny();
      hud.hint(`<b>${t(`reason.${res.reason}`)}</b>`);
      setTimeout(() => ui.buildType && hud.hint(t('ui.hud.buildHint', { name: tower(ui.buildType).name, cost: game.costOf(ui.buildType) })), 1100);
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
      backFromModal();
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
        fx.muzzle(e.id, e.tower);
        sound.shot(e.tower);
        break;
      case 'explosion':
        sound.explosion(e.big);
        break;
      case 'death':
        enemyViews.die(e);
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
        hud.toast(t('ui.hud.early', { n: e.amount }));
        sound.coin();
        break;
      case 'build':
        sound.build();
        break;
      case 'rank':
        overlay.text(board.wx(e.x), 1.1, board.wz(e.y), t('ui.hud.rank', { n: e.rank }), '#c9a4ff', 13);
        break;
      case 'wave': {
        sound.wave(e.boss);
        const w = game.waveDef(e.n);
        if (e.boss) {
          const b = w.groups.find((g) => ENEMIES[g.type].boss);
          const en = enemy(b.type);
          hud.toast(t('ui.hud.boss', { n: e.n, name: en.name, blurb: en.blurb.replace(/^Boss\. /, '') }), 'boss');
        }
        for (const g of w.groups) {
          if (ENEMY_UNLOCK[g.type] === e.n && !seenTypes.has(g.type)) {
            seenTypes.add(g.type);
            hud.toast(t('ui.hud.newEnemy', { name: enemy(g.type).name, blurb: enemy(g.type).blurb }));
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
        run.won = true;
        run.firstWin = !wasWon;
        recordBest(def, game.wave, true);
        const nextMap = MAPS[idx + 1];
        const extra = nextMap && !wasWon && !progress.unlockAll ? t('ui.end.newMap', { name: t(`map.${nextMap.id}.name`) }) : '';
        setTimeout(() => {
          openModal('end');
          showEnd('victory', game, def, extra, t('ui.end.crystalsLater', { n: pendingCrystals() }), [
            [t('ui.end.toMenu'), 'ghost', () => openMenu()],
            [t('ui.end.endless'), 'primary', () => (game.continueEndless(), closeModal())],
          ]);
        }, 900);
        break;
      }
      case 'defeat': {
        sound.defeat();
        const before = progress.maps[def.id]?.best || 0;
        const n = finishRun();
        const survived = Math.max(0, game.wave - 1);
        const extra = survived > before && before > 0 ? t('ui.end.newRecord') : before ? t('ui.end.record', { n: before }) : '';
        setTimeout(() => {
          openModal('end');
          showEnd('defeat', game, def, extra, n ? `<span class="ico crystal"></span>${t('ui.end.crystals', { n })}` : '', [
            [t('ui.end.toMenu'), 'ghost', () => openMenu()],
            [t('ui.end.again'), 'primary', () => (closeModal(), loadMap(def, true))],
          ]);
        }, 1200);
        break;
      }
      case 'interest':
        hud.toast(t('ui.hud.interest', { n: e.amount }));
        sound.coin();
        break;
      case 'barrier':
        hud.toast(t('ui.hud.barrier', { n: e.left }));
        overlay.text(board.wx(game.map.base.x + 0.5), 1.3, board.wz(game.map.base.y + 0.5), '◈', '#7ee8ff', 22);
        break;
      case 'medic':
        hud.toast(t('ui.hud.medic', { n: e.amount }));
        break;
      case 'boss':
        sound.boss(e.ability);
        if (e.ability === 'stomp' && e.towers) hud.toast(t('ui.hud.stomp', { n: e.towers }), 'boss');
        if (e.ability === 'burst') hud.toast(t('ui.hud.burst'), 'boss');
        break;
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
    fx.update(ui.mode === 'menu' ? rdt : gdt, game);
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
