// Käselaib, Ghost und Strohballen
import * as THREE from 'three';

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(g, w, h, n, color, size) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const s = Math.random() * size + 0.5;
    g.globalAlpha = 0.15 + Math.random() * 0.3;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  g.globalAlpha = 1;
}

const cache = new Map();
function cheeseMaterials(C) {
  if (cache.has(C.id)) return cache.get(C.id);
  const side = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = C.rind;
    g.fillRect(0, 0, w, h);
    // Tuchstruktur / Rinde
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`;
      g.fillRect(0, y, w, 1);
    }
    speckle(g, w, h, 1400, '#000', 2);
    speckle(g, w, h, 500, '#fff', 2);
    // Markierung, damit man die Drehung sieht
    g.fillStyle = 'rgba(60,30,10,0.55)';
    g.fillRect(0, 0, 18, h);
    g.fillRect(w / 2, 0, 18, h);
  });
  const face = canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = C.rind;
    g.fillRect(0, 0, w, w);
    speckle(g, w, w, 1600, '#000', 2);
    g.strokeStyle = 'rgba(70,35,10,0.35)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(c, c, c * 0.86, 0, Math.PI * 2);
    g.stroke();
    // Prägestempel
    g.lineWidth = 4;
    g.beginPath();
    g.arc(c, c, c * 0.42, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(70,35,10,0.45)';
    g.font = '800 50px "Barlow Condensed", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(C.id === 'parmigiano' ? 'PR' : C.id === 'camembert' ? 'CN' : 'DG', c, c + 3);
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      g.fillRect(c + Math.cos(ang) * c * 0.62 - 4, c + Math.sin(ang) * c * 0.62 - 4, 8, 8);
    }
  });
  const mats = [
    new THREE.MeshStandardMaterial({ map: side, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: face, roughness: 0.75 }),
    new THREE.MeshStandardMaterial({ map: face, roughness: 0.75 }),
  ];
  cache.set(C.id, mats);
  return mats;
}

export function createCheese(C) {
  // Zylinder entlang der lokalen y-Achse – wie der Physik-Körper
  const geo = new THREE.CylinderGeometry(C.radius, C.radius, C.halfWidth * 2, 48, 1);
  const mesh = new THREE.Mesh(geo, cheeseMaterials(C));
  mesh.castShadow = true;
  // abgerundete Kante als dünner Ring
  const rim = new THREE.Mesh(new THREE.TorusGeometry(C.radius - 0.02, 0.035, 8, 48), new THREE.MeshStandardMaterial({ color: C.rind, roughness: 0.8 }));
  rim.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const r = rim.clone();
    r.position.y = s * (C.halfWidth - 0.01);
    mesh.add(r);
  }
  return mesh;
}

export function createGhost(C) {
  const geo = new THREE.CylinderGeometry(C.radius, C.radius, C.halfWidth * 2, 32, 1);
  const mat = new THREE.MeshBasicMaterial({ color: '#cfe4ff', transparent: true, opacity: 0.38, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
  mesh.add(edges);
  mesh.renderOrder = 2;
  return mesh;
}

let baleMats = null;
export function createBale(b) {
  baleMats ||= (() => {
    const straw = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#d8b65a';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i++) {
        g.strokeStyle = Math.random() < 0.5 ? 'rgba(140,100,30,0.5)' : 'rgba(255,240,170,0.5)';
        g.lineWidth = 1;
        g.beginPath();
        const x = Math.random() * w;
        const y = Math.random() * h;
        g.moveTo(x, y);
        g.lineTo(x + (Math.random() - 0.5) * 6, y + 6 + Math.random() * 10);
        g.stroke();
      }
      g.fillStyle = 'rgba(90,60,30,0.75)';
      g.fillRect(0, h * 0.28, w, 4);
      g.fillRect(0, h * 0.68, w, 4);
    });
    return new THREE.MeshStandardMaterial({ map: straw, roughness: 1 });
  })();
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.hx * 2, b.hy * 2, b.hz * 2), baleMats);
  m.castShadow = m.receiveShadow = true;
  return m;
}
