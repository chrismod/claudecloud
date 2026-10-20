// Renderer, Himmel mit Wolken, Licht, Umgebungslicht und Nebel
import * as THREE from 'three';

// Sonne seitlich hinter der Kamera: Schatten fallen schräg nach vorn und zeigen jede Bodenwelle
export const SUN_DIR = new THREE.Vector3(-0.55, 0.62, -0.3).normalize();
const HORIZON = new THREE.Color('#d6e0dc');
const ZENITH = new THREE.Color('#4f8cc9');

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      horizon: { value: HORIZON },
      zenith: { value: ZENITH },
      sun: { value: SUN_DIR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 horizon, zenith, sun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(horizon, zenith, pow(h, 0.5));
        // warmer Dunst zur Sonne hin, unter dem Horizont grünlich (Landschaft im Dunst)
        float s = max(dot(d, sun), 0.0);
        col = mix(col, vec3(1.0, 0.93, 0.8), pow(s, 6.0) * 0.25 * (1.0 - h));
        col += vec3(1.0, 0.95, 0.85) * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.12);
        if (d.y < 0.0) col = mix(horizon, vec3(0.55, 0.62, 0.5), clamp(-d.y * 4.0, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function cloudTexture() {
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n / 2;
  const g = cv.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = n * 0.18 + Math.random() * n * 0.64;
    const y = n * 0.22 + Math.random() * n * 0.12 - (Math.abs(x - n / 2) / n) * 20;
    const r = 18 + Math.random() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const shade = 235 + Math.random() * 20;
    grad.addColorStop(0, `rgba(${shade},${shade},${shade + 5},0.9)`);
    grad.addColorStop(0.6, `rgba(${shade - 10},${shade - 8},${shade},0.5)`);
    grad.addColorStop(1, 'rgba(220,225,235,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Unterseite etwas grauer
  const fade = g.createLinearGradient(0, 0, 0, n / 2);
  fade.addColorStop(0.5, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(120,130,150,0.25)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = fade;
  g.fillRect(0, 0, n, n / 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createScene(container, { quality = 1 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality < 1 ? 1.5 : 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON.clone(), 90, 650);

  const camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.1, 2500);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMaterial());
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // Umgebungslicht aus dem Himmel (für Käse, Felsen und Ballen)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMaterial()));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: '#4d6b2c', side: THREE.DoubleSide }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  envScene.add(ground);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.55;

  // Wolken: große Billboards weit oben
  const cloudTex = cloudTexture();
  const clouds = new THREE.Group();
  for (let i = 0; i < 34; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true, opacity: 0.75 + Math.random() * 0.25 }));
    const a = Math.random() * Math.PI * 2;
    const d = 350 + Math.random() * 900;
    m.position.set(Math.cos(a) * d, 140 + Math.random() * 160, Math.sin(a) * d + 300);
    const sc = 160 + Math.random() * 220;
    m.scale.set(sc, sc / 2, 1);
    clouds.add(m);
  }
  scene.add(clouds);

  const hemi = new THREE.HemisphereLight('#dbe9fb', '#51602e', 1.0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff0d6', 2.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality < 1 ? 1024 : 2048, quality < 1 ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -45;
  sc.right = 45;
  sc.top = 45;
  sc.bottom = -45;
  sc.near = 1;
  sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  // Schattenbereich folgt dem Käse, leicht nach vorn versetzt (dort schaut die Kamera hin)
  const ahead = new THREE.Vector3();
  const followSun = (target, dir) => {
    ahead.copy(target);
    if (dir) ahead.addScaledVector(dir, 15);
    sun.target.position.copy(ahead);
    sun.position.copy(ahead).addScaledVector(SUN_DIR, 120);
    sky.position.copy(camera.position);
    clouds.position.set(camera.position.x * 0.9, 0, camera.position.z * 0.9);
  };

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, sun, followSun, resize };
}
