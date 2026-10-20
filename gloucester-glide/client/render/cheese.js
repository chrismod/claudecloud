// Käselaibe (gedrechselt, mit runden Kanten), Bruchschaden, Bruchstücke, Ghost und Strohballen
import * as THREE from 'three';

// Form je Sorte: Kantenrundung, Bauch an der Seite, Wölbung der Deckfläche
const SHAPE = {
  gloucester: { edge: 0.08, bulge: 0.015, dome: 0.012 },
  emmentaler: { edge: 0.17, bulge: 0.04, dome: 0.035 },
  camembert: { edge: 0.06, bulge: 0.004, dome: 0.006 },
  parmigiano: { edge: 0.07, bulge: 0.04, dome: 0.012 },
};

function profile(C) {
  const { edge: e, bulge, dome } = SHAPE[C.id] ?? SHAPE.gloucester;
  const R = C.radius;
  const H = C.halfWidth;
  const top = [];
  // Deckfläche (leicht gewölbt) von der Mitte nach außen
  for (let i = 0; i <= 8; i++) {
    const r = ((R - e) * i) / 8;
    const t = r / (R - e);
    top.push(new THREE.Vector2(r, H + dome * (1 - t * t)));
  }
  // Kante als Viertelkreis
  for (let i = 1; i <= 10; i++) {
    const a = Math.PI / 2 - (i / 10) * (Math.PI / 2);
    top.push(new THREE.Vector2(R - e + e * Math.cos(a), H - e + e * Math.sin(a)));
  }
  // Seite mit Bauch
  const side = [];
  for (let i = 1; i < 10; i++) {
    const y = (H - e) * (1 - (2 * i) / 10);
    const t = y / (H - e || 1);
    side.push(new THREE.Vector2(R + bulge * (1 - t * t), y));
  }
  const bottom = top.map((p) => new THREE.Vector2(p.x, -p.y)).reverse();
  const pts = [...top, ...side, ...bottom];
  // Anteil der Seitenfläche an der Profillänge (für die Rindentextur)
  let total = 0;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push((total += pts[i].distanceTo(pts[i - 1])));
  const sideFrom = lens[top.length - 1] / total;
  const sideTo = lens[top.length + side.length] / total;
  // Lathe nimmt die Punkte von unten nach oben – damit die Flächen nach außen zeigen, umdrehen
  return { pts: pts.reverse(), total, sideFrom: 1 - sideTo, sideTo: 1 - sideFrom };
}

function noiseCanvas(w, h, fill, dots) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  for (const [color, n, size, alpha] of dots) {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const s = Math.random() * size + 0.6;
      g.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, s, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  return cv;
}

// Rinde je Sorte, gemalt in den UV-Raum der Drehform (u = rundherum, v = entlang des Profils)
function paintRind(C, prof) {
  const W = 1024;
  const Hh = 512;
  const dark = new THREE.Color(C.rind).multiplyScalar(0.7).getStyle();
  const light = new THREE.Color(C.rind).lerp(new THREE.Color('#ffffff'), 0.35).getStyle();
  const cv = noiseCanvas(W, Hh, C.rind, [
    [dark, 3500, 2.2, 0.35],
    [light, 2000, 1.8, 0.3],
  ]);
  const g = cv.getContext('2d');
  const y0 = prof.sideFrom * Hh;
  const y1 = prof.sideTo * Hh;
  if (C.id === 'camembert') {
    // Weißschimmel: wolkig
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${200 + Math.random() * 40},${195 + Math.random() * 40},${170 + Math.random() * 40},0.25)`;
      g.beginPath();
      g.arc(Math.random() * W, Math.random() * Hh, 4 + Math.random() * 14, 0, Math.PI * 2);
      g.fill();
    }
  } else if (C.id === 'gloucester') {
    // Tuchwicklung an der Seite
    for (let y = y0; y < y1; y += 4) {
      g.fillStyle = `rgba(80,30,0,${0.06 + Math.random() * 0.06})`;
      g.fillRect(0, y, W, 1.5);
    }
  } else if (C.id === 'parmigiano') {
    // Punktschrift rundherum, wie eingebrannt
    g.save();
    g.fillStyle = 'rgba(120,70,20,0.45)';
    g.font = `700 ${Math.max(12, (y1 - y0) * 0.32)}px "Barlow Condensed", sans-serif`;
    g.textBaseline = 'middle';
    const text = 'PARMIGIANO REGGIANO · ';
    let x = 0;
    while (x < W) {
      g.fillText(text, x, (y0 + y1) / 2);
      x += g.measureText(text).width;
    }
    g.restore();
  } else if (C.id === 'emmentaler') {
    // Naturrinde mit feinen Rillen
    for (let y = y0; y < y1; y += 9) {
      g.fillStyle = `rgba(110,70,20,${0.025 + Math.random() * 0.025})`;
      g.fillRect(0, y, W, 2);
    }
  }
  // Markierungsstreifen auf der Seite, damit man die Drehung sieht
  if (C.id !== 'parmigiano') {
    g.fillStyle = 'rgba(70,35,10,0.18)';
    g.fillRect(0, y0, 10, y1 - y0);
  }
  return cv;
}

// Stempel auf der Deckfläche
function stampTexture(C) {
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  const c = n / 2;
  const ink = { emmentaler: 'rgba(190,30,30,0.85)', parmigiano: 'rgba(110,60,15,0.6)', camembert: 'rgba(120,110,90,0.35)', gloucester: 'rgba(70,25,5,0.5)' }[C.id];
  const label = { emmentaler: 'EMMENTALER · SWITZERLAND · ', parmigiano: 'PARMIGIANO REGGIANO · DOP · ', camembert: 'CAMEMBERT DE NORMANDIE · ', gloucester: 'DOUBLE GLOUCESTER · ' }[C.id];
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(c, c, c * 0.9, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(c, c, c * 0.55, 0, Math.PI * 2);
  g.stroke();
  g.font = '700 26px "Barlow Condensed", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = label.split('');
  chars.forEach((ch, i) => {
    const a = (i / chars.length) * Math.PI * 2;
    g.save();
    g.translate(c + Math.sin(a) * c * 0.72, c - Math.cos(a) * c * 0.72);
    g.rotate(a);
    g.fillText(ch, 0, 0);
    g.restore();
  });
  g.font = '800 54px "Barlow Condensed", sans-serif';
  g.fillText({ emmentaler: '+', parmigiano: 'PR', camembert: 'CN', gloucester: 'DG' }[C.id], c, c + 3);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const shared = new Map();
function sharedFor(C) {
  if (shared.has(C.id)) return shared.get(C.id);
  const prof = profile(C);
  const geo = new THREE.LatheGeometry(prof.pts, 72);
  geo.computeVertexNormals();
  const bump = new THREE.CanvasTexture(noiseCanvas(512, 256, '#808080', [['#000', 2500, 1.6, 0.4], ['#fff', 2500, 1.6, 0.4]]));
  const s = { prof, geo, bump, rind: paintRind(C, prof), stamp: stampTexture(C) };
  shared.set(C.id, s);
  return s;
}

const ROUGH = { gloucester: 0.55, emmentaler: 0.7, camembert: 0.95, parmigiano: 0.75 };

export function createCheese(C) {
  const S = sharedFor(C);
  // Jede Instanz bekommt eigene Geometrie und Textur – beides nimmt Schaden
  const geo = S.geo.clone();
  const canvas = document.createElement('canvas');
  canvas.width = S.rind.width;
  canvas.height = S.rind.height;
  canvas.getContext('2d').drawImage(S.rind, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap: S.bump, bumpScale: 1.2, roughness: ROUGH[C.id] ?? 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Stempel auf beiden Seiten, der Wölbung folgend
  const { edge, dome } = SHAPE[C.id] ?? SHAPE.gloucester;
  const rr = (C.radius - edge) * 0.82;
  const decalGeo = new THREE.CircleGeometry(rr, 40);
  decalGeo.rotateX(-Math.PI / 2);
  const dp = decalGeo.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const t = Math.hypot(dp.getX(i), dp.getZ(i)) / (C.radius - edge);
    dp.setY(i, C.halfWidth + dome * (1 - t * t) + 0.002);
  }
  const decalMat = () => new THREE.MeshStandardMaterial({ map: S.stamp, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const top = new THREE.Mesh(decalGeo, decalMat());
  const bottom = new THREE.Mesh(decalGeo, decalMat());
  bottom.rotation.x = Math.PI;
  mesh.add(top, bottom);

  mesh.userData.cheese = { C, S, canvas, map, base: geo.attributes.position.array.slice(), decals: [top, bottom] };
  return mesh;
}

// Delle und abgeplatzte Rinde an der Stelle, die vom Stoß getroffen wurde.
// dir: Richtung des Stoßes in Weltkoordinaten (vom Boden weg) → Kontaktpunkt liegt in Gegenrichtung.
const _q = new THREE.Quaternion();
const _d = new THREE.Vector3();
export function damageCheese(mesh, dir, amount) {
  const st = mesh.userData.cheese;
  if (!st) return;
  const { C, S, canvas, map } = st;
  _q.copy(mesh.quaternion).invert();
  _d.set(-dir.x, -dir.y, -dir.z).applyQuaternion(_q).normalize();
  const pos = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;
  // Stützpunkt der Form in Kontaktrichtung
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const d = pos.getX(i) * _d.x + pos.getY(i) * _d.y + pos.getZ(i) * _d.z;
    if (d > bestDot) (bestDot = d), (best = i);
  }
  const cx = pos.getX(best);
  const cy = pos.getY(best);
  const cz = pos.getZ(best);
  const radius = Math.min(0.32, 0.1 + amount * 1.2) * (C.radius / 0.5);
  const depth = Math.min(0.09, 0.012 + amount * 0.35);
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - cx;
    const dy = pos.getY(i) - cy;
    const dz = pos.getZ(i) - cz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > radius) continue;
    const f = 1 - dist / radius;
    const k = depth * f * f * (0.7 + Math.random() * 0.6);
    // nach innen, Richtung Mittelpunkt der Form
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    pos.setXYZ(i, x - (x / l) * k, y - (y / l) * k, z - (z / l) * k);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();

  // Rinde abplatzen lassen: Teig (und bei Emmentaler Löcher) kommt zum Vorschein
  const g = canvas.getContext('2d');
  const u = uv.getX(best) * canvas.width;
  const v = (1 - uv.getY(best)) * canvas.height;
  const ru = (radius / (Math.PI * 2 * C.radius)) * canvas.width * 0.9;
  const rv = (radius / S.prof.total) * canvas.height * 0.9;
  for (const off of [0, canvas.width, -canvas.width]) blob(g, u + off, v, ru, rv, C);
  map.needsUpdate = true;
  // Ein Stempel, der getroffen wurde, wird mit beschädigt
  if (Math.abs(cy) > C.halfWidth * 0.8) {
    const dcl = st.decals[cy > 0 ? 0 : 1];
    dcl.material.opacity = Math.max(0.3, dcl.material.opacity - amount * 2);
  }
}

function blob(g, u, v, ru, rv, C) {
  const pts = 14;
  g.save();
  g.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const k = 0.65 + Math.random() * 0.45;
    const x = u + Math.cos(a) * ru * k;
    const y = v + Math.sin(a) * rv * k;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.fillStyle = C.paste;
  g.fill();
  g.clip();
  // Bruchkante etwas dunkler
  g.strokeStyle = 'rgba(80,40,10,0.35)';
  g.lineWidth = 3;
  g.stroke();
  const holes = C.id === 'emmentaler' ? 7 : C.id === 'parmigiano' ? 0 : 2;
  for (let i = 0; i < holes; i++) {
    const x = u + (Math.random() - 0.5) * ru * 1.4;
    const y = v + (Math.random() - 0.5) * rv * 1.4;
    const r = (C.id === 'emmentaler' ? 0.18 : 0.08) * Math.min(ru, rv) * (0.6 + Math.random());
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    grad.addColorStop(0, 'rgba(120,80,20,0.85)');
    grad.addColorStop(1, 'rgba(200,150,60,0.4)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Krümelstruktur
  if (C.id === 'parmigiano') {
    g.fillStyle = 'rgba(255,255,230,0.5)';
    for (let i = 0; i < 40; i++) g.fillRect(u + (Math.random() - 0.5) * ru * 2, v + (Math.random() - 0.5) * rv * 2, 2, 2);
  }
  g.restore();
}

// Der Laib zerbricht in Stücke (nur Darstellung)
export function createShards(scene, mesh, vel, groundAt) {
  const { C } = mesh.userData.cheese;
  const shards = [];
  const n = 12;
  const rindMat = new THREE.MeshStandardMaterial({ color: C.rind, roughness: 0.7, flatShading: true });
  const pasteMat = new THREE.MeshStandardMaterial({ color: C.paste, roughness: 0.85, flatShading: true });
  for (let i = 0; i < n; i++) {
    // Keilstück: Tortenstück aus der Form
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const R = C.radius * (0.85 + Math.random() * 0.15);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
    shape.lineTo(Math.cos((a0 + a1) / 2) * R * 1.02, Math.sin((a0 + a1) / 2) * R * 1.02);
    shape.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
    shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: C.halfWidth * 2, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
    geo.translate(0, 0, -C.halfWidth);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, [rindMat, pasteMat]);
    m.castShadow = true;
    m.position.copy(mesh.position);
    m.quaternion.copy(mesh.quaternion);
    const out = new THREE.Vector3(Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)).applyQuaternion(mesh.quaternion);
    shards.push({
      m,
      v: new THREE.Vector3(vel.x * 0.55, Math.abs(vel.y) * 0.3 + 2, vel.z * 0.55).addScaledVector(out, 3 + Math.random() * 4),
      w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      rest: false,
    });
    scene.add(m);
  }
  const e = new THREE.Euler();
  const dq = new THREE.Quaternion();
  return {
    update(dt) {
      for (const s of shards) {
        if (s.rest) continue;
        s.v.y -= 9.81 * dt;
        s.m.position.addScaledVector(s.v, dt);
        e.set(s.w.x * dt, s.w.y * dt, s.w.z * dt);
        s.m.quaternion.multiply(dq.setFromEuler(e));
        const gy = groundAt(s.m.position.x, s.m.position.z) + 0.08;
        if (s.m.position.y < gy) {
          s.m.position.y = gy;
          s.v.y = Math.abs(s.v.y) * 0.3;
          s.v.x *= 0.7;
          s.v.z *= 0.7;
          s.w.multiplyScalar(0.6);
          if (s.v.lengthSq() < 0.3) s.rest = true;
        }
      }
    },
    dispose() {
      for (const s of shards) {
        scene.remove(s.m);
        s.m.geometry.dispose();
      }
      rindMat.dispose();
      pasteMat.dispose();
    },
  };
}

export function disposeCheese(mesh) {
  mesh.geometry.dispose();
  mesh.material.map?.dispose();
  mesh.material.dispose();
  for (const d of mesh.userData.cheese?.decals ?? []) d.material.dispose();
  mesh.userData.cheese?.decals[0].geometry.dispose();
}

export function createGhost(C) {
  const S = sharedFor(C);
  const mat = new THREE.MeshBasicMaterial({ color: '#cfe4ff', transparent: true, opacity: 0.38, depthWrite: false });
  const mesh = new THREE.Mesh(S.geo, mat);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(S.geo, 25), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }));
  mesh.add(edges);
  mesh.renderOrder = 2;
  return mesh;
}

let baleMat = null;
export function createBale(b) {
  baleMat ||= (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#d4b259';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(140,100,30,0.45)' : 'rgba(255,240,170,0.5)';
      g.lineWidth = 1 + Math.random();
      g.beginPath();
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const a = (Math.random() - 0.5) * 0.8;
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * (6 + Math.random() * 14), y + Math.sin(a) * (6 + Math.random() * 14));
      g.stroke();
    }
    g.fillStyle = 'rgba(80,55,25,0.8)';
    g.fillRect(70, 0, 5, 256);
    g.fillRect(180, 0, 5, 256);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 1.5, roughness: 1 });
  })();
  const geo = new THREE.BoxGeometry(b.hx * 2, b.hy * 2, b.hz * 2, 2, 2, 2);
  // Ecken leicht runden, Halme stehen ab
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = Math.abs(x) / b.hx > 0.99 && Math.abs(y) / b.hy > 0.99 ? 0.92 : 1;
    p.setXYZ(i, x * (1 + (Math.random() - 0.5) * 0.04), y * k, z * k);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, baleMat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
