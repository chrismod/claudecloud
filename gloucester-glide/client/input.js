// Tastatur, Gamepad und Touch → pro Spieler und Tick { steer: -100..100, flags }
// Belegung: 'solo' = alles; 'p1' = WASD (+ Leertaste) und Gamepad 1; 'p2' = Pfeiltasten und Gamepad 2
import { JUMP, RESPAWN } from '../shared/sim.js';

const SCHEMES = {
  solo: { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['Space', 'KeyW', 'ArrowUp'], respawn: ['KeyR'], touch: true },
  p1: { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW', 'Space'], respawn: ['KeyS'], touch: false },
  p2: { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], respawn: ['ArrowDown'], touch: false },
};

export function createInput({ onKey } = {}) {
  const keys = new Set();
  const samplers = new Set();

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      if (e.code === 'Enter' || e.code === 'Escape') onKey?.(e.code, e);
      return;
    }
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      for (const s of samplers) s.key(e.code);
      onKey?.(e.code, e);
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // Touch-Flächen (nur Einzelspieler)
  const el = document.getElementById('touch');
  const touch = { steer: 0 };
  const active = new Map();
  const refresh = () => {
    touch.steer = 0;
    for (const pad of active.values()) if (pad.dataset.steer) touch.steer += Number(pad.dataset.steer);
    el.querySelectorAll('.pad').forEach((p) => p.classList.toggle('active', [...active.values()].includes(p)));
  };
  el.addEventListener('pointerdown', (e) => {
    const pad = e.target.closest('.pad');
    if (!pad) return;
    e.preventDefault();
    active.set(e.pointerId, pad);
    for (const s of samplers) if (s.scheme.touch) s.touchAction(pad.dataset.action);
    refresh();
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, (e) => (active.delete(e.pointerId), refresh()));
  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (isTouch) document.body.classList.add('touch');

  // Gamepads: Einzelspieler nimmt jedes; zu zweit bekommt Spieler 1 das erste, Spieler 2 das zweite.
  // Ist nur eins angeschlossen, gehört es Spieler 2 (Spieler 1 fährt dann mit WASD).
  const pads = () => [...(navigator.getGamepads?.() ?? [])].filter(Boolean);
  let startWas = false;
  function padFor(name) {
    const list = pads();
    if (name === 'solo') return list[0] ?? null;
    if (list.length === 1) return name === 'p2' ? list[0] : null;
    return list[name === 'p1' ? 0 : 1] ?? null;
  }

  function createSampler(name) {
    const scheme = SCHEMES[name];
    let steer = 0;
    let jumpQueued = false;
    let jumpBuffer = 0; // kurz vor der Landung gedrückt zählt trotzdem
    let respawnQueued = false;
    let padJumpWas = false;
    let padResetWas = false;
    const s = {
      scheme,
      key(code) {
        if (scheme.jump.includes(code)) jumpQueued = true;
        if (scheme.respawn.includes(code)) respawnQueued = true;
      },
      touchAction(action) {
        if (action === 'jump') jumpQueued = true;
        if (action === 'respawn') respawnQueued = true;
      },
      // Einmal je Simulations-Tick aufrufen
      sample(dt) {
        let digital = (scheme.right.some((k) => keys.has(k)) ? 1 : 0) - (scheme.left.some((k) => keys.has(k)) ? 1 : 0);
        if (scheme.touch) digital += touch.steer;
        let analog = 0;
        const p = padFor(name);
        if (p) {
          analog = (Math.abs(p.axes[0]) > 0.12 ? p.axes[0] : 0) + (p.buttons[14]?.pressed ? -1 : 0) + (p.buttons[15]?.pressed ? 1 : 0);
          const j = p.buttons[0]?.pressed;
          const rs = p.buttons[3]?.pressed || p.buttons[1]?.pressed;
          if (j && !padJumpWas) jumpQueued = true;
          if (rs && !padResetWas) respawnQueued = true;
          padJumpWas = j;
          padResetWas = rs;
        }
        const target = Math.max(-1, Math.min(1, digital + analog)) * 100;
        // Digitale Eingaben weich anlaufen lassen, Analogsticks direkt
        if (analog !== 0 && digital === 0) steer = target;
        else {
          const rate = (target === 0 || Math.sign(target) !== Math.sign(steer) ? 900 : 420) * dt;
          steer += Math.max(-rate, Math.min(rate, target - steer));
        }
        let flags = 0;
        if (jumpQueued) jumpBuffer = 9;
        if (jumpBuffer > 0) (jumpBuffer--, (flags |= JUMP));
        if (respawnQueued) flags |= RESPAWN;
        jumpQueued = respawnQueued = false;
        return { steer: Math.round(steer), flags };
      },
      jumped() {
        jumpBuffer = 0;
      },
      reset() {
        steer = 0;
        jumpQueued = respawnQueued = false;
        jumpBuffer = 0;
      },
      dispose() {
        samplers.delete(s);
      },
    };
    samplers.add(s);
    return s;
  }

  return {
    isTouch,
    createSampler,
    showTouch(on) {
      el.classList.toggle('hidden', !(on && isTouch));
    },
    // Start-Taste eines Gamepads (Menü, Pause)
    poll() {
      const pressed = pads().some((p) => p.buttons[9]?.pressed);
      if (pressed && !startWas) onKey?.('GamepadStart');
      startWas = pressed;
    },
  };
}
