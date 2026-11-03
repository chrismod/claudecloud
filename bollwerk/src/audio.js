// Prozedurale Klänge per WebAudio – keine Audiodateien. Gleiche Klänge werden gedrosselt.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = new Map();
    try {
      this.muted = localStorage.getItem('bollwerk.muted') === '1';
    } catch {
      /* Speicher nicht verfügbar */
    }
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.45;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('bollwerk.muted', this.muted ? '1' : '0');
    } catch {
      /* egal */
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.45;
    return this.muted;
  }

  gate(key, gap) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(key) || 0) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  tone(freq, dur, { type = 'sine', peak = 0.2, slide = 1, delay = 0, attack = 0.005 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss(freq, q, dur, peak, { delay = 0, type = 'bandpass', slide = 1 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  shot(tower) {
    switch (tower) {
      case 'bolt':
        if (this.gate('bolt', 0.06)) this.tone(900 + Math.random() * 200, 0.06, { type: 'square', peak: 0.035, slide: 0.5 });
        break;
      case 'mortar':
        if (this.gate('mortar', 0.12)) (this.tone(120, 0.18, { type: 'sine', peak: 0.2, slide: 0.5 }), this.hiss(600, 1, 0.12, 0.08));
        break;
      case 'sniper':
        if (this.gate('sniper', 0.08)) (this.hiss(2500, 0.8, 0.12, 0.12, { slide: 0.3 }), this.tone(300, 0.1, { type: 'triangle', peak: 0.1, slide: 0.4 }));
        break;
      case 'tesla':
        if (this.gate('tesla', 0.08)) this.hiss(3000, 3, 0.15, 0.08, { slide: 0.5, type: 'highpass' });
        break;
      case 'acid':
        if (this.gate('acid', 0.1)) this.tone(260, 0.12, { type: 'sine', peak: 0.08, slide: 1.8 });
        break;
      case 'missile':
        if (this.gate('missile', 0.1)) this.hiss(900, 0.7, 0.3, 0.06, { slide: 2 });
        break;
      case 'frost':
        if (this.gate('frost', 0.15)) (this.tone(1400, 0.25, { type: 'sine', peak: 0.04, slide: 1.3 }), this.tone(2100, 0.2, { type: 'sine', peak: 0.025, delay: 0.03 }));
        break;
      default:
    }
  }

  explosion(big) {
    if (!this.gate(big ? 'boom-big' : 'boom', big ? 0.05 : 0.07)) return;
    this.hiss(big ? 400 : 900, 0.6, big ? 0.9 : 0.3, big ? 0.35 : 0.12, { type: 'lowpass', slide: 0.2 });
    this.tone(big ? 70 : 110, big ? 0.6 : 0.2, { peak: big ? 0.35 : 0.12, slide: 0.4 });
  }

  death(boss) {
    if (boss) {
      this.explosion(true);
      this.tone(220, 0.8, { type: 'sawtooth', peak: 0.08, slide: 0.25 });
      return;
    }
    if (this.gate('death', 0.05)) this.tone(500 + Math.random() * 300, 0.09, { type: 'triangle', peak: 0.05, slide: 0.4 });
  }

  coin() {
    if (this.gate('coin', 0.09)) (this.tone(1320, 0.07, { type: 'square', peak: 0.025 }), this.tone(1760, 0.1, { type: 'square', peak: 0.025, delay: 0.05 }));
  }

  leak() {
    if (this.gate('leak', 0.1)) (this.tone(180, 0.35, { type: 'sawtooth', peak: 0.12, slide: 0.5 }), this.tone(140, 0.4, { type: 'square', peak: 0.06, slide: 0.5, delay: 0.05 }));
  }

  build() {
    if (!this.gate('build', 0.05)) return;
    this.tone(220, 0.12, { type: 'triangle', peak: 0.15, slide: 1.5 });
    this.hiss(1800, 1, 0.08, 0.05);
  }

  upgrade() {
    if (!this.gate('upgrade', 0.05)) return;
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', peak: 0.09, delay: i * 0.05 }));
  }

  sell() {
    if (this.gate('sell', 0.05)) [784, 659, 523].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', peak: 0.07, delay: i * 0.04 }));
  }

  click() {
    if (this.gate('click', 0.03)) this.tone(660, 0.04, { type: 'sine', peak: 0.06 });
  }

  deny() {
    if (this.gate('deny', 0.1)) this.tone(160, 0.15, { type: 'square', peak: 0.06, slide: 0.8 });
  }

  wave(boss) {
    if (!this.gate('wave', 0.3)) return;
    if (boss) {
      [110, 104, 98].forEach((f, i) => this.tone(f, 0.6, { type: 'sawtooth', peak: 0.12, delay: i * 0.35, attack: 0.05 }));
    } else {
      this.tone(392, 0.25, { type: 'triangle', peak: 0.1 });
      this.tone(523, 0.35, { type: 'triangle', peak: 0.1, delay: 0.12 });
    }
  }

  ability(key) {
    if (key === 'blizzard') this.hiss(4000, 0.5, 1.2, 0.15, { slide: 0.2, type: 'highpass' });
    else if (key === 'overdrive') [330, 440, 660, 880].forEach((f, i) => this.tone(f, 0.2, { type: 'sawtooth', peak: 0.05, delay: i * 0.06 }));
    else if (key === 'meteor') this.hiss(3000, 0.6, 0.8, 0.1, { slide: 0.1 });
  }

  boss(ability) {
    if (!this.ctx || this.muted) return;
    if (ability === 'windup') this.tone(70, 0.9, { type: 'sawtooth', peak: 0.08, slide: 1.8, attack: 0.5 });
    else if (ability === 'stomp') (this.explosion(true), this.tone(45, 0.7, { peak: 0.4, slide: 0.6 }));
    else if (ability === 'blink') (this.tone(900, 0.25, { type: 'sine', peak: 0.1, slide: 0.3 }), this.hiss(5000, 2, 0.2, 0.06, { slide: 0.3 }));
    else if (ability === 'aura') [440, 554, 659].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', peak: 0.06, delay: i * 0.05 }));
    else if (ability === 'burst') (this.hiss(500, 0.8, 0.6, 0.2, { type: 'lowpass', slide: 0.3 }), this.tone(160, 0.5, { type: 'square', peak: 0.08, slide: 0.5 }));
  }

  victory() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', peak: 0.12, delay: i * 0.12 }));
  }

  defeat() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.5, { type: 'sawtooth', peak: 0.07, delay: i * 0.18 }));
  }
}
