// Prozeduraler Klang: Wind über toter Erde, ein Klangteppich, der mit dem Leben aufblüht,
// generative Kalimba-Melodie, Vögel am Tag, Grillen in der Nacht – und Effekte.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // Dur-Pentatonik
const CHORDS = [
  [0, 7, 12, 16], // I
  [-3, 4, 9, 12], // vi
  [-7, 0, 5, 9], // IV
  [-5, 2, 7, 11], // V
];
const ROOT = 146.83; // D3
const hz = (semi) => ROOT * 2 ** (semi / 12);

let ctx = null;
let master;
let musicBus;
let sfxBus;
let reverb;
let noiseBuf;
let wind;
let pad = [];
let padFilter;
let crickets;
let shimmer;
let state = { life: 0, night: 0, activity: 0, weave: 0, rot: 0 };
let rotDrone;
let nextBeat = 0;
let nestLevel = 0;
let chordIdx = 0;
let nextChord = 0;
let nextNote = 0;
let nextBird = 0;
let volume = 0.8;

function makeNoise() {
  const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = last * 0.5 + (Math.random() * 2 - 1) * 0.5;
    d[i] = last;
  }
  return b;
}

function makeReverb(seconds = 3.2) {
  const len = ctx.sampleRate * seconds;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  const conv = ctx.createConvolver();
  conv.buffer = b;
  return conv;
}

function noiseLoop(type, freq, q, dest) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(dest);
  src.start();
  return { f, g };
}

function out(node, pan = 0, wet = 0.3, bus = sfxBus) {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(p);
  p.connect(bus);
  if (wet > 0) {
    const w = ctx.createGain();
    w.gain.value = wet;
    p.connect(w).connect(reverb);
  }
  return p;
}

function tone(freq, { type = 'sine', at = 0, attack = 0.005, decay = 1.2, gain = 0.2, pan = 0, wet = 0.35, bus = sfxBus, slide = 0 } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(g);
  out(g, pan, wet, bus);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

function noiseHit({ at = 0, type = 'bandpass', freq = 1000, q = 1, decay = 0.3, gain = 0.3, pan = 0, wet = 0.2, sweep = 1 } = {}) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + decay);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(f).connect(g);
  out(g, pan, wet);
  src.start(t, Math.random() * 2);
  src.stop(t + decay + 0.05);
}

// Kalimba: Grundton + unharmonischer Oberton, kurzer Anschlag
function pluck(freq, pan, gain = 0.09) {
  tone(freq, { decay: 1.6, gain, pan, wet: 0.5, bus: musicBus });
  tone(freq * 4.02, { decay: 0.25, gain: gain * 0.35, pan, wet: 0.5, bus: musicBus });
  tone(freq * 2, { decay: 0.6, gain: gain * 0.2, pan, wet: 0.5, bus: musicBus, type: 'triangle' });
}

function bird(pan) {
  const base = 2200 + Math.random() * 2400;
  const n = 2 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const at = i * (0.07 + Math.random() * 0.08);
    tone(base * (0.9 + Math.random() * 0.25), { at, attack: 0.01, decay: 0.07 + Math.random() * 0.05, gain: 0.025, pan, wet: 0.4, slide: 0.7 + Math.random() * 0.8 });
  }
}

export const audio = {
  get ready() {
    return !!ctx;
  },
  unlock() {
    if (ctx) {
      ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.9;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    reverb = makeReverb();
    const rv = ctx.createGain();
    rv.gain.value = 0.55;
    reverb.connect(rv).connect(master);
    noiseBuf = makeNoise();

    wind = noiseLoop('bandpass', 380, 0.6, master);
    // Grillen: Rauschband → Amplitudenmodulation → Pegel
    const am = ctx.createGain();
    am.gain.value = 0.5;
    crickets = noiseLoop('bandpass', 4800, 12, am);
    crickets.g.gain.value = 1;
    const level = ctx.createGain();
    level.gain.value = 0;
    am.connect(level).connect(master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(am.gain);
    lfo.start();
    crickets = { g: level };
    shimmer = noiseLoop('highpass', 5200, 0.7, sfxBus);
    // Fäulnis: tiefes, schwebendes Brummen
    rotDrone = { g: ctx.createGain(), f: ctx.createBiquadFilter() };
    rotDrone.g.gain.value = 0;
    rotDrone.f.type = 'lowpass';
    rotDrone.f.frequency.value = 220;
    for (const [fr, det] of [[49, 0], [49.7, 0], [73.4, 0]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.detune.value = det;
      o.connect(rotDrone.f);
      o.start();
    }
    rotDrone.f.connect(rotDrone.g).connect(master);

    padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 400;
    padFilter.Q.value = 0.7;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.05;
    padFilter.connect(padGain);
    padGain.connect(musicBus);
    const pw = ctx.createGain();
    pw.gain.value = 0.6;
    padGain.connect(pw).connect(reverb);
    for (let i = 0; i < 4; i++) {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'triangle';
      o2.type = 'sawtooth';
      o2.detune.value = 7;
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      o1.connect(padFilter);
      o2.connect(g2).connect(padFilter);
      o1.start();
      o2.start();
      pad.push([o1, o2]);
    }
    this.setChord(0, true);
  },
  setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
  },
  get volume() {
    return volume;
  },
  setChord(i, now = false) {
    chordIdx = i;
    const c = CHORDS[i];
    const t = ctx.currentTime;
    pad.forEach(([o1, o2], k) => {
      const f = hz(c[k] - 12);
      o1.frequency.setTargetAtTime(f, t, now ? 0.01 : 1.5);
      o2.frequency.setTargetAtTime(f * 1.002, t, now ? 0.01 : 1.5);
    });
  },
  // jede Frame: Umgebungszustand
  update(s) {
    if (!ctx) return;
    state = s;
    const t = ctx.currentTime;
    const life = s.life;
    wind.g.gain.setTargetAtTime(0.06 + (1 - life) * 0.14, t, 0.5);
    wind.f.frequency.setTargetAtTime(300 + Math.sin(t * 0.13) * 120 + (1 - life) * 200, t, 0.5);
    crickets.g.gain.setTargetAtTime(life * s.night * 0.018, t, 1);
    shimmer.g.gain.setTargetAtTime(s.weave * 0.05, t, 0.08);
    rotDrone.g.gain.setTargetAtTime((s.rot ?? 0) * 0.07 + nestLevel * 0.03, t, 0.4);
    rotDrone.f.frequency.setTargetAtTime(160 + (s.rot ?? 0) * 300 + Math.sin(t * 0.7) * 40, t, 0.3);
    // Herzschlag der Moderherzen
    if (nestLevel > 0.02 && t > nextBeat) {
      nextBeat = t + (1 / (0.9 + s.night * 0.6));
      const v = nestLevel * 0.5;
      tone(52, { decay: 0.25, gain: v, slide: 0.6, wet: 0.15 });
      tone(46, { at: 0.17, decay: 0.3, gain: v * 0.7, slide: 0.6, wet: 0.15 });
    }
    padFilter.frequency.setTargetAtTime(280 + life * 1500 + s.activity * 400, t, 0.8);

    if (t > nextChord) {
      nextChord = t + 9 + Math.random() * 4;
      this.setChord((chordIdx + 1 + Math.floor(Math.random() * 2)) % 4);
    }
    // generative Melodie: dichter, wenn der Wald lebt und die Geister aktiv sind
    if (t > nextNote) {
      const density = 0.15 + life * 0.55 + s.activity * 0.4;
      nextNote = t + (0.32 + Math.random() * 0.5) / density;
      if (Math.random() < 0.35 + life * 0.5) {
        const c = CHORDS[chordIdx];
        const pool = Math.random() < 0.6 ? c.map((x) => x + 12) : SCALE.map((x) => x + 12);
        const semi = pool[Math.floor(Math.random() * pool.length)];
        pluck(hz(semi), (Math.random() - 0.5) * 0.8, 0.045 + life * 0.04);
      }
    }
    if (t > nextBird) {
      nextBird = t + 1.5 + Math.random() * 5;
      if (Math.random() < life * (1 - s.night) * 0.9) bird((Math.random() - 0.5) * 1.6);
    }
  },
  pulse(pan = 0, hue = 0) {
    if (!ctx) return;
    const base = hue < 0.5 ? hz(12) : hz(19);
    [1, 2.76, 5.4].forEach((r, i) => tone(base * r, { decay: 1.8 / (i + 1), gain: 0.12 / (i + 1), pan, wet: 0.6 }));
    noiseHit({ type: 'bandpass', freq: 600, q: 0.8, decay: 0.6, gain: 0.12, pan, sweep: 4 });
  },
  puff(pan = 0) {
    if (!ctx) return;
    noiseHit({ type: 'lowpass', freq: 1800, q: 1, decay: 0.25, gain: 0.35, pan, sweep: 0.3 });
    tone(220, { decay: 0.25, gain: 0.15, pan, slide: 0.5, wet: 0.2 });
    const c = CHORDS[chordIdx];
    pluck(hz(c[Math.floor(Math.random() * 4)] + 24), pan, 0.06);
  },
  crackle(pan = 0) {
    if (!ctx) return;
    noiseHit({ type: 'highpass', freq: 2500 + Math.random() * 3000, q: 1, decay: 0.04 + Math.random() * 0.05, gain: 0.12, pan, wet: 0.1 });
  },
  decomposed(pan = 0) {
    if (!ctx) return;
    tone(55, { decay: 1.2, gain: 0.35, pan, slide: 0.6, wet: 0.3 });
    noiseHit({ type: 'lowpass', freq: 900, q: 0.7, decay: 1.0, gain: 0.3, pan, sweep: 0.2 });
    const c = CHORDS[chordIdx];
    c.forEach((s, i) => pluck(hz(s + 12), pan, 0.06), 0);
  },
  join(i) {
    if (!ctx) return;
    const notes = i === 0 ? [12, 16, 19, 24] : [19, 24, 28, 31];
    notes.forEach((s, k) => tone(hz(s), { at: k * 0.08, decay: 1.2, gain: 0.1, wet: 0.5, pan: i === 0 ? -0.3 : 0.3 }));
  },
  ui() {
    if (!ctx) return;
    tone(hz(24), { decay: 0.2, gain: 0.05, wet: 0.2 });
  },
  ping(pan) {
    if (!ctx) return;
    tone(hz(28), { decay: 0.8, gain: 0.08, pan, wet: 0.6 });
    tone(hz(35), { at: 0.12, decay: 0.8, gain: 0.06, pan, wet: 0.6 });
  },
  ritual(progress) {
    if (!ctx) return;
    if (Math.random() < 0.25) tone(hz(12 + Math.floor(progress * 4) * 5), { decay: 0.6, gain: 0.04 + progress * 0.05, wet: 0.6 });
  },
  awaken() {
    if (!ctx) return;
    const t0 = 0;
    tone(36.7, { attack: 0.4, decay: 6, gain: 0.5, wet: 0.5 });
    noiseHit({ type: 'lowpass', freq: 400, q: 0.5, decay: 4, gain: 0.4, sweep: 6 });
    // Chor: verstimmte Sägezähne durch Formantfilter
    const chord = [0, 7, 12, 16, 19, 24];
    chord.forEach((s, i) => {
      const t = ctx.currentTime + t0 + i * 0.15;
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(s);
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 700 + i * 80;
        f.Q.value = 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 1.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
        o.connect(f).connect(g);
        out(g, (i / chord.length - 0.5) * 1.2, 0.8, musicBus);
        o.start(t);
        o.stop(t + 7.2);
      }
    });
    [24, 28, 31, 36, 40, 43].forEach((s, i) => pluck(hz(s), (i % 2 ? 0.4 : -0.4), 0.08));
  },
  nest(level) {
    nestLevel = level;
  },
  purifying(p) {
    if (!ctx) return;
    if (Math.random() < 0.18) tone(hz(12 + Math.floor(p * 8) * 2), { decay: 0.4, gain: 0.05 + p * 0.06, wet: 0.5, type: 'triangle' });
    if (Math.random() < 0.3) noiseHit({ type: 'bandpass', freq: 3000 + p * 3000, q: 4, decay: 0.08, gain: 0.05 });
  },
  purified() {
    if (!ctx) return;
    noiseHit({ type: 'lowpass', freq: 300, q: 0.5, decay: 2.5, gain: 0.5, sweep: 8 });
    tone(41, { attack: 0.05, decay: 3, gain: 0.4, slide: 0.5 });
    [0, 7, 12, 16, 19, 24, 28].forEach((st, i) => tone(hz(st + 12), { at: 0.3 + i * 0.07, decay: 2.5, gain: 0.07, wet: 0.7, pan: (i % 2 ? 0.4 : -0.4) }));
  },
  horn(night) {
    if (!ctx) return;
    // tiefes Waldhorn: Sägezahn durch Tiefpass, langsam an- und abschwellend
    const notes = night ? [-12, -9, -14] : [-12, -5];
    notes.forEach((st, i) => {
      const t0 = ctx.currentTime + i * 0.9;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(st);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t0);
      f.frequency.linearRampToValueAtTime(900, t0 + 0.6);
      f.frequency.linearRampToValueAtTime(400, t0 + 1.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
      o.connect(f).connect(g);
      out(g, 0, 0.8, musicBus);
      o.start(t0);
      o.stop(t0 + 1.9);
    });
  },
  dawn() {
    if (!ctx) return;
    [0, 4, 7, 12, 16, 19].forEach((st, i) => tone(hz(st + 12), { at: i * 0.18, attack: 0.3, decay: 3, gain: 0.06, wet: 0.8 }));
    bird(-0.5);
    setTimeout(() => bird(0.5), 600);
  },
  rank() {
    if (!ctx) return;
    [0, 4, 7, 12].forEach((st, i) => {
      tone(hz(st + 12), { at: i * 0.12, decay: 1.6, gain: 0.12, wet: 0.6, type: 'triangle' });
      tone(hz(st + 24), { at: i * 0.12 + 0.02, decay: 1.2, gain: 0.05, wet: 0.6 });
    });
    tone(hz(24), { at: 0.5, attack: 0.2, decay: 2.5, gain: 0.1, wet: 0.8 });
  },
  objective() {
    if (!ctx) return;
    [12, 19, 24].forEach((st, i) => pluck(hz(st + 12), 0, 0.1));
    tone(hz(31), { at: 0.15, decay: 1.4, gain: 0.06, wet: 0.7 });
  },
  flow(mult) {
    if (!ctx) return;
    tone(hz(12 + mult * 3), { decay: 0.5, gain: 0.06, wet: 0.5, type: 'triangle' });
  },
  denied() {
    if (!ctx) return;
    tone(hz(-5), { decay: 0.25, gain: 0.08, wet: 0.2, type: 'triangle' });
  },
};
