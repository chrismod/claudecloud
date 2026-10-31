// Porträts der Fahrer: jede Maus einmal in einer kleinen Szene rendern (eigener, kurzlebiger Renderer)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createKartModel } from './kart.js';
import { DRIVERS } from '../sim/config.js';

export function renderPortraits(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight('#fff4e0', 3);
  key.position.set(2, 3, 3);
  const rim = new THREE.DirectionalLight('#9cc8ff', 2.5);
  rim.position.set(-3, 2, -2);
  scene.add(key, rim, new THREE.AmbientLight('#ffffff', 0.4));
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  cam.position.set(1.55, 1.9, 2.5);
  cam.lookAt(0, 1.2, -0.25);
  const out = {};
  const fake = { x: 0, y: 0, z: 0, heading: 0, drift: 0, ls: 0, spinVis: 0, onGround: true, slope: 0, vy: 0, loc: { bank: 0, tx: 0, tz: 1 }, steerVis: -0.3, fs: 0, tumbleT: 0, spinT: 0, offroad: false, input: { throttle: 0, brake: 0 }, boostT: 0, goldenT: 0, driftLevel: 0, shieldT: 0, orbit: 0, invulnT: 0 };
  for (const d of DRIVERS) {
    const m = createKartModel(d);
    m.update(fake, 1 / 60, 0.5);
    scene.add(m.group);
    renderer.render(scene, cam);
    out[d.id] = canvas.toDataURL('image/png');
    scene.remove(m.group);
  }
  pmrem.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
