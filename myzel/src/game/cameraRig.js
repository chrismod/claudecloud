// Gemeinsame Kamera: rahmt beide Geister, zoomt mit ihrem Abstand, schaut leicht voraus.
import * as THREE from 'three';
import { WATER } from '../config.js';

export function createCameraRig(camera) {
  const focus = new THREE.Vector3();
  const look = new THREE.Vector3();
  const rig = {
    yaw: 0.35,
    pitch: 0.68,
    dist: 30,
    focus,
    shake: 0,
    mode: 'title',
    titleT: 0,
    snapNext: true,
  };

  function update(dt, players, field, rx) {
    let tx;
    let ty;
    let tz;
    let dist;
    let pitch;
    if (rig.mode === 'title') {
      rig.titleT += dt;
      rig.yaw = 0.35 + rig.titleT * 0.035;
      tx = 0;
      tz = 0;
      ty = field.height(0, 0) + 9;
      dist = 52;
      pitch = 0.3;
    } else {
      rig.yaw += rx * dt * 1.6;
      let cx = 0;
      let cz = 0;
      let cyy = 0;
      let vx = 0;
      let vz = 0;
      for (const p of players) {
        cx += p.x;
        cz += p.z;
        cyy += p.y;
        vx += p.vx;
        vz += p.vz;
      }
      const n = players.length || 1;
      cx /= n;
      cz /= n;
      cyy /= n;
      const spread = players.length > 1 ? Math.hypot(players[0].x - players[1].x, players[0].z - players[1].z) : 0;
      tx = cx + (vx / n) * 0.55;
      tz = cz + (vz / n) * 0.55;
      ty = cyy - 0.5;
      dist = Math.min(68, 26 + spread * 0.85);
      pitch = 0.62 + Math.min(0.2, spread * 0.004);
    }
    const k = rig.snapNext ? 1 : Math.min(1, dt * 3);
    if (rig.snapNext) {
      rig.dist = dist;
      rig.pitch = pitch;
      focus.y = ty;
      rig.snapNext = false;
    }
    focus.x += (tx - focus.x) * k;
    focus.y += (ty - focus.y) * Math.min(1, dt * 2);
    focus.z += (tz - focus.z) * k;
    rig.dist += (dist - rig.dist) * Math.min(1, dt * 1.5);
    rig.pitch += (pitch - rig.pitch) * Math.min(1, dt * 1.5);

    const cp = Math.cos(rig.pitch);
    const x = focus.x + Math.sin(rig.yaw) * cp * rig.dist;
    const z = focus.z + Math.cos(rig.yaw) * cp * rig.dist;
    let y = focus.y + Math.sin(rig.pitch) * rig.dist;
    y = Math.max(y, Math.max(field.height(x, z), WATER) + 4);
    camera.position.set(x, y, z);
    rig.shake = Math.max(0, rig.shake - dt * 1.5);
    const s = rig.shake * rig.shake;
    camera.position.x += (Math.random() - 0.5) * s * 1.2;
    camera.position.y += (Math.random() - 0.5) * s * 1.2;
    look.copy(focus);
    look.y += rig.mode === 'title' ? 4 : 1;
    camera.lookAt(look);
  }

  function snap(players, field) {
    const cx = players.reduce((a, p) => a + p.x, 0) / players.length;
    const cz = players.reduce((a, p) => a + p.z, 0) / players.length;
    focus.set(cx, field.height(cx, cz) + 1, cz);
  }

  return Object.assign(rig, { update, snap });
}
