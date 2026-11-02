// Wasserfläche: trüb und braun in erschöpften Gegenden, klar und türkis, wo Leben ist.
import * as THREE from 'three';
import { WATER } from '../config.js';
import { U, GLSL_NOISE, GLSL_VIT } from './shared.js';

export function createWater(scene) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.02,
    metalness: 0.0,
    transparent: true,
    opacity: 0.86,
    envMapIntensity: 0.9,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uVit: U.uVit, uWin: U.uWin, uWinCenter: U.uWinCenter, uTime: U.uTime, uNight: U.uNight });
    shader.vertexShader =
      'varying vec3 vW;\n' +
      shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader =
      `uniform float uTime; uniform float uNight; varying vec3 vW;
      ${GLSL_NOISE}
      ${GLSL_VIT}
      ` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec4 vit = mzVit(vW.xz);
          float lf = smoothstep(0.1, 0.65, mix(0.08, vit.r, mzInWin(vW.xz)));
          diffuseColor.rgb = mix(vec3(0.03, 0.032, 0.02), vec3(0.006, 0.035, 0.045), lf);
          diffuseColor.a = mix(0.95, 0.88, lf);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          vec2 wp = vW.xz;
          float e = 0.15;
          float t = uTime;
          float w0 = mzNoise(wp * 0.6 + vec2(t * 0.35, t * 0.2)) + 0.5 * mzNoise(wp * 1.7 - vec2(t * 0.5, -t * 0.3));
          float wx = mzNoise((wp + vec2(e, 0.0)) * 0.6 + vec2(t * 0.35, t * 0.2)) + 0.5 * mzNoise((wp + vec2(e, 0.0)) * 1.7 - vec2(t * 0.5, -t * 0.3));
          float wz = mzNoise((wp + vec2(0.0, e)) * 0.6 + vec2(t * 0.35, t * 0.2)) + 0.5 * mzNoise((wp + vec2(0.0, e)) * 1.7 - vec2(t * 0.5, -t * 0.3));
          vec3 pert = vec3(w0 - wx, 0.0, w0 - wz) * 0.9;
          normal = normalize(normal + (viewMatrix * vec4(pert, 0.0)).xyz);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.1, 0.6, 0.7) * vit.a * vit.a * 0.25 * mzInWin(vW.xz);`,
        );
  };
  mat.customProgramCacheKey = () => 'water';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1).rotateX(-Math.PI / 2), mat);
  mesh.position.y = WATER;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return {
    mesh,
    update(focus) {
      mesh.position.x = Math.round(focus.x / 32) * 32;
      mesh.position.z = Math.round(focus.z / 32) * 32;
    },
  };
}
