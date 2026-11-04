// Renderer, Kamera und Nachbearbeitung (Bloom, Farbgebung, Vignette, Korn) mit dynamischer Auflösung.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { U } from './shared.js';

// Höhennebel: dichter in Tälern und über Wasser, dünner auf Hügeln
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogWY;
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWY = (inverse(viewMatrix) * mvPosition).y;
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogWY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float hFac = exp(-max(vFogWY - 0.5, 0.0) * 0.14);
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * (0.7 + 1.3 * hFac));
    fogFactor = max(fogFactor, (1.0 - exp(-vFogDepth * 0.012)) * hFac * 0.3);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(fogFactor, 0.0, 1.0));
#endif`;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uNight: { value: 0 },
    uVignette: { value: 1 },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uNight, uVignette, uFade, uFlash; uniform vec2 uRes;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      // leichte chromatische Aberration zum Rand hin
      float ca = dot(c, c) * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ca).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // Sättigung und Split-Toning: Schatten kühl, Lichter warm
      col = mix(vec3(l), col, 1.12);
      col += vec3(-0.012, 0.0, 0.025) * (1.0 - l) * (0.5 + uNight);
      col += vec3(0.03, 0.015, -0.02) * l * (1.0 - uNight);
      float v = smoothstep(0.85, 0.2, length(c * vec2(1.0, 0.85)));
      col *= mix(1.0, v, 0.55 * uVignette);
      col += (h(vUv * uRes + fract(uTime) * 91.7) - 0.5) * 0.028;
      col = mix(col, vec3(1.0, 0.97, 0.9), uFlash);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setClearColor(0x000000, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.3, 2000);

  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.55, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const fixed = new URLSearchParams(location.search).get('scale');
  let scale = fixed ? Number(fixed) : Math.min(window.devicePixelRatio || 1, 1.5);
  const maxScale = scale;
  let w = 1;
  let h = 1;
  function resize() {
    w = container.clientWidth || window.innerWidth;
    h = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(scale);
    renderer.setSize(w, h);
    composer.setPixelRatio(scale);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    grade.uniforms.uRes.value.set(w * scale, h * scale);
  }
  window.addEventListener('resize', resize);
  resize();

  // Dynamische Auflösung: hält die Bildrate, indem die Pixeldichte nachgeführt wird
  let acc = 0;
  let frames = 0;
  let cooldown = 2;
  function adapt(dt) {
    acc += dt;
    frames++;
    cooldown -= dt;
    if (acc < 1.5) return;
    const avg = acc / frames;
    acc = 0;
    frames = 0;
    if (cooldown > 0 || fixed) return;
    if (avg > 1 / 45 && scale > 0.55) {
      scale = Math.max(0.55, scale - 0.15);
      resize();
      cooldown = 2;
    } else if (avg < 1 / 58 && scale < maxScale) {
      scale = Math.min(maxScale, scale + 0.1);
      resize();
      cooldown = 4;
    }
  }

  return {
    renderer,
    scene,
    camera,
    composer,
    bloom,
    grade,
    get scale() {
      return scale;
    },
    render(dt) {
      grade.uniforms.uTime.value = U.uTime.value;
      grade.uniforms.uNight.value = U.uNight.value;
      composer.render(dt);
      adapt(dt);
    },
  };
}
