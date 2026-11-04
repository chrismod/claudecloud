// Renderer, Kamera, Licht, Himmel, Nachbearbeitung (Bloom) und Stimmungen je Karte.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const THEMES = {
  meadow: {
    skyTop: '#5d9bd6',
    skyBottom: '#f3e6cf',
    skyDeep: '#5f93c4',
    fog: '#cfdce6',
    sun: '#fff1d6',
    sunI: 2.6,
    hemiSky: '#dcecff',
    hemiGround: '#5d6b3a',
    hemiI: 1.25,
    grass: ['#86b65a', '#6fa24a', '#9cc566'],
    earth: '#8a6648',
    rock: '#7d7a78',
    stone: '#e8e2d4',
    road: '#e6cf9f',
    roadEdge: '#c9ad78',
    leaves: ['#4f8f3a', '#3f7d33', '#69a845'],
    deco: { tree: 0.32, trees: 'mixed', rock: 0.13, bush: 0.2, flower: 0.45, tuft: 5 },
    exposure: 1.0,
    bloom: 0.55,
  },
  autumn: {
    skyTop: '#6d8fc4',
    skyBottom: '#f6d8b8',
    skyDeep: '#b9785a',
    fog: '#e3d4c4',
    sun: '#ffe0b8',
    sunI: 2.5,
    hemiSky: '#ffe9d6',
    hemiGround: '#6b4e2e',
    hemiI: 1.2,
    grass: ['#a8b257', '#8f9e48', '#bdbd62'],
    earth: '#86593a',
    rock: '#857a72',
    stone: '#ece0cf',
    road: '#d9b98a',
    roadEdge: '#b8925e',
    leaves: ['#d8803a', '#c45a2c', '#e6b043'],
    deco: { tree: 0.34, trees: 'mixed', rock: 0.13, bush: 0.2, flower: 0.2, tuft: 4, flowers: ['#ffd84d', '#ff7b54', '#ffffff'] },
    exposure: 1.0,
    bloom: 0.55,
  },
  dusk: {
    skyTop: '#24305e',
    skyBottom: '#e49a7b',
    skyDeep: '#3b2c5e',
    fog: '#8a7895',
    sun: '#ffc9a3',
    sunI: 2.2,
    hemiSky: '#b8b6ff',
    hemiGround: '#3c3248',
    hemiI: 1.15,
    grass: ['#5f9a6b', '#4e8660', '#73ad78'],
    earth: '#6b4f4a',
    rock: '#6c6878',
    stone: '#e4dde4',
    road: '#d8c2a6',
    roadEdge: '#ab9077',
    leaves: ['#3f7f6a', '#2f6c5e', '#5b9a6e'],
    deco: { tree: 0.3, trees: 'mixed', rock: 0.13, bush: 0.2, flower: 0.35, tuft: 4 },
    exposure: 1.05,
    bloom: 0.8,
  },
  desert: {
    skyTop: '#4f8fd0',
    skyBottom: '#f7dcb0',
    skyDeep: '#c58d5a',
    fog: '#e8cfa4',
    sun: '#fff0d0',
    sunI: 2.8,
    hemiSky: '#fff2dc',
    hemiGround: '#8a6a40',
    hemiI: 1.25,
    grass: ['#e2c58e', '#d4b47a', '#ecd3a0'],
    earth: '#b07a48',
    rock: '#c59a6a',
    stone: '#f3e9d8',
    road: '#c9a476',
    roadEdge: '#a8814f',
    leaves: ['#6f9a4a', '#5c8a3e', '#86ad58'],
    cloud: '#fff4e6',
    deco: { tree: 0.1, trees: 'cactus', rock: 0.22, bush: 0.05, flower: 0.06, tuft: 1, flowers: ['#ff6f61', '#ffd166'] },
    exposure: 0.95,
    bloom: 0.5,
  },
  snow: {
    skyTop: '#7fa6cf',
    skyBottom: '#e8eff6',
    skyDeep: '#8fa8c6',
    fog: '#dfe7ef',
    sun: '#ffffff',
    sunI: 2.3,
    hemiSky: '#eef6ff',
    hemiGround: '#8a98a8',
    hemiI: 1.3,
    grass: ['#eef3f8', '#dfe8f1', '#f7fafc'],
    earth: '#6f7684',
    rock: '#8a93a0',
    stone: '#c9d2dc',
    road: '#aebccb',
    roadEdge: '#8c9cad',
    leaves: ['#3f6b5a', '#2f5a4c', '#4f7d6a'],
    deco: { tree: 0.3, trees: 'snow', rock: 0.12, bush: 0.03, flower: 0, tuft: 1 },
    exposure: 0.92,
    bloom: 0.5,
  },
  volcano: {
    skyTop: '#3a2230',
    skyBottom: '#c4583a',
    skyDeep: '#2a1418',
    fog: '#5a2a24',
    sun: '#ffb080',
    sunI: 2.2,
    hemiSky: '#ffb89a',
    hemiGround: '#2a1a18',
    hemiI: 1.0,
    grass: ['#4a3c3a', '#3c302e', '#5a4844'],
    earth: '#3a2a26',
    rock: '#2e2a2c',
    stone: '#d6cbc2',
    road: '#8a6e5e',
    roadEdge: '#5e4a40',
    leaves: ['#2a2422', '#3a302c', '#4a3a32'],
    deco: { tree: 0.12, trees: 'dead', rock: 0.3, bush: 0, flower: 0, tuft: 0.6, lava: 0.2 },
    cloud: '#6a3a32',
    exposure: 1.05,
    bloom: 0.9,
  },
  night: {
    skyTop: '#0c1230',
    skyBottom: '#3a3270',
    skyDeep: '#120e2a',
    fog: '#1c1840',
    sun: '#b8c8ff',
    sunI: 1.5,
    hemiSky: '#8a9aff',
    hemiGround: '#1a1830',
    hemiI: 0.95,
    grass: ['#2f5a5a', '#284c50', '#3a6a66'],
    earth: '#2a2440',
    rock: '#4a4a66',
    stone: '#cdd2e6',
    road: '#958fb0',
    roadEdge: '#6a6688',
    leaves: ['#1f4a4a', '#2a5a56', '#16403f'],
    deco: { tree: 0.2, trees: 'mixed', rock: 0.1, bush: 0.12, flower: 0.2, flowers: ['#9ad8ff', '#c9a4ff'], tuft: 3, crystal: 0.14 },
    stars: 1,
    cloud: '#34306a',
    exposure: 1.15,
    bloom: 1.0,
  },
};

function skyMaterial(theme) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(theme.skyTop) },
      bottom: { value: new THREE.Color(theme.skyBottom) },
      deep: { value: new THREE.Color(theme.skyDeep) },
      stars: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, bottom, deep;
      uniform float stars;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      varying vec3 vDir;
      void main() {
        float y = normalize(vDir).y;
        // über dem Horizont zum Zenit, darunter in die Tiefe unter den schwebenden Inseln
        vec3 col = y > 0.0 ? mix(bottom, top, smoothstep(0.0, 0.7, y)) : mix(bottom, deep, smoothstep(0.0, 0.55, -y));
        if (stars > 0.0) {
          vec3 d = normalize(vDir) * 700.0;
          vec3 cell = floor(d);
          float h = hash(cell);
          // runde, kleine Sterne mit weichem Rand
          float r = length(fract(d) - 0.5);
          col += vec3(0.85, 0.92, 1.0) * step(0.9992, h) * (1.0 - smoothstep(0.1, 0.5, r)) * stars * (0.6 + 0.4 * hash(cell + 3.0)) * step(-0.05, d.y);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function cloudTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const g = cv.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const x = 40 + Math.random() * 176;
    const y = 50 + Math.random() * 40 - Math.abs(x - 128) * 0.15;
    const r = 18 + Math.random() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Stage {
  constructor(container, settings) {
    this.container = container;
    this.settings = settings;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.quality === 'low' ? 1 : 2));
    renderer.shadowMap.enabled = settings.quality !== 'low';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.8, 400);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMaterial(THEMES.meadow));
    this.scene.add(this.sky);

    this.clouds = new THREE.Group();
    this.scene.add(this.clouds);
    const ctex = cloudTexture();
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex, transparent: true, depthWrite: false, opacity: 0.55, fog: false }));
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
      const r = 24 + Math.random() * 22;
      m.position.set(Math.cos(a) * r, -10 - Math.random() * 8, Math.sin(a) * r);
      const s = 12 + Math.random() * 12;
      m.scale.set(s, s * 0.5, 1);
      m.userData.speed = 0.08 + Math.random() * 0.15;
      this.clouds.add(m);
    }

    const controls = (this.controls = new OrbitControls(this.camera, renderer.domElement));
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = false;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = 1.1;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.zoomToCursor = true;

    // Mehrfach abgetasteter HDR-Puffer: glatte Kanten trotz Nachbearbeitung
    const rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 1.25);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.shake = 0;
    this.bounds = { w: 10, h: 10 };
    this.listeners = [];
    this.resize();
    // Größe wird zusätzlich jedes Bild geprüft (checkSize): eingebettete Ansichten melden Größenänderungen
    // nicht immer per resize-Ereignis
    window.addEventListener('resize', () => this.checkSize());
    if (window.ResizeObserver) new ResizeObserver(() => this.checkSize()).observe(container);
  }

  applyTheme(name) {
    const t = (this.theme = THEMES[name] || THEMES.meadow);
    this.sky.material.uniforms.top.value.set(t.skyTop);
    this.sky.material.uniforms.bottom.value.set(t.skyBottom);
    this.sky.material.uniforms.deep.value.set(t.skyDeep);
    this.sky.material.uniforms.stars.value = t.stars || 0;
    for (const c of this.clouds.children) {
      c.material.opacity = t.stars ? 0.1 : 0.55;
      c.material.color.set(t.cloud || '#ffffff');
    }
    this.scene.fog = new THREE.Fog(t.skyDeep, 70, 190);
    this.hemi.color.set(t.hemiSky);
    this.hemi.groundColor.set(t.hemiGround);
    this.hemi.intensity = t.hemiI;
    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunI;
    this.renderer.toneMappingExposure = t.exposure;
    this.bloom.strength = t.bloom;
    return t;
  }

  // Kamera und Schatten auf eine Karte der Größe w×h ausrichten
  frame(w, h) {
    this.bounds = { w, h };
    const s = this.sun.shadow.camera;
    const r = Math.max(w, h) * 0.75 + 2;
    s.left = -r;
    s.right = r;
    s.top = r;
    s.bottom = -r;
    s.near = 1;
    s.far = 80;
    s.updateProjectionMatrix();
    this.sun.position.set(-r * 0.9, r * 1.6, r * 0.7);
    this.sun.target.position.set(0, 0, 0);
    this.resetView();
  }

  resetView() {
    const { w, h } = this.bounds;
    const aspect = this.camera.aspect;
    // Im Hochformat die lange Kartenseite senkrecht legen
    const rotate = aspect < 0.9 && w > h;
    const bw = rotate ? h : w;
    const bh = rotate ? w : h;
    const fov = (this.camera.fov * Math.PI) / 180;
    const needH = bh * 1.08 + 1.5;
    const needW = (bw + 1.2) / aspect;
    const dist = (Math.max(needH, needW) / 2 / Math.tan(fov / 2)) * (rotate ? 1.0 : 1.1);
    const polar = rotate ? 0.62 : 0.72;
    const az = rotate ? Math.PI / 2 : 0;
    const c = this.controls;
    c.target.set(rotate ? 0.4 : 0, 0, rotate ? 0 : 0.4);
    const r = Math.sin(polar) * dist;
    this.camera.position.set(c.target.x + Math.sin(az) * r, Math.cos(polar) * dist, c.target.z + Math.cos(az) * r);
    c.minDistance = 5;
    c.maxDistance = dist * 1.6;
    c.minAzimuthAngle = az - 0.8;
    c.maxAzimuthAngle = az + 0.8;
    c.update();
    if (this.scene.fog) {
      this.scene.fog.near = dist * 1.6;
      this.scene.fog.far = dist * 4.5;
    }
  }

  onResize(fn) {
    this.listeners.push(fn);
  }

  viewSize() {
    return [this.container.clientWidth || window.innerWidth, this.container.clientHeight || window.innerHeight, window.devicePixelRatio || 1];
  }

  checkSize() {
    const [w, h, dpr] = this.viewSize();
    if (w !== this.width || h !== this.height || dpr !== this.dpr) this.resize();
  }

  resize() {
    const wasPortrait = this.camera.aspect < 0.9;
    const [w, h, dpr] = this.viewSize();
    this.dpr = dpr;
    const pr = Math.min(dpr, this.settings.quality === 'low' ? 1 : 2);
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w;
    this.height = h;
    if (wasPortrait !== this.camera.aspect < 0.9 && this.bounds) this.resetView();
    for (const fn of this.listeners || []) fn(w, h);
  }

  setQuality(q) {
    this.settings.quality = q;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.scene.traverse((o) => o.material && (o.material.needsUpdate = true));
    this.resize();
  }

  update(dt) {
    // Ziel innerhalb der Karte halten
    const t = this.controls.target;
    const { w, h } = this.bounds;
    t.x = Math.max(-w / 2, Math.min(w / 2, t.x));
    t.z = Math.max(-h / 2, Math.min(h / 2, t.z));
    t.y = 0;
    this.controls.update();
    for (const c of this.clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 40) c.position.x = -40;
    }
  }

  render(dt) {
    this.checkSize();
    let ox = 0;
    let oy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * this.shake * 0.25;
      ox = (Math.random() - 0.5) * s;
      oy = (Math.random() - 0.5) * s;
      this.camera.position.x += ox;
      this.camera.position.y += oy;
    }
    if (this.settings.quality === 'low') this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
    this.camera.position.x -= ox;
    this.camera.position.y -= oy;
  }
}
