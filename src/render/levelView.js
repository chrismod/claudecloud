// Szenenobjekte eines Levels: Plattformen, Cocktailspieße, Martiniglas, Olive.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { glassGeometry, OLIVE_RADIUS } from '../physics/world.js';
import { BOARD_Z } from './stage.js';

const PLATFORM_DEPTH = 1.6;
const PICK_COLORS = ['#d8322f', '#2a9d8f', '#f2b134', '#7b4bb3'];

export class LevelView {
  constructor(scene, level, textures) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.disposables = [];
    this.time = 0;

    for (const s of level.statics || []) if (s.type === 'box') this._platform(s, textures);
    this.picks = (level.anchors || []).map((a, i) => this._pick(a, i));
    if (level.glass) this._glass(level.glass);
    this._olive(textures);
  }

  _track(...objs) {
    this.disposables.push(...objs);
    return objs[0];
  }

  _platform(s, textures) {
    const geo = this._track(new RoundedBoxGeometry(s.w, s.h, PLATFORM_DEPTH, 3, 0.14));
    const look = s.look || 'bread';
    const base = look === 'cheese' ? textures.cheese : look === 'board' ? textures.wood : textures.bread;
    const map = this._track(base.clone());
    map.needsUpdate = true;
    const tile = look === 'cheese' ? 2.2 : 3;
    map.repeat.set(Math.max(1, s.w / tile), Math.max(1, s.h / tile));
    const mat = this._track(
      new THREE.MeshStandardMaterial({
        map,
        bumpMap: map,
        bumpScale: look === 'bread' ? 3 : look === 'board' ? 0.6 : 4,
        roughness: look === 'cheese' ? 0.55 : 0.85,
        color: look === 'board' ? new THREE.Color('#9a6a44') : new THREE.Color('#ffffff'),
      }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(s.x, s.y, 0);
    mesh.rotation.z = s.angle || 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _pick(a, i) {
    const g = new THREE.Group();
    g.position.set(a.x, a.y, 0);
    const len = 0.75 - BOARD_Z;
    const stickGeo = this._track(new THREE.CylinderGeometry(0.028, 0.034, len, 10));
    const stick = new THREE.Mesh(stickGeo, this._track(new THREE.MeshStandardMaterial({ color: '#d9b98a', roughness: 0.7 })));
    stick.rotation.x = Math.PI / 2;
    stick.position.z = BOARD_Z + len / 2;
    stick.castShadow = true;
    const headGeo = this._track(new THREE.SphereGeometry(0.1, 20, 14));
    const head = new THREE.Mesh(
      headGeo,
      this._track(
        new THREE.MeshPhysicalMaterial({ color: PICK_COLORS[i % PICK_COLORS.length], roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
      ),
    );
    head.position.z = 0.78;
    head.castShadow = true;
    const ringMat = this._track(
      new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false }),
    );
    const ring = new THREE.Mesh(this._track(new THREE.TorusGeometry(0.3, 0.025, 8, 40)), ringMat);
    ring.position.z = 0.02;
    g.add(stick, head, ring);
    this.group.add(g);
    return { group: g, ring, head, highlight: 0, target: 0 };
  }

  _glass(def) {
    const G = glassGeometry(def);
    const g = new THREE.Group();
    g.position.set(G.x, G.rimY, 0);
    const glassMat = this._track(
      new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        transmission: 1,
        thickness: 0.05,
        roughness: 0.04,
        ior: 1.5,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: true,
        envMapIntensity: 1.4,
      }),
    );
    const bowlPts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      bowlPts.push(new THREE.Vector2(0.05 + (G.halfWidth - 0.05) * t, -G.depth + G.depth * t + Math.sin(t * Math.PI) * 0.02));
    }
    const bowl = new THREE.Mesh(this._track(new THREE.LatheGeometry(bowlPts, 64)), glassMat);
    const stem = new THREE.Mesh(this._track(new THREE.CylinderGeometry(0.045, 0.06, G.stem, 16)), glassMat);
    stem.position.y = -G.depth - G.stem / 2;
    const base = new THREE.Mesh(this._track(new THREE.CylinderGeometry(G.baseHalf, G.baseHalf * 1.02, 0.05, 48)), glassMat);
    base.position.y = -G.depth - G.stem;
    const rimMat = this._track(new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.55 }));
    const rimRing = new THREE.Mesh(this._track(new THREE.TorusGeometry(G.halfWidth, 0.014, 8, 80)), rimMat);
    rimRing.rotation.x = Math.PI / 2;

    // Martini im Glas
    const liquidY = -G.depth * 0.42;
    const liquidR = (G.halfWidth - 0.05) * (1 - 0.42) + 0.04;
    const liquidPts = [new THREE.Vector2(0, -G.depth + 0.03), new THREE.Vector2(0.06, -G.depth + 0.04), new THREE.Vector2(liquidR, liquidY), new THREE.Vector2(0, liquidY)];
    const liquid = new THREE.Mesh(
      this._track(new THREE.LatheGeometry(liquidPts, 48)),
      this._track(
        new THREE.MeshPhysicalMaterial({ color: '#f1f6d2', transmission: 0.85, roughness: 0.05, thickness: 0.4, ior: 1.33, transparent: true, opacity: 0.9 }),
      ),
    );
    g.add(bowl, stem, base, rimRing, liquid);
    for (const m of [stem, base]) m.castShadow = true;
    this.group.add(g);
    this.glass = { group: g, G };
  }

  _olive(textures) {
    const r = OLIVE_RADIUS;
    const g = new THREE.Group();
    const skin = this._track(
      new THREE.MeshPhysicalMaterial({
        map: textures.olive,
        roughness: 0.32,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        sheen: 0.3,
        sheenColor: new THREE.Color('#c8d88a'),
        emissive: new THREE.Color('#fff2b0'),
        emissiveIntensity: 0,
      }),
    );
    const body = new THREE.Mesh(this._track(new THREE.SphereGeometry(r, 48, 32)), skin);
    body.scale.z = 1.3;
    body.castShadow = true;
    // Paprikafüllung an der Stirnseite
    const pimento = new THREE.Mesh(
      this._track(new THREE.SphereGeometry(r * 0.42, 24, 16)),
      this._track(new THREE.MeshPhysicalMaterial({ color: '#d42a24', roughness: 0.45, clearcoat: 0.6 })),
    );
    pimento.scale.set(1, 1, 0.45);
    pimento.position.z = r * 1.3 * 0.93;
    const rim = new THREE.Mesh(
      this._track(new THREE.TorusGeometry(r * 0.42, r * 0.06, 8, 32)),
      this._track(new THREE.MeshStandardMaterial({ color: '#33461a', roughness: 0.6 })),
    );
    rim.position.z = r * 1.3 * 0.9;
    g.add(body, pimento, rim);
    this.group.add(g);
    this.olive = { group: g, skin, glow: 0 };
  }

  // hover: Anker unter dem Zeiger; target: mögliches Ziel beim Ziehen; oliveTarget: Olive als Ziel
  update(world, dt, { hover = null, target = null, oliveTarget = false } = {}) {
    this.time += dt;
    const o = world.olive;
    const og = this.olive.group;
    og.visible = o.state !== 'lost' || o.y > world.killY;
    og.position.set(o.x, o.y, 0);
    og.rotation.z = o.angle;
    this.olive.glow += ((oliveTarget ? 1 : 0) - this.olive.glow) * Math.min(1, dt * 12);
    this.olive.skin.emissiveIntensity = this.olive.glow * (0.25 + 0.1 * Math.sin(this.time * 10));

    for (let i = 0; i < this.picks.length; i++) {
      const pk = this.picks[i];
      const a = world.anchors[i];
      const want = a === target ? 1 : a === hover ? 0.7 : 0;
      pk.highlight += (want - pk.highlight) * Math.min(1, dt * 14);
      pk.ring.material.opacity = pk.highlight * 0.85;
      const s = 1 + pk.highlight * (0.12 + 0.08 * Math.sin(this.time * 8));
      pk.ring.scale.setScalar(s);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const d of this.disposables) d.dispose?.();
  }
}
