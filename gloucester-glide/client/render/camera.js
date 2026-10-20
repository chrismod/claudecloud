// Verfolgerkamera: hinter dem Käse in Fahrtrichtung, weicher Nachlauf, Sichtfeld wächst mit dem Tempo
import * as THREE from 'three';

export function createChaseCam(camera) {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const dir = new THREE.Vector3(0, 0, 1);
  let shake = 0;
  let fov = 62;
  let first = true;
  const tmp = new THREE.Vector3();

  return {
    dir,
    reset() {
      first = true;
      dir.set(0, 0, 1);
    },
    bump(strength) {
      shake = Math.min(0.6, shake + strength * 0.04);
    },
    update(dt, target, vel, groundAt, mode = 'chase', time = 0) {
      if (mode === 'orbit') {
        // Kamerafahrt fürs Menü
        const a = time * 0.12;
        tmp.set(target.x + Math.sin(a) * 9 - 4, target.y + 3.2, target.z - 8 + Math.cos(a) * 3);
        tmp.y = Math.max(tmp.y, groundAt(tmp.x, tmp.z) + 1.5);
        pos.lerp(tmp, first ? 1 : Math.min(1, dt * 2));
        look.lerp(tmp.copy(target).add(new THREE.Vector3(0, 0.3, 3)), first ? 1 : Math.min(1, dt * 4));
        first = false;
        camera.position.copy(pos);
        camera.lookAt(look);
        return;
      }
      const flat = Math.hypot(vel.x, vel.z);
      if (flat > 1.5) {
        tmp.set(vel.x / flat, 0, vel.z / flat);
        dir.lerp(tmp, Math.min(1, dt * 2.5)).normalize();
      }
      const speed = Math.hypot(vel.x, vel.y, vel.z);
      const back = 6 + Math.min(speed, 30) * 0.05;
      tmp.copy(target).addScaledVector(dir, -back);
      tmp.y = target.y + 2.6;
      // Am steilen Hang liegt der Punkt hinter dem Käse höher – Kamera nicht in den Boden
      tmp.y = Math.max(tmp.y, groundAt(tmp.x, tmp.z) + 1.4);
      if (first) pos.copy(tmp);
      else pos.lerp(tmp, Math.min(1, dt * 6));
      const lookAhead = tmp.copy(target).addScaledVector(dir, 4);
      lookAhead.y = target.y + 0.2;
      if (first) look.copy(lookAhead);
      else look.lerp(lookAhead, Math.min(1, dt * 10));
      first = false;

      camera.position.copy(pos);
      if (shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
        shake *= Math.exp(-dt * 7);
      }
      camera.lookAt(look);
      const targetFov = 60 + Math.min(speed, 32) * 0.55;
      fov += (targetFov - fov) * Math.min(1, dt * 2);
      camera.fov = fov;
      camera.updateProjectionMatrix();
    },
  };
}
