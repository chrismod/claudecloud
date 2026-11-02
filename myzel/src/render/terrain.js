// Terrain-Chunks mit zwei Detailstufen. Der Boden-Shader liest die Vitalität pro Pixel:
// erschöpfter Staub ↔ Moos und Waldboden, darüber leuchtende Myzeladern.
import * as THREE from 'three';
import { CHUNK, NEAR_R, FAR_R } from '../config.js';
import { U, GLSL_NOISE, GLSL_VIT } from './shared.js';

function makeMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, envMapIntensity: 0.6, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uVit: U.uVit,
      uWin: U.uWin,
      uWinCenter: U.uWinCenter,
      uTime: U.uTime,
      uNight: U.uNight,
      uP1: U.uP1,
      uP2: U.uP2,
    });
    shader.vertexShader =
      `attribute vec4 aMeta; varying vec4 vMeta; varying vec3 vW; varying vec3 vWN;\n` +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vMeta = aMeta; vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = objectNormal;`,
      );
    shader.fragmentShader =
      `uniform float uTime; uniform float uNight; uniform vec3 uP1; uniform vec3 uP2;
      varying vec4 vMeta; varying vec3 vW; varying vec3 vWN;
      ${GLSL_NOISE}
      ${GLSL_VIT}
      ` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          vec2 xz = vW.xz;
          vec4 vit = mzVit(xz);
          float inW = mzInWin(xz);
          float life = mix(vMeta.z, vit.r, inW);
          float myc = mix(vMeta.w, vit.g, inW);
          float hue = mix(0.5, vit.b, inW);
          float glow = vit.a * inW;
          float n1 = mzFbm(xz * 0.07);
          float n2 = mzNoise(xz * 0.9);
          float n3 = mzNoise(xz * 0.23 + 4.0);
          // erschöpfter Boden: Staub, rissige Erde, graue Asche
          vec3 dead = mix(vec3(0.085, 0.066, 0.048), vec3(0.19, 0.145, 0.095), n1);
          dead = mix(dead, vec3(0.13, 0.125, 0.12), smoothstep(0.55, 0.8, n3) * 0.6);
          dead *= 0.8 + 0.4 * n2;
          // Risse in der ausgetrockneten Erde
          dead *= 0.75 + 0.25 * smoothstep(0.0, 0.05, mzVeins(xz * 0.55 + 3.0));
          // lebendiger Boden: Moos, Laubstreu, Klee
          vec3 alive = mix(vec3(0.075, 0.19, 0.04), vec3(0.21, 0.34, 0.07), n1);
          alive = mix(alive, vec3(0.17, 0.11, 0.06), smoothstep(0.55, 0.85, n3) * 0.55);
          alive = mix(alive, vec3(0.12, 0.14, 0.18), vMeta.y * 0.45); // Pilzwald: kühles Moos
          alive *= 0.82 + 0.36 * n2;
          float lf = smoothstep(0.08, 0.7, life + (n2 - 0.5) * 0.18);
          vec3 col = mix(dead, alive, lf);
          // Fels an steilen Hängen, mit Moos wenn belebt
          float rock = smoothstep(0.8, 0.62, vWN.y);
          vec3 rockC = mix(vec3(0.16, 0.155, 0.145), vec3(0.3, 0.29, 0.27), n2);
          rockC = mix(rockC, vec3(0.09, 0.2, 0.05), lf * smoothstep(0.35, 0.7, n1) * 0.8);
          col = mix(col, rockC, rock);
          // Ufer: Schlamm
          float shore = 1.0 - smoothstep(-0.2, 0.9, vW.y);
          col = mix(col, mix(vec3(0.12, 0.1, 0.07), vec3(0.06, 0.05, 0.035), lf), shore * 0.85);
          // Myzel: verzweigte Hyphen (fein) und Stränge (grob)
          vec2 q = xz + vec2(mzNoise(xz * 0.35), mzNoise(xz * 0.35 + 9.0)) * 1.7;
          float vf = mzVeins(q * 1.3);
          float vc = mzVeins(q * 0.33);
          float vein = (1.0 - smoothstep(0.0, 0.08, vf)) * 0.55 + (1.0 - smoothstep(0.0, 0.045, vc));
          float mv = smoothstep(0.1, 0.45, myc) * (1.0 - rock * 0.7) * (1.0 - shore);
          vec3 veinCol = mix(uP1, uP2, hue);
          col = mix(col, vec3(0.86, 0.83, 0.74), vein * mv * 0.42 * (1.0 - lf * 0.55));
          diffuseColor.rgb = col;
          vec3 mzEmit = veinCol * vein * mv * (0.03 + uNight * 0.5 * (1.0 - lf * 0.45) + glow * (1.1 + uNight * 1.6));
          mzEmit += veinCol * glow * mv * 0.18;
          `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.45, shore);`,
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += mzEmit;');
  };
  mat.customProgramCacheKey = () => 'terrain';
  return mat;
}

function buildGeometry(field, store, cx, cz, seg) {
  const step = CHUNK / seg;
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  const n = seg + 1;
  // Höhen mit Rand für Normalen
  const H = new Float32Array((n + 2) * (n + 2));
  for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) H[(j + 1) * (n + 2) + (i + 1)] = field.height(x0 + i * step, z0 + j * step);
  const h = (i, j) => H[(j + 1) * (n + 2) + (i + 1)];
  const saved = store.get(cx + ',' + cz);

  const vCount = n * n + 4 * n;
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const meta = new Float32Array(vCount * 4);
  const v = new THREE.Vector3();
  let k = 0;
  const put = (i, j, drop) => {
    const x = x0 + i * step;
    const z = z0 + j * step;
    pos[k * 3] = x;
    pos[k * 3 + 1] = h(i, j) - drop;
    pos[k * 3 + 2] = z;
    v.set(h(i - 1, j) - h(i + 1, j), 2 * step, h(i, j - 1) - h(i, j + 1)).normalize();
    nor[k * 3] = v.x;
    nor[k * 3 + 1] = v.y;
    nor[k * 3 + 2] = v.z;
    let life;
    let myc;
    if (saved) {
      const ci = Math.min(CHUNK - 1, Math.floor(j * step)) * CHUNK + Math.min(CHUNK - 1, Math.floor(i * step));
      life = saved.L[ci] / 255;
      myc = saved.M[ci] / 255;
    } else {
      const b = field.baseState(x, z);
      life = b.life;
      myc = b.myc;
    }
    meta[k * 4] = 0;
    meta[k * 4 + 1] = field.mushroomness(x, z);
    meta[k * 4 + 2] = life;
    meta[k * 4 + 3] = myc;
    k++;
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) put(i, j, 0);
  // Schürzen gegen Risse zwischen Detailstufen
  const skirt = seg === 32 ? 1.5 : 4;
  const skirtStart = k;
  for (let e = 0; e < n; e++) put(e, 0, skirt);
  for (let e = 0; e < n; e++) put(e, n - 1, skirt);
  for (let e = 0; e < n; e++) put(0, e, skirt);
  for (let e = 0; e < n; e++) put(n - 1, e, skirt);

  const idx = [];
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * n + i;
      idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  const top = (i, j) => j * n + i;
  for (let e = 0; e < seg; e++) {
    // Nordkante (j=0), Südkante (j=n-1), Westkante (i=0), Ostkante (i=n-1)
    const sN = skirtStart + e;
    const sS = skirtStart + n + e;
    const sW = skirtStart + 2 * n + e;
    const sE = skirtStart + 3 * n + e;
    idx.push(top(e, 0), top(e + 1, 0), sN, top(e + 1, 0), sN + 1, sN);
    idx.push(top(e, n - 1), sS, top(e + 1, n - 1), top(e + 1, n - 1), sS, sS + 1);
    idx.push(top(0, e), sW, top(0, e + 1), top(0, e + 1), sW, sW + 1);
    idx.push(top(n - 1, e), top(n - 1, e + 1), sE, top(n - 1, e + 1), sE + 1, sE);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aMeta', new THREE.BufferAttribute(meta, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export function createTerrain(scene, field, store) {
  const material = makeMaterial();
  const chunks = new Map(); // key → { mesh, lod }
  const queue = [];
  let center = null;
  const group = new THREE.Group();
  scene.add(group);

  function setCenter(ccx, ccz, immediate = false) {
    if (center && center.cx === ccx && center.cz === ccz && !immediate) return;
    center = { cx: ccx, cz: ccz };
    queue.length = 0;
    const want = new Map();
    for (let dz = -FAR_R; dz <= FAR_R; dz++)
      for (let dx = -FAR_R; dx <= FAR_R; dx++) {
        if (dx * dx + dz * dz > (FAR_R + 0.5) ** 2) continue;
        const lod = Math.abs(dx) <= NEAR_R && Math.abs(dz) <= NEAR_R ? 32 : 8;
        want.set(ccx + dx + ',' + (ccz + dz), { cx: ccx + dx, cz: ccz + dz, lod, d: dx * dx + dz * dz });
      }
    for (const [k, c] of chunks)
      if (!want.has(k)) {
        group.remove(c.mesh);
        c.mesh.geometry.dispose();
        chunks.delete(k);
      }
    for (const [k, w] of want) {
      const c = chunks.get(k);
      if (!c || c.lod !== w.lod) queue.push(w);
    }
    queue.sort((a, b) => b.lod - a.lod || a.d - b.d);
    if (immediate) while (queue.length) build(queue.shift());
  }

  function build(w) {
    const k = w.cx + ',' + w.cz;
    const geo = buildGeometry(field, store, w.cx, w.cz, w.lod);
    const old = chunks.get(k);
    if (old) {
      group.remove(old.mesh);
      old.mesh.geometry.dispose();
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    chunks.set(k, { mesh, lod: w.lod });
  }

  function pump(budgetMs = 4) {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budgetMs) build(queue.shift());
    return queue.length;
  }

  return { setCenter, pump, material, group };
}
