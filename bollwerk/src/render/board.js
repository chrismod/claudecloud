// Spielbrett als schwebende Insel: Wiese, Plattformen, Weg mit Fließpfeilen, Deko, Portale, Kern.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE_BONUS } from '../game/data.js';
import { makeRng, hashString } from '../game/rng.js';

export const PLATFORM_H = 0.3;
export const RAISED_H = 0.55;
const ROAD_Y = 0.02;

export function tileTop(tile) {
  if (tile === 'R') return RAISED_H;
  if ('#DXC'.includes(tile)) return PLATFORM_H;
  return 0;
}

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Band entlang einer Polylinie (x/z), u = Reststrecke bis zum Ziel
function ribbon(points, width, y, extendStart = 0) {
  const pts = points.map((p) => new THREE.Vector2(p.x, p.y));
  if (extendStart) {
    const d = pts[0].clone().sub(pts[1]).normalize();
    pts.unshift(pts[0].clone().addScaledVector(d, extendStart));
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1];
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dir = next.clone().sub(prev).normalize();
    const n = new THREE.Vector2(-dir.y, dir.x);
    // Gehrung an Knicken
    let scale = 1;
    if (i > 0 && i < pts.length - 1) {
      const d1 = pts[i].clone().sub(prev).normalize();
      const d2 = next.clone().sub(pts[i]).normalize();
      const c = Math.max(0.5, (1 + d1.dot(d2)) / 2);
      scale = 1 / Math.sqrt(c);
    }
    const hw = (width / 2) * scale;
    pos.push(pts[i].x + n.x * hw, y, pts[i].y + n.y * hw, pts[i].x - n.x * hw, y, pts[i].y - n.y * hw);
    const u = total - cum[i];
    uv.push(u, 1, u, 0);
    if (i < pts.length - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Kopfsteinpflaster (Graustufen, wird mit der Wegfarbe eingefärbt). u: 1 Feld, v: Wegbreite
function cobbleTexture() {
  const t = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#9a9488';
    g.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y0 = (r / rows) * h;
      const rh = h / rows;
      let x = r % 2 ? -rh * 0.5 : 0;
      while (x < w) {
        const sw = rh * (0.8 + rnd() * 0.6);
        const l = 205 + rnd() * 45;
        g.fillStyle = `rgb(${l},${l - 4},${l - 10})`;
        g.beginPath();
        g.roundRect(x + 2.5, y0 + 2.5, sw - 5, rh - 5, 9);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.16)';
        g.beginPath();
        g.roundRect(x + 5, y0 + 4, sw - 12, (rh - 8) * 0.45, 6);
        g.fill();
        // Kacheln über den Rand fortsetzen, damit die Textur nahtlos wiederholt
        if (x + sw > w) {
          g.fillStyle = `rgb(${l},${l - 4},${l - 10})`;
          g.beginPath();
          g.roundRect(x - w + 2.5, y0 + 2.5, sw - 5, rh - 5, 9);
          g.fill();
        }
        x += sw;
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Steinplatte mit eingelassenem Rand und feiner Körnung
function slabTexture() {
  return canvasTexture(256, 256, (g, w) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, w);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1800; i++) {
      const l = 225 + rnd() * 30;
      g.fillStyle = `rgba(${l},${l},${l - 6},0.5)`;
      g.fillRect(rnd() * w, rnd() * w, 2, 2);
    }
    g.strokeStyle = 'rgba(120,110,100,0.35)';
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(26, 26, w - 52, w - 52, 18);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(29, 29, w - 58, w - 58, 16);
    g.stroke();
  });
}

// Wind: wiegt Gras und Baumkronen, Stärke nach Höhe im Modell
function swayMaterial(mat, wind, amount, from = 0) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float h = max(0.0, position.y - ${from.toFixed(2)});
          float sw = sin(uWind * 1.6 + ip.x * 0.7 + ip.z * 0.5) + 0.5 * sin(uWind * 2.9 + ip.x * 1.3);
          transformed.x += sw * h * ${amount.toFixed(3)};
          transformed.z += cos(uWind * 1.3 + ip.z * 0.9) * h * ${(amount * 0.5).toFixed(3)};
        }`,
      );
  };
  return mat;
}

function chevronTexture() {
  const t = canvasTexture(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // Spitze zeigt Richtung kleinerer u-Werte (zum Kern)
    g.beginPath();
    g.moveTo(80, 12);
    g.lineTo(48, 32);
    g.lineTo(80, 52);
    g.stroke();
  });
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glyphTexture(tile, color) {
  return canvasTexture(128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.globalAlpha = 0.9;
    const c = w / 2;
    g.beginPath();
    g.arc(c, c, 50, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    if (tile === 'D') {
      // Blitz
      g.moveTo(c + 6, c - 34);
      g.lineTo(c - 16, c + 4);
      g.lineTo(c + 2, c + 4);
      g.lineTo(c - 6, c + 34);
      g.lineTo(c + 16, c - 6);
      g.lineTo(c - 2, c - 6);
      g.closePath();
      g.fill();
    } else if (tile === 'R') {
      // Auge / Kreise
      g.arc(c, c, 26, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(c, c, 9, 0, Math.PI * 2);
      g.fill();
    } else if (tile === 'X') {
      // Stern
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? 14 : 32;
        g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    } else if (tile === 'C') {
      // Münze
      g.arc(c, c, 26, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.font = 'bold 34px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('¤', c, c + 2);
      g.globalCompositeOperation = 'source-over';
    }
  });
}

export class Board {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    stage.scene.add(this.group);
    this.time = 0;
    this.flowTex = chevronTexture();
    this.cobbleTex = cobbleTexture();
    this.slabTex = slabTexture();
    this.wind = { value: 0 };
    this.portals = [];
    this.coreFlash = 0;
  }

  // Spielkoordinaten (Feld-Einheiten) → Welt
  wx(x) {
    return x - this.W / 2;
  }
  wz(y) {
    return y - this.H / 2;
  }

  build(game, theme) {
    this.dispose();
    const map = game.map;
    this.map = map;
    this.W = map.W;
    this.H = map.H;
    const rng = makeRng(hashString(map.def.id) ^ 0x51ed);
    const G = new THREE.Group();
    this.group.add(G);
    this.root = G;
    const W = this.W;
    const H = this.H;

    // Insel: Erdschichten, Felsunterseite
    const earth = new THREE.MeshStandardMaterial({ color: theme.earth, roughness: 0.95 });
    const rock = new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 0.9, flatShading: true });
    const slab = new THREE.Mesh(new RoundedBoxGeometry(W + 1, 0.7, H + 1, 2, 0.18), earth);
    slab.position.y = -0.36;
    slab.receiveShadow = true;
    G.add(slab);
    const rocks = [];
    for (let i = 0; i < 26; i++) {
      const h = 1.5 + rng() * 3.5;
      const g = new THREE.ConeGeometry(0.6 + rng() * 1.6, h, 6 + Math.floor(rng() * 3), 1);
      g.rotateX(Math.PI);
      g.translate((rng() - 0.5) * (W - 2), -0.75 - h / 2, (rng() - 0.5) * (H - 2));
      rocks.push(g);
    }
    const under = new THREE.Mesh(mergeGeometries(rocks), rock);
    G.add(under);
    const ledge = new THREE.Mesh(new RoundedBoxGeometry(W + 0.6, 0.6, H + 0.6, 1, 0.2), rock);
    ledge.position.y = -0.9;
    G.add(ledge);

    // Wiese mit Farbflecken
    const seg = 4;
    const grassGeo = new THREE.PlaneGeometry(W + 1, H + 1, (W + 1) * seg, (H + 1) * seg);
    grassGeo.rotateX(-Math.PI / 2);
    const colors = [];
    const ga = new THREE.Color(theme.grass[0]);
    const gb = new THREE.Color(theme.grass[1]);
    const gc = new THREE.Color(theme.grass[2]);
    const p = grassGeo.attributes.position;
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const n = Math.sin(x * 1.3 + Math.sin(z * 0.7) * 2) * 0.5 + Math.sin(z * 1.7 + x * 0.4) * 0.5;
      tmp.copy(ga).lerp(n > 0 ? gc : gb, Math.abs(n) * 0.8);
      tmp.offsetHSL(0, 0, (rng() - 0.5) * 0.03);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    grassGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const grass = new THREE.Mesh(grassGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    grass.position.y = 0.001;
    grass.receiveShadow = true;
    G.add(grass);

    // Weg
    const roadMat = new THREE.MeshStandardMaterial({ color: theme.road, roughness: 0.9, map: this.cobbleTex });
    const edgeMat = new THREE.MeshStandardMaterial({ color: theme.roadEdge, roughness: 0.95 });
    const flowMat = new THREE.MeshBasicMaterial({ map: this.flowTex, transparent: true, opacity: 0.35, depthWrite: false, color: '#ffffff' });
    this.flowMat = flowMat;
    map.paths.forEach((path, i) => {
      const pts = path.pts.map((q) => ({ x: this.wx(q.x), y: this.wz(q.y) }));
      const sp = map.spawns[i];
      const atEdge = sp.x === 0 || sp.y === 0 || sp.x === W - 1 || sp.y === H - 1;
      const ext = atEdge ? 0.5 : 0;
      const edge = new THREE.Mesh(ribbon(pts, 0.94, ROAD_Y, ext), edgeMat);
      edge.receiveShadow = true;
      const road = new THREE.Mesh(ribbon(pts, 0.8, ROAD_Y + 0.004 + i * 0.0005, ext), roadMat);
      road.receiveShadow = true;
      const flow = new THREE.Mesh(ribbon(pts, 0.34, ROAD_Y + 0.01, 0), flowMat);
      flow.renderOrder = 2;
      G.add(edge, road, flow);
    });

    // Plattformen
    const cells = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (map.isBuildable(x, y)) cells.push([x, y, map.tileAt(x, y)]);
    const platGeo = new RoundedBoxGeometry(0.9, 1, 0.9, 2, 0.06);
    platGeo.translate(0, 0.5, 0);
    {
      // Oberseite hell, Seiten dunkler – gibt den Plattformen Kontur
      const n = platGeo.attributes.normal;
      const pos = platGeo.attributes.position;
      const vc = [];
      for (let i = 0; i < n.count; i++) {
        const up = n.getY(i);
        const k = up > 0.6 ? 1 : 0.72 + 0.14 * pos.getY(i);
        vc.push(k, k * 0.98, k * 0.95);
      }
      platGeo.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
    }
    const platMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, vertexColors: true, map: this.slabTex });
    const plats = new THREE.InstancedMesh(platGeo, platMat, cells.length);
    const m4 = new THREE.Matrix4();
    const stone = new THREE.Color(theme.stone);
    cells.forEach(([x, y, t], i) => {
      const h = tileTop(t);
      m4.makeScale(1, h, 1).setPosition(this.wx(x + 0.5), 0, this.wz(y + 0.5));
      plats.setMatrixAt(i, m4);
      tmp.copy(stone).offsetHSL(0, 0, (rng() - 0.5) * 0.05);
      if (t !== '#') tmp.lerp(new THREE.Color(TILE_BONUS[t].color), 0.18);
      plats.setColorAt(i, tmp);
    });
    plats.castShadow = true;
    plats.receiveShadow = true;
    G.add(plats);
    // Sonderfelder: leuchtende Glyphen
    this.glyphs = [];
    for (const [x, y, t] of cells) {
      if (t === '#') continue;
      const mat = new THREE.MeshBasicMaterial({ map: glyphTexture(t, '#ffffff'), color: new THREE.Color(TILE_BONUS[t].color).multiplyScalar(1.6), transparent: true, depthWrite: false, toneMapped: false });
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), mat);
      gm.rotation.x = -Math.PI / 2;
      gm.position.set(this.wx(x + 0.5), tileTop(t) + 0.003, this.wz(y + 0.5));
      G.add(gm);
      this.glyphs.push(gm);
    }

    this.buildDeco(map, theme, rng, G);
    this.buildPortals(map, G);
    this.buildCore(map, G);
    this.buildCursor(G);
  }

  buildDeco(map, theme, rng, G) {
    const trees = [];
    const rocks = [];
    const bushes = [];
    const flowers = [];
    const lava = [];
    const crystals = [];
    const D = { tree: 0.32, trees: 'mixed', rock: 0.13, bush: 0.2, flower: 0.45, tuft: 5, ...theme.deco };
    const free = (x, y) => map.tileAt(x, y) === '.' && !map.road.has(y * map.W + x);
    for (let y = -0; y < map.H; y++) {
      for (let x = 0; x < map.W; x++) {
        if (!free(x, y)) continue;
        const nearRoad = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => map.road.has((y + dy) * map.W + x + dx));
        const r = rng();
        const px = this.wx(x + 0.5) + (rng() - 0.5) * 0.4;
        const pz = this.wz(y + 0.5) + (rng() - 0.5) * 0.4;
        if (D.lava && !nearRoad && rng() < D.lava) {
          lava.push([this.wx(x + 0.5), this.wz(y + 0.5), 0.28 + rng() * 0.16, rng()]);
          continue;
        }
        if (r < D.tree && !nearRoad) trees.push([px, pz, 0.7 + rng() * 0.6, rng()]);
        else if (r < D.tree + D.rock) rocks.push([px, pz, 0.12 + rng() * 0.14, rng()]);
        else if (r < D.tree + D.rock + D.bush) bushes.push([px, pz, 0.12 + rng() * 0.1, rng()]);
        if (D.crystal && rng() < D.crystal) for (let k = 0; k < 3; k++) crystals.push([px + (rng() - 0.5) * 0.3, pz + (rng() - 0.5) * 0.3, 0.06 + rng() * 0.08, rng()]);
        if (rng() < D.flower) for (let k = 0; k < 4; k++) flowers.push([this.wx(x + rng()), this.wz(y + rng()), rng()]);
      }
    }
    // Rand der Insel
    for (let i = 0; i < (map.W + map.H) * 2; i++) {
      const side = Math.floor(rng() * 4);
      const t = rng();
      const x = side < 2 ? (t - 0.5) * map.W : (side === 2 ? -0.5 : 0.5) * (map.W + 0.6);
      const z = side >= 2 ? (t - 0.5) * map.H : (side === 0 ? -0.5 : 0.5) * (map.H + 0.6);
      if (rng() < 0.5) {
        if (rng() < D.bush * 2.5) bushes.push([x, z, 0.1 + rng() * 0.12, rng()]);
        else if (rng() < D.rock * 2) rocks.push([x, z, 0.08 + rng() * 0.1, rng()]);
      } else if (rng() < D.flower * 2) flowers.push([x, z, rng()]);
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    const col = new THREE.Color();
    const leaves = theme.leaves.map((c) => new THREE.Color(c));

    if (trees.length && D.trees === 'cactus') {
      // Kakteen: Stamm mit zwei Armen
      const cyl = (r, h) => new THREE.CapsuleGeometry(r, h, 4, 8);
      const geo = mergeGeometries([cyl(0.07, 0.42).translate(0, 0.28, 0), cyl(0.045, 0.14).translate(0.11, 0.33, 0), new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6).rotateZ(Math.PI / 2).translate(0.06, 0.24, 0), cyl(0.04, 0.12).translate(-0.1, 0.4, 0), new THREE.CylinderGeometry(0.03, 0.03, 0.09, 6).rotateZ(Math.PI / 2).translate(-0.05, 0.32, 0)]);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), trees.length);
      trees.forEach(([x, z, sc, r], i) => {
        q.setFromAxisAngle(v.set(0, 1, 0), r * 6.28);
        m4.compose(v.set(x, 0, z), q, s.setScalar(sc * 1.1));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.copy(leaves[Math.floor(r * 97) % leaves.length]));
      });
      mesh.castShadow = true;
      G.add(mesh);
    } else if (trees.length && D.trees === 'dead') {
      // Verkohlte Bäume: Stamm mit kahlen Ästen
      const br = (len, rz, ry, y) => new THREE.CylinderGeometry(0.012, 0.025, len, 5).translate(0, len / 2, 0).rotateZ(rz).rotateY(ry).translate(0, y, 0);
      const geo = mergeGeometries([new THREE.CylinderGeometry(0.03, 0.065, 0.62, 6).translate(0, 0.31, 0), br(0.24, 0.8, 0, 0.38), br(0.2, -0.9, 0.8, 0.46), br(0.17, 0.7, 2.4, 0.52), br(0.14, -0.6, 3.6, 0.3)]);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#2a2220', roughness: 1, flatShading: true }), trees.length);
      trees.forEach(([x, z, sc, r], i) => {
        q.setFromAxisAngle(v.set(0, 1, 0), r * 6.28);
        m4.compose(v.set(x, 0, z), q, s.setScalar(sc));
        mesh.setMatrixAt(i, m4);
      });
      mesh.castShadow = true;
      G.add(mesh);
    } else if (trees.length) {
      const snow = D.trees === 'snow';
      const trunkGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.3, 6);
      trunkGeo.translate(0, 0.15, 0);
      const crownGeo = mergeGeometries([new THREE.ConeGeometry(0.26, 0.45, 7).translate(0, 0.42, 0), new THREE.ConeGeometry(0.2, 0.38, 7).translate(0, 0.66, 0)]);
      const roundGeo = new THREE.IcosahedronGeometry(0.24, 0).translate(0, 0.5, 0);
      const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#7a5636', roughness: 1 }), trees.length);
      const pines = trees.filter((t) => snow || t[3] < 0.55);
      const rounds = trees.filter((t) => !snow && t[3] >= 0.55);
      const crownMat = swayMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }), this.wind, 0.07, 0.25);
      const pine = new THREE.InstancedMesh(crownGeo, crownMat, Math.max(1, pines.length));
      const round = new THREE.InstancedMesh(roundGeo, crownMat, Math.max(1, rounds.length));
      pine.count = pines.length;
      round.count = rounds.length;
      trees.forEach(([x, z, sc, r], i) => {
        q.setFromAxisAngle(v.set(0, 1, 0), r * 6.28);
        m4.compose(v.set(x, 0, z), q, s.set(sc, sc, sc));
        trunk.setMatrixAt(i, m4);
      });
      const place = (mesh, list) =>
        list.forEach(([x, z, sc, r], i) => {
          q.setFromAxisAngle(v.set(0, 1, 0), r * 6.28);
          m4.compose(v.set(x, 0, z), q, s.set(sc, sc * (0.9 + r * 0.3), sc));
          mesh.setMatrixAt(i, m4);
          mesh.setColorAt(i, col.copy(leaves[Math.floor(r * 97) % leaves.length]).offsetHSL(0, 0, (r - 0.5) * 0.06));
        });
      place(pine, pines);
      place(round, rounds);
      if (snow && pines.length) {
        // Schneehauben auf den Tannen
        const capGeo = mergeGeometries([new THREE.ConeGeometry(0.2, 0.18, 7).translate(0, 0.58, 0), new THREE.ConeGeometry(0.15, 0.16, 7).translate(0, 0.8, 0)]);
        const caps = new THREE.InstancedMesh(capGeo, swayMaterial(new THREE.MeshStandardMaterial({ color: '#f7fbff', roughness: 0.6, flatShading: true }), this.wind, 0.07, 0.25), pines.length);
        pines.forEach(([x, z, sc, r], i) => {
          q.setFromAxisAngle(v.set(0, 1, 0), r * 6.28);
          m4.compose(v.set(x, 0, z), q, s.set(sc * 1.02, sc * (0.9 + r * 0.3), sc * 1.02));
          caps.setMatrixAt(i, m4);
        });
        caps.castShadow = true;
        G.add(caps);
      }
      for (const m of [trunk, pine, round]) {
        m.castShadow = true;
        m.receiveShadow = true;
        G.add(m);
      }
    }
    if (rocks.length) {
      const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 0.9, flatShading: true }), rocks.length);
      rocks.forEach(([x, z, sc, r], i) => {
        q.setFromEuler(new THREE.Euler(r * 3, r * 7, r * 2));
        m4.compose(v.set(x, sc * 0.35, z), q, s.set(sc, sc * 0.7, sc * 0.9));
        mesh.setMatrixAt(i, m4);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      G.add(mesh);
    }
    if (bushes.length) {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), bushes.length);
      bushes.forEach(([x, z, sc, r], i) => {
        m4.compose(v.set(x, sc * 0.5, z), q.identity(), s.set(sc, sc * 0.75, sc));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.copy(leaves[Math.floor(r * 31) % leaves.length]).offsetHSL(0, 0.05, 0.04));
      });
      mesh.castShadow = true;
      G.add(mesh);
    }
    // Grasbüschel auf freien Wiesenfeldern
    {
      const tufts = [];
      for (let y = -1; y <= map.H; y++) {
        for (let x = -1; x <= map.W; x++) {
          const inside = x >= 0 && y >= 0 && x < map.W && y < map.H;
          if (inside && !free(x, y)) continue;
          const n = Math.floor((inside ? D.tuft : D.tuft * 0.4) + rng());
          for (let k = 0; k < n; k++) {
            const px = this.wx(x + rng());
            const pz = this.wz(y + rng());
            if (Math.abs(px) > map.W / 2 + 0.45 || Math.abs(pz) > map.H / 2 + 0.45) continue;
            tufts.push([px, pz, 0.6 + rng() * 0.7, rng()]);
          }
        }
      }
      // Halm aus Vorder- und Rückseite, beide mit Normale nach oben (wirkt wie weich beleuchtetes Gras)
      const blade = (a) => {
        const g = new THREE.BufferGeometry();
        const c = Math.cos(a) * 0.035;
        const s2 = Math.sin(a) * 0.035;
        const A = [-c, 0, -s2];
        const B = [c, 0, s2];
        const C = [c * 0.2 + s2 * 0.6, 0.22, s2 * 0.2 - c * 0.6];
        g.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...C, ...B, ...A, ...C], 3));
        const lo = [0.78, 0.82, 0.7];
        const hi = [1.25, 1.25, 1.05];
        g.setAttribute('color', new THREE.Float32BufferAttribute([...lo, ...lo, ...hi, ...lo, ...lo, ...hi], 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(Array(6).fill([0, 1, 0]).flat(), 3));
        return g;
      };
      const tuftGeo = mergeGeometries([blade(0), blade(2.1), blade(4.2), blade(1).translate(0.04, 0, 0.03)]);
      const tuftMat = swayMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1 }), this.wind, 0.35);
      const mesh = new THREE.InstancedMesh(tuftGeo, tuftMat, Math.max(1, tufts.length));
      mesh.count = tufts.length;
      tufts.forEach(([x, z, sc, r], i) => {
        q.setFromAxisAngle(v.set(0, 1, 0), r * 6.28);
        m4.compose(v.set(x, 0, z), q, s.set(sc, sc * (0.8 + r * 0.5), sc));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.set(theme.grass[Math.floor(r * 30) % 3]).offsetHSL(0, 0.06, 0.02 + r * 0.05));
      });
      mesh.receiveShadow = true;
      G.add(mesh);
    }

    if (flowers.length) {
      const palette = (D.flowers || ['#ffffff', '#ffd84d', '#ff8fb1', '#b89cff', '#ff7b54']).map((c) => new THREE.Color(c));
      const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), flowers.length);
      flowers.forEach(([x, z, r], i) => {
        m4.makeTranslation(x, 0.04, z);
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, palette[Math.floor(r * 50) % palette.length]);
      });
      G.add(mesh);
    }
    this.buildGlow(lava, crystals, G);
  }

  // Lavapfützen und Leuchtkristalle (Vulkan, Sternennacht)
  buildGlow(lava, crystals, G) {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    this.lavaMat = null;
    if (lava.length) {
      const rim = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1a1414', roughness: 1, flatShading: true }), lava.length);
      this.lavaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4a10') });
      const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), this.lavaMat, lava.length);
      lava.forEach(([x, z, r, k], i) => {
        q.setFromAxisAngle(v.set(0, 1, 0), k * 6.28);
        m4.compose(v.set(x, 0.006, z), q, s.set(r * 1.25, 1, r * 1.1));
        rim.setMatrixAt(i, m4);
        m4.compose(v.set(x, 0.012, z), q, s.set(r, 1, r * 0.85));
        pool.setMatrixAt(i, m4);
      });
      rim.receiveShadow = true;
      G.add(rim, pool);
      this.lavaSpots = lava;
    }
    if (crystals.length) {
      const mat = new THREE.MeshStandardMaterial({ color: '#bfe6ff', emissive: '#7a6cff', emissiveIntensity: 1.6, roughness: 0.15, flatShading: true });
      const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), mat, crystals.length);
      const c = new THREE.Color();
      crystals.forEach(([x, z, sc, k], i) => {
        q.setFromEuler(new THREE.Euler((k - 0.5) * 0.6, k * 6, (k - 0.5) * 0.5));
        m4.compose(v.set(x, sc * 1.2, z), q, s.set(sc * 0.6, sc * 2.2, sc * 0.6));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, c.set(k < 0.5 ? '#9ad8ff' : '#d4b4ff'));
      });
      mesh.castShadow = true;
      G.add(mesh);
    }
  }

  buildPortals(map, G) {
    this.portals = [];
    const ringMat = new THREE.MeshStandardMaterial({ color: '#2c2440', emissive: '#b67cff', emissiveIntensity: 2.2, roughness: 0.4 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#4a4258', roughness: 0.7 });
    map.spawns.forEach((sp, i) => {
      const path = map.paths[i];
      const a = path.pts[0];
      const b = path.pts[1];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const g = new THREE.Group();
      g.position.set(this.wx(sp.x + 0.5), 0, this.wz(sp.y + 0.5));
      g.rotation.y = -ang;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 10, 40), ringMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.y = 0.48;
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.37, 40),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          uniforms: { time: { value: 0 } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: /* glsl */ `
            uniform float time; varying vec2 vUv;
            void main(){
              vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
              float swirl = sin(a * 3.0 + r * 9.0 - time * 3.0) * 0.5 + 0.5;
              vec3 col = mix(vec3(0.45, 0.2, 0.9), vec3(1.0, 0.75, 1.0), swirl * clamp(1.0 - r, 0.0, 1.0));
              float alpha = (1.0 - smoothstep(0.7, 1.0, r)) * (0.55 + 0.45 * swirl);
              gl_FragColor = vec4(col * 1.6, alpha);
            }`,
        }),
      );
      disc.rotation.y = Math.PI / 2;
      disc.position.y = 0.48;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.08, 16), stoneMat);
      foot.position.y = 0.04;
      foot.receiveShadow = true;
      for (const s of [-1, 1]) {
        const pillar = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.6, 0.14, 1, 0.03), stoneMat);
        pillar.position.set(0, 0.3, s * 0.44);
        pillar.castShadow = true;
        g.add(pillar);
      }
      ring.castShadow = true;
      g.add(ring, disc, foot);
      G.add(g);
      this.portals.push({ group: g, disc, ring, pulse: 0 });
    });
  }

  buildCore(map, G) {
    const g = new THREE.Group();
    g.position.set(this.wx(map.base.x + 0.5), 0, this.wz(map.base.y + 0.5));
    const ceramic = new THREE.MeshStandardMaterial({ color: '#efeae0', roughness: 0.5 });
    const band = new THREE.MeshStandardMaterial({ color: '#2f3b52', roughness: 0.4, metalness: 0.3 });
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.14, 8), ceramic);
    p1.position.y = 0.07;
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.14, 8), band);
    p2.position.y = 0.21;
    const p3 = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.06, 8), ceramic);
    p3.position.y = 0.31;
    for (const m of [p1, p2, p3]) ((m.castShadow = true), (m.receiveShadow = true));
    this.coreMat = new THREE.MeshStandardMaterial({ color: '#7ee8ff', emissive: '#38d6ff', emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.1, flatShading: true });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), this.coreMat);
    crystal.scale.set(1, 1.7, 1);
    crystal.position.y = 0.85;
    crystal.castShadow = true;
    const shards = new THREE.Group();
    shards.position.y = 0.85;
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), this.coreMat);
      const a = (i / 4) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.42, Math.sin(a * 2) * 0.08, Math.sin(a) * 0.42);
      s.scale.y = 1.6;
      shards.add(s);
    }
    this.coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7ee8ff').multiplyScalar(2), toneMapped: false }));
    this.coreRing.rotation.x = Math.PI / 2;
    this.coreRing.position.y = 0.36;
    // Lichtsäule über dem Kern
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color('#38d6ff') }, time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 color; uniform float time; varying vec2 vUv;
        void main(){
          float a = pow(1.0 - vUv.y, 2.2) * 0.32;
          a *= 0.75 + 0.25 * sin(vUv.y * 30.0 - time * 4.0);
          a *= 0.6 + 0.4 * pow(sin(vUv.x * 3.14159 * 2.0) * 0.5 + 0.5, 2.0);
          gl_FragColor = vec4(color * 1.6, a);
        }`,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 6, 24, 1, true).translate(0, 3.6, 0), this.beamMat);
    beam.renderOrder = 6;
    g.add(p1, p2, p3, crystal, shards, this.coreRing, beam);
    G.add(g);
    this.core = { group: g, crystal, shards };
  }

  buildCursor(G) {
    const tex = canvasTexture(128, 128, (g, w) => {
      g.clearRect(0, 0, w, w);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 8;
      const r = 18;
      const m = 8;
      g.beginPath();
      g.roundRect(m, m, w - 2 * m, w - 2 * m, r);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fill();
    });
    this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.visible = false;
    this.cursor.renderOrder = 5;
    G.add(this.cursor);

    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 96), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }));
    this.range = new THREE.Group();
    for (const m of [disc, ring]) {
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 4;
      this.range.add(m);
    }
    inner.rotation.x = -Math.PI / 2;
    inner.renderOrder = 4;
    this.minRange = inner;
    this.range.add(inner);
    this.range.visible = false;
    G.add(this.range);
    this.rangeDisc = disc;
    this.rangeRing = ring;
  }

  showCursor(cx, cy, ok, tile) {
    if (cx == null) {
      this.cursor.visible = false;
      return;
    }
    this.cursor.visible = true;
    this.cursor.position.set(this.wx(cx + 0.5), tileTop(tile) + 0.012, this.wz(cy + 0.5));
    this.cursor.material.color.set(ok ? '#8dffb0' : '#ff7a7a');
    this.cursor.scale.setScalar(0.96);
  }

  showRange(x, y, r, tile, color = '#ffffff', min = 0) {
    if (x == null || !r) {
      this.range.visible = false;
      return;
    }
    this.range.visible = true;
    const h = Math.max(tileTop(tile), 0.03) + 0.02;
    this.range.position.set(this.wx(x), h, this.wz(y));
    this.rangeDisc.scale.setScalar(r);
    this.rangeRing.scale.setScalar(r);
    this.rangeDisc.material.color.set(color);
    this.rangeRing.material.color.set(color);
    this.minRange.visible = min > 0;
    this.minRange.scale.setScalar(Math.max(0.01, min));
  }

  leak() {
    this.coreFlash = 1;
  }

  update(dt, game) {
    this.time += dt;
    this.wind.value = this.time;
    this.flowTex.offset.x += dt * 0.6;
    for (const p of this.portals) {
      p.disc.material.uniforms.time.value = this.time;
      p.ring.rotation.z += dt * 0.6;
      if (p.pulse > 0) p.pulse = Math.max(0, p.pulse - dt * 3);
      p.ring.scale.setScalar(1 + p.pulse * 0.15);
    }
    if (this.core) {
      const c = this.core;
      const life = Math.max(0, Math.min(1, game.lives / game.maxLives));
      c.crystal.rotation.y += dt * 0.8;
      c.crystal.position.y = 0.85 + Math.sin(this.time * 2) * 0.05;
      c.shards.rotation.y -= dt * 1.2;
      c.shards.position.y = c.crystal.position.y;
      this.coreFlash = Math.max(0, this.coreFlash - dt * 2.5);
      const base = new THREE.Color('#38d6ff').lerp(new THREE.Color('#ff4d6d'), 1 - life);
      this.coreMat.emissive.copy(base).lerp(new THREE.Color('#ffffff'), this.coreFlash * 0.6);
      this.coreMat.emissiveIntensity = 0.6 + life * 1.2 + this.coreFlash * 2;
      this.coreRing.material.color.copy(base).multiplyScalar(1.5 + this.coreFlash * 2);
      this.beamMat.uniforms.color.value.copy(base).lerp(new THREE.Color('#ffffff'), this.coreFlash * 0.5);
      this.beamMat.uniforms.time.value = this.time;
      this.coreRing.scale.setScalar(1 + this.coreFlash * 0.4 + Math.sin(this.time * 3) * 0.02);
    }
    if (this.lavaMat) this.lavaMat.color.setRGB(1, 0.3, 0.05).multiplyScalar(0.95 + Math.sin(this.time * 1.7) * 0.2);
    for (const g of this.glyphs) g.material.opacity = 0.75 + Math.sin(this.time * 2 + g.position.x) * 0.2;
  }

  portalPulse(i) {
    if (this.portals[i]) this.portals[i].pulse = 1;
  }

  dispose() {
    if (!this.root) return;
    this.root.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) for (const m of [].concat(o.material)) m.dispose();
    });
    this.group.remove(this.root);
    this.root = null;
  }
}
