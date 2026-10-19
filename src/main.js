import './style.css';
import { World } from './physics/world.js';
import { LEVELS } from './levels.js';
import { Stage } from './render/stage.js';
import { LevelView } from './render/levelView.js';
import { StrandView } from './render/strandView.js';
import { Effects } from './render/effects.js';
import { woodTexture, breadTexture, cheeseBlockTexture, oliveTexture, fiberTexture } from './render/textures.js';
import { Sound } from './audio.js';

const STEP = 1 / 60;
const $ = (id) => document.getElementById(id);

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem('filatura.progress') || '{}');
  } catch {
    return {};
  }
}

function saveProgress(p) {
  try {
    localStorage.setItem('filatura.progress', JSON.stringify(p));
  } catch {
    /* privater Modus o. Ä. */
  }
}

function starsFor(level, used) {
  if (used <= level.par + 1e-6) return 3;
  if (used <= level.par + (level.cheese - level.par) / 2) return 2;
  return 1;
}

class Game {
  constructor() {
    this.stage = new Stage($('stage'));
    this.textures = {
      wood: woodTexture(),
      bread: breadTexture(),
      cheese: cheeseBlockTexture(),
      olive: oliveTexture(),
      fiber: fiberTexture(),
    };
    this.strandView = new StrandView(this.stage.scene, this.textures.fiber);
    this.effects = new Effects(this.stage.scene, this.stage.renderer);
    this.sound = new Sound();
    this.progress = loadProgress();

    this.overlay = $('overlay');
    this.octx = this.overlay.getContext('2d');
    this.trail = [];

    this.pointer = { mode: null, id: null, world: null, last: null, lastTime: 0 };
    this.hover = null;
    this.target = null;
    this.oliveTarget = false;
    this.acc = 0;
    this.last = performance.now();
    this.time = 0;

    this._bindUI();
    this._bindInput();
    this._resize();
    window.addEventListener('resize', () => this._resize());

    const first = LEVELS.findIndex((l) => !this.progress[l.id]);
    this.load(first < 0 ? 0 : first);
    this.showPanel('panel-start');

    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- Level

  load(index) {
    this.index = (index + LEVELS.length) % LEVELS.length;
    this.level = LEVELS[this.index];
    this.world = new World(this.level);
    this.view?.dispose();
    this.view = new LevelView(this.stage.scene, this.level, this.textures);
    this.strandView.clear();
    this.effects.clear();
    this.pointer.mode = null;
    this.trail.length = 0;
    this.endTimer = null;
    this.lastSnap = null;
    $('level-num').textContent = String(this.index + 1);
    $('level-name').textContent = this.level.name;
    $('hint-text').textContent = this.level.hint;
    this.showHint(8);
    this.hidePanels();
    this._updateHud();
  }

  restart() {
    this.load(this.index);
  }

  go() {
    this.world.releaseOlive();
    this._updateHud();
  }

  // Ein Level ist spielbar, wenn es das erste ist oder das vorherige geschafft wurde
  unlocked(i) {
    return i === 0 || !!this.progress[LEVELS[i].id] || !!this.progress[LEVELS[i - 1].id];
  }

  // ---------------------------------------------------------------- UI

  _bindUI() {
    $('btn-go').addEventListener('click', () => {
      this.sound.unlock();
      this.go();
    });
    $('btn-restart').addEventListener('click', () => this.restart());
    $('btn-levels').addEventListener('click', () => this.openLevels());
    $('btn-hint').addEventListener('click', () => this.toggleHint());
    $('btn-close-levels').addEventListener('click', () => this.hidePanels());
    $('btn-play').addEventListener('click', () => {
      this.sound.unlock();
      this.hidePanels();
    });
    $('btn-next').addEventListener('click', () => this.load(this.index + 1));
    $('btn-win-retry').addEventListener('click', () => this.restart());
    $('btn-retry').addEventListener('click', () => this.restart());
    const soundBtn = $('btn-sound');
    soundBtn.classList.toggle('muted', this.sound.muted);
    soundBtn.addEventListener('click', () => {
      this.sound.unlock();
      soundBtn.classList.toggle('muted', this.sound.toggleMute());
    });
  }

  // Hinweis zeigen und nach einigen Sekunden (oder beim ersten Eingriff) ausblenden
  showHint(seconds) {
    $('hint').classList.remove('dim');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hideHint(), seconds * 1000);
  }

  hideHint() {
    clearTimeout(this.hintTimer);
    $('hint').classList.add('dim');
  }

  toggleHint() {
    if ($('hint').classList.contains('dim')) this.showHint(10);
    else this.hideHint();
  }

  showPanel(id) {
    this.hidePanels();
    $(id).hidden = false;
    this.panel = id;
  }

  hidePanels() {
    for (const el of document.querySelectorAll('.panel')) el.hidden = true;
    this.panel = null;
  }

  openLevels() {
    const grid = $('level-grid');
    grid.innerHTML = '';
    LEVELS.forEach((l, i) => {
      const b = document.createElement('button');
      const open = this.unlocked(i);
      b.className = 'level-card' + (i === this.index ? ' current' : '') + (open ? '' : ' locked');
      b.disabled = !open;
      const stars = this.progress[l.id] || 0;
      b.innerHTML = `<div class="n">${open ? i + 1 : ''}</div><div class="name"></div><div class="mini-stars">${'●'.repeat(stars)}${'○'.repeat(3 - stars)}</div>`;
      b.querySelector('.name').textContent = open ? l.name : '· · ·';
      b.addEventListener('click', () => this.load(i));
      grid.appendChild(b);
    });
    this.showPanel('panel-levels');
  }

  _updateHud() {
    const w = this.world;
    const frac = w.cheeseLeft / w.budget;
    $('cheese-fill').style.width = `${(frac * 100).toFixed(1)}%`;
    $('cheese-fill').closest('.level-title').classList.toggle('low', frac < 0.2);
    const btn = $('btn-go');
    const waiting = w.olive.state === 'waiting';
    btn.disabled = !waiting;
    let label = w.olive.state === 'rolling' ? 'Olive rollt … ' : 'Olive los! ';
    if (waiting && w.autoRelease !== null) label = `Start in ${Math.max(0, Math.ceil(w.autoRelease - w.time))} s · Olive los! `;
    btn.firstChild.textContent = label;
    btn.classList.toggle('countdown', waiting && w.autoRelease !== null);
  }

  _onWin() {
    const used = this.world.used;
    const stars = starsFor(this.level, used);
    const prev = this.progress[this.level.id] || 0;
    if (stars > prev) {
      this.progress[this.level.id] = stars;
      saveProgress(this.progress);
    }
    const starsEl = $('win-stars');
    starsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('div');
      s.className = 'star' + (i < stars ? ' on' : '');
      starsEl.appendChild(s);
    }
    const pct = Math.round((used / this.level.cheese) * 100);
    $('win-text').textContent =
      stars === 3 ? `${pct} % Mozzarella verbraucht – meisterhaft!` : `${pct} % Mozzarella verbraucht. Geht's sparsamer?`;
    const last = this.index === LEVELS.length - 1;
    if (last) $('win-text').textContent += ' Alle Level geschafft – bravissimo!';
    $('btn-next').textContent = last ? 'Von vorn →' : 'Weiter →';
    this.showPanel('panel-win');
  }

  _onLose(reason) {
    const LOSE_TEXT = {
      stuck: 'Die Olive steckt fest. Weicher Käse gibt nach – fester trägt.',
      impact: 'Kalter Käse ist beim Aufprall zerbrochen. Frisch gezogener fängt weicher.',
      tear: 'Der heiße Käse ist unter der Last gerissen. Lass ihn etwas fester werden.',
      cut: 'Daneben! Probier einen anderen Moment für den Schnitt.',
      none: 'Die Olive ist abgestürzt. Ein Käsefaden hätte sie gehalten.',
    };
    $('lose-text').textContent = LOSE_TEXT[reason === 'stuck' ? 'stuck' : this.lastSnap || 'none'];
    this.showPanel('panel-lose');
  }

  // ---------------------------------------------------------------- Eingabe

  // Greifradius für Spieße: mindestens ~26 px, damit es auch mit dem Finger klappt
  _pickRadius() {
    return Math.max(0.7, 26 * this.stage.worldPerPixel());
  }

  _bindInput() {
    const canvas = this.stage.renderer.domElement;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('pointercancel', (e) => this._up(e));
    window.addEventListener('keydown', (e) => this._key(e));
  }

  _down(e) {
    this.sound.unlock();
    if (this.panel || this.pointer.mode) return;
    this.hideHint();
    const p = this.stage.toWorld(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    this.stage.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointer.id = e.pointerId;
    this.pointer.last = p;
    this.pointer.lastTime = performance.now();
    const anchor = e.button === 0 ? this.world.pickAnchor(p.x, p.y, this._pickRadius()) : null;
    if (anchor && this.world.cheeseLeft > 0.05 && this.world.olive.state !== 'won') {
      this.world.beginStrand(anchor, p.x, p.y);
      this.pointer.mode = 'draw';
    } else {
      this.pointer.mode = 'cut';
      this.trail.push({ x: e.clientX, y: e.clientY, t: this.time });
    }
  }

  _move(e) {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.stage.setParallax((e.clientX - rect.left) / rect.width - 0.5, 0.5 - (e.clientY - rect.top) / rect.height);
    const p = this.stage.toWorld(e.clientX, e.clientY);
    if (!p) return;
    const w = this.world;
    const mode = this.pointer.mode;
    if (mode && e.pointerId !== this.pointer.id) return;

    if (mode === 'draw' && w.drawing) {
      w.dragTo(p.x, p.y);
      const now = performance.now();
      const dt = Math.max(1, now - this.pointer.lastTime) / 1000;
      const last = this.pointer.last;
      this.sound.stretch(Math.hypot(p.x - last.x, p.y - last.y) / dt);
      this.pointer.lastTime = now;
      this.target = w.pickAnchor(p.x, p.y, this._pickRadius(), w.drawing.startAnchor);
      this.oliveTarget = !this.target && Math.hypot(w.olive.x - p.x, w.olive.y - p.y) < w.olive.r + 0.4;
    } else if (mode === 'cut') {
      const last = this.pointer.last;
      const cuts = w.cut(last.x, last.y, p.x, p.y);
      if (cuts) this.sound.snap(false);
      this.trail.push({ x: e.clientX, y: e.clientY, t: this.time });
    } else {
      this.hover = w.pickAnchor(p.x, p.y, this._pickRadius());
    }
    this.pointer.last = p;
    this._updateCursor();
  }

  _up(e) {
    if (e.pointerId !== this.pointer.id) return;
    const w = this.world;
    if (this.pointer.mode === 'draw' && w.drawing) {
      const p = this.stage.toWorld(e.clientX, e.clientY) || this.pointer.last;
      const res = w.endStrand(p.x, p.y, this._pickRadius());
      if (res && (res.result === 'anchor' || res.result === 'olive')) this.sound.attach();
    }
    this.sound.stretch(0);
    this.pointer.mode = null;
    this.pointer.id = null;
    this.target = null;
    this.oliveTarget = false;
    this._updateCursor();
  }

  _key(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') {
      e.preventDefault();
      this.sound.unlock();
      if (this.panel === 'panel-win') this.load(this.index + 1);
      else if (this.panel === 'panel-start') this.hidePanels();
      else if (this.panel === 'panel-lose') this.restart();
      else if (!this.panel) this.go();
    } else if (k === 'r') {
      this.restart();
    } else if (k === 'l') {
      if (this.panel === 'panel-levels') this.hidePanels();
      else this.openLevels();
    } else if (k === 'h') {
      this.toggleHint();
    } else if (k === 'm') {
      this.sound.unlock();
      $('btn-sound').classList.toggle('muted', this.sound.toggleMute());
    } else if (k === 'escape') {
      if (this.world.drawing) {
        this.world.cancelStrand();
        this.pointer.mode = null;
      } else if (this.panel && this.panel !== 'panel-win' && this.panel !== 'panel-lose') {
        this.hidePanels();
      }
    } else if (k === 'n' && this.panel === 'panel-win') {
      this.load(this.index + 1);
    }
  }

  _updateCursor() {
    const c = this.stage.renderer.domElement;
    c.style.cursor = this.pointer.mode === 'draw' ? 'grabbing' : this.hover ? 'grab' : 'crosshair';
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.overlay.width = window.innerWidth * dpr;
    this.overlay.height = window.innerHeight * dpr;
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.effects.resize(window.innerHeight);
  }

  // ---------------------------------------------------------------- Ereignisse

  _handleEvents() {
    for (const e of this.world.drainEvents()) {
      if (e.type === 'snap') {
        this.lastSnap = e.cause;
        const cold = e.T < 0.35;
        this.effects.burst(e.x, e.y, cold ? 1 : 0, cold ? 16 : 10, { speed: cold ? 3 : 1.6 });
        if (e.cause !== 'cut') this.sound.snap(cold);
        if (e.cause === 'impact') this.stage.addShake(0.12);
      } else if (e.type === 'attach' && e.result !== 'free') {
        this.effects.burst(e.x, e.y, 0, 5, { speed: 0.8, up: 0.4 });
      } else if (e.type === 'release') {
        this.sound.release();
      } else if (e.type === 'won') {
        this.effects.burst(e.x, e.y + 0.2, 2, 34, { speed: 2.6, up: 2.2 });
        this.sound.win();
        this.endTimer = { at: this.time + 1.0, fn: () => this._onWin() };
      } else if (e.type === 'lost') {
        this.sound.lose();
        this.endTimer = { at: this.time + (e.reason === 'stuck' ? 0.4 : 0.9), fn: () => this._onLose(e.reason) };
      }
      if (e.type !== 'draw-start' && e.type !== 'attach') this._updateHud();
    }
  }

  // ---------------------------------------------------------------- Loop

  frame(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.time += dt;

    if (!this.panel || this.panel === 'panel-win' || this.panel === 'panel-lose') {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 4) {
        this.world.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === 4) this.acc = 0;
      this._handleEvents();
    }
    if (this.endTimer && this.time >= this.endTimer.at) {
      const fn = this.endTimer.fn;
      this.endTimer = null;
      fn();
    }
    if (this.world.drawing || (this.world.autoRelease !== null && this.world.olive.state === 'waiting')) this._updateHud();

    this.view.update(this.world, dt, { hover: this.hover, target: this.target, oliveTarget: this.oliveTarget });
    this.strandView.sync(this.world);
    this.effects.update(dt, this.world);
    this.stage.render(dt);
    this._drawTrail();
    requestAnimationFrame((t2) => this.frame(t2));
  }

  _drawTrail() {
    const ctx = this.octx;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const life = 0.22;
    while (this.trail.length && this.time - this.trail[0].t > life) this.trail.shift();
    if (this.trail.length < 2) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const k = 1 - (this.time - b.t) / life;
      ctx.strokeStyle = `rgba(255, 252, 240, ${0.85 * k})`;
      ctx.lineWidth = 1 + 5 * k;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
}

window.__filatura = new Game();
