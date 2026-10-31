// Prozeduraler Ton: Motoren, Driften, Effekte und ein kleiner Musik-Sequenzer (WebAudio)
let ctx = null;
let master;
let sfxBus;
let musicBus;
let noiseBuf;

function noiseBuffer() {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function env(g, t, a, peak, dec, end = 0.0001) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(end, t + a + dec);
}

function tone(freq, { type = 'square', t = ctx.currentTime, dur = 0.15, vol = 0.2, slide = 0, attack = 0.005, bus = sfxBus, filter = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    o.connect(f);
    node = f;
  }
  node.connect(g).connect(bus);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise({ t = ctx.currentTime, dur = 0.3, vol = 0.3, type = 'bandpass', freq = 1000, q = 1, slide = 0, bus = sfxBus, attack = 0.005 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, attack, vol, dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + attack + 0.05);
}

// --- Motor je Spieler ------------------------------------------------------------------------------
function createEngine(pan) {
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const o3 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'square';
  o3.type = 'sawtooth';
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 600;
  f.Q.value = 3;
  const g = ctx.createGain();
  g.gain.value = 0;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  const g2 = ctx.createGain();
  g2.gain.value = 0.5;
  o1.connect(f);
  o2.connect(g2).connect(f);
  o3.connect(f);
  f.connect(g).connect(p).connect(sfxBus);
  // Drift-Quietschen
  const sq = ctx.createBufferSource();
  sq.buffer = noiseBuf;
  sq.loop = true;
  const sf = ctx.createBiquadFilter();
  sf.type = 'bandpass';
  sf.frequency.value = 1900;
  sf.Q.value = 8;
  const sg = ctx.createGain();
  sg.gain.value = 0;
  sq.connect(sf).connect(sg).connect(p);
  // Turbo-Rauschen
  const bs = ctx.createBufferSource();
  bs.buffer = noiseBuf;
  bs.loop = true;
  const bf = ctx.createBiquadFilter();
  bf.type = 'highpass';
  bf.frequency.value = 900;
  const bg = ctx.createGain();
  bg.gain.value = 0;
  bs.connect(bf).connect(bg).connect(p);
  for (const n of [o1, o2, o3, sq, bs]) n.start();
  return {
    update(k, on) {
      const t = ctx.currentTime;
      const sp = Math.max(0, Math.abs(k.fs)) / 32;
      const rev = 48 + sp * 120 + (k.input.throttle > 0 ? 12 : 0) + (k.boostT > 0 ? 30 : 0);
      // leichte Gangwechsel-Charakteristik
      const gear = (sp * 3) % 1;
      const f0 = rev * (0.85 + gear * 0.25);
      o1.frequency.setTargetAtTime(f0, t, 0.05);
      o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.05);
      o3.frequency.setTargetAtTime(f0 * 1.01, t, 0.05);
      f.frequency.setTargetAtTime(350 + sp * 1600 + (k.input.throttle > 0 ? 400 : 0), t, 0.08);
      g.gain.setTargetAtTime(on ? 0.05 + sp * 0.05 : 0, t, 0.1);
      sg.gain.setTargetAtTime(on && k.drift && k.onGround ? 0.05 + k.driftLevel * 0.02 : 0, t, 0.05);
      sf.frequency.setTargetAtTime(1600 + k.driftLevel * 400, t, 0.1);
      bg.gain.setTargetAtTime(on && (k.boostT > 0 || k.goldenT > 0) ? 0.06 : 0, t, 0.08);
    },
    stop() {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      sg.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      bg.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => [o1, o2, o3, sq, bs].forEach((n) => n.stop()), 300);
    },
  };
}

// --- Musik -----------------------------------------------------------------------------------------
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const SONGS = {
  polder: { bpm: 150, root: 60, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], minor: false, lead: 'square' },
  alm: { bpm: 140, root: 62, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], minor: false, lead: 'triangle' },
  vulkan: { bpm: 158, root: 57, prog: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]], minor: true, lead: 'sawtooth' },
  menu: { bpm: 118, root: 60, prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], minor: false, lead: 'triangle' },
};
let music = null;

function startMusic(name) {
  stopMusic();
  const song = SONGS[name] ?? SONGS.menu;
  const state = { song, step: 0, next: ctx.currentTime + 0.1, rate: 1, timer: null };
  const leadPat = [0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2, 2, 1, 0, 1];
  const bassPat = [0, null, 0, null, 0, null, 7, null, 0, null, 0, null, 7, null, 5, null];
  const tick = () => {
    while (state.next < ctx.currentTime + 0.25) {
      const s = state.step;
      const t = state.next;
      const bar = Math.floor(s / 16) % 4;
      const chord = song.prog[bar];
      const i = s % 16;
      const spb = 60 / (song.bpm * state.rate) / 4;
      // Schlagzeug
      if (i % 4 === 0) {
        tone(110, { t, dur: 0.18, vol: 0.32, type: 'sine', slide: 0.35, bus: musicBus });
      }
      if (i % 8 === 4) noise({ t, dur: 0.14, vol: 0.18, type: 'bandpass', freq: 1800, q: 0.7, bus: musicBus });
      if (i % 2 === 1 || name !== 'menu') noise({ t, dur: 0.03, vol: i % 2 ? 0.05 : 0.025, type: 'highpass', freq: 7000, bus: musicBus });
      // Bass
      const b = bassPat[i];
      if (b !== null) tone(NOTE(song.root - 24 + chord[0] + b), { t, dur: spb * 1.6, vol: 0.13, type: 'triangle', bus: musicBus, filter: 900 });
      // Arpeggio / Melodie
      if (name !== 'menu' || i % 2 === 0) {
        const n = chord[leadPat[i]] + (Math.floor(s / 64) % 2 && i > 11 ? 12 : 0);
        tone(NOTE(song.root + n), { t, dur: spb * 0.9, vol: 0.045, type: song.lead, bus: musicBus, filter: 2600 });
      }
      // Akkordflächen am Taktanfang
      if (i === 0) for (const c of chord) tone(NOTE(song.root - 12 + c), { t, dur: spb * 14, vol: 0.022, type: 'sawtooth', bus: musicBus, attack: 0.08, filter: 1200 });
      state.step++;
      state.next += spb;
    }
  };
  state.timer = setInterval(tick, 60);
  tick();
  music = state;
}
function stopMusic() {
  if (music) clearInterval(music.timer);
  music = null;
}

// --- Öffentliche Schnittstelle ------------------------------------------------------------------
const engines = new Map();
let wantedMusic = null; // Musik, die starten soll, sobald der Ton freigeschaltet ist

export const audio = {
  muted: false,
  unlock() {
    if (ctx) return ctx.state === 'suspended' ? ctx.resume() : null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.55;
    musicBus.connect(master);
    noiseBuf = noiseBuffer();
    if (wantedMusic) startMusic(wantedMusic);
    return null;
  },
  get ready() {
    return !!ctx;
  },
  toggleMute() {
    this.muted = !this.muted;
    if (master) master.gain.setTargetAtTime(this.muted ? 0 : 0.8, ctx.currentTime, 0.05);
    return this.muted;
  },
  music(name) {
    wantedMusic = name;
    if (ctx) startMusic(name);
  },
  stopMusic() {
    wantedMusic = null;
    stopMusic();
  },
  musicRate(r) {
    if (music) music.rate = r;
  },
  engine(key, k, on, pan = 0) {
    if (!ctx) return;
    let e = engines.get(key);
    if (!e) engines.set(key, (e = createEngine(pan)));
    e.update(k, on);
  },
  stopEngines() {
    for (const e of engines.values()) e.stop();
    engines.clear();
  },
  sfx(name, opt = {}) {
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const v = opt.vol ?? 1;
    switch (name) {
      case 'count':
        tone(587, { dur: 0.25, vol: 0.25 * v, type: 'square', filter: 3000 });
        break;
      case 'go':
        tone(1175, { dur: 0.6, vol: 0.28 * v, type: 'square', filter: 4000 });
        tone(880, { dur: 0.6, vol: 0.15 * v, type: 'square', filter: 3000 });
        break;
      case 'roll':
        tone(900 + Math.random() * 600, { dur: 0.04, vol: 0.06 * v, type: 'square' });
        break;
      case 'itemReady':
        tone(784, { dur: 0.1, vol: 0.15 * v, type: 'triangle' });
        tone(1175, { t: t + 0.08, dur: 0.2, vol: 0.15 * v, type: 'triangle' });
        break;
      case 'box':
        noise({ dur: 0.15, vol: 0.25 * v, freq: 2500, q: 0.8 });
        tone(660, { dur: 0.12, vol: 0.1 * v, type: 'triangle', slide: 1.6 });
        break;
      case 'cheese':
        tone(1318, { dur: 0.08, vol: 0.12 * v, type: 'triangle' });
        tone(1976, { t: t + 0.06, dur: 0.15, vol: 0.12 * v, type: 'triangle' });
        break;
      case 'boost':
        noise({ dur: 0.6, vol: 0.25 * v, type: 'bandpass', freq: 500, slide: 6, q: 1.2 });
        break;
      case 'miniTurbo':
        noise({ dur: 0.4, vol: 0.2 * v, type: 'bandpass', freq: 800, slide: 4, q: 1.5 });
        tone(300, { dur: 0.3, vol: 0.08 * v, type: 'sawtooth', slide: 2.5, filter: 2000 });
        break;
      case 'driftLevel':
        tone([0, 880, 1100, 1320][opt.level ?? 1], { dur: 0.08, vol: 0.08 * v, type: 'square', filter: 3500 });
        break;
      case 'hop':
        tone(220, { dur: 0.08, vol: 0.06 * v, type: 'triangle', slide: 1.8 });
        break;
      case 'land':
        noise({ dur: 0.15, vol: 0.2 * v, type: 'lowpass', freq: 400 });
        break;
      case 'wall':
        noise({ dur: 0.2, vol: 0.3 * v, type: 'lowpass', freq: 600 });
        tone(90, { dur: 0.15, vol: 0.2 * v, type: 'sine', slide: 0.6 });
        break;
      case 'bump':
        tone(120, { dur: 0.1, vol: 0.18 * v, type: 'square', slide: 0.5, filter: 800 });
        break;
      case 'hit':
        tone(500, { dur: 0.5, vol: 0.18 * v, type: 'sawtooth', slide: 0.25, filter: 2500 });
        noise({ dur: 0.3, vol: 0.2 * v, freq: 1200 });
        break;
      case 'explode':
        noise({ dur: 1.0, vol: 0.5 * v, type: 'lowpass', freq: 1600, slide: 0.08 });
        tone(70, { dur: 0.6, vol: 0.4 * v, type: 'sine', slide: 0.5 });
        break;
      case 'fire':
        if (opt.item === 'rocket') noise({ dur: 0.8, vol: 0.25 * v, freq: 600, slide: 3, q: 0.6 });
        else if (opt.item === 'fondue') {
          noise({ dur: 0.35, vol: 0.2 * v, type: 'lowpass', freq: 500 });
          tone(180, { t: t + 0.05, dur: 0.15, vol: 0.12 * v, type: 'sine', slide: 0.6 });
        } else if (opt.item === 'stink') {
          tone(110, { dur: 0.7, vol: 0.14 * v, type: 'sawtooth', slide: 0.7, filter: 500 });
          noise({ dur: 0.8, vol: 0.15 * v, type: 'lowpass', freq: 300 });
        } else if (opt.item === 'shield') {
          tone(523, { dur: 0.3, vol: 0.1 * v, type: 'triangle' });
          tone(784, { t: t + 0.1, dur: 0.4, vol: 0.1 * v, type: 'triangle' });
        } else if (opt.item === 'golden') {
          [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, { t: t + i * 0.06, dur: 0.25, vol: 0.12 * v, type: 'square', filter: 4000 }));
        } else if (opt.item === 'turbo') {
          noise({ dur: 0.7, vol: 0.3 * v, freq: 400, slide: 6, q: 1 });
        } else {
          tone(260, { dur: 0.18, vol: 0.14 * v, type: 'square', slide: 0.6, filter: 1500 });
          noise({ dur: 0.12, vol: 0.12 * v, freq: 900 });
        }
        break;
      case 'shieldBreak':
        noise({ dur: 0.4, vol: 0.3 * v, freq: 3500, q: 0.8 });
        tone(1500, { dur: 0.3, vol: 0.08 * v, type: 'triangle', slide: 0.5 });
        break;
      case 'splash':
        noise({ dur: 0.4, vol: 0.3 * v, type: 'lowpass', freq: 900, slide: 0.3 });
        break;
      case 'lap':
        [659, 880].forEach((f, i) => tone(f, { t: t + i * 0.1, dur: 0.18, vol: 0.14 * v, type: 'square', filter: 3000 }));
        break;
      case 'finalLap':
        [523, 659, 784, 1046].forEach((f, i) => tone(f, { t: t + i * 0.11, dur: 0.22, vol: 0.15 * v, type: 'square', filter: 3500 }));
        break;
      case 'finish':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, { t: t + i * 0.13, dur: i === 5 ? 0.8 : 0.2, vol: 0.16 * v, type: 'square', filter: 4000 }));
        break;
      case 'stall':
        tone(80, { dur: 0.5, vol: 0.2 * v, type: 'sawtooth', slide: 0.5, filter: 600 });
        break;
      case 'move':
        tone(1200, { dur: 0.035, vol: 0.06 * v, type: 'square', filter: 4000 });
        break;
      case 'ok':
        tone(880, { dur: 0.06, vol: 0.1 * v, type: 'square', filter: 4000 });
        tone(1320, { t: t + 0.05, dur: 0.1, vol: 0.1 * v, type: 'square', filter: 4000 });
        break;
      case 'back':
        tone(660, { dur: 0.08, vol: 0.08 * v, type: 'square', slide: 0.7, filter: 3000 });
        break;
      case 'buy':
        [784, 988, 1318].forEach((f, i) => tone(f, { t: t + i * 0.05, dur: 0.1, vol: 0.12 * v, type: 'triangle' }));
        break;
      case 'deny':
        tone(150, { dur: 0.2, vol: 0.15 * v, type: 'square', filter: 900 });
        break;
      default:
        break;
    }
  },
};
