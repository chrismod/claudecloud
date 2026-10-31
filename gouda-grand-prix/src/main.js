// Gouda Grand Prix – Spielablauf: Titel mit Demo-Rennen, Menüs, Rennen (1–2 Spieler), Grand Prix mit Werkstatt
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow-condensed/900-italic.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/700.css';
import './style.css';
import * as THREE from 'three';
import { createView, ChaseCam } from './render/view.js';
import { buildWorld } from './render/world.js';
import { createKartModel } from './render/kart.js';
import { createFx } from './render/fx.js';
import { createItemViews } from './render/items.js';
import { renderPortraits } from './render/portraits.js';
import { createRace, finalResults, DT } from './sim/race.js';
import { TRACKS } from './sim/tracks.js';
import { DRIVERS, POINTS, COINS, UPGRADES, ITEMS } from './sim/config.js';
import { WALL } from './sim/track.js';
import { createInput } from './input.js';
import { audio } from './audio.js';
import { createHud } from './ui/hud.js';
import { createScreens } from './ui/screens.js';
import { ICONS } from './ui/icons.js';

const view = createView(document.getElementById('stage'));
const input = createInput();
const hud = createHud(document.getElementById('hud'));
const screens = createScreens(document.getElementById('screens'), { sfx: (n) => audio.sfx(n), padInfo });
const portraits = renderPortraits();
const divider = document.getElementById('divider');
const fade = document.getElementById('fade');

const opts = { players: 1, mode: 'gp', difficulty: 'mittel', drivers: [0, 1] };
let gp = null;
let state = 'title'; // title | menu | race | paused | results
let session = null;
let last = performance.now();

// Debug-Zugang (für automatische Tests im Browser)
window.__ggp = { get session() { return session; }, get state() { return state; }, opts, startRace: (...a) => startRace(...a), startGP: (ids) => startGP(ids) };

function padInfo() {
  const pads = input.pads();
  if (!pads.length) return `<span class="pad off">${ICONS.gamepad} Kein Gamepad – Taste auf dem Gamepad drücken zum Verbinden</span>`;
  return pads.map((p, i) => `<span class="pad on p${i + 1}">${ICONS.gamepad} Gamepad ${i + 1}: ${p.id.replace(/\(.*?\)/g, '').slice(0, 28)}</span>`).join('');
}

// --- Rennen aufbauen / abbauen ------------------------------------------------------------------------
function disposeSession() {
  if (!session) return;
  audio.stopEngines();
  session.world.scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
  session.world.env.dispose();
  session = null;
}

function buildSession(trackIdx, entrants, { attract = false } = {}) {
  disposeSession();
  const def = TRACKS[trackIdx];
  const race = createRace({ trackDef: def, entrants, difficulty: opts.difficulty, seed: (Math.random() * 1e9) | 0 });
  const world = buildWorld({ track: race.track, def, renderer: view.renderer });
  const fx = createFx(world.scene);
  const items = createItemViews(world.scene, race);
  const models = race.karts.map((k) => {
    const m = createKartModel(k.driver);
    m.group.traverse((o) => {
      if (o.isMesh && o.castShadow) o.castShadow = true;
    });
    world.scene.add(m.group);
    return m;
  });
  const humans = race.karts.filter((k) => k.human >= 0).sort((a, b) => a.human - b.human);
  const cams = (humans.length ? humans : [race.karts[0]]).map(() => new ChaseCam(race.track));
  view.renderer.toneMappingExposure = world.theme.exposure;
  view.setBloom(world.theme.bloom);
  session = {
    def,
    trackIdx,
    race,
    world,
    fx,
    items,
    models,
    humans,
    cams,
    acc: 0,
    attract,
    look: humans.map(() => false),
    eff: (humans.length ? humans : [0]).map(() => ({ boost: 0, stink: 0, hit: 0 })),
    doneT: 0,
    finalLapPlayed: false,
    spect: { kart: race.karts[0], shot: 'chase', t: 0, pos: new THREE.Vector3() },
  };
  setupViews();
  // Shader vorab übersetzen, damit der Start nicht ruckelt
  view.renderer.compile(world.scene, session.cams[0].camera);
  return session;
}

function setupViews() {
  const s = session;
  const n = s.cams.length;
  const rects = n === 2 ? [[0, 0.5, 1, 0.5], [0, 0, 1, 0.5]] : [[0, 0, 1, 1]];
  view.setViews(
    s.cams.map((c, i) => ({
      scene: s.world.scene,
      camera: c.camera,
      rect: rects[i],
      before: () => {
        const k = s.humans[i] ?? s.spect.kart;
        s.world.focusShadow(k.x, k.y, k.z);
        const { height, pixelRatio } = view.size;
        s.fx.setViewportHeight(height * pixelRatio * rects[i][3] * 0.72);
      },
    })),
  );
  divider.classList.toggle('hidden', n !== 2);
}

// --- Spielmodi --------------------------------------------------------------------------------------
function startAttract() {
  const order = [...DRIVERS].sort(() => Math.random() - 0.5);
  buildSession(Math.floor(Math.random() * TRACKS.length), order.map((d) => ({ driver: d.id, human: -1 })), { attract: true });
  session.race.time = -0.5;
  hud.show(false);
}

function makeEntrants(humanDrivers, gridOrder) {
  const others = DRIVERS.filter((d) => !humanDrivers.includes(d.id)).map((d) => d.id);
  const ents = [];
  const upAI = (id) => gp?.aiUpgrades[id];
  if (gridOrder) {
    for (const id of gridOrder) {
      const h = humanDrivers.indexOf(id);
      ents.push({ driver: id, human: h, upgrades: h >= 0 ? gp?.upgrades[h] : upAI(id) });
    }
    return ents;
  }
  others.sort(() => Math.random() - 0.5);
  for (const id of others.slice(0, 8 - humanDrivers.length)) ents.push({ driver: id, human: -1, upgrades: upAI(id) });
  humanDrivers.forEach((id, h) => ents.push({ driver: id, human: h, upgrades: gp?.upgrades[h] }));
  return ents;
}

function startRace(trackIdx, humanDrivers) {
  state = 'loading';
  const def = TRACKS[trackIdx];
  screens.show(screens.loading(def, gp ? `Grand Prix · Rennen ${gp.index + 1}/3` : 'Einzelrennen'));
  audio.stopMusic();
  setTimeout(() => {
    let grid = null;
    if (gp && gp.index > 0) {
      // Spätere Rennen: Tabellenführer startet hinten
      grid = Object.keys(gp.points).sort((a, b) => gp.points[a] - gp.points[b]);
    }
    buildSession(trackIdx, makeEntrants(humanDrivers, grid));
    session.humanDrivers = humanDrivers;
    hud.build(session.race, session.humans, portraits);
    hud.show(true);
    for (const p of hud.panels) p.onRoll = () => audio.sfx('roll');
    screens.show(null);
    fadeIn();
    state = 'race';
  }, 60);
}

function fadeIn() {
  fade.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => fade.classList.remove('on')));
}

// --- Menüfluss ------------------------------------------------------------------------------------
function toTitle() {
  state = 'title';
  gp = null;
  if (!session?.attract) startAttract();
  screens.show(
    screens.title(() => {
      audio.unlock();
      audio.music('menu');
      toMenu();
    }),
  );
}
function toMenu() {
  state = 'menu';
  if (!session?.attract) startAttract();
  hud.show(false);
  screens.show(
    screens.mainMenu(
      opts,
      () => toDrivers(),
      () => screens.show(screens.controls(() => toMenu())),
    ),
  );
}
function toDrivers() {
  screens.show(
    screens.driverSelect(
      opts.players,
      portraits,
      opts.drivers,
      (ids) => {
        opts.drivers = ids.map((id) => DRIVERS.findIndex((d) => d.id === id));
        if (opts.mode === 'gp') startGP(ids);
        else toTracks(ids);
      },
      () => toMenu(),
    ),
  );
}
function toTracks(ids) {
  screens.show(
    screens.trackSelect(
      (i) => startRace(i, ids),
      () => toDrivers(),
    ),
  );
}
function startGP(ids) {
  gp = {
    index: 0,
    tracks: TRACKS.map((_, i) => i),
    drivers: ids,
    points: Object.fromEntries(DRIVERS.map((d) => [d.id, 0])),
    wallets: ids.map(() => 40),
    upgrades: ids.map(() => ({ motor: 0, tires: 0, turbo: 0, rind: 0 })),
    aiUpgrades: Object.fromEntries(DRIVERS.map((d) => [d.id, { motor: 0, tires: 0, turbo: 0, rind: 0 }])),
  };
  startRace(gp.tracks[0], ids);
}

function showResults() {
  state = 'results';
  const race = session.race;
  const res = finalResults(race);
  const rows = res.map((r, i) => {
    const k = r.kart;
    const row = { driver: k.driver, human: k.human, time: r.time, estimated: r.estimated, cheese: k.cheeseTotal, points: POINTS[i] ?? 0 };
    if (gp) {
      gp.points[k.driver.id] += row.points;
      row.total = gp.points[k.driver.id];
      if (k.human >= 0) {
        row.coins = COINS[i] + k.cheeseTotal * 2;
        gp.wallets[k.human] += row.coins;
      }
    }
    return row;
  });
  audio.stopEngines();
  audio.music('menu');
  hud.show(false);
  screens.show(
    screens.results({ def: session.def, rows, gp: !!gp, raceNo: (gp?.index ?? 0) + 1, portraits }, () => {
      if (!gp) {
        screens.show(
          screens.afterSingle(
            () => startRace(session.trackIdx, session.humanDrivers),
            () => {
              const ids = session.humanDrivers;
              state = 'menu';
              hud.show(false);
              startAttract();
              toTracks(ids);
            },
            () => toTitleFromRace(),
          ),
        );
        return;
      }
      // KI rüstet je nach Schärfe ebenfalls auf
      const perRace = { mild: 0.5, mittel: 1, alt: 2 }[opts.difficulty] ?? 1;
      for (const id of Object.keys(gp.aiUpgrades)) {
        let n = Math.floor(perRace) + (Math.random() < perRace % 1 ? 1 : 0);
        while (n-- > 0) {
          const u = UPGRADES[Math.floor(Math.random() * UPGRADES.length)].id;
          gp.aiUpgrades[id][u] = Math.min(3, gp.aiUpgrades[id][u] + 1);
        }
      }
      gp.index++;
      if (gp.index >= gp.tracks.length) {
        const standings = DRIVERS.map((d) => ({ driver: d, points: gp.points[d.id], human: gp.drivers.indexOf(d.id) })).sort((a, b) => b.points - a.points);
        audio.sfx('finish');
        screens.show(screens.podium({ standings, portraits }, () => toTitleFromRace()));
        return;
      }
      screens.show(
        screens.garage({ players: gp.drivers.length, wallets: gp.wallets, upgrades: gp.upgrades, drivers: gp.drivers, portraits, nextTrack: TRACKS[gp.tracks[gp.index]] }, () => startRace(gp.tracks[gp.index], gp.drivers)),
      );
    }),
  );
}

function toTitleFromRace() {
  gp = null;
  disposeSession();
  hud.show(false);
  startAttract();
  toMenu();
}

function pauseGame() {
  if (state !== 'race') return;
  state = 'paused';
  for (let i = 0; i < session.humans.length; i++) audio.engine('p' + i, session.humans[i], false);
  screens.show(
    screens.pause(
      () => {
        screens.show(null);
        state = 'race';
      },
      () => {
        startRace(session.trackIdx, session.humanDrivers);
      },
      () => toTitleFromRace(),
    ),
  );
}
window.addEventListener('blur', () => pauseGame());

// --- Ereignisse aus der Simulation → Ton, Effekte, Anzeige ------------------------------------------
function nearestHumanDist(x, z) {
  const s = session;
  const list = s.humans.length ? s.humans : [s.spect.kart];
  let d = Infinity;
  for (const k of list) d = Math.min(d, Math.hypot(k.x - x, k.z - z));
  return d;
}
function vol(x, z) {
  return Math.max(0, 1 - nearestHumanDist(x, z) / 70);
}

function handleEvents() {
  const s = session;
  const race = s.race;
  const players = s.humans.length;
  const hi = (k) => (k ? k.human : -1);
  for (const e of race.events) {
    const k = e.kart;
    const me = k && k.human >= 0 && !s.attract;
    switch (e.type) {
      case 'count':
        s.world.setStartLights(4 - e.n);
        if (!s.attract) {
          audio.sfx('count');
          hud.countdown(String(e.n));
        }
        break;
      case 'go':
        s.world.setStartLights(4);
        if (!s.attract) {
          audio.sfx('go');
          hud.countdown('LOS!', 'go');
          audio.music(s.def.theme);
        }
        break;
      case 'startBoost':
        if (me) hud.message(k.human, 'Raketenstart!', { cls: 'good' });
        break;
      case 'stall':
        if (me) (hud.message(k.human, 'Abgewürgt!', { cls: 'bad' }), audio.sfx('stall'));
        break;
      case 'box':
        s.fx.burst(e.box.x, e.box.y, e.box.z, [2.5, 1.6, 0.4], 18, 7, 0.4);
        if (me) audio.sfx('box');
        break;
      case 'itemReady':
        if (me) {
          audio.sfx('itemReady');
          input.rumble(k.human, 0.1, 0.3, 80);
        }
        break;
      case 'cheese':
        s.fx.burst(e.coin.x, e.coin.y, e.coin.z, [3, 2.2, 0.5], 10, 4, 0.3);
        if (me) audio.sfx('cheese');
        break;
      case 'boost':
        if (me) audio.sfx('boost');
        break;
      case 'miniTurbo': {
        const c = [null, [0.8, 1.6, 4], [4, 1.8, 0.4], [3, 1, 4]][e.level];
        s.fx.burst(k.x, k.y + 0.4, k.z, c, 20, 6, 0.35);
        if (me) (audio.sfx('miniTurbo'), input.rumble(k.human, 0.2, 0.6, 120));
        break;
      }
      case 'driftLevel':
        if (me) audio.sfx('driftLevel', { level: e.level });
        break;
      case 'hop':
        if (me) audio.sfx('hop');
        break;
      case 'land':
        if (e.impact > 3) s.fx.dust(k.x, k.y, k.z, dustColor(), 6, 2);
        if (me && e.impact > 4) {
          audio.sfx('land');
          s.cams[k.human].shake(Math.min(0.4, e.impact * 0.03));
          input.rumble(k.human, 0.4, 0.2, 100);
        }
        break;
      case 'wall':
        s.fx.sparks(k.x, k.y + 0.3, k.z, [3, 2, 0.8], 12, 6);
        if (me) {
          audio.sfx('wall');
          s.cams[k.human].shake(Math.min(0.5, e.strength * 0.04));
          input.rumble(k.human, 0.6, 0.3, 160);
        }
        break;
      case 'bump':
        if (hi(e.a) >= 0 || hi(e.b) >= 0) {
          audio.sfx('bump');
          for (const q of [e.a, e.b]) if (q.human >= 0 && !s.attract) input.rumble(q.human, 0.4, 0.4, 100);
        }
        break;
      case 'hit':
        s.fx.cheeseCrumbs(k.x, k.y, k.z, 10 + e.lost * 6);
        s.fx.smoke(k.x, k.y, k.z, [0.8, 0.8, 0.8], 6);
        if (me) {
          audio.sfx('hit');
          s.cams[k.human].shake(0.5);
          s.eff[k.human].hit = 1;
          input.rumble(k.human, 1, 0.8, 400);
          const what = e.by && e.by !== k ? `von ${e.by.driver.name}` : '';
          hud.message(k.human, e.kind === 'tumble' ? 'Bumm!' : 'Ausgerutscht!', { sub: e.lost ? `−${e.lost} Käse ${what}` : what, cls: 'bad' });
        }
        if (e.by && e.by.human >= 0 && e.by !== k && !s.attract) hud.message(e.by.human, 'Treffer!', { sub: k.driver.name, cls: 'good' });
        break;
      case 'shieldBreak':
        s.fx.burst(k.x, k.y + 0.8, k.z, [3, 2.5, 1], 30, 7, 0.35);
        if (me) (audio.sfx('shieldBreak'), hud.message(k.human, 'Panzer hält!', { cls: 'good' }));
        break;
      case 'explode':
        s.fx.explosion(e.x, e.y, e.z);
        if (!s.attract || vol(e.x, e.z) > 0.2) audio.sfx('explode', { vol: Math.max(0.15, vol(e.x, e.z)) });
        s.humans.forEach((h, i) => {
          const d = Math.hypot(h.x - e.x, h.z - e.z);
          if (d < 30) s.cams[i].shake(0.6 * (1 - d / 30));
        });
        break;
      case 'wheelHit':
        s.fx.burst(e.x, e.y, e.z, [3, 2.2, 0.4], 30, 8, 0.4);
        if (vol(e.x, e.z) > 0.05 && !s.attract) audio.sfx('hit', { vol: vol(e.x, e.z) });
        break;
      case 'wheelBounce':
        s.fx.sparks(e.p.x, e.p.y, e.p.z, [3, 2, 0.6], 5, 4);
        break;
      case 'splash':
        s.fx.splash(e.x, e.y, e.z);
        if (vol(e.x, e.z) > 0.05 && !s.attract) audio.sfx('splash', { vol: vol(e.x, e.z) });
        break;
      case 'fire':
        if ((me || vol(k.x, k.z) > 0.3) && !s.attract) audio.sfx('fire', { item: e.item, vol: me ? 1 : vol(k.x, k.z) });
        if (e.item === 'stink') for (let i = 0; i < 20; i++) s.fx.stink(k.x, k.y, k.z);
        if (me && e.item === 'stink') hud.message(k.human, 'Stinkekäse!', { sub: e.count ? `${e.count} Gegner riechen das` : 'Niemand vor dir …', cls: 'good' });
        break;
      case 'stinked':
        if (me) (hud.message(k.human, 'Bäh! Limburger!', { sub: `von ${e.by.driver.name}`, cls: 'bad' }), audio.sfx('fire', { item: 'stink' }));
        break;
      case 'lap':
        if (me) {
          if (e.final) {
            hud.message(k.human, 'Letzte Runde!', { cls: 'final', dur: 2.2 });
            audio.sfx('finalLap');
            if (!s.finalLapPlayed) (audio.musicRate(1.1), (s.finalLapPlayed = true));
          } else {
            hud.message(k.human, `Runde ${e.lap}`, { dur: 1.4 });
            audio.sfx('lap');
          }
        }
        break;
      case 'finish':
        if (me) {
          audio.sfx('finish');
          hud.message(k.human, 'Ziel!', { sub: `${k.rank + 1}. Platz`, cls: k.rank < 3 ? 'final' : '', dur: 4 });
          input.rumble(k.human, 0.5, 0.5, 300);
        }
        break;
      case 'raceDone':
        s.doneT = 0.001;
        break;
      default:
        break;
    }
  }
  race.events.length = 0;
  void players;
}

function dustColor() {
  const t = session.def.theme;
  return t === 'vulkan' ? [0.25, 0.2, 0.2] : t === 'alm' ? [0.62, 0.58, 0.45] : [0.55, 0.5, 0.38];
}

// --- Partikel am Kart --------------------------------------------------------------------------------
const DRIFT_COLORS = [[2.5, 2.2, 1.6], [0.7, 1.5, 4], [4, 1.8, 0.35], [3, 0.9, 4]];
function kartEffects(k, dt) {
  const s = session;
  if (nearestCamDist(k) > 140) return;
  const yaw = k.heading + k.drift * -0.38;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const local = (lx, ly, lz) => [k.x + lx * cy + lz * sy, k.y + ly, k.z - lx * sy + lz * cy];
  if (k.drift && k.onGround) {
    for (const side of [1, -1]) {
      const [x, y, z] = local(side * 0.8, 0.1, -0.86);
      s.fx.sparks(x, y, z, DRIFT_COLORS[k.driftLevel], k.driftLevel ? 2 : 1, 3);
      if (Math.random() < 0.3) s.fx.smoke(x, y, z, [0.8, 0.8, 0.82], 1);
      s.fx.skid(k.idx * 2 + (side > 0 ? 1 : 0), x, y, z);
    }
  } else if (k.spinT > 0 && k.onGround) {
    const [x, y, z] = local(0, 0.1, -0.8);
    s.fx.skid(k.idx * 2, x, y, z);
  }
  if (k.offroad && k.onGround && Math.abs(k.fs) > 5 && Math.random() < 0.7) {
    const [x, y, z] = local((Math.random() - 0.5) * 1.6, 0, -0.9);
    s.fx.dust(x, y, z, dustColor(), 1, 1);
  }
  if (k.boostT > 0 || k.goldenT > 0) {
    for (const side of [1, -1]) {
      const [x, y, z] = local(side * 0.26, 0.5, -1.75);
      const back = local(side * 0.26, 0.5, -3.5);
      s.fx.flame(x, y, z, (back[0] - x) * 3 + k.vx * 0.6, (back[2] - z) * 3 + k.vz * 0.6, k.goldenT > 0 ? [3, 2.2, 0.4] : [3.4, 1.3, 0.3]);
    }
  }
  if (k.goldenT > 0 && Math.random() < 0.7) s.fx.golden(k.x, k.y, k.z);
  if (k.stinkT > 0 && Math.random() < 0.35) s.fx.stink(k.x, k.y, k.z);
  if ((k.spinT > 0 || k.tumbleT > 0) && Math.random() < 0.3) s.fx.smoke(k.x, k.y + 0.3, k.z, [0.7, 0.7, 0.72], 1);
  void dt;
}
function nearestCamDist(k) {
  let d = Infinity;
  for (const c of session.cams) d = Math.min(d, c.camera.position.distanceTo({ x: k.x, y: k.y, z: k.z }));
  return d;
}

// --- Zuschauerkamera (Titel/Demo) --------------------------------------------------------------------
const tmpV = new THREE.Vector3();
function spectatorCam(dt) {
  const s = session;
  const sp = s.spect;
  sp.t -= dt;
  if (sp.t <= 0) {
    const ranked = s.race.kartsByRank();
    sp.kart = ranked[Math.floor(Math.random() * Math.min(4, ranked.length))];
    sp.shot = ['chase', 'side', 'track', 'chase', 'low'][Math.floor(Math.random() * 5)];
    sp.t = 5 + Math.random() * 3;
    s.cams[0].init = false;
    if (sp.shot === 'track') {
      // fester Punkt am Rand ein Stück voraus
      const p = s.race.track.pointAt(sp.kart.s + 60, (Math.random() < 0.5 ? -1 : 1) * (WALL - 2));
      sp.pos.set(p.x, p.y + 2.2 + Math.random() * 3, p.z);
    }
  }
  const k = sp.kart;
  const cam = s.cams[0];
  const { width, height } = view.size;
  if (sp.shot === 'chase') {
    cam.update(k, dt, { aspect: width / height });
    return;
  }
  const c = cam.camera;
  c.aspect = width / height;
  if (sp.shot === 'track') {
    c.position.copy(sp.pos);
    c.fov = 40;
  } else {
    const a = k.heading + (sp.shot === 'side' ? Math.PI / 2 + Math.sin(performance.now() / 4000) * 0.6 : Math.PI * 0.85);
    const dist = sp.shot === 'side' ? 6 : 5;
    tmpV.set(k.x + Math.sin(a) * dist, k.y + (sp.shot === 'low' ? 0.7 : 1.6), k.z + Math.cos(a) * dist);
    c.position.lerp(tmpV, cam.init ? 1 - Math.exp(-dt * 8) : 1);
    cam.init = true;
    c.fov = 55;
  }
  c.lookAt(k.x, k.y + 0.8, k.z);
  c.updateProjectionMatrix();
}

// --- Hauptschleife -------------------------------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  const frameMs = now - last;
  const dt = Math.min(0.05, frameMs / 1000);
  last = now;

  // Menüeingaben
  const evs = input.menuEvents(state === 'race' || state === 'paused' ? (session?.humans.length ?? 1) : opts.players);
  for (const ev of evs) {
    if (audio.ready) audio.unlock();
    if (state === 'race') {
      if (ev.action === 'start') pauseGame();
    } else screens.nav(ev);
  }

  const s = session;
  if (!s) return;
  const race = s.race;
  const running = state === 'race' || state === 'results' || (s.attract && state !== 'loading');
  if (running) {
    if (!s.attract) {
      s.humans.forEach((k, i) => {
        const inp = input.raceInput(i, s.humans.length);
        race.setInput(i, inp);
        s.look[i] = inp.look;
      });
    }
    s.acc += dt;
    let steps = 0;
    while (s.acc >= DT && steps < 12) {
      race.step(DT);
      s.acc -= DT;
      steps++;
    }
    handleEvents();
    if (s.doneT > 0 && !s.attract) {
      s.doneT += dt;
      if (s.doneT > 3.5 && state === 'race') showResults();
    }
    if (s.attract && (race.phase === 'done' || race.time > 90)) {
      startAttract();
      return;
    }
  }

  // Grafik aktualisieren
  const t = race.time;
  const visT = now / 1000;
  race.karts.forEach((k, i) => {
    s.models[i].update(k, dt, t);
    if (running) kartEffects(k, dt);
  });
  s.items.update(dt, t, s.fx);
  // Vulkan: Rauch und Glut
  if (s.world.deco.crater && running) {
    const c = s.world.deco.crater;
    if (Math.random() < 0.25) s.fx.volcanoSmoke(c.x, c.y + 5, c.z);
    if (Math.random() < 0.4) s.fx.ember(c.x, c.y + 4, c.z);
  }
  if (running) s.fx.update(dt);
  // Publikum jubelt, wenn jemand nahe am Start ist
  let excite = 0;
  for (const k of race.karts) if (race.time > 0 && (k.s < 50 || k.s > race.track.length - 30)) excite = 1;
  s.world.update(dt, visT, race.time < 0 ? 0.4 : excite);
  if (race.time < 0) s.world.setStartLights(Math.max(0, Math.min(3, 4 - Math.ceil(-race.time))));

  const { width, height } = view.size;
  if (s.attract) {
    spectatorCam(dt);
    view.setEffects(0, { vignette: 0.5 });
  } else {
    const split = s.humans.length === 2;
    s.humans.forEach((k, i) => {
      const mode = race.time < 0 ? 'intro' : k.finished ? 'finish' : 'race';
      s.cams[i].update(k, dt, { raceTime: race.time, lookBack: s.look[i], aspect: split ? width / (height / 2) : width / height, mode, time: visT });
      const e = s.eff[i];
      e.boost += ((k.boostT > 0 || k.goldenT > 0 ? 1 : 0) - e.boost) * Math.min(1, dt * 5);
      e.stink += ((k.stinkT > 0 ? 1 : 0) - e.stink) * Math.min(1, dt * 3);
      e.hit = Math.max(0, e.hit - dt * 1.8);
      view.setEffects(i, { boost: e.boost, stink: e.stink, hit: e.hit, vignette: 0.5 });
      if (state === 'race') audio.engine('p' + i, k, true, split ? 0 : 0);
    });
    hud.update(race, dt, visT);
  }
  view.render(visT);
  view.adapt(frameMs);
}

// Ton freischalten beim ersten Klick / Tastendruck
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio.unlock(), { once: false, passive: true });
document.getElementById('mute').addEventListener('click', (e) => {
  e.currentTarget.classList.toggle('off', audio.toggleMute());
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && state !== 'race') document.getElementById('mute').click();
});

toTitle();
requestAnimationFrame(frame);
void ITEMS;
