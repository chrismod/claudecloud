// Gras- und Erdbrocken, die der Käse aufwirbelt
import * as THREE from 'three';

const MAX = 600;

export function createParticles(scene) {
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 16;
  const g = dot.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(8, 8, 7, 0, Math.PI * 2);
  g.fill();
  const mat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, sizeAttenuation: true, alphaTest: 0.5, map: new THREE.CanvasTexture(dot) });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let next = 0;
  const colors = [new THREE.Color('#5c8f2e'), new THREE.Color('#7fb046'), new THREE.Color('#6b5236'), new THREE.Color('#4a3a28')];
  for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -9999;

  return {
    emit(p, v, n, spread = 1.5) {
      for (let k = 0; k < n; k++) {
        const i = next++ % MAX;
        pos[i * 3] = p.x + (Math.random() - 0.5) * 0.4;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.4;
        vel[i * 3] = v.x * 0.3 + (Math.random() - 0.5) * spread * 2;
        vel[i * 3 + 1] = Math.random() * spread * 2 + 0.5;
        vel[i * 3 + 2] = v.z * 0.3 + (Math.random() - 0.5) * spread * 2;
        life[i] = 0.5 + Math.random() * 0.7;
        const c = colors[Math.floor(Math.random() * colors.length)];
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
    },
    update(dt) {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        vel[i * 3 + 1] -= 9.81 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (life[i] <= 0) pos[i * 3 + 1] = -9999;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    clear() {
      life.fill(0);
      for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -9999;
      geo.attributes.position.needsUpdate = true;
    },
  };
}
