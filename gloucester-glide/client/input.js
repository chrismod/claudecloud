// Tastatur, Gamepad und Touch → pro Tick { steer: -100..100, flags }
import { JUMP, RESPAWN } from '../shared/sim.js';

export function createInput({ onKey } = {}) {
  const keys = new Set();
  let steer = 0;
  let jumpQueued = false;
  let jumpBuffer = 0; // kurz vor der Landung gedrückt zählt trotzdem
  let respawnQueued = false;
  const touch = { steer: 0, jump: false };
  let padJumpWas = false;
  let padResetWas = false;

  const LEFT = ['KeyA', 'ArrowLeft'];
  const RIGHT = ['KeyD', 'ArrowRight'];

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      if (e.code === 'Enter' || e.code === 'Escape') onKey?.(e.code, e);
      return;
    }
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') jumpQueued = true;
      if (e.code === 'KeyR') respawnQueued = true;
      onKey?.(e.code, e);
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // Touch-Flächen
  const el = document.getElementById('touch');
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
    if (pad.dataset.action === 'jump') jumpQueued = true;
    if (pad.dataset.action === 'respawn') respawnQueued = true;
    refresh();
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, (e) => (active.delete(e.pointerId), refresh()));
  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (isTouch) document.body.classList.add('touch');

  function gamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      const x = Math.abs(p.axes[0]) > 0.12 ? p.axes[0] : 0;
      const dl = p.buttons[14]?.pressed ? -1 : 0;
      const dr = p.buttons[15]?.pressed ? 1 : 0;
      const j = p.buttons[0]?.pressed;
      const rs = p.buttons[3]?.pressed || p.buttons[1]?.pressed;
      if (j && !padJumpWas) jumpQueued = true;
      if (rs && !padResetWas) respawnQueued = true;
      padJumpWas = j;
      padResetWas = rs;
      if (p.buttons[9]?.pressed) onKey?.('GamepadStart');
      return x + dl + dr;
    }
    return 0;
  }

  return {
    isTouch,
    showTouch(on) {
      el.classList.toggle('hidden', !(on && isTouch));
    },
    // Einmal je Simulations-Tick aufrufen
    sample(dt) {
      const digital = (RIGHT.some((k) => keys.has(k)) ? 1 : 0) - (LEFT.some((k) => keys.has(k)) ? 1 : 0) + touch.steer;
      const analog = gamepad();
      let target = Math.max(-1, Math.min(1, digital + analog)) * 100;
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
  };
}
