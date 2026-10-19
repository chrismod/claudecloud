// Renderer, Kamera, Licht und Hintergrund (Schneidebrett).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { woodTexture } from './textures.js';

// Sichtbarer Weltausschnitt – oben und unten mit etwas Luft für die Bedienelemente
const VIEW = { minX: -10.2, maxX: 10.2, minY: -6.7, maxY: 6.5 };
export const BOARD_Z = -1.0;

export class Stage {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#24160d');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(28, 1, 1, 200);
    this.center = new THREE.Vector3((VIEW.minX + VIEW.maxX) / 2, (VIEW.minY + VIEW.maxY) / 2, 0);
    this.parallax = new THREE.Vector2();
    this.parallaxTarget = new THREE.Vector2();
    this.shake = 0;

    scene.add(new THREE.HemisphereLight('#fff3e0', '#4a2c18', 0.9));
    const key = new THREE.DirectionalLight('#fff0dc', 2.4);
    key.position.set(-7, 11, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 11;
    sc.bottom = -11;
    sc.near = 1;
    sc.far = 50;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#ffc98f', 0.9);
    rim.position.set(9, 4, 6);
    scene.add(rim);

    const wood = woodTexture();
    wood.repeat.set(3.2, 2.4);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 40),
      new THREE.MeshStandardMaterial({ map: wood, roughness: 0.78, metalness: 0 }),
    );
    board.position.z = BOARD_Z;
    board.receiveShadow = true;
    scene.add(board);

    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._ndc = new THREE.Vector2();
    this._hit = new THREE.Vector3();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const halfW = (VIEW.maxX - VIEW.minX) / 2;
    const halfH = (VIEW.maxY - VIEW.minY) / 2;
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.distance = Math.max(halfH / t, halfW / (t * this.camera.aspect));
    this.camera.updateProjectionMatrix();
    this._placeCamera();
  }

  // Wie viele Welteinheiten einem CSS-Pixel entsprechen
  worldPerPixel() {
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const h = this.container.clientHeight || window.innerHeight;
    return (2 * this.distance * t) / h;
  }

  setParallax(nx, ny) {
    this.parallaxTarget.set(nx, ny);
  }

  addShake(amount) {
    this.shake = Math.min(0.25, this.shake + amount);
  }

  _placeCamera() {
    const c = this.camera;
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    c.position.set(this.center.x + this.parallax.x * 0.35 + sx, this.center.y + this.parallax.y * 0.25 + sy, this.distance);
    c.lookAt(this.center.x + sx * 0.5, this.center.y + sy * 0.5, 0);
    c.updateMatrixWorld();
  }

  // Bildschirmkoordinaten → Weltkoordinaten in der Spielebene z = 0
  toWorld(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.plane, this._hit)) return null;
    return { x: this._hit.x, y: this._hit.y };
  }

  // Weltkoordinaten → Bildschirmkoordinaten (CSS-Pixel)
  toScreen(x, y, z = 0) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  render(dt) {
    this.parallax.lerp(this.parallaxTarget, 1 - Math.exp(-dt * 3));
    this.shake *= Math.exp(-dt * 10);
    if (this.shake < 0.002) this.shake = 0;
    this._placeCamera();
    this.renderer.render(this.scene, this.camera);
  }
}
