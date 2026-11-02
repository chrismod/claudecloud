// Partikel: Effekt-Pool (Sporenwolken, Funken, Lichtströme), Schwebeteilchen und Glühwürmchen.
import * as THREE from 'three';
import { U, GLSL_VIT } from './shared.js';

const POINT_FRAG = /* glsl */ `
  varying vec3 vCol; varying float vA;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    float a = exp(-d * 3.0) * vA;
    gl_FragColor = vec4(vCol * a, a);
  }`;

export class Effects {
  constructor(scene, max = 3000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.target = new Array(max).fill(null);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute vec3 aCol; attribute float aSize; attribute float aA; uniform float uScale; varying vec3 vCol; varying float vA;
        void main(){ vCol = aCol; vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: POINT_FRAG,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit({ x, y, z, count = 20, speed = 3, up = 1, color = new THREE.Color(1, 1, 1), life = 1.2, size = 0.4, spread = 0.3, gravity = -0.5, drag = 1.5, target = null, jitter = 0.2 }) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() * 2 - 1) * Math.PI * 0.5;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = Math.cos(a) * Math.cos(e) * sp;
      this.vel[i * 3 + 1] = Math.abs(Math.sin(e)) * sp * up + up * speed * 0.3;
      this.vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
      const j = 1 + (Math.random() - 0.5) * jitter;
      this.col[i * 3] = color.r * j;
      this.col[i * 3 + 1] = color.g * j;
      this.col[i * 3 + 2] = color.b * j;
      this.maxLife[i] = this.life[i] = life * (0.6 + Math.random() * 0.6);
      this.s0[i] = size * (0.5 + Math.random());
      this.grav[i] = gravity;
      this.drag[i] = drag;
      this.target[i] = target;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const o = i * 3;
      const tg = this.target[i];
      if (tg) {
        // zum Ziel hingezogen (Lichtströme zum Geist / zum Baum)
        const dx = tg.x - this.pos[o];
        const dy = tg.y - this.pos[o + 1];
        const dz = tg.z - this.pos[o + 2];
        const d = Math.hypot(dx, dy, dz) + 0.001;
        const f = 30 * dt;
        this.vel[o] += (dx / d) * f;
        this.vel[o + 1] += (dy / d) * f;
        this.vel[o + 2] += (dz / d) * f;
        if (d < 0.6) this.life[i] = Math.min(this.life[i], 0.05);
      }
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[o] *= dr;
      this.vel[o + 1] = this.vel[o + 1] * dr + this.grav[i] * dt;
      this.vel[o + 2] *= dr;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t * 3) * Math.min(1, (1 - t) * 8 + 0.2);
      this.size[i] = this.s0[i] * (0.4 + 0.6 * t);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aCol.needsUpdate = a.aSize.needsUpdate = a.aA.needsUpdate = true;
  }

  setViewport(h) {
    this.mat.uniforms.uScale.value = h * 0.6;
  }
}

// Schwebeteilchen um den Fokus: graue Asche über totem Boden, goldene Pollen und Sporen über lebendigem,
// nachts Glühwürmchen. Alles im Shader, CPU macht nichts.
export class Ambient {
  constructor(scene, count = 2600) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random();
      pos[i * 3 + 1] = Math.random();
      pos[i * 3 + 2] = Math.random();
      seed[i * 4] = Math.random();
      seed[i * 4 + 1] = Math.random();
      seed[i * 4 + 2] = Math.random();
      seed[i * 4 + 3] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uVit: U.uVit,
        uRot: U.uRot,
        uWin: U.uWin,
        uWinCenter: U.uWinCenter,
        uTime: U.uTime,
        uNight: U.uNight,
        uFocus: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(110, 14, 110) },
        uScale: { value: 400 },
        uGround: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uNight, uScale, uGround; uniform vec3 uFocus, uBox;
        varying vec3 vCol; varying float vA;
        ${GLSL_VIT}
        void main(){
          float t = uTime;
          bool fly = aSeed.w < 0.22;
          vec3 drift = fly ? vec3(sin(t * 0.7 + aSeed.x * 40.0) * 2.0, sin(t * 0.9 + aSeed.y * 30.0) * 0.8, cos(t * 0.6 + aSeed.z * 50.0) * 2.0)
                           : vec3(t * 0.35 + sin(t * 0.5 + aSeed.y * 20.0) * 1.5, t * (0.12 + aSeed.x * 0.15), t * 0.18 + cos(t * 0.4 + aSeed.x * 30.0) * 1.5);
          vec3 p = position * uBox + drift;
          // um den Fokus kacheln
          p = mod(p - (uFocus - uBox * 0.5), uBox) + (uFocus - uBox * 0.5);
          p.y = uGround + mod(position.y * uBox.y + drift.y, uBox.y) - 1.0;
          vec4 v = mzVit(p.xz) ;
          float life = smoothstep(0.3, 0.8, v.r) * mzInWin(p.xz);
          vec3 ash = vec3(0.55, 0.52, 0.48);
          vec3 pollen = mix(vec3(1.0, 0.85, 0.45), vec3(0.6, 1.0, 0.85), aSeed.z);
          float a;
          float size;
          if (fly) {
            p.y = uGround + 0.5 + aSeed.z * 4.0 + sin(t + aSeed.x * 10.0) * 0.5;
            if (uNight > 0.5) {
              // Glühwürmchen: nur nachts über lebendigem Boden, blinkend
              float blink = smoothstep(0.55, 1.0, sin(t * (1.5 + aSeed.x * 2.0) + aSeed.y * 30.0));
              vCol = vec3(0.75, 1.0, 0.35) * 2.5;
              a = blink * life * uNight;
              size = 0.32;
            } else {
              // Schmetterlinge am Tag: flatternde Farbtupfer über Blumen
              vec3 c1 = vec3(1.0, 0.55, 0.12);
              vec3 c2 = vec3(0.35, 0.6, 1.0);
              vec3 c3 = vec3(1.0, 0.95, 0.75);
              vCol = (aSeed.y < 0.33 ? c1 : aSeed.y < 0.66 ? c2 : c3) * 0.9;
              a = smoothstep(0.55, 0.9, v.r) * mzInWin(p.xz) * (1.0 - uNight) * 0.9;
              size = 0.38 * (0.35 + 0.65 * abs(sin(t * 14.0 + aSeed.x * 20.0)));
              p.y = uGround + 0.4 + aSeed.z * 1.8 + abs(sin(t * 2.0 + aSeed.w * 30.0)) * 0.6;
            }
          } else {
            vCol = mix(ash * 0.5, pollen * (0.7 + uNight * 0.8), life);
            a = mix(0.25, 0.6, life) * (1.0 - uNight * 0.4 * (1.0 - life));
            size = mix(0.1, 0.13, life);
            // Fäulnis: giftige, violett glimmende Sporen
            float rotF = smoothstep(0.3, 0.7, mzRot(p.xz)) * mzInWin(p.xz);
            vCol = mix(vCol, mix(vec3(0.7, 0.15, 1.1), vec3(0.5, 1.0, 0.15), aSeed.z * aSeed.z), rotF);
            a = mix(a, 0.85, rotF);
            size = mix(size, 0.16, rotF);
          }
          vec3 d = p - uFocus;
          a *= 1.0 - smoothstep(35.0, 55.0, length(d.xz));
          vA = a;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: POINT_FRAG,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(focus, groundY) {
    this.mat.uniforms.uFocus.value.copy(focus);
    this.mat.uniforms.uGround.value = groundY;
  }

  setViewport(h) {
    this.mat.uniforms.uScale.value = h * 0.6;
  }
}
