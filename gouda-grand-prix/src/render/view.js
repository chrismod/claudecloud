// Renderer, Nachbearbeitung (Bloom, Farbkorrektur, Tempo-Unschärfe) und Splitscreen-Kameras
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Rendert mehrere Kameras in Teilbereiche desselben Ziels
class SplitRenderPass extends Pass {
  constructor() {
    super();
    this.views = []; // { scene, camera, rect: [x,y,w,h] in 0..1, before() }
    this.needsSwap = false;
    this.clear = true;
  }
  render(renderer, writeBuffer, readBuffer) {
    const target = this.renderToScreen ? null : readBuffer;
    const W = readBuffer.width;
    const H = readBuffer.height;
    const oldAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    for (const v of this.views) {
      const [x, y, w, h] = v.rect;
      const px = Math.round(x * W);
      const py = Math.round(y * H);
      const pw = Math.round(w * W);
      const ph = Math.round(h * H);
      v.before?.();
      if (target) {
        target.viewport.set(px, py, pw, ph);
        target.scissor.set(px, py, pw, ph);
        target.scissorTest = true;
        renderer.setRenderTarget(target);
      }
      renderer.render(v.scene, v.camera);
    }
    if (target) {
      target.viewport.set(0, 0, W, H);
      target.scissor.set(0, 0, W, H);
      target.scissorTest = false;
    }
    renderer.autoClear = oldAuto;
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    rect0: { value: new THREE.Vector4(0, 0, 1, 1) },
    rect1: { value: new THREE.Vector4(0, 0, 0, 0) },
    fx0: { value: new THREE.Vector4() }, // boost, stink, hit, vignette
    fx1: { value: new THREE.Vector4() },
    time: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec4 rect0, rect1, fx0, fx1;
    uniform float time, aspect;
    varying vec2 vUv;
    bool inRect(vec2 p, vec4 r) { return p.x >= r.x && p.x <= r.x + r.z && p.y >= r.y && p.y <= r.y + r.w; }
    void main() {
      vec4 r = rect0; vec4 f = fx0;
      if (rect1.z > 0.0 && inRect(vUv, rect1)) { r = rect1; f = fx1; }
      vec2 c = r.xy + r.zw * vec2(0.5, 0.55);
      vec2 d = vUv - c;
      vec2 dn = d / r.zw;
      float dist = length(dn * vec2(r.z / r.w * aspect, 1.0)) ;
      vec2 uv = vUv;
      // Stinkekäse: wabernde Verzerrung
      if (f.y > 0.0) uv += vec2(sin(vUv.y * 40.0 + time * 4.0), cos(vUv.x * 30.0 + time * 3.0)) * 0.004 * f.y;
      vec3 col = vec3(0.0);
      // Tempo-Unschärfe nach außen hin
      float blur = f.x * smoothstep(0.15, 0.9, length(dn) * 1.4);
      if (blur > 0.01) {
        for (int i = 0; i < 8; i++) {
          float k = float(i) / 7.0;
          vec2 o = (uv - c) * (1.0 - blur * 0.06 * k);
          vec2 s = clamp(c + o, r.xy + 0.001, r.xy + r.zw - 0.001);
          col += texture2D(tDiffuse, s).rgb;
        }
        col /= 8.0;
      } else col = texture2D(tDiffuse, uv).rgb;
      // Treffer: chromatische Aberration und Rotstich
      if (f.z > 0.0) {
        vec2 o = d * 0.02 * f.z;
        col.r = mix(col.r, texture2D(tDiffuse, clamp(uv + o, r.xy, r.xy + r.zw)).r, 0.9);
        col.b = mix(col.b, texture2D(tDiffuse, clamp(uv - o, r.xy, r.xy + r.zw)).b, 0.9);
        col *= mix(vec3(1.0), vec3(1.25, 0.85, 0.8), f.z * 0.5);
      }
      if (f.y > 0.0) col = mix(col, col * vec3(0.65, 1.15, 0.45) + vec3(0.02, 0.06, 0.0), f.y * 0.8);
      // Kontrast und Sättigung leicht anheben
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.12);
      // Vignette
      float v = smoothstep(0.55, 1.25, length(dn * vec2(1.0, 0.9)) * 1.25);
      col *= 1.0 - v * f.w;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createView(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const maxRatio = pixelRatio;
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const split = new SplitRenderPass();
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.55, 0.82);
  const grade = new ShaderPass(GradeShader);
  const output = new OutputPass();
  composer.addPass(split);
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(output);

  let width = 1;
  let height = 1;
  function resize() {
    width = container.clientWidth || window.innerWidth;
    height = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    bloom.resolution.set(width * pixelRatio * 0.5, height * pixelRatio * 0.5);
    grade.uniforms.aspect.value = width / height;
  }
  window.addEventListener('resize', resize);
  resize();

  // Adaptive Auflösung: hält die Bildrate, wenn die Grafikkarte nicht hinterherkommt
  let slow = 0;
  let fast = 0;
  function adapt(frameMs) {
    if (frameMs > 24) (slow += frameMs), (fast = 0);
    else if (frameMs < 13) (fast += frameMs), (slow = Math.max(0, slow - frameMs));
    else slow = Math.max(0, slow - frameMs * 0.5);
    if (slow > 1500 && pixelRatio > 0.6) {
      pixelRatio = Math.max(0.6, pixelRatio - 0.15);
      slow = 0;
      resize();
    } else if (fast > 4000 && pixelRatio < maxRatio) {
      pixelRatio = Math.min(maxRatio, pixelRatio + 0.1);
      fast = 0;
      resize();
    }
  }

  function setViews(views) {
    split.views = views;
    const r0 = views[0]?.rect ?? [0, 0, 1, 1];
    const r1 = views[1]?.rect ?? [0, 0, 0, 0];
    grade.uniforms.rect0.value.set(...r0);
    grade.uniforms.rect1.value.set(...r1);
  }
  function setEffects(i, { boost = 0, stink = 0, hit = 0, vignette = 0.45 }) {
    grade.uniforms['fx' + i].value.set(boost, stink, hit, vignette);
  }
  function setBloom(strength, threshold = 0.82) {
    bloom.strength = strength;
    bloom.threshold = threshold;
  }

  function render(time) {
    grade.uniforms.time.value = time;
    composer.render();
  }

  return {
    renderer,
    setViews,
    setEffects,
    setBloom,
    render,
    adapt,
    resize,
    get size() {
      return { width, height, pixelRatio };
    },
  };
}

// --- Verfolgerkamera -------------------------------------------------------------------------------
export class ChaseCam {
  constructor(track) {
    this.track = track;
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.3, 6000);
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shakeT = 0;
    this.shakeA = 0;
    this.hint = -1;
    this.fov = 70;
    this.init = false;
    this.loc = {};
  }
  shake(amount) {
    this.shakeA = Math.max(this.shakeA, amount);
    this.shakeT = 0.4;
  }
  update(k, dt, { raceTime = 0, lookBack = false, aspect = 1, mode = 'race', time = 0 } = {}) {
    const cam = this.camera;
    cam.aspect = aspect;
    // Fahrtrichtung: im Drift zwischen Nase und Bewegungsrichtung
    const velYaw = Math.hypot(k.vx, k.vz) > 3 ? Math.atan2(k.vx, k.vz) : k.heading;
    let target = k.drift ? mixAngle(k.heading, velYaw, 0.55) : mixAngle(k.heading, velYaw, 0.2);
    if (k.spinT > 0 || k.tumbleT > 0) target = this.yaw;
    if (!this.init) {
      this.yaw = target;
    }
    this.yaw = mixAngle(this.yaw, target, 1 - Math.exp(-dt * 5));
    let yaw = this.yaw + (lookBack ? Math.PI : 0);
    const speed = Math.max(0, k.fs);
    let dist = 5.6 + speed * 0.045;
    let height = 2.2 + speed * 0.012;
    // Intro: Kamera schwenkt von vorn nach hinten
    if (mode === 'intro') {
      const t = Math.min(1, Math.max(0, (raceTime + 3.2) / 2.6));
      const e = t * t * (3 - 2 * t);
      yaw = this.yaw + Math.PI * (1 - e) * 0.9;
      dist = 7 + (1 - e) * 2;
      height = 1.6 + (1 - e) * 1.0;
    } else if (mode === 'finish') {
      yaw = time * 0.35;
      dist = 8;
      height = 2.8;
    }
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const want = new THREE.Vector3(k.x - fx * dist, k.y + height, k.z - fz * dist);
    // nicht in den Boden
    const loc = this.track.locate(want.x, want.z, this.hint, this.loc);
    this.hint = loc.i;
    want.y = Math.max(want.y, loc.y + 1.0);
    const lookAt = new THREE.Vector3(k.x + fx * 4, k.y + 1.1, k.z + fz * 4);
    if (!this.init || mode === 'intro') {
      this.pos.copy(want);
      this.look.copy(lookAt);
      this.init = true;
    } else {
      const a = 1 - Math.exp(-dt * 12);
      this.pos.x += (want.x - this.pos.x) * a;
      this.pos.z += (want.z - this.pos.z) * a;
      this.pos.y += (want.y - this.pos.y) * (1 - Math.exp(-dt * 6));
      this.look.lerp(lookAt, 1 - Math.exp(-dt * 16));
    }
    cam.position.copy(this.pos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeA * (this.shakeT / 0.4);
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    } else this.shakeA = 0;
    cam.lookAt(this.look);
    // Sichtfeld weitet sich mit Tempo und Turbo
    const boost = k.boostT > 0 || k.goldenT > 0 ? 1 : 0;
    const fovT = 66 + Math.min(1, speed / 32) * 8 + boost * 9;
    this.fov += (fovT - this.fov) * Math.min(1, dt * 4);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }
}

function mixAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
