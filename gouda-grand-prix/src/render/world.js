// Welt einer Strecke: Himmel, Licht, Gelände, Fahrbahn, Banden, Startportal, Szenerie je Thema
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROAD_HALF, CURB, WALL } from '../sim/track.js';
import { THEMES } from './themes.js';
import * as TX from './textures.js';

// --- Rauschen für das Gelände (nicht kachelnd) ---------------------------------------------------
function h2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise2(x, z, seed = 0) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = h2(xi, zi, seed);
  const b = h2(xi + 1, zi, seed);
  const c = h2(xi, zi + 1, seed);
  const d = h2(xi + 1, zi + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm2(x, z, oct = 4, seed = 0) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += noise2(x * f, z * f, seed + i * 31) * a;
    a *= 0.5;
    f *= 2.03;
  }
  return s;
}
function ridged(x, z, oct = 5, seed = 0) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(noise2(x * f, z * f, seed + i * 13) * 2 - 1);
    s += n * n * a;
    a *= 0.5;
    f *= 2.1;
  }
  return s;
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Vertexfarben auf eine Geometrie setzen
function paint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) (arr[i * 3] = c.r), (arr[i * 3 + 1] = c.g), (arr[i * 3 + 2] = c.b);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
function merge(parts) {
  return mergeGeometries(parts.map(prep), false);
}
function jitter(geo, amount, seed) {
  const r = rng(seed);
  const p = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount]);
    const o = map.get(key);
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- Bäume und Felsen ----------------------------------------------------------------------------
function coniferGeo() {
  const parts = [paint(new THREE.CylinderGeometry(0.25, 0.4, 3, 6).translate(0, 1.5, 0), '#5a3d26')];
  const greens = ['#1f4d2b', '#245a30', '#2b6635'];
  for (let i = 0; i < 4; i++) {
    const r = 3.0 - i * 0.62;
    const g = new THREE.ConeGeometry(r, 3.6 - i * 0.3, 9, 1).translate(0, 3 + i * 2.1, 0);
    parts.push(paint(jitter(g, 0.35, i + 3), greens[i % 3]));
  }
  return merge(parts);
}
function broadleafGeo() {
  const parts = [paint(new THREE.CylinderGeometry(0.28, 0.45, 3.6, 7).translate(0, 1.8, 0), '#5b4030')];
  const blobs = [
    [0, 4.6, 0, 2.5],
    [1.4, 4.0, 0.6, 1.8],
    [-1.2, 4.2, -0.5, 1.9],
    [0.2, 5.8, -0.6, 1.7],
    [-0.4, 4.0, 1.3, 1.6],
  ];
  blobs.forEach(([x, y, z, r], i) => parts.push(paint(jitter(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), 0.35, i + 9), i % 2 ? '#3f7a2a' : '#4b8a30')));
  return merge(parts);
}
function poplarGeo() {
  const parts = [paint(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6).translate(0, 1.2, 0), '#5b4a3a')];
  parts.push(paint(jitter(new THREE.IcosahedronGeometry(1.3, 1).scale(1, 3.4, 1).translate(0, 6, 0), 0.25, 5), '#3d6e2a'));
  return merge(parts);
}
function deadTreeGeo() {
  const parts = [paint(new THREE.CylinderGeometry(0.15, 0.4, 5, 6).translate(0, 2.5, 0), '#1c1716')];
  const br = [
    [0.6, 3.2, 0.8, 0.7],
    [-0.5, 3.8, -1.0, -0.6],
    [0.2, 4.4, 0.6, 1.2],
  ];
  for (const [rx, y, rz, len] of br) {
    const b = new THREE.CylinderGeometry(0.06, 0.13, 2.2, 5).translate(0, 1.1, 0);
    b.rotateZ(rx).rotateX(rz).translate(0, y, 0);
    parts.push(paint(b, '#231b18'));
  }
  return merge(parts);
}
function rockGeo(seed, color = '#8a8580') {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const r = rng(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const k = 0.75 + noise2(v.x * 2 + seed, v.z * 2, seed) * 0.5;
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y * 0.7, v.z);
  }
  g.computeVertexNormals();
  void r;
  return paint(g, color);
}

// Wiegen im Wind für Instanzen (Bäume, Gras)
function addWind(material, uniforms, strength = 0.05, from = 1) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;
        #else
          float ph = 0.0;
        #endif
        float sw = max(0.0, position.y - ${from.toFixed(2)});
        transformed.x += sin(uTime * 1.7 + ph) * ${strength.toFixed(3)} * sw;
        transformed.z += cos(uTime * 1.3 + ph * 1.3) * ${(strength * 0.7).toFixed(3)} * sw;`,
      );
  };
  material.customProgramCacheKey = () => 'wind' + strength + from;
}

// --- Himmel --------------------------------------------------------------------------------------
function makeSky(theme, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(theme.zenith) },
      horizon: { value: new THREE.Color(theme.horizon) },
      groundCol: { value: new THREE.Color(theme.ground) },
      sunDir: { value: sunDir.clone() },
      sunColor: { value: new THREE.Color(theme.sunColor) },
      coverage: { value: theme.clouds },
      night: { value: theme.night ? 1 : 0 },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith, horizon, groundCol, sunDir, sunColor;
      uniform float coverage, night, time;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += noise(p) * a; p = p * 2.03 + 1.7; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.42));
        if (h < 0.0) col = mix(horizon, groundCol, clamp(-h * 5.0, 0.0, 1.0));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        float dayK = 1.0 - night;
        col += sunColor * (pow(s, 6.0) * 0.16 + pow(s, 60.0) * 0.4) * (0.3 + dayK * 0.7);
        col += sunColor * smoothstep(0.99935, 0.9997, s) * mix(2.5, 22.0, dayK);
        float cl = 0.0;
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.1) * 0.55 + vec2(time * 0.006, time * 0.002);
          float n = fbm(uv * 1.4);
          cl = smoothstep(1.0 - coverage - 0.05, 1.0 - coverage + 0.3, n) * smoothstep(0.0, 0.2, h);
          float lit = smoothstep(0.35, 0.85, fbm(uv * 1.4 + normalize(sunDir).xz * 0.06));
          vec3 cc = mix(vec3(0.68, 0.73, 0.82), vec3(1.05, 1.03, 1.0), lit);
          cc = mix(cc, cc * vec3(0.10, 0.07, 0.10) + vec3(0.16, 0.05, 0.03) * (1.0 - h), night);
          cc += sunColor * pow(s, 5.0) * 0.4 * dayK;
          col = mix(col, cc, cl * 0.92);
          if (night > 0.5) {
            vec3 p = floor(d * 380.0);
            float r = hash3(p);
            float star = step(0.9975, r) * (0.6 + 0.4 * sin(time * 3.0 + r * 200.0));
            col += vec3(0.9, 0.92, 1.0) * star * smoothstep(0.0, 0.25, h) * (1.0 - cl) * 1.5;
          }
        }
        // Glühen am Horizont (Vulkan)
        col += vec3(1.0, 0.25, 0.05) * night * pow(1.0 - abs(h), 12.0) * 0.35;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

// --- Welt ----------------------------------------------------------------------------------------
export function buildWorld({ track, def, renderer }) {
  const theme = THEMES[def.theme] ?? THEMES.polder;
  const scene = new THREE.Scene();
  const updaters = [];
  const windUniforms = { uTime: { value: 0 } };
  const R = rng(def.id.length * 977 + 13);

  const sunDir = new THREE.Vector3(...theme.sunDir).normalize();
  const sky = makeSky(theme, sunDir);
  scene.add(sky);
  scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);

  // Umgebungslicht aus dem Himmel (für Lack und Glanz)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSky(theme, sunDir));
  const env = pmrem.fromScene(envScene, 0.02, 1, 5000).texture;
  scene.environment = env;
  scene.environmentIntensity = theme.night ? 0.5 : 0.85;
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(theme.sunColor, theme.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const SH = 60;
  Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 420 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemi);
  scene.add(hemi);
  // Lichtbasis für texelgenaues Nachführen des Schattens (kein Flimmern)
  const lz = sunDir.clone().negate();
  const lx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lz).normalize();
  const ly = new THREE.Vector3().crossVectors(lz, lx);
  const texel = (SH * 2) / 2048;

  // --- Geländehöhe -------------------------------------------------------------------------------
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.x[i]);
    maxX = Math.max(maxX, track.x[i]);
    minZ = Math.min(minZ, track.z[i]);
    maxZ = Math.max(maxZ, track.z[i]);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const boxDist = (x, z) => Math.hypot(Math.max(0, Math.abs(x - cx) - (maxX - minX) / 2), Math.max(0, Math.abs(z - cz) - (maxZ - minZ) / 2));

  const volcano = { x: cx + 40, z: maxZ + 330 };
  const canals = [
    { ax: minX - 200, az: minZ - 70, bx: maxX + 200, bz: minZ - 70 },
    { ax: maxX + 75, az: minZ - 300, bx: maxX + 75, bz: maxZ + 300 },
    { ax: minX - 80, az: maxZ + 220, bx: maxX + 40, bz: minZ - 300 },
  ];
  const segDist = (x, z, c) => {
    const vx = c.bx - c.ax;
    const vz = c.bz - c.az;
    const t = Math.max(0, Math.min(1, ((x - c.ax) * vx + (z - c.az) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(x - c.ax - vx * t, z - c.az - vz * t);
  };

  function natural(x, z) {
    if (def.theme === 'polder') {
      let h = fbm2(x * 0.004, z * 0.004, 3, 1) * 3 - 1.2 + fbm2(x * 0.03, z * 0.03, 2, 5) * 0.5;
      for (const c of canals) {
        const d = segDist(x, z, c);
        h = Math.min(h, -3.2 + smooth(5, 12, d) * 3.6 + Math.min(h, 0.5) * smooth(5, 12, d));
      }
      return h;
    }
    if (def.theme === 'alm') {
      const base = fbm2(x * 0.0035, z * 0.0035, 4, 2) * 34 - 12 + fbm2(x * 0.015, z * 0.015, 3, 9) * 5;
      const bd = boxDist(x, z);
      const mount = smooth(80, 520, bd) * (60 + ridged(x * 0.0022, z * 0.0022, 5, 4) * 340);
      return base + mount;
    }
    // Vulkan
    const base = ridged(x * 0.006, z * 0.006, 4, 7) * 16 - 7 + fbm2(x * 0.03, z * 0.03, 2, 3) * 2;
    const r = Math.hypot(x - volcano.x, z - volcano.z);
    let cone = 230 * Math.pow(Math.max(0, 1 - r / 330), 1.35);
    if (r < 55) cone -= (55 - r) * 1.6;
    const bd = boxDist(x, z);
    return base + cone + smooth(150, 600, bd) * (40 + ridged(x * 0.003, z * 0.003, 4, 2) * 120);
  }
  const tmpLoc = {};
  function terrainHeight(x, z) {
    const loc = track.locate(x, z, -1, tmpLoc);
    const dist = Math.min(loc.dist, Math.abs(loc.d) + 0.0);
    const n = natural(x, z);
    const roadY = loc.y - 0.3;
    if (dist < WALL + 4) return roadY;
    return roadY + (n - roadY) * smooth(WALL + 4, WALL + 46, dist);
  }

  // --- Gelände-Mesh -------------------------------------------------------------------------------
  const SIZE = Math.max(maxX - minX, maxZ - minZ) + (def.theme === 'polder' ? 1300 : 1500);
  const SEG = 300;
  const tgeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2).translate(cx, 0, cz);
  const tp = tgeo.attributes.position;
  const tuv = tgeo.attributes.uv;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i);
    const z = tp.getZ(i);
    tp.setY(i, terrainHeight(x, z));
    tuv.setXY(i, x / 6, z / 6);
  }
  tgeo.computeVertexNormals();
  {
    const col = new Float32Array(tp.count * 3);
    const g0 = new THREE.Color(theme.grass[0]);
    const g1 = new THREE.Color(theme.grass[1]);
    const g2 = new THREE.Color(theme.grass[2]);
    const rock = new THREE.Color(def.theme === 'vulkan' ? '#2a2322' : '#8b8680');
    const snow = new THREE.Color('#f4f7fb');
    const mud = new THREE.Color(def.theme === 'vulkan' ? '#5a1e10' : '#5a5236');
    const worn = new THREE.Color(def.theme === 'vulkan' ? '#3a2a24' : '#7d7a52');
    const nrm = tgeo.attributes.normal;
    const c = new THREE.Color();
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i);
      const y = tp.getY(i);
      const z = tp.getZ(i);
      const n1 = fbm2(x * 0.01, z * 0.01, 3, 21);
      const n2 = fbm2(x * 0.05, z * 0.05, 2, 8);
      c.copy(g0).lerp(g1, smooth(0.35, 0.7, n1)).lerp(g2, smooth(0.5, 0.8, n2) * 0.6);
      const loc = track.locate(x, z, -1, tmpLoc);
      if (loc.dist < WALL + 14) c.lerp(worn, smooth(WALL + 14, WALL + 2, loc.dist) * 0.45);
      const slope = 1 - nrm.getY(i);
      c.lerp(rock, smooth(0.18, 0.4, slope + n2 * 0.1));
      if (def.theme === 'alm') {
        c.lerp(rock, smooth(70, 120, y + n1 * 30));
        c.lerp(snow, smooth(150, 200, y + n1 * 40) * (1 - smooth(0.5, 0.75, slope)));
      }
      if (theme.water != null) c.lerp(mud, smooth(theme.water + 1.6, theme.water + 0.2, y));
      if (def.theme === 'vulkan') {
        const r = Math.hypot(x - volcano.x, z - volcano.z);
        c.lerp(new THREE.Color('#141010'), smooth(250, 120, r));
      }
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    tgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const gtex = TX.groundTexture(theme.groundTex);
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: gtex.map, normalMap: gtex.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95 });
  const terrain = new THREE.Mesh(tgeo, groundMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // --- Fahrbahn, Randsteine, Seitenstreifen ----------------------------------------------------------
  const n = track.n;
  const L = track.length;
  function ribbon(dList, yOff, uOf, vScale) {
    const cols = dList.length;
    const pos = new Float32Array((n + 1) * cols * 3);
    const uv = new Float32Array((n + 1) * cols * 2);
    for (let k = 0; k <= n; k++) {
      const i = k % n;
      const s = k === n ? L : track.sAt[i];
      for (let c = 0; c < cols; c++) {
        const d = dList[c];
        const o = (k * cols + c) * 3;
        pos[o] = track.x[i] - track.tz[i] * d;
        pos[o + 1] = track.y0[i] + d * track.bank[i] + yOff[c];
        pos[o + 2] = track.z[i] + track.tx[i] * d;
        uv[(k * cols + c) * 2] = uOf(c, d);
        uv[(k * cols + c) * 2 + 1] = s / vScale;
      }
    }
    const idx = [];
    for (let k = 0; k < n; k++)
      for (let c = 0; c < cols - 1; c++) {
        const a = k * cols + c;
        const b = (k + 1) * cols + c;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  // Fahrbahn (Wickelrichtung: Normalen nach oben)
  const roadDs = [ROAD_HALF, ROAD_HALF / 2, 0, -ROAD_HALF / 2, -ROAD_HALF];
  const roadTex = TX.roadTextures(theme.night ? 'night' : 'day');
  const roadGeo = ribbon(roadDs, [0, 0, 0, 0, 0], (c, d) => (ROAD_HALF - d) / (2 * ROAD_HALF), 18);
  const road = new THREE.Mesh(
    roadGeo,
    new THREE.MeshStandardMaterial({ map: roadTex.map, normalMap: roadTex.normalMap, roughnessMap: roadTex.roughnessMap, roughness: theme.night ? 0.75 : 0.88, metalness: 0.0, normalScale: new THREE.Vector2(0.8, 0.8) }),
  );
  road.receiveShadow = true;
  scene.add(road);
  fixWinding(roadGeo);

  // Randsteine (leicht erhöht)
  const curbTex = TX.curbTexture(theme.curb[0], theme.curb[1]);
  const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6 });
  for (const side of [1, -1]) {
    const ds = side > 0 ? [ROAD_HALF + CURB, ROAD_HALF] : [-ROAD_HALF, -ROAD_HALF - CURB];
    const yo = side > 0 ? [0.09, 0.02] : [0.02, 0.09];
    const g = ribbon(ds, yo, (c) => c, 4);
    fixWinding(g);
    const m = new THREE.Mesh(g, curbMat);
    m.receiveShadow = true;
    scene.add(m);
  }
  // Seitenstreifen (Gras) bis hinter die Bande
  for (const side of [1, -1]) {
    const ds = side > 0 ? [WALL + 4, WALL + 1, ROAD_HALF + CURB] : [-ROAD_HALF - CURB, -WALL - 1, -WALL - 4];
    const yo = side > 0 ? [-0.3, 0, 0.0] : [0.0, 0, -0.3];
    const g = ribbon(ds, yo, () => 0, 1);
    // Weltkoordinaten als UV und Vertexfarben wie das Gelände
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    const col = new Float32Array(p.count * 3);
    const cc = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      uv.setXY(i, p.getX(i) / 6, p.getZ(i) / 6);
      const n1 = fbm2(p.getX(i) * 0.01, p.getZ(i) * 0.01, 3, 21);
      cc.set(theme.grass[0]).lerp(new THREE.Color(theme.grass[1]), smooth(0.35, 0.7, n1)).lerp(new THREE.Color(def.theme === 'vulkan' ? '#3a2a24' : '#7d7a52'), 0.4);
      col[i * 3] = cc.r;
      col[i * 3 + 1] = cc.g;
      col[i * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    fixWinding(g);
    const m = new THREE.Mesh(g, groundMat);
    m.receiveShadow = true;
    scene.add(m);
  }

  // Schanzen: über die ganze Breite, Holzplanken mit Warnstreifen
  for (const r of def.ramps ?? []) {
    const i0 = Math.round(r.at * n);
    const pos = [];
    const uv = [];
    const idx = [];
    const ds = [-WALL, WALL];
    for (let k = 0; k <= r.len; k++) {
      const i = (i0 + k) % n;
      for (const d of ds) {
        pos.push(track.x[i] - track.tz[i] * d, track.y[i] + d * track.bank[i] + 0.03, track.z[i] + track.tx[i] * d);
        uv.push((d + WALL) / (2 * WALL), k / 4);
      }
    }
    for (let k = 0; k < r.len; k++) {
      const a = k * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    // Vorderkante (senkrecht)
    const iEnd = (i0 + r.len) % n;
    const base = pos.length / 3;
    for (const d of ds) {
      pos.push(track.x[iEnd] - track.tz[iEnd] * d, track.y0[iEnd] + d * track.bank[iEnd], track.z[iEnd] + track.tx[iEnd] * d);
      uv.push((d + WALL) / (2 * WALL), 0);
    }
    const top = r.len * 2;
    idx.push(top, base, top + 1, top + 1, base, base + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    fixWinding(g);
    const wood = TX.woodTexture().clone();
    wood.needsUpdate = true;
    wood.repeat.set(6, 1);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8, side: THREE.DoubleSide }));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    // Pfeile auf der Schanze
    const sMid = track.sAt[(i0 + Math.round(r.len * 0.55)) % n];
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ map: TX.padTexture(), transparent: true, roughness: 0.5, emissive: '#ff8a00', emissiveIntensity: 0.25, emissiveMap: TX.padTexture() }));
    const p = track.pointAt(sMid, 0);
    arrow.position.set(p.x, p.y + 0.12, p.z);
    arrow.rotation.set(-Math.PI / 2 + Math.atan2(r.height, r.len) * 1.2, 0, 0, 'YXZ');
    arrow.rotation.y = p.heading;
    arrow.rotation.order = 'YXZ';
    scene.add(arrow);
  }

  // --- Bande aus Käselaiben (rotes Wachs) ------------------------------------------------------------
  {
    const geo = new THREE.CylinderGeometry(0.88, 0.88, 0.52, 20, 1);
    // gewölbte Laibkante
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (r > 0.5) {
        const k = 1 + (0.06 - (y * y) / 0.52) * 0.6;
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
      }
    }
    geo.computeVertexNormals();
    const spacing = 1.85;
    const per = Math.floor(L / spacing);
    const count = per * 2 * 2;
    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const im = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    const palette = def.theme === 'vulkan' ? ['#1d1d1f', '#2a2a2c', '#ff8a1e'] : ['#c8281e', '#c8281e', '#d23a1f', '#f2c230', '#1d1d1f'];
    let c = 0;
    const pt = {};
    for (let k = 0; k < per; k++) {
      const s = k * spacing;
      for (const side of [1, -1]) {
        track.pointAt(s, side * (WALL + 0.55), pt);
        // Startgerade: Lücke fürs Portal lassen wir nicht – Portal steht hinter der Bande
        for (let layer = 0; layer < 2; layer++) {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
          m4.compose(new THREE.Vector3(pt.x + (R() - 0.5) * 0.1, pt.y + 0.26 + layer * 0.53, pt.z + (R() - 0.5) * 0.1), q, new THREE.Vector3(1, 1, 1));
          im.setMatrixAt(c, m4);
          const pick = (k * 7 + layer * 3 + (side > 0 ? 1 : 0)) % 11 === 0 ? palette[3] ?? palette[0] : (k + layer) % 9 === 0 ? palette[palette.length - 1] : palette[(k + layer) % 2];
          im.setColorAt(c, col.set(pick));
          c++;
        }
      }
    }
    im.count = c;
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  }

  // --- Startportal mit Startampel -----------------------------------------------------------------
  const startLights = [];
  {
    const p0 = track.pointAt(0, 0);
    const g = new THREE.Group();
    g.position.set(p0.x, p0.y, p0.z);
    g.rotation.y = p0.heading;
    scene.add(g);
    const metal = new THREE.MeshStandardMaterial({ color: '#2a2a33', metalness: 0.7, roughness: 0.35 });
    const span = ROAD_HALF + CURB + 2.2;
    for (const side of [1, -1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(1.1, 9, 1.1), metal);
      pil.position.set(-side * span, 4.5, 0);
      pil.castShadow = true;
      g.add(pil);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 1.2, 2.6, 1.0), metal);
    beam.position.set(0, 8.4, 0);
    beam.castShadow = true;
    g.add(beam);
    const signTex = TX.signTexture('GOUDA GRAND PRIX', { w: 2048, h: 180, font: 'italic 900 150px "Barlow Condensed", Impact, sans-serif' });
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: theme.night ? 0.9 : 0.25, roughness: 0.4 });
    for (const side of [1, -1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 2, 2.2), signMat);
      sign.position.set(0, 8.4, side * 0.51);
      if (side > 0) sign.rotation.y = 0;
      else sign.rotation.y = Math.PI;
      g.add(sign);
    }
    // Ampel: 3 Lampen, nach hinten (zu den wartenden Karts) gerichtet
    const housing = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.6, 0.8), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 }));
    housing.position.set(0, 6.3, -0.2);
    g.add(housing);
    for (let i = 0; i < 3; i++) {
      const lm = new THREE.MeshStandardMaterial({ color: '#330a0a', emissive: '#ff2a1a', emissiveIntensity: 0, roughness: 0.3 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12), lm);
      lamp.position.set((i - 1) * 1.65, 6.3, -0.65);
      g.add(lamp);
      startLights.push(lm);
    }
    // Ziellinie (Schachbrett)
    const chk = TX.checkerTexture().clone();
    chk.needsUpdate = true;
    chk.repeat.set(4, 1);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 2.4), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.03;
    line.receiveShadow = true;
    g.add(line);
  }
  function setStartLights(phase) {
    // phase: 0 aus, 1..3 rot, 4 grün
    startLights.forEach((m, i) => {
      if (phase === 4) {
        m.emissive.set('#3dff4a');
        m.emissiveIntensity = 6;
        m.color.set('#0a3310');
      } else {
        m.emissive.set('#ff2a1a');
        m.emissiveIntensity = i < phase ? 7 : 0;
        m.color.set('#330a0a');
      }
    });
  }

  // --- Tribünen mit Mäuse-Publikum am Start -------------------------------------------------------
  const crowd = [];
  {
    const free = (x, z, need) => track.locate(x, z, -1, tmpLoc).dist > need;
    for (const [s0, side] of [
      [20, 1],
      [20, -1],
      [-45, 1],
    ]) {
      const p = track.pointAt(s0, side * (WALL + 9));
      if (!free(p.x, p.z, WALL + 6)) continue;
      const g = new THREE.Group();
      g.position.set(p.x, p.y - 0.2, p.z);
      g.rotation.y = p.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      scene.add(g);
      const tiers = 6;
      const len = 34;
      const conc = new THREE.MeshStandardMaterial({ color: '#c9c3b8', roughness: 0.9 });
      for (let t = 0; t < tiers; t++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9 + t * 0.9, 1.4), conc);
        b.position.set(0, (0.9 + t * 0.9) / 2, -t * 1.4);
        b.castShadow = b.receiveShadow = true;
        g.add(b);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.3, tiers * 1.4 + 2), new THREE.MeshStandardMaterial({ color: theme.curb[0], roughness: 0.5 }));
      roof.position.set(0, tiers * 0.9 + 4.2, -tiers * 0.7 + 0.5);
      roof.castShadow = true;
      g.add(roof);
      for (const x of [-len / 2, len / 2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, tiers * 0.9 + 4.2, 0.4), conc);
        post.position.set(x, (tiers * 0.9 + 4.2) / 2, -tiers * 1.4 + 0.4);
        g.add(post);
      }
      // Publikum: Mäuseköpfe mit Ohren
      const head = merge([
        paint(new THREE.SphereGeometry(0.32, 10, 8).translate(0, 0.75, 0), '#ffffff'),
        paint(new THREE.CylinderGeometry(0.22, 0.28, 0.6, 8).translate(0, 0.3, 0), '#ffffff'),
        paint(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 10).rotateX(Math.PI / 2).translate(0.24, 1.02, 0), '#ffffff'),
        paint(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 10).rotateX(Math.PI / 2).translate(-0.24, 1.02, 0), '#ffffff'),
      ]);
      const per = 40;
      const im = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), per * tiers);
      const m4 = new THREE.Matrix4();
      const furs = ['#8f8178', '#b9b3aa', '#5c5f6b', '#c7a27c', '#f2efe8', '#3d3a3a'];
      const shirts = ['#e8582a', '#f2c230', '#2f6fe0', '#2ea65a', '#d23a3a', '#9a4fd6', '#ffffff'];
      let c = 0;
      const col = new THREE.Color();
      for (let t = 0; t < tiers; t++)
        for (let k = 0; k < per; k++) {
          if (R() < 0.15) continue;
          const x = -len / 2 + 0.6 + (k / per) * (len - 1.2) + (R() - 0.5) * 0.3;
          m4.makeTranslation(x, 0.9 + t * 0.9, -t * 1.4 - 0.2);
          im.setMatrixAt(c, m4);
          im.setColorAt(c, col.set(R() < 0.5 ? furs[Math.floor(R() * furs.length)] : shirts[Math.floor(R() * shirts.length)]));
          crowd.push({ im, i: c, base: m4.clone(), ph: R() * 10 });
          c++;
        }
      im.count = c;
      im.castShadow = true;
      g.add(im);
    }
  }
  const crowdTmp = new THREE.Matrix4();
  let crowdExcite = 0;

  // --- Werbebanden --------------------------------------------------------------------------------
  {
    const ads = [
      ['FONDUE-BAR', '#1b3a6b', '#ffffff', '#f2c230'],
      ['MÄUSE-TV', '#d23a3a', '#ffffff', '#1b1b24'],
      ['EMMENTALER', '#f2c230', '#5a2a0a', '#d23a3a'],
      ['RACLETTE-REIFEN', '#1b1b24', '#ff8a1e', '#ff8a1e'],
      ['GOUDA OIL', '#2ea65a', '#ffffff', '#f2c230'],
      ['KÄSEKISTEN', '#ff9a1a', '#ffffff', '#c8281e'],
    ];
    const pt = {};
    for (let k = 0; k < 14; k++) {
      const s = ((k + 0.5) / 14) * L;
      const side = k % 2 ? 1 : -1;
      track.pointAt(s, side * (WALL + 2.2), pt);
      if (track.locate(pt.x, pt.z, -1, tmpLoc).dist < WALL) continue;
      const [txt, bg, fg, st] = ads[k % ads.length];
      const t = TX.signTexture(txt, { bg, fg, stripe: st, w: 1024, h: 160, font: 'italic 900 120px "Barlow Condensed", Impact, sans-serif' });
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(14, 1.5, 0.2),
        [0, 0, 0, 0, 1, 1].map((i) => (i ? new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: '#fff', emissiveMap: t, emissiveIntensity: theme.night ? 0.8 : 0.08 }) : new THREE.MeshStandardMaterial({ color: '#222' }))),
      );
      board.position.set(pt.x, pt.y + 1.75, pt.z);
      board.rotation.y = pt.heading + Math.PI / 2;
      board.castShadow = true;
      scene.add(board);
    }
  }

  // --- Verteilen von Objekten ------------------------------------------------------------------------
  const halfS = SIZE / 2 - 20;
  function scatter(count, { minDist = WALL + 8, maxDist = 400, near = 0, test } = {}) {
    const out = [];
    let tries = 0;
    while (out.length < count && tries < count * 30) {
      tries++;
      let x;
      let z;
      if (near > 0 && R() < 0.75) {
        // gehäuft in Streckennähe
        const s = R() * L;
        const d = (R() < 0.5 ? -1 : 1) * (minDist + Math.pow(R(), 1.6) * near);
        const p = track.pointAt(s, d);
        x = p.x;
        z = p.z;
      } else {
        x = cx + (R() * 2 - 1) * halfS;
        z = cz + (R() * 2 - 1) * halfS;
      }
      const loc = track.locate(x, z, -1, tmpLoc);
      if (loc.dist < minDist || loc.dist > maxDist) continue;
      const y = terrainHeight(x, z);
      if (theme.water != null && y < theme.water + 0.6) continue;
      if (test && !test(x, y, z)) continue;
      out.push({ x, y, z });
    }
    return out;
  }
  function instances(geo, mat, pts, { scale = [1, 1], color, shadow = true, yaw = true, tilt = 0 } = {}) {
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    pts.forEach((p, i) => {
      const s = scale[0] + R() * (scale[1] - scale[0]);
      e.set((R() - 0.5) * tilt, yaw ? R() * Math.PI * 2 : 0, (R() - 0.5) * tilt);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(p.x, p.y - 0.15, p.z), q, new THREE.Vector3(s, s * (0.9 + R() * 0.25), s));
      im.setMatrixAt(i, m4);
      if (color) im.setColorAt(i, c.set(color(i)));
    });
    im.castShadow = shadow;
    im.receiveShadow = true;
    scene.add(im);
    return im;
  }
  const foliageMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  addWind(foliageMat, windUniforms, 0.012, 2.5);
  const tint = (a, b) => () => new THREE.Color(a).lerp(new THREE.Color(b), R()).getStyle();

  // Grasbüschel am Streckenrand
  function grass(count, colors) {
    const tex = TX.grassBladeTexture();
    const blade = new THREE.PlaneGeometry(1.4, 0.9).translate(0, 0.45, 0);
    const geo = mergeGeometries([blade, blade.clone().rotateY(Math.PI / 3), blade.clone().rotateY((-Math.PI / 3))]);
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
    addWind(mat, windUniforms, 0.18, 0.05);
    const pts = scatter(count, { minDist: WALL + 1.6, maxDist: 140, near: 60 });
    const im = instances(geo, mat, pts, { scale: [0.8, 1.6], color: tint(colors[0], colors[1]), shadow: false });
    im.receiveShadow = true;
  }

  const deco = { windmills: [], lavaMats: [], water: null, torches: [] };

  if (def.theme === 'polder') {
    instances(broadleafGeo(), foliageMat, scatter(260, { minDist: WALL + 14, maxDist: 520, near: 160 }), { scale: [0.9, 1.6], color: tint('#ffffff', '#c8e0a0') });
    // Pappelreihen entlang der Grachten
    const pop = [];
    for (const c of canals) {
      const len = Math.hypot(c.bx - c.ax, c.bz - c.az);
      for (let t = 0; t < len; t += 11) {
        const f = t / len;
        const nx = -(c.bz - c.az) / len;
        const nz = (c.bx - c.ax) / len;
        for (const side of [-1, 1]) {
          const x = c.ax + (c.bx - c.ax) * f + nx * 14 * side;
          const z = c.az + (c.bz - c.az) * f + nz * 14 * side;
          if (track.locate(x, z, -1, tmpLoc).dist < WALL + 10) continue;
          pop.push({ x, y: terrainHeight(x, z), z });
        }
      }
    }
    instances(poplarGeo(), foliageMat, pop, { scale: [0.9, 1.3], color: tint('#ffffff', '#d8f0b0') });
    grass(9000, ['#ffffff', '#d0e8a0']);
    // Tulpenfelder
    const tulip = merge([paint(new THREE.ConeGeometry(0.16, 0.34, 5).rotateX(Math.PI).translate(0, 0.62, 0), '#ffffff'), paint(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 3).translate(0, 0.25, 0), '#3d7a2a')]);
    const tcols = ['#e3262f', '#ffd21f', '#ff5fa2', '#ffffff', '#8a3ad8', '#ff7a1a'];
    const fields = [];
    for (let f = 0; f < 40 && fields.length < 6; f++) {
      const s = R() * L;
      const side = R() < 0.5 ? -1 : 1;
      const p = track.pointAt(s, side * (WALL + 30));
      const ok = [-30, 0, 30].every((a) => [-14, 14].every((b) => track.locate(p.x + Math.cos(p.heading) * a + Math.sin(p.heading) * b, p.z - Math.sin(p.heading) * a + Math.cos(p.heading) * b, -1, tmpLoc).dist > WALL + 10));
      if (ok) fields.push(p);
    }
    const tpts = [];
    const tc = [];
    for (const p of fields) {
      const ca = Math.cos(p.heading);
      const sa = Math.sin(p.heading);
      let row = 0;
      for (let b = -12; b <= 12; b += 0.9, row++) {
        const color = tcols[(Math.floor(row / 3) + fields.indexOf(p)) % tcols.length];
        for (let a = -28; a <= 28; a += 0.55) {
          const x = p.x + ca * a + sa * b + (R() - 0.5) * 0.2;
          const z = p.z - sa * a + ca * b + (R() - 0.5) * 0.2;
          const y = terrainHeight(x, z);
          if (y < (theme.water ?? -99) + 0.5) continue;
          tpts.push({ x, y: y + 0.1, z });
          tc.push(color);
        }
      }
    }
    const tm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    addWind(tm, windUniforms, 0.08, 0.1);
    instances(tulip, tm, tpts, { scale: [0.9, 1.25], color: (i) => tc[i], shadow: false });
    // Windmühlen
    for (const p of scatter(7, { minDist: WALL + 30, maxDist: 170, near: 90 })) deco.windmills.push(windmill(p));
    // Wasser
    deco.water = waterPlane(theme.water, theme.waterColor);
    // Häuschen
    for (const p of scatter(10, { minDist: WALL + 22, maxDist: 260, near: 120 })) house(p, ['#9c3b24', '#7a2e1d', '#c2a77a'][Math.floor(R() * 3)]);
  } else if (def.theme === 'alm') {
    instances(coniferGeo(), foliageMat, scatter(900, { minDist: WALL + 8, maxDist: 700, near: 220, test: (x, y) => y < 140 }), { scale: [0.9, 1.9], color: tint('#ffffff', '#b0c8a0') });
    instances(broadleafGeo(), foliageMat, scatter(80, { minDist: WALL + 10, maxDist: 300, near: 120, test: (x, y) => y < 60 }), { scale: [0.9, 1.3], color: tint('#ffffff', '#e0f0a0') });
    const rocks = scatter(140, { minDist: WALL + 5, maxDist: 600, near: 120 });
    instances(rockGeo(3), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), rocks, { scale: [0.8, 3.2], color: tint('#ffffff', '#a8a49a'), tilt: 0.4 });
    grass(11000, ['#ffffff', '#e8f0a0']);
    // Kühe
    const cow = merge([
      paint(new THREE.BoxGeometry(0.9, 0.85, 1.9).translate(0, 1.15, 0), '#ffffff'),
      paint(new THREE.BoxGeometry(0.55, 0.55, 0.7).translate(0, 1.35, 1.2), '#ffffff'),
      paint(new THREE.BoxGeometry(0.3, 0.2, 0.2).translate(0, 1.2, 1.6), '#f2b9b0'),
      ...[
        [0.3, 0.7],
        [-0.3, 0.7],
        [0.3, -0.7],
        [-0.3, -0.7],
      ].map(([x, z]) => paint(new THREE.BoxGeometry(0.18, 0.8, 0.18).translate(x, 0.4, z), '#3a2a20')),
      paint(new THREE.BoxGeometry(0.5, 0.06, 0.1).translate(0, 1.7, 1.15), '#e8e0c8'),
    ]);
    instances(cow, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), scatter(40, { minDist: WALL + 10, maxDist: 200, near: 90, test: (x, y) => y < 50 }), { scale: [1.2, 1.4], color: () => ['#ffffff', '#8a5a3a', '#e8e0d0', '#3a2a20'][Math.floor(R() * 4)] });
    for (const p of scatter(9, { minDist: WALL + 22, maxDist: 240, near: 120, test: (x, y) => y < 60 })) chalet(p);
  } else {
    instances(deadTreeGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), scatter(260, { minDist: WALL + 8, maxDist: 500, near: 160 }), { scale: [0.8, 1.6], tilt: 0.25 });
    const rocks = scatter(260, { minDist: WALL + 4, maxDist: 600, near: 140 });
    instances(rockGeo(7, '#4a403c'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), rocks, { scale: [0.8, 4], color: tint('#ffffff', '#806860'), tilt: 0.6 });
    // Lava
    const lt = TX.lavaTexture().clone();
    lt.needsUpdate = true;
    lt.repeat.set(SIZE / 60, SIZE / 60);
    const lavaMat = new THREE.MeshStandardMaterial({ color: '#2a0a04', emissive: '#ffffff', emissiveMap: lt, emissiveIntensity: 2.4, roughness: 0.7, map: lt });
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), lavaMat);
    lava.position.set(cx, theme.water, cz);
    scene.add(lava);
    deco.lavaMats.push(lt);
    // Kraterglühen
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(48, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a1a').multiplyScalar(4), fog: false }),
    );
    glow.position.set(volcano.x, natural(volcano.x, volcano.z) + 6, volcano.z);
    scene.add(glow);
    deco.crater = glow.position.clone();
    // Fackeln entlang der Strecke
    const flameGeo = new THREE.ConeGeometry(0.28, 1.0, 8).translate(0, 0.5, 0);
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347').multiplyScalar(5), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const postMat = new THREE.MeshStandardMaterial({ color: '#2a2422', roughness: 0.8 });
    const pt = {};
    for (let s = 0; s < L; s += 24) {
      for (const side of [1, -1]) {
        track.pointAt(s + (side > 0 ? 12 : 0), side * (WALL + 1.6), pt);
        if (track.locate(pt.x, pt.z, -1, tmpLoc).dist < WALL) continue;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.6, 6), postMat);
        post.position.set(pt.x, pt.y + 1.3, pt.z);
        scene.add(post);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 0.4, 8), postMat);
        bowl.position.set(pt.x, pt.y + 2.7, pt.z);
        scene.add(bowl);
        const fl = new THREE.Mesh(flameGeo, flameMat);
        fl.position.set(pt.x, pt.y + 2.85, pt.z);
        scene.add(fl);
        deco.torches.push({ m: fl, ph: R() * 10 });
      }
    }
  }

  function windmill(p) {
    const g = new THREE.Group();
    g.position.set(p.x, p.y - 0.5, p.z);
    const toTrack = track.locate(p.x, p.z, -1, tmpLoc);
    g.rotation.y = Math.atan2(track.x[toTrack.i] - p.x, track.z[toTrack.i] - p.z);
    scene.add(g);
    const brick = new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 0.9 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 4.4, 14, 8), brick);
    tower.position.y = 7;
    tower.castShadow = tower.receiveShadow = true;
    g.add(tower);
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.3, 16), new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.7 }));
    gallery.position.y = 5.2;
    gallery.castShadow = true;
    g.add(gallery);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.1, 3.6, 8), new THREE.MeshStandardMaterial({ color: '#2c3b2a', roughness: 0.7 }));
    cap.position.y = 15.8;
    cap.castShadow = true;
    g.add(cap);
    for (const [y, x] of [
      [3, 0],
      [9, 0],
    ]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.4), new THREE.MeshStandardMaterial({ color: '#f2efe2', roughness: 0.4 }));
      win.position.set(x, y, (y < 6 ? 4.1 : 3.2) + 0.05);
      win.rotation.x = -0.12;
      g.add(win);
    }
    const hub = new THREE.Group();
    hub.position.set(0, 14.5, 3.4);
    g.add(hub);
    const wood = new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: 0.8 });
    const cloth = new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 11, 0.3), wood);
      spar.position.y = 5.5;
      spar.castShadow = true;
      arm.add(spar);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 8.5), cloth);
      sail.position.set(1.25, 6.6, 0.05);
      sail.castShadow = true;
      arm.add(sail);
      hub.add(arm);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), wood);
    hub.add(knob);
    return { hub, speed: 0.5 + R() * 0.4 };
  }
  function house(p, wall) {
    const g = new THREE.Group();
    g.position.set(p.x, p.y - 0.3, p.z);
    g.rotation.y = R() * Math.PI * 2;
    scene.add(g);
    const w = 6 + R() * 3;
    const d = 8 + R() * 3;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 4.5, d), new THREE.MeshStandardMaterial({ color: wall, roughness: 0.9 }));
    body.position.y = 2.25;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.62, w * 0.62, d + 0.6, 3, 1), new THREE.MeshStandardMaterial({ color: '#2b2b2f', roughness: 0.7 }));
    roof.rotation.x = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.rotation.order = 'YXZ';
    roof.scale.set(1, 1, 0.9);
    roof.position.y = 4.5 + w * 0.3;
    roof.castShadow = true;
    g.add(roof);
    for (const z of [-d / 4, d / 4]) {
      for (const side of [1, -1]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), new THREE.MeshStandardMaterial({ color: '#f5f2ea', emissive: '#ffcc66', emissiveIntensity: 0.05 }));
        win.position.set((side * w) / 2 + side * 0.02, 2.4, z);
        win.rotation.y = (side * Math.PI) / 2;
        g.add(win);
      }
    }
  }
  function chalet(p) {
    const g = new THREE.Group();
    g.position.set(p.x, p.y - 0.4, p.z);
    g.rotation.y = R() * Math.PI * 2;
    scene.add(g);
    const wood = new THREE.MeshStandardMaterial({ map: TX.woodTexture(), color: '#b07a48', roughness: 0.85 });
    const stone = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.95 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(9, 2.4, 7), stone);
    base.position.y = 1.2;
    base.castShadow = base.receiveShadow = true;
    g.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 7), wood);
    top.position.y = 3.9;
    top.castShadow = true;
    g.add(top);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 8.4, 3, 1), new THREE.MeshStandardMaterial({ color: '#5a3a2a', roughness: 0.8 }));
    roof.rotation.order = 'YXZ';
    roof.rotation.x = Math.PI / 2;
    roof.rotation.y = 0;
    roof.scale.set(1.0, 1, 0.36);
    roof.rotation.z = Math.PI / 2;
    roof.position.y = 6.2;
    roof.castShadow = true;
    g.add(roof);
    const box = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: '#d8263a', roughness: 0.7 }));
    box.position.set(0, 3.0, 3.7);
    g.add(box);
    for (const x of [-2.5, 0, 2.5]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.3), new THREE.MeshStandardMaterial({ color: '#2a3340', roughness: 0.2, metalness: 0.3 }));
      win.position.set(x, 4.0, 3.52);
      g.add(win);
    }
  }
  function waterPlane(level, color) {
    const nt = TX.waterNormals().clone();
    nt.needsUpdate = true;
    nt.repeat.set(SIZE / 30, SIZE / 30);
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.06, metalness: 0.0, normalMap: nt, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.92, envMapIntensity: 1.2 });
    const w = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), mat);
    w.position.set(cx, level, cz);
    w.receiveShadow = true;
    scene.add(w);
    return nt;
  }

  // --- Ferne Berge als Kulisse (Polder: flacher Horizont mit Baumreihen genügt) --------------------
  if (def.theme !== 'polder') {
    const ring = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: def.theme === 'vulkan' ? '#16100f' : '#6f7f95', roughness: 1, flatShading: true, fog: true });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + R() * 0.1;
      const r = SIZE * 0.62 + R() * 300;
      const h = 220 + R() * 380;
      const m = new THREE.Mesh(jitter(new THREE.ConeGeometry(260 + R() * 200, h, 7, 3), 40, i), mat);
      m.position.set(cx + Math.cos(a) * r, h / 2 - 40, cz + Math.sin(a) * r);
      ring.add(m);
    }
    scene.add(ring);
  }

  // --- Aktualisierung ------------------------------------------------------------------------------
  function update(dt, time, excite = 0) {
    windUniforms.uTime.value = time;
    sky.material.uniforms.time.value = time;
    for (const w of deco.windmills) w.hub.rotation.z -= dt * w.speed;
    if (deco.water) {
      deco.water.offset.x = time * 0.01;
      deco.water.offset.y = time * 0.006;
    }
    for (const t of deco.lavaMats) {
      t.offset.x = time * 0.004;
      t.offset.y = Math.sin(time * 0.1) * 0.02;
    }
    for (const t of deco.torches) {
      const f = 0.85 + Math.sin(time * 17 + t.ph) * 0.1 + Math.sin(time * 31 + t.ph * 2) * 0.06;
      t.m.scale.set(f, f * (1 + Math.sin(time * 11 + t.ph) * 0.15), f);
    }
    // Publikum hüpft (mehr, wenn jemand vorbeifährt)
    crowdExcite += (excite - crowdExcite) * Math.min(1, dt * 2);
    for (const c of crowd) {
      const j = Math.max(0, Math.sin(time * (6 + crowdExcite * 4) + c.ph)) * (0.08 + crowdExcite * 0.35);
      crowdTmp.copy(c.base);
      crowdTmp.elements[13] += j;
      c.im.setMatrixAt(c.i, crowdTmp);
    }
    if (crowd.length) for (const im of new Set(crowd.map((c) => c.im))) im.instanceMatrix.needsUpdate = true;
    for (const fn of updaters) fn(dt, time);
  }

  function focusShadow(x, y, z) {
    // auf das Schattentexel-Raster einrasten
    const p = new THREE.Vector3(x, y, z);
    const a = Math.round(p.dot(lx) / texel) * texel;
    const b = Math.round(p.dot(ly) / texel) * texel;
    const c = p.dot(lz);
    const snapped = lx.clone().multiplyScalar(a).addScaledVector(ly, b).addScaledVector(lz, c);
    sun.target.position.copy(snapped);
    sun.position.copy(snapped).addScaledVector(sunDir, 200);
    sun.target.updateMatrixWorld();
  }

  return { scene, theme, sun, update, focusShadow, setStartLights, terrainHeight, deco, env, center: new THREE.Vector3(cx, 0, cz) };
}

// Ribbons werden in Fahrtrichtung aufgebaut; sicherstellen, dass die Flächen nach oben zeigen
function fixWinding(g) {
  const nrm = g.attributes.normal;
  let up = 0;
  for (let i = 0; i < nrm.count; i += 7) up += nrm.getY(i);
  if (up < 0) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
  }
}
