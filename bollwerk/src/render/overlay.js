// 2D-Ebene über der 3D-Szene: Lebensbalken und schwebende Zahlen.
import * as THREE from 'three';

export class Overlay {
  constructor(canvas, stage, enemies) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.stage = stage;
    this.enemies = enemies;
    this.texts = [];
    this.v = new THREE.Vector3();
    this.resize();
    stage.onResize(() => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = this.stage.width || window.innerWidth;
    this.h = this.stage.height || window.innerHeight;
    this.cv.width = Math.round(this.w * dpr);
    this.cv.height = Math.round(this.h * dpr);
    this.cv.style.width = this.w + 'px';
    this.cv.style.height = this.h + 'px';
  }

  project(x, y, z) {
    const v = this.v.set(x, y, z).project(this.stage.camera);
    return [((v.x + 1) / 2) * this.w, ((1 - v.y) / 2) * this.h, v.z];
  }

  text(wx, wy, wz, str, color = '#ffd25e', size = 14) {
    this.texts.push({ wx, wy, wz, str, color, size, life: 1.1, max: 1.1 });
  }

  clear() {
    this.texts.length = 0;
  }

  draw(dt, game, board) {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    if (!game) return;
    const camDist = this.stage.camera.position.distanceTo(this.stage.controls.target);
    const zoom = Math.max(0.65, Math.min(1.6, 16 / camDist));

    for (const e of game.enemies) {
      if (!e.alive) continue;
      const damaged = e.hp < e.maxHp - 0.01 || (e.maxShield && e.shield < e.maxShield - 0.01);
      if (!damaged && !e.boss) continue;
      const p = this.enemies.worldPos(e, this.v);
      const [sx, sy, sz] = this.project(p.x, p.y + e.def.size + 0.18, p.z);
      if (sz > 1) continue;
      const w = (e.boss ? 46 : 22) * zoom;
      const h = (e.boss ? 5 : 3.2) * zoom;
      const x = sx - w / 2;
      const y = sy - h / 2;
      g.fillStyle = 'rgba(20,22,30,0.65)';
      g.beginPath();
      g.roundRect(x - 1, y - 1, w + 2, h + 2, h);
      g.fill();
      const f = Math.max(0, e.hp / e.maxHp);
      g.fillStyle = f > 0.5 ? '#7be27b' : f > 0.25 ? '#ffd24d' : '#ff5d5d';
      g.beginPath();
      g.roundRect(x, y, w * f, h, h / 2);
      g.fill();
      if (e.maxShield > 0 && e.shield > 0) {
        g.fillStyle = '#8fc4ff';
        g.fillRect(x, y - h * 0.9, w * (e.shield / e.maxShield), h * 0.6);
      }
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let n = 0;
    for (const t of this.texts) {
      t.life -= dt;
      if (t.life <= 0) continue;
      this.texts[n++] = t;
      const k = 1 - t.life / t.max;
      const [sx, sy, sz] = this.project(t.wx, t.wy, t.wz);
      if (sz > 1) continue;
      g.globalAlpha = Math.min(1, t.life * 3);
      g.font = `700 ${Math.round(t.size * zoom)}px Outfit, system-ui, sans-serif`;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(20,20,30,0.55)';
      const yy = sy - k * 28;
      g.strokeText(t.str, sx, yy);
      g.fillStyle = t.color;
      g.fillText(t.str, sx, yy);
      g.globalAlpha = 1;
    }
    this.texts.length = n;
    void board;
  }
}
