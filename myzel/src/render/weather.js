// Wetter zum Anschauen: Regenschnüre, Schneeflocken, fallendes Herbstlaub, Frühlingsblüten, Blitze.
// Die Teilchen leben in einer Kiste um den Fokus und werden komplett im Vertex-Shader bewegt.
import * as THREE from 'three';
import { U, GLSL_VIT } from './shared.js';

const BOX = new THREE.Vector3(70, 46, 70);

function seeds(n, perVertex = 1) {
  const a = new Float32Array(n * perVertex * 4);
  for (let i = 0; i < n; i++) {
    const s = [Math.random(), Math.random(), Math.random(), Math.random()];
    for (let v = 0; v < perVertex; v++) a.set(s, (i * perVertex + v) * 4);
  }
  return a;
}

const wrap = /* glsl */ `
  uniform vec3 uFocus; uniform vec3 uBox; uniform float uGround;
  vec3 inBox(vec3 p) {
    vec3 lo = vec3(uFocus.x - uBox.x * 0.5, uGround - 4.0, uFocus.z - uBox.z * 0.5);
    return mod(p - lo, uBox) + lo;
  }`;

export function createWeather(scene) {
  const common = () => ({ uFocus: { value: new THREE.Vector3() }, uBox: { value: BOX }, uGround: { value: 0 }, uTime: U.uTime, uNight: U.uNight });

  // --- Regen: kurze, schräge Linien ---
  const RAIN = 4000;
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN * 2 * 3), 3));
  rg.setAttribute('aSeed', new THREE.BufferAttribute(seeds(RAIN, 2), 4));
  const end = new Float32Array(RAIN * 2);
  for (let i = 0; i < RAIN; i++) end[i * 2 + 1] = 1;
  rg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const rainMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...common(), uRain: U.uRain, uWind: U.uWind },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; attribute float aEnd;
      uniform float uTime, uRain, uWind; varying float vA;
      ${wrap}
      void main(){
        float speed = 26.0 + aSeed.w * 8.0;
        vec3 vel = vec3(2.5 + uWind * 3.0, -speed, 1.0);
        vec3 p = aSeed.xyz * uBox + vel * uTime;
        p = inBox(p);
        p += normalize(vel) * aEnd * (0.7 + aSeed.w * 0.6);
        vA = step(aSeed.x, uRain) * (0.18 + 0.12 * aEnd);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight; varying float vA;
      void main(){ gl_FragColor = vec4(mix(vec3(0.75, 0.8, 0.88), vec3(0.3, 0.35, 0.5), uNight), vA); }`,
  });
  const rain = new THREE.LineSegments(rg, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);

  // --- Schnee, Laub und Blüten als Punkte ---
  const FLAKES = 3200;
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLAKES * 3), 3));
  pg.setAttribute('aSeed', new THREE.BufferAttribute(seeds(FLAKES), 4));
  const flakeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...common(), uSnowfall: U.uSnowfall, uSeason: U.uSeason, uScale: { value: 400 }, uVit: U.uVit, uWin: U.uWin, uWinCenter: U.uWinCenter, uRot: U.uRot },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uSnowfall, uScale; uniform vec4 uSeason;
      varying vec3 vCol; varying float vA; varying float vLeaf;
      ${wrap}
      ${GLSL_VIT}
      void main(){
        // ein Teil der Punkte ist Schnee, der Rest Laub/Blüten
        bool leaf = aSeed.w < 0.18;
        vec3 p;
        float size;
        if (leaf) {
          vec3 vel = vec3(1.2, -1.1, 0.4);
          p = aSeed.xyz * uBox + vel * uTime;
          p.x += sin(uTime * 1.7 + aSeed.y * 40.0) * 1.2;
          p.z += cos(uTime * 1.3 + aSeed.x * 30.0) * 1.0;
          p = inBox(p);
          float life = smoothstep(0.45, 0.8, mzVit(p.xz).r) * mzInWin(p.xz);
          vec3 autumn = aSeed.z < 0.33 ? vec3(0.85, 0.22, 0.04) : aSeed.z < 0.66 ? vec3(0.95, 0.55, 0.08) : vec3(0.85, 0.72, 0.15);
          vec3 petal = vec3(1.0, 0.75, 0.85);
          float wA = uSeason.z * 0.9;
          float wS = uSeason.x * 0.7;
          vCol = (autumn * wA + petal * wS) / max(0.001, wA + wS);
          vA = max(wA, wS) * life * 0.95;
          size = 0.22 * (0.5 + 0.5 * abs(sin(uTime * 4.0 + aSeed.x * 50.0)));
          vLeaf = 1.0;
        } else {
          vec3 vel = vec3(0.8, -2.2 - aSeed.w * 1.2, 0.3);
          p = aSeed.xyz * uBox + vel * uTime;
          p.x += sin(uTime * 0.9 + aSeed.y * 30.0) * 0.8;
          p.z += cos(uTime * 0.7 + aSeed.x * 20.0) * 0.8;
          p = inBox(p);
          vCol = vec3(0.95, 0.97, 1.0);
          vA = step(aSeed.x, uSnowfall) * 0.85;
          size = 0.1 + aSeed.z * 0.08;
          vLeaf = 0.0;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight; varying vec3 vCol; varying float vA; varying float vLeaf;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        // Blätter als Ellipse, Flocken rund und weich
        float d = vLeaf > 0.5 ? length(c * vec2(1.0, 2.2)) * 2.0 : length(c) * 2.0;
        if (d > 1.0) discard;
        float a = vA * (vLeaf > 0.5 ? 1.0 : smoothstep(1.0, 0.3, d));
        gl_FragColor = vec4(vCol * (1.0 - uNight * 0.6), a);
      }`,
  });
  const flakes = new THREE.Points(pg, flakeMat);
  flakes.frustumCulled = false;
  scene.add(flakes);

  // --- Blitze ---
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.2, 4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  let bolt = null;
  let boltT = 0;
  function strike(x, y, z) {
    if (bolt) {
      scene.remove(bolt);
      bolt.geometry.dispose();
    }
    const pts = [];
    let px = x;
    let pz = z;
    const top = y + 140;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new THREE.Vector3(px, top - (top - y) * t, pz));
      px += (Math.random() - 0.5) * 9;
      pz += (Math.random() - 0.5) * 9;
    }
    const geos = [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.35, 4)];
    // Seitenarm
    const k = 4 + Math.floor(Math.random() * 6);
    const br = [pts[k].clone()];
    for (let i = 1; i < 6; i++) br.push(br[i - 1].clone().add(new THREE.Vector3((Math.random() - 0.3) * 10, -8, (Math.random() - 0.5) * 10)));
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(br), 20, 0.18, 4));
    const g = new THREE.Group();
    for (const geo of geos) g.add(new THREE.Mesh(geo, boltMat));
    g.geometry = { dispose: () => geos.forEach((q) => q.dispose()) };
    bolt = g;
    boltT = 0.35;
    scene.add(bolt);
  }

  function update(dt, focus, groundY, viewportH) {
    for (const m of [rainMat, flakeMat]) {
      m.uniforms.uFocus.value.copy(focus);
      m.uniforms.uGround.value = groundY;
    }
    flakeMat.uniforms.uScale.value = viewportH * 0.6;
    rain.visible = U.uRain.value > 0.01;
    flakes.visible = U.uSnowfall.value > 0.01 || U.uSeason.value.z > 0.05 || U.uSeason.value.x > 0.05;
    if (bolt) {
      boltT -= dt;
      boltMat.opacity = boltT > 0 ? (Math.random() < 0.7 ? 1 : 0.2) * Math.min(1, boltT * 5) : 0;
      if (boltT <= 0) {
        scene.remove(bolt);
        bolt.geometry.dispose();
        bolt = null;
      }
    }
  }

  return { update, strike };
}
