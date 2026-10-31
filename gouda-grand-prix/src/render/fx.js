// Partikel (Rauch, Staub, Funken, Flammen, Käsekrümel) und Reifenspuren
import * as THREE from 'three';
import { softSprite, puffSprite } from './textures.js';

function makePoints(max, texture, blending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 4);
  const size = new Float32Array(max);
  const rot = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('rot', new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending,
    fog: true,
    uniforms: { map: { value: texture }, scale: { value: 600 }, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */ `
      attribute float size; attribute float rot; attribute vec4 color;
      uniform float scale;
      varying vec4 vColor; varying float vRot;
      #include <fog_pars_vertex>
      void main() {
        vColor = color; vRot = rot;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = -mvPosition.z;
        // nahe an der Kamera ausblenden und begrenzen, sonst füllen einzelne Partikel das Bild
        vColor.a *= smoothstep(0.8, 3.5, dist);
        gl_PointSize = min(size * scale / max(0.5, dist), scale * 0.12);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec4 vColor; varying float vRot;
      #include <fog_pars_fragment>
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float c = cos(vRot), s = sin(vRot);
        uv = mat2(c, -s, s, c) * uv + 0.5;
        vec4 t = texture2D(map, uv);
        gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
        if (gl_FragColor.a < 0.004) discard;
        #include <fog_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  return { pts, pos, col, size, rot, geo, mat, max };
}

export function createFx(scene) {
  const normal = makePoints(3000, puffSprite(), THREE.NormalBlending);
  const add = makePoints(3000, softSprite(), THREE.AdditiveBlending);
  scene.add(normal.pts, add.pts);
  const pools = [normal, add];
  const parts = [[], []];

  /** p: {x,y,z, vx,vy,vz, life, size, grow, color:[r,g,b], alpha, drag, grav, spin, additive} */
  function spawn(p) {
    const list = parts[p.additive ? 1 : 0];
    if (list.length >= pools[p.additive ? 1 : 0].max) list.shift();
    p.age = 0;
    p.rot = p.rot ?? Math.random() * 6.28;
    p.spin = p.spin ?? (Math.random() - 0.5) * 2;
    p.drag = p.drag ?? 1;
    p.grav = p.grav ?? 0;
    p.grow = p.grow ?? 1;
    p.alpha = p.alpha ?? 1;
    list.push(p);
  }

  function update(dt) {
    for (let k = 0; k < 2; k++) {
      const pool = pools[k];
      const list = parts[k];
      let w = 0;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) continue;
        const dr = Math.exp(-p.drag * dt);
        p.vx *= dr;
        p.vy = p.vy * dr - p.grav * dt;
        p.vz *= dr;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rot += p.spin * dt;
        const t = p.age / p.life;
        pool.pos[w * 3] = p.x;
        pool.pos[w * 3 + 1] = p.y;
        pool.pos[w * 3 + 2] = p.z;
        const fade = k ? 1 - t : Math.min(1, t * 6) * (1 - t);
        pool.col[w * 4] = p.color[0];
        pool.col[w * 4 + 1] = p.color[1];
        pool.col[w * 4 + 2] = p.color[2];
        pool.col[w * 4 + 3] = p.alpha * fade;
        pool.size[w] = p.size * (1 + (p.grow - 1) * t);
        pool.rot[w] = p.rot;
        list[w++] = p;
      }
      list.length = w;
      pool.geo.setDrawRange(0, w);
      for (const n of ['position', 'color', 'size', 'rot']) {
        const a = pool.geo.attributes[n];
        a.needsUpdate = true;
        a.clearUpdateRanges();
        a.addUpdateRange(0, w * a.itemSize);
      }
    }
  }

  // Bildschirmhöhe in Pixel für die Punktgröße
  function setViewportHeight(h) {
    for (const p of pools) p.mat.uniforms.scale.value = h * 0.9;
  }

  // --- Reifenspuren --------------------------------------------------------------------------------
  const SKID = 1600;
  const skidGeo = new THREE.PlaneGeometry(0.32, 1).rotateX(-Math.PI / 2);
  const skidMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const skids = new THREE.InstancedMesh(skidGeo, skidMat, SKID);
  skids.frustumCulled = false;
  skids.count = 0;
  scene.add(skids);
  let skidHead = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const lastSkid = new Map();
  function skid(key, x, y, z) {
    const prev = lastSkid.get(key);
    lastSkid.set(key, { x, y, z, t: performance.now() });
    if (!prev || performance.now() - prev.t > 120) return;
    const dx = x - prev.x;
    const dz = z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05 || len > 3) return;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz));
    sc.set(1, 1, len);
    m4.compose(new THREE.Vector3((x + prev.x) / 2, (y + prev.y) / 2 + 0.03, (z + prev.z) / 2), q, sc);
    skids.setMatrixAt(skidHead, m4);
    skidHead = (skidHead + 1) % SKID;
    skids.count = Math.min(SKID, skids.count + 1);
    skids.instanceMatrix.needsUpdate = true;
  }

  // --- Vorgefertigte Effekte ----------------------------------------------------------------------
  const rnd = (a = 1) => (Math.random() * 2 - 1) * a;
  const fx = {
    update,
    setViewportHeight,
    skid,
    spawn,
    dust(x, y, z, color = [0.75, 0.68, 0.55], n = 1, v = 1) {
      for (let i = 0; i < n; i++)
        spawn({ x: x + rnd(0.3), y: y + 0.2, z: z + rnd(0.3), vx: rnd(1.5) * v, vy: 1 + Math.random() * 1.5, vz: rnd(1.5) * v, life: 0.9 + Math.random() * 0.6, size: 1.0, grow: 3, color, alpha: 0.45, drag: 2 });
    },
    smoke(x, y, z, color = [0.85, 0.85, 0.88], n = 1) {
      for (let i = 0; i < n; i++)
        spawn({ x: x + rnd(0.2), y: y + 0.3, z: z + rnd(0.2), vx: rnd(1), vy: 1.2 + Math.random(), vz: rnd(1), life: 1.2 + Math.random() * 0.8, size: 0.9, grow: 3.5, color, alpha: 0.4, drag: 1.5 });
    },
    sparks(x, y, z, color, n = 3, speed = 4) {
      for (let i = 0; i < n; i++)
        spawn({ x, y: y + 0.15, z, vx: rnd(speed), vy: 1 + Math.random() * speed * 0.8, vz: rnd(speed), life: 0.25 + Math.random() * 0.3, size: 0.28, grow: 0.4, color, alpha: 1, drag: 3, grav: 14, additive: true });
    },
    flame(x, y, z, vx, vz, color = [3, 1.4, 0.4]) {
      spawn({ x: x + rnd(0.05), y: y + rnd(0.05), z: z + rnd(0.05), vx, vy: 0.5 + Math.random(), vz, life: 0.18 + Math.random() * 0.12, size: 0.6, grow: 0.3, color, alpha: 0.9, drag: 4, additive: true });
    },
    burst(x, y, z, color, n = 30, speed = 9, size = 0.5) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = Math.random() * Math.PI - Math.PI / 2;
        const s = speed * (0.4 + Math.random() * 0.6);
        spawn({ x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.abs(Math.sin(e)) * s + 2, vz: Math.sin(a) * Math.cos(e) * s, life: 0.5 + Math.random() * 0.5, size, grow: 0.5, color, alpha: 1, drag: 2.5, grav: 10, additive: true });
      }
    },
    explosion(x, y, z) {
      fx.burst(x, y + 0.5, z, [4, 1.6, 0.3], 60, 14, 0.9);
      for (let i = 0; i < 26; i++)
        spawn({ x: x + rnd(1), y: y + 0.6 + Math.random(), z: z + rnd(1), vx: rnd(5), vy: 2 + Math.random() * 5, vz: rnd(5), life: 1.4 + Math.random(), size: 2.2, grow: 2.4, color: [0.35, 0.3, 0.28], alpha: 0.75, drag: 2 });
      spawn({ x, y: y + 1, z, vx: 0, vy: 0, vz: 0, life: 0.35, size: 14, grow: 1.5, color: [5, 2.5, 0.8], alpha: 1, additive: true });
    },
    cheeseCrumbs(x, y, z, n = 14) {
      for (let i = 0; i < n; i++)
        spawn({ x, y: y + 0.8, z, vx: rnd(5), vy: 3 + Math.random() * 5, vz: rnd(5), life: 0.9 + Math.random() * 0.5, size: 0.35, grow: 0.8, color: [1.6, 1.15, 0.25], alpha: 1, drag: 1, grav: 18, additive: true });
    },
    stink(x, y, z) {
      spawn({ x: x + rnd(1.2), y: y + 1 + Math.random(), z: z + rnd(1.2), vx: rnd(0.8), vy: 0.6, vz: rnd(0.8), life: 1.4, size: 1.6, grow: 2.2, color: [0.45, 0.8, 0.2], alpha: 0.55, drag: 1 });
    },
    golden(x, y, z) {
      spawn({ x: x + rnd(1), y: y + 0.3 + Math.random() * 1.4, z: z + rnd(1), vx: rnd(1), vy: 1.5, vz: rnd(1), life: 0.6, size: 0.35, grow: 0.2, color: [3, 2.2, 0.5], alpha: 1, drag: 1, additive: true });
    },
    splash(x, y, z) {
      for (let i = 0; i < 24; i++)
        spawn({ x, y: y + 0.3, z, vx: rnd(4), vy: 2 + Math.random() * 4, vz: rnd(4), life: 0.7 + Math.random() * 0.3, size: 0.6, grow: 0.6, color: [1.0, 0.8, 0.3], alpha: 0.95, drag: 1, grav: 16 });
    },
    volcanoSmoke(x, y, z) {
      spawn({ x: x + rnd(15), y, z: z + rnd(15), vx: rnd(2) + 3, vy: 8 + Math.random() * 4, vz: rnd(2), life: 9, size: 40, grow: 3, color: [0.22, 0.18, 0.18], alpha: 0.5, drag: 0.2 });
    },
    ember(x, y, z) {
      spawn({ x: x + rnd(20), y, z: z + rnd(20), vx: rnd(3), vy: 10 + Math.random() * 10, vz: rnd(3), life: 2.5, size: 1.2, grow: 0.2, color: [4, 1.4, 0.3], alpha: 1, drag: 0.4, grav: 4, additive: true });
    },
  };
  return fx;
}
