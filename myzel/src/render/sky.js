// Himmel, Tag-Nacht-Zyklus, Sonne/Mond, Sterne, Wolken, Nebel und Umgebungslicht (IBL).
import * as THREE from 'three';
import { U, GLSL_NOISE } from './shared.js';
import { smoothstep, lerp } from '../noise.js';

const KEYS = [
  // t (0 = Mitternacht), Zenit, Horizont, Nebel, Sonnenlicht, Intensität, Himmelslicht, Bodenlicht, Ambient-Stärke
  { t: 0.0, zen: '#050918', hor: '#131d36', fog: '#0e1528', sun: '#7f9bd8', si: 0.38, hs: '#2b3d6e', hg: '#0e1410', hi: 0.36 },
  { t: 0.2, zen: '#0b1430', hor: '#2a3150', fog: '#20263e', sun: '#8aa0d8', si: 0.3, hs: '#36456e', hg: '#14160f', hi: 0.4 },
  { t: 0.255, zen: '#33477e', hor: '#f08a5a', fog: '#b0786a', sun: '#ff8a4a', si: 1.2, hs: '#8a86b0', hg: '#3a2c1c', hi: 0.6 },
  { t: 0.32, zen: '#5c8fd0', hor: '#f4d2a2', fog: '#d6c4a6', sun: '#ffd49a', si: 2.6, hs: '#b8cce8', hg: '#4a4026', hi: 0.75 },
  { t: 0.5, zen: '#4d86d6', hor: '#cfe2ec', fog: '#bccfcf', sun: '#fff4e2', si: 3.3, hs: '#cfe0f4', hg: '#4c4a30', hi: 0.85 },
  { t: 0.68, zen: '#5a86c8', hor: '#f2d6a8', fog: '#d8c6a4', sun: '#ffd8a0', si: 2.6, hs: '#c0c8e0', hg: '#4c4026', hi: 0.75 },
  { t: 0.745, zen: '#3a3f7a', hor: '#ff7a4a', fog: '#b26a5a', sun: '#ff7a3a', si: 1.3, hs: '#9a7ea8', hg: '#3a2818', hi: 0.6 },
  { t: 0.8, zen: '#0f1838', hor: '#3a2f52', fog: '#26243e', sun: '#8aa0d8', si: 0.3, hs: '#3a4470', hg: '#14140f', hi: 0.4 },
  { t: 1.0, zen: '#050918', hor: '#131d36', fog: '#0e1528', sun: '#7f9bd8', si: 0.38, hs: '#2b3d6e', hg: '#0e1410', hi: 0.36 },
].map((k) => ({ ...k, zen: new THREE.Color(k.zen), hor: new THREE.Color(k.hor), fog: new THREE.Color(k.fog), sun: new THREE.Color(k.sun), hs: new THREE.Color(k.hs), hg: new THREE.Color(k.hg) }));

function sampleKeys(t) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const f = smoothstep(0, 1, (t - a.t) / (b.t - a.t));
  const c = (k) => a[k].clone().lerp(b[k], f);
  return { zen: c('zen'), hor: c('hor'), fog: c('fog'), sun: c('sun'), hs: c('hs'), hg: c('hg'), si: lerp(a.si, b.si, f), hi: lerp(a.hi, b.hi, f) };
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZen: { value: new THREE.Color() },
      uHor: { value: new THREE.Color() },
      uSun: { value: new THREE.Vector3() },
      uMoon: { value: new THREE.Vector3() },
      uSunCol: { value: new THREE.Color() },
      uNight: U.uNight,
      uTime: U.uTime,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZen, uHor, uSun, uMoon, uSunCol; uniform float uNight, uTime;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHor, uZen, pow(h, 0.55));
        if (d.y < 0.0) col = uHor * (1.0 + d.y * 0.6);
        float s = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.5) * (1.0 - uNight);
        col += uSunCol * smoothstep(0.9993, 0.9996, s) * 12.0 * (1.0 - uNight);
        // Mond
        float m = max(dot(d, uMoon), 0.0);
        col += vec3(0.75, 0.82, 1.0) * (smoothstep(0.99935, 0.9996, m) * 3.0 + pow(m, 60.0) * 0.18) * uNight;
        // Sterne
        vec2 sp = d.xz / (d.y + 0.35) * 160.0;
        float st = mzHash(floor(sp));
        float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 60.0);
        float star = smoothstep(0.985, 1.0, st) * (1.0 - smoothstep(0.08, 0.32, length(fract(sp) - 0.5)));
        col += vec3(0.9, 0.95, 1.0) * star * tw * uNight * smoothstep(0.02, 0.25, d.y) * 2.0;
        // Wolkenschleier
        vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.004, 0.0);
        float cl = smoothstep(0.45, 0.85, mzFbm(cp)) * smoothstep(0.0, 0.25, d.y);
        vec3 cloudCol = mix(uHor * 1.15, uSunCol * 0.9 + uHor * 0.4, pow(s, 3.0));
        cloudCol = mix(cloudCol, vec3(0.12, 0.14, 0.22), uNight * 0.8);
        col = mix(col, cloudCol, cl * 0.75);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function createSky(scene, renderer) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMaterial());
  sky.scale.setScalar(1500);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  scene.fog = new THREE.FogExp2(0x000000, 0.0052);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -55;
  sc.right = 55;
  sc.top = 55;
  sc.bottom = -55;
  sc.near = 1;
  sc.far = 260;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.8);
  scene.add(hemi);

  // Umgebungslicht aus dem Himmel (für Reflexe auf Wasser und weiches Licht)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(sky.geometry, sky.material);
  envSky.scale.setScalar(100);
  envScene.add(envSky);
  let envRT = null;
  let envAge = Infinity;

  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const state = { night: 0, dayTime: 0.3, sunDir, fogColor: new THREE.Color() };

  function update(dayTime, focus, dt) {
    state.dayTime = dayTime;
    const a = (dayTime - 0.25) * Math.PI * 2; // 0 bei Sonnenaufgang
    sunDir.set(Math.cos(a) * 0.75, Math.sin(a), -0.45 + Math.cos(a) * 0.15).normalize();
    moonDir.set(-sunDir.x, -sunDir.y, -sunDir.z * 0.6 + 0.3).normalize();
    if (moonDir.y < 0.25) moonDir.y = 0.25 + moonDir.y * 0.1;
    moonDir.normalize();
    const k = sampleKeys(dayTime);
    const night = smoothstep(0.02, -0.14, sunDir.y);
    state.night = night;
    U.uNight.value = night;
    const m = sky.material.uniforms;
    m.uZen.value.copy(k.zen);
    m.uHor.value.copy(k.hor);
    m.uSun.value.copy(sunDir);
    m.uMoon.value.copy(moonDir);
    m.uSunCol.value.copy(k.sun);
    scene.fog.color.copy(k.fog);
    state.fogColor.copy(k.fog);

    const lightDir = sunDir.y > -0.05 ? sunDir : moonDir;
    sun.color.copy(k.sun);
    sun.intensity = k.si * smoothstep(-0.05, 0.08, Math.max(sunDir.y, night * moonDir.y));
    U.uSunDir.value.copy(lightDir);
    U.uSunColor.value.copy(k.sun).multiplyScalar(sun.intensity);
    // Schattenkamera folgt dem Fokus, auf Texel gerastert gegen Flimmern
    const texel = 110 / 2048;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    sun.target.position.set(fx, focus.y, fz);
    sun.position.set(fx + lightDir.x * 120, focus.y + Math.max(lightDir.y, 0.15) * 120, fz + lightDir.z * 120);
    hemi.color.copy(k.hs);
    hemi.groundColor.copy(k.hg);
    hemi.intensity = k.hi * 1.6;
    sky.position.copy(focus);

    envAge += dt;
    if (envAge > 4) {
      envAge = 0;
      if (envRT) envRT.dispose();
      envRT = pmrem.fromScene(envScene, 0, 0.1, 500);
      scene.environment = envRT.texture;
    }
  }

  return { update, state, sun, hemi, sky };
}
