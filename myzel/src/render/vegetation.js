// Instanzierte Pflanzen. Jede Instanz liest im Vertex-Shader das Leben an ihrem Standort aus der
// Vitalitätstextur und wächst entsprechend – die Simulation "malt" den Wald direkt auf die GPU.
import * as THREE from 'three';
import * as GEO from './geometries.js';
import { U, GLSL_VIT, addOcclusion } from './shared.js';
import { generateFlora, KINDS } from '../world/flora.js';

const GROW = 0;
const TRUNK = 1;
const REGROW = 2;
const CONSUME = 3;
const STATIC = 4;

const pal = (...hex) => hex.map((h) => new THREE.Color(h));

function specs() {
  const oak = GEO.oak();
  const birch = GEO.birch();
  const fir = GEO.fir();
  const gm = GEO.giantMushroom();
  const leaves = pal('#ffffff', '#f0f5d0', '#d6ecc0', '#fff2c4');
  return {
    grass: { season: 'grass', translucent: true, tipH: 0.8, geo: GEO.grass(), r: 2, per: 640, mode: GROW, min: 0.42, wind: 1, dry: '#9c8a5e', dryMix: 1, pal: pal('#ffffff', '#e8f2c0', '#d0e6a8', '#f6f0b0'), double: true },
    flower: { season: 'flower', geo: GEO.flower(), r: 2, per: 80, mode: GROW, wind: 0.9, pal: pal('#ffffff', '#ffd84a', '#b78cff', '#ff7fae'), double: true, glow: 0.35 },
    fern: { season: 'grass', translucent: true, tipH: 0.5, geo: GEO.fern(), r: 3, per: 50, mode: GROW, wind: 0.5, pal: pal('#ffffff', '#e6f5c8', '#cfe8b0', '#f0e8b8'), double: true },
    reed: { season: 'grass', geo: GEO.reed(), r: 3, per: 70, mode: GROW, min: 0.35, wind: 0.6, dry: '#8d7f5a', dryMix: 1, pal: leaves, double: true },
    mushRed: { season: 'shroom', rim: true, double: true, geo: GEO.mushRed(), r: 2, per: 11, mode: GROW, pal: pal('#d42a1e', '#e8481c', '#b8142a', '#f0661a'), glow: 0.1 },
    mushBrown: { season: 'shroom', rim: true, double: true, geo: GEO.mushBrown(), r: 2, per: 14, mode: GROW, pal: pal('#7a4a26', '#9a6234', '#5e3a20', '#b88a52') },
    mushGlow: { rim: true, breathe: true, double: true, geo: GEO.mushGlow(), r: 2, per: 16, mode: GROW, pal: pal('#5ff0ff', '#b37bff', '#52ffb0', '#7aa8ff'), glow: 1.4 },
    parasol: { season: 'shroom', rim: true, double: true, geo: GEO.parasol(), r: 2, per: 5, mode: GROW, wind: 0.05, pal: pal('#ffffff', '#f0e0c8', '#e8d4b8', '#fff0dc') },
    puff: { season: 'shroom', geo: GEO.puffball(), r: 3, per: 5, mode: REGROW, pal: leaves, glow: 0.5 },
    bush: { season: 'decid', translucent: true, tipH: 1.4, occlude: true, geo: GEO.bush(), r: 3, per: 10, mode: GROW, wind: 0.15, pal: pal('#ffffff', '#e0f0b0', '#c8e0a0', '#f8e0a0'), shadow: true, glow: 0.4 },
    rock: { geo: GEO.rock(), r: 3, per: 5, mode: STATIC, moss: true, shadow: true, pal: leaves },
    oakTrunk: { occlude: true, geo: oak.trunk, r: 3, per: 9, mode: TRUNK, dry: '#6b665f', shadow: true, pal: leaves },
    oakCrown: { season: 'decid', translucent: true, tipH: 8, occlude: true, geo: oak.crown, r: 3, per: 9, mode: GROW, wind: 0.04, pal: leaves, shadow: true },
    birchTrunk: { occlude: true, geo: birch.trunk, r: 3, per: 9, mode: TRUNK, dry: '#8a8680', shadow: true, pal: leaves },
    birchCrown: { season: 'decid', translucent: true, tipH: 10, occlude: true, geo: birch.crown, r: 3, per: 9, mode: GROW, wind: 0.05, pal: pal('#ffffff', '#f4f0b0', '#e0f0c0', '#ffe090'), shadow: true },
    firTrunk: { occlude: true, geo: fir.trunk, r: 3, per: 9, mode: TRUNK, dry: '#5f5a54', shadow: true, pal: leaves },
    firCrown: { season: 'conifer', occlude: true, geo: fir.crown, r: 3, per: 9, mode: GROW, wind: 0.02, pal: pal('#ffffff', '#e0f0e0', '#d8e8c8', '#f0f0d8'), shadow: true },
    gmStem: { breathe: true, occlude: true, geo: gm.stem, r: 3, per: 9, mode: GROW, wind: 0.005, pal: leaves, shadow: true, glow: 0.8 },
    gmCap: { breathe: true, rim: true, rimStr: 0.3, occlude: true, geo: gm.cap, r: 3, per: 9, mode: GROW, wind: 0.005, pal: pal('#8a4fe0', '#24b3a4', '#e0603a', '#3d7fe0'), shadow: true, glow: 0.7 },
    log: { geo: GEO.deadLog(), r: 3, per: 2, mode: CONSUME, dry: '#5d554c', shadow: true, pal: leaves, glow: 0.7 },
  };
}

function injectVertex(shader, spec, depth) {
  shader.uniforms.uVit = U.uVit;
  shader.uniforms.uRot = U.uRot;
  shader.uniforms.uWin = U.uWin;
  shader.uniforms.uWinCenter = U.uWinCenter;
  shader.uniforms.uTime = U.uTime;
  shader.uniforms.uWindAmp = { value: spec.wind ?? 0 };
  shader.uniforms.uMin = { value: spec.min ?? 0 };
  shader.uniforms.uWind = U.uWind;
  shader.uniforms.uSeason = U.uSeason;
  shader.vertexShader =
    `#define MODE ${spec.mode}
    ${spec.breathe ? '#define BREATHE' : ''}
    ${spec.season ? '#define S_' + spec.season.toUpperCase() : ''}
    uniform float uTime; uniform float uMin; uniform float uWindAmp; uniform float uWind; uniform vec4 uSeason;
    attribute vec4 aInst; attribute vec2 aMask;
    varying float vGrow; varying float vLife; varying vec4 vVit; varying vec2 vMask; varying float vUp; varying float vHueR; varying float vRot; varying float vTip;
    ${GLSL_VIT}
    float mzBack(float t){ float c1 = 1.4; float c3 = c1 + 1.0; float u = t - 1.0; return 1.0 + c3 * u * u * u + c1 * u * u; }
    ` +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
      vec3 transformed = vec3(position);
      vec3 iO = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec4 vit = mzVit(iO.xz);
      float g = smoothstep(aInst.x, aInst.x + 0.18, vit.r);
      float sc = 1.0;
      #if MODE == 0
        sc = mix(uMin, 1.0, mzBack(g));
      #elif MODE == 1
        sc = aInst.w > 0.5 ? mzBack(g) : 1.0;
        g = aInst.w > 0.5 ? g : 1.0;
      #elif MODE == 2
        float rg = clamp((uTime - aInst.w - 1.5) / 40.0, 0.0, 1.0);
        sc = mzBack(g) * mzBack(rg);
        g *= rg;
      #elif MODE == 3
        float cs = 1.0 - clamp((uTime - aInst.w) / 1.6, 0.0, 1.0);
        sc = cs * (1.0 + 0.15 * sin(clamp(uTime - aInst.w, 0.0, 2.0) * 30.0) * (1.0 - cs));
        g = 1.0;
      #else
        g = 1.0;
      #endif
      // Fäulnis lässt Pflanzen welken und schrumpfen
      float rot = mzRot(iO.xz);
      #if MODE != 1 && MODE != 4
        sc *= 1.0 - smoothstep(0.25, 0.9, rot) * 0.55;
      #endif
      #ifdef BREATHE
        sc *= 1.0 + 0.035 * sin(uTime * 1.4 + aInst.y * 20.0);
      #endif
      // Jahreszeiten: Laubbäume kahl im Winter, Blumen im Frühling, Pilze im Herbst
      #if defined(S_DECID)
        sc *= 1.0 - uSeason.w * 0.95;
      #elif defined(S_FLOWER)
        sc *= (1.0 + uSeason.x * 0.3) * (1.0 - uSeason.w) * (1.0 - uSeason.z * 0.6);
      #elif defined(S_SHROOM)
        sc *= (1.0 + uSeason.z * 0.35) * (1.0 - uSeason.w * 0.85);
      #elif defined(S_GRASS)
        sc *= 1.0 - uSeason.w * 0.35;
      #endif
      transformed *= sc;
      vRot = rot;
      vTip = clamp(position.y / ${(spec.tipH ?? 1).toFixed(2)}, 0.0, 1.0);
      float hgt = max(transformed.y, 0.0);
      float ph = aInst.y * 6.283 + iO.x * 0.21 + iO.z * 0.17;
      float sway = sin(uTime * 1.6 + ph) + 0.5 * sin(uTime * 2.9 + iO.x * 0.5);
      transformed.x += sway * uWindAmp * uWind * hgt * hgt * 0.08;
      transformed.z += cos(uTime * 1.3 + ph) * uWindAmp * uWind * hgt * hgt * 0.05;
      vGrow = g;
      vLife = smoothstep(0.12, 0.7, vit.r);
      vVit = vit;
      vMask = aMask;
      vHueR = aInst.z;
      ${depth ? '' : 'vUp = normalize((instanceMatrix * vec4(objectNormal, 0.0)).xyz).y;'}
      `,
    );
}

function makeMaterial(spec) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: spec.mode === STATIC ? 0.95 : 0.82,
    metalness: 0,
    side: spec.double ? THREE.DoubleSide : THREE.FrontSide,
    envMapIntensity: 0.7,
  });
  const palette = spec.pal;
  mat.onBeforeCompile = (shader) => {
    injectVertex(shader, spec, false);
    shader.uniforms.uNight = U.uNight;
    shader.uniforms.uPal = { value: palette };
    shader.uniforms.uDry = { value: new THREE.Color(spec.dry ?? '#8a7f6a') };
    shader.uniforms.uDryMix = { value: spec.dryMix ?? 0 };
    shader.uniforms.uGlowStr = { value: spec.glow ?? 0 };
    shader.uniforms.uSnow = U.uSnow;
    shader.uniforms.uWet = U.uWet;
    shader.fragmentShader =
      `#define MODE ${spec.mode}
      ${spec.season ? '#define S_' + spec.season.toUpperCase() : ''}
      uniform vec4 uSeason; uniform float uSnow; uniform float uWet;
      ${spec.moss ? '#define MOSS' : ''}
      uniform float uNight; uniform vec3 uPal[4]; uniform vec3 uDry; uniform float uDryMix; uniform float uGlowStr;
      ${spec.rim ? '#define RIM' : ''}
      ${spec.translucent ? '#define TRANSLUCENT' : ''}
      varying float vGrow; varying float vLife; varying vec4 vVit; varying vec2 vMask; varying float vUp; varying float vHueR; varying float vRot; varying float vTip;
      ` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          vec3 pal = uPal[int(floor(vHueR * 3.999))];
          diffuseColor.rgb *= mix(vec3(1.0), pal, vMask.x);
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
          #if MODE == 1 || MODE == 3
            diffuseColor.rgb = mix(uDry * (0.5 + lum * 2.0), diffuseColor.rgb, vLife);
          #endif
          diffuseColor.rgb = mix(diffuseColor.rgb, uDry * (0.55 + lum * 1.6), (1.0 - vGrow) * uDryMix);
          #ifdef MOSS
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.16, 0.03), smoothstep(0.35, 0.85, vUp) * vLife * 0.9);
          #endif
          float rotF = smoothstep(0.2, 0.7, vRot);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.02, 0.06) * (0.6 + lum * 2.0), rotF * 0.85);
          #if defined(S_DECID)
            // Herbstlaub je Baum: rot, orange, gold – im Frühling blühen manche Kronen
            vec3 autumn = vHueR < 0.3 ? vec3(0.62, 0.12, 0.03) : vHueR < 0.65 ? vec3(0.78, 0.36, 0.05) : vec3(0.72, 0.58, 0.1);
            diffuseColor.rgb = mix(diffuseColor.rgb, autumn * (0.55 + lum * 2.2), uSeason.z * 0.92 * vMask.x);
            float blossom = step(0.55, fract(vHueR * 7.31)) * smoothstep(0.35, 0.9, vTip);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.62, 0.74) * (0.7 + lum), uSeason.x * blossom * 0.75 * vMask.x);
          #elif defined(S_CONIFER)
            diffuseColor.rgb *= mix(vec3(1.0), vec3(0.8, 0.9, 0.95), uSeason.w);
          #elif defined(S_GRASS)
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.25, 0.1) * (0.6 + lum * 1.6), uSeason.z * 0.45 + uSeason.w * 0.55);
            diffuseColor.rgb *= mix(vec3(1.0), vec3(0.92, 1.12, 0.85), uSeason.x * 0.6);
          #endif
          // Schnee auf allem, was nach oben zeigt; Nässe macht dunkler
          float snowF = uSnow * smoothstep(0.2, 0.7, vUp);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.54, 0.6), snowF * 0.9);
          diffuseColor.rgb *= 1.0 - uWet * 0.22 * (1.0 - snowF);
          `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor *= 1.0 - uWet * 0.45 * (1.0 - snowF);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          vec3 gcol = mix(diffuseColor.rgb * 1.6, pal, vMask.x * 0.6);
          totalEmissiveRadiance += gcol * vMask.y * uGlowStr * (0.1 + uNight * 1.5 + vVit.a * 2.5) * vGrow * (1.0 - rotF);
          #ifdef RIM
            // weiches Randlicht: Pilzhüte wirken durchscheinend
            float rimF = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);
            totalEmissiveRadiance += mix(diffuseColor.rgb, pal, 0.5) * rimF * (0.35 + uNight * 0.6) * ${(spec.rimStr ?? 1).toFixed(2)} * vGrow * (1.0 - rotF);
          #endif
          #ifdef TRANSLUCENT
            // Licht scheint durch Halme und Blätter
            totalEmissiveRadiance += diffuseColor.rgb * vTip * vTip * 0.35 * (1.0 - uNight * 0.8) * vGrow;
          #endif
          `,
        );
    if (spec.occlude) addOcclusion(shader, true);
  };
  mat.customProgramCacheKey = () =>
    'veg' + spec.mode + (spec.moss ? 'm' : '') + (spec.double ? 'd' : '') + (spec.occlude ? 'o' : '') + (spec.rim ? 'r' + (spec.rimStr ?? 1) : '') + (spec.translucent ? 't' + (spec.tipH ?? 1) : '') + (spec.breathe ? 'b' : '') + (spec.season ?? '');
  return mat;
}

function makeDepthMaterial(spec) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (shader) => injectVertex(shader, spec, true);
  mat.customProgramCacheKey = () => 'vegd' + spec.mode + (spec.breathe ? 'b' : '') + (spec.tipH ?? 1) + (spec.season ?? '');
  return mat;
}

class Pool {
  constructor(kind, spec, scene) {
    this.kind = kind;
    this.spec = spec;
    this.capacity = spec.per * (2 * spec.r + 1) ** 2;
    const geo = spec.geo;
    this.inst = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
    this.inst.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aInst', this.inst);
    this.mesh = new THREE.InstancedMesh(geo, makeMaterial(spec), this.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = !!spec.shadow;
    this.mesh.receiveShadow = true;
    if (spec.shadow) this.mesh.customDepthMaterial = makeDepthMaterial(spec);
    this.entries = [];
    scene.add(this.mesh);
  }

  rebuild(chunks, filter) {
    const m = this.mesh.instanceMatrix.array;
    const a = this.inst.array;
    let n = 0;
    this.entries.length = 0;
    for (const flora of chunks) {
      const list = flora[this.kind];
      for (const e of list) {
        if (n >= this.capacity) break;
        if (filter && !filter(e)) continue;
        const c = Math.cos(e.rot) * e.s;
        const s = Math.sin(e.rot) * e.s;
        const o = n * 16;
        m[o] = c;
        m[o + 1] = 0;
        m[o + 2] = -s;
        m[o + 3] = 0;
        m[o + 4] = 0;
        m[o + 5] = e.s;
        m[o + 6] = 0;
        m[o + 7] = 0;
        m[o + 8] = s;
        m[o + 9] = 0;
        m[o + 10] = c;
        m[o + 11] = 0;
        m[o + 12] = e.x;
        m[o + 13] = e.y;
        m[o + 14] = e.z;
        m[o + 15] = 1;
        const p = n * 4;
        a[p] = e.th;
        a[p + 1] = e.phase;
        a[p + 2] = e.hue;
        a[p + 3] = e.w;
        this.entries.push(e);
        e.gi = n;
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.inst.needsUpdate = true;
  }

  setW(e, w) {
    e.w = w;
    if (this.entries[e.gi] !== e) return;
    this.inst.array[e.gi * 4 + 3] = w;
    this.inst.needsUpdate = true;
  }
}

export function createVegetation(scene, field) {
  const SPEC = specs();
  const pools = {};
  for (const k of KINDS) pools[k] = new Pool(k, SPEC[k], scene);
  const cache = new Map(); // key → flora
  const queue = [];
  let center = null;
  let dirty = false;
  const consumed = new Set();

  const key = (cx, cz) => cx + ',' + cz;

  function setCenter(ccx, ccz) {
    if (center && center.cx === ccx && center.cz === ccz) return;
    center = { cx: ccx, cz: ccz };
    queue.length = 0;
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) {
        const k = key(ccx + dx, ccz + dz);
        if (!cache.has(k)) queue.push({ cx: ccx + dx, cz: ccz + dz, d: dx * dx + dz * dz });
      }
    queue.sort((a, b) => a.d - b.d);
    // Cache klein halten
    if (cache.size > 120)
      for (const [k, f] of cache) if (Math.abs(f.cx - ccx) > 5 || Math.abs(f.cz - ccz) > 5) cache.delete(k);
    dirty = true;
  }

  function pump(budgetMs = 4) {
    const t0 = performance.now();
    let did = false;
    while (queue.length && performance.now() - t0 < budgetMs) {
      const q = queue.shift();
      const k = key(q.cx, q.cz);
      if (cache.has(k)) continue;
      const f = generateFlora(field, q.cx, q.cz);
      f.cx = q.cx;
      f.cz = q.cz;
      cache.set(k, f);
      did = true;
    }
    // erst neu aufbauen, wenn die Warteschlange leer ist (oder sehr lange nicht)
    if ((did || dirty) && queue.length === 0) rebuild();
    return queue.length;
  }

  function rebuild() {
    dirty = false;
    if (!center) return;
    for (const k of KINDS) {
      const pool = pools[k];
      const r = pool.spec.r;
      const list = [];
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const f = cache.get(key(center.cx + dx, center.cz + dz));
          if (f) list.push(f);
        }
      pool.rebuild(list, k === 'log' ? (e) => !consumed.has(e.id) || e.w < 1e8 : null);
    }
  }

  // Interaktive Objekte in der Nähe
  function nearby(kind, x, z, radius) {
    const out = [];
    for (const e of pools[kind].entries) {
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < radius) out.push({ e, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  return {
    pools,
    setCenter,
    pump,
    nearby,
    rebuild,
    get pending() {
      return queue.length;
    },
    burstPuff(e, time) {
      pools.puff.setW(e, time);
    },
    consumeLog(e, time) {
      consumed.add(e.id);
      pools.log.setW(e, time);
    },
    setConsumed(ids) {
      ids.forEach((id) => consumed.add(id));
      dirty = true;
    },
    isConsumed: (id) => consumed.has(id),
    consumedList: () => [...consumed],
  };
}
