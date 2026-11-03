// Vorschaubilder für Bauleiste, Wellenvorschau und Almanach – einmalig mit eigenem Renderer fotografiert.
import * as THREE from 'three';
import { buildTowerModel } from './towers.js';
import { shapeFor } from './enemies.js';
import { ENEMIES } from '../game/data.js';

export function renderSnapshots(towerTypes, enemyTypes, size = 112) {
  const out = { towers: {}, enemies: {} };
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  r.setSize(size, size);
  r.setPixelRatio(1);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a5f77', 2.4));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);

  cam.position.set(1.2, 1.3, 1.65);
  cam.lookAt(0, 0.36, 0);
  for (const type of towerTypes) {
    const model = buildTowerModel(type, 3, null);
    model.head.rotation.y = -0.5;
    scene.add(model.root);
    r.render(scene, cam);
    out.towers[type] = r.domElement.toDataURL('image/png');
    scene.remove(model.root);
  }

  cam.position.set(1.6, 1.1, 2.4);
  cam.lookAt(0, 0, 0);
  for (const type of enemyTypes) {
    const s = shapeFor(type);
    const mat = new THREE.MeshStandardMaterial({ color: ENEMIES[type].color, roughness: 0.38, flatShading: s.flat });
    const g = new THREE.Group();
    const body = new THREE.Mesh(s.geo, mat);
    g.add(body);
    if (s.eyes) {
      const [fx, fy, fz] = s.eyes;
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
        w.position.set(fx, fy, fz * side);
        w.scale.y = 1.2;
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshStandardMaterial({ color: '#1b1d26' }));
        p.position.set(fx + 0.12, fy, fz * side);
        g.add(w, p);
      }
    }
    g.rotation.y = 0.7;
    const sc = 0.62 / Math.max(0.6, ENEMIES[type].size * 4.2);
    g.scale.setScalar(Math.min(0.75, sc * 1.6));
    scene.add(g);
    r.render(scene, cam);
    out.enemies[type] = r.domElement.toDataURL('image/png');
    scene.remove(g);
  }
  r.dispose();
  r.forceContextLoss?.();
  return out;
}
