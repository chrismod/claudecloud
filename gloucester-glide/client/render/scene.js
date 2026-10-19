// Renderer, Himmel, Licht und Nebel
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
const HORIZON = new THREE.Color('#cfdcd8');
const ZENITH = new THREE.Color('#5d93c9');

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON.clone(), 60, 420);

  const camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.1, 1500);

  // Himmelskuppel mit Verlauf und Sonne
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 32, 16),
    new THREE.ShaderMaterial({
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
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, zenith, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sun), 0.0);
          col += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.18);
          // dezente Wolkenbänder
          float c = sin(vDir.x * 9.0 + vDir.z * 3.0) * sin(vDir.z * 7.0 - vDir.x * 2.0);
          col = mix(col, vec3(1.0), smoothstep(0.55, 0.95, c) * smoothstep(0.05, 0.3, h) * 0.35);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight('#dfeefc', '#4d5e2c', 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff3dc', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -40;
  sc.right = 40;
  sc.top = 40;
  sc.bottom = -40;
  sc.near = 1;
  sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // Schattenbereich folgt dem Käse
  const followSun = (target) => {
    sun.target.position.copy(target);
    sun.position.copy(target).addScaledVector(SUN_DIR, 100);
    sky.position.copy(camera.position);
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
