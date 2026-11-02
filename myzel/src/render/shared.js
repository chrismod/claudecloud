// Gemeinsame Uniforms (per Referenz in allen Materialien) und GLSL-Bausteine.
import * as THREE from 'three';
import { WIN } from '../config.js';

export const U = {
  uVit: { value: null }, // RGBA: Leben, Myzel, Farbton, Leuchten
  uRot: { value: null }, // R: Fäulnis, G: Schutz durch Mutterbäume
  uWin: { value: WIN },
  uWinCenter: { value: new THREE.Vector2() },
  uTime: { value: 0 },
  uNight: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uWind: { value: 1 },
  uP1: { value: new THREE.Color('#ffb347') }, // Hyphe: Bernstein
  uP2: { value: new THREE.Color('#3ff5c8') }, // Keim: Jade
  uPlayers: { value: [new THREE.Vector3(1e5, 0, 1e5), new THREE.Vector3(1e5, 0, 1e5)] },
};

export function createVitalityTexture() {
  const data = new Uint8Array(WIN * WIN * 4);
  const tex = new THREE.DataTexture(data, WIN, WIN, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  U.uVit.value = tex;
  return { tex, data };
}

export function createRotTexture() {
  const data = new Uint8Array(WIN * WIN * 4);
  const tex = new THREE.DataTexture(data, WIN, WIN, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  U.uRot.value = tex;
  return { tex, data };
}

export const GLSL_NOISE = /* glsl */ `
float mzHash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec2 mzHash2(vec2 p){ float n = mzHash(p); return vec2(n, mzHash(p + n + 17.17)); }
float mzNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(mzHash(i), mzHash(i+vec2(1,0)), u.x), mix(mzHash(i+vec2(0,1)), mzHash(i+vec2(1,1)), u.x), u.y);
}
float mzFbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<4;i++){ v += a*mzNoise(p); p = p*2.03 + 7.1; a *= 0.5; } return v; }
// Abstand zur Zellgrenze (Voronoi F2-F1) – ergibt Netz-/Adermuster
float mzVeins(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g = vec2(x,y);
    vec2 o = mzHash2(i+g);
    vec2 r = g + o - f;
    float d = dot(r,r);
    if(d < d1){ d2 = d1; d1 = d; } else if(d < d2){ d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}
`;

// Vitalität an einer Weltposition; außerhalb des Fensters gilt ein Ersatzwert
export const GLSL_VIT = /* glsl */ `
uniform sampler2D uVit;
uniform float uWin;
uniform vec2 uWinCenter;
uniform sampler2D uRot;
vec4 mzVit(vec2 xz){ return texture2D(uVit, xz / uWin); }
float mzRot(vec2 xz){ return texture2D(uRot, xz / uWin).r; }
float mzInWin(vec2 xz){ vec2 d = abs(xz - uWinCenter); return 1.0 - smoothstep(96.0, 110.0, max(d.x, d.y)); }
`;

// Bäume zwischen Kamera und Geistern werden gerastert ausgeblendet, damit man die Geister immer sieht.
export function addOcclusion(shader, instanced) {
  shader.uniforms.uPlayers = U.uPlayers;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vOccWP;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vOccWP = (modelMatrix * ${instanced ? 'instanceMatrix * ' : ''}vec4(transformed, 1.0)).xyz;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vOccWP;\nuniform vec3 uPlayers[2];')
    .replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      {
        float occ = 0.0;
        for (int k = 0; k < 2; k++) {
          vec3 cd = uPlayers[k] - cameraPosition;
          float L = length(cd);
          vec3 dir = cd / L;
          vec3 rel = vOccWP - cameraPosition;
          float t = dot(rel, dir);
          if (t > 0.0 && t < L - 1.2) occ = max(occ, 1.0 - smoothstep(2.5, 6.0, length(rel - dir * t)));
        }
        float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (occ * 0.9 > ign) discard;
      }`,
    );
}
