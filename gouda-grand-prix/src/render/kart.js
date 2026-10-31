// Kart mit Mäuse-Fahrer: Lackchassis, Käsekeil-Nase, Käse-Heckflügel, Auspuff mit Flammen, Reifen,
// Maus mit Ohren, Schnurrhaaren, Brille und Schal. Animation aus dem Simulationszustand.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cheeseTexture, furTexture, softSprite } from './textures.js';

const blobTexture = () => softSprite();

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const geoCache = new Map();
const g = (key, fn) => {
  if (!geoCache.has(key)) geoCache.set(key, fn());
  return geoCache.get(key);
};

// Käsekeil (dreieckiges Prisma) mit Lochtextur
function wedgeGeo(w, h, l) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(l, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  geo.translate(0, 0, -w / 2);
  geo.rotateY(-Math.PI / 2);
  return geo;
}

function tyreGeo(r, w) {
  // abgerundetes Reifenprofil als Drehkörper
  const pts = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * Math.PI;
    pts.push(new THREE.Vector2(r - 0.08 + Math.cos(a) * 0.08 + (Math.cos(a) > 0 ? 0 : 0), (w / 2) * Math.sin(a) * 1.0));
  }
  pts.unshift(new THREE.Vector2(r * 0.55, -w / 2));
  pts.push(new THREE.Vector2(r * 0.55, w / 2));
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.rotateZ(Math.PI / 2);
  return geo;
}

const mats = new Map();
function mat(key, fn) {
  if (!mats.has(key)) mats.set(key, fn());
  return mats.get(key);
}

export function createKartModel(driver) {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const body = new THREE.Group();
  root.add(tilt);
  tilt.add(body);

  const paint = new THREE.MeshPhysicalMaterial({ color: driver.kart, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, emissive: '#000000' });
  const accent = new THREE.MeshPhysicalMaterial({ color: driver.accent, metalness: 0.2, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const dark = mat('dark', () => new THREE.MeshStandardMaterial({ color: '#18181c', roughness: 0.55, metalness: 0.4 }));
  const chrome = mat('chrome', () => new THREE.MeshStandardMaterial({ color: '#e8e8ee', roughness: 0.12, metalness: 1 }));
  const rubber = mat('rubber', () => new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.82 }));
  const cheese = mat('cheese', () => new THREE.MeshStandardMaterial({ map: cheeseTexture(true), roughness: 0.55, color: '#ffffff' }));
  const seatM = mat('seat', () => new THREE.MeshStandardMaterial({ color: '#2b2b33', roughness: 0.7 }));

  const add = (parent, geo, m, pos, rot, shadow = true) => {
    const mesh = new THREE.Mesh(geo, m);
    if (pos) mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Chassis
  add(body, g('chassis', () => new RoundedBoxGeometry(1.36, 0.28, 2.3, 4, 0.12)), paint, [0, 0.38, -0.05]);
  add(body, g('floor', () => new RoundedBoxGeometry(1.5, 0.1, 2.5, 2, 0.04)), dark, [0, 0.24, -0.05]);
  for (const s of [1, -1]) add(body, g('pod', () => new RoundedBoxGeometry(0.34, 0.3, 1.3, 3, 0.12)), accent, [s * 0.7, 0.36, -0.1]);
  // Nase: Käsekeil
  add(body, g('nose', () => wedgeGeo(1.1, 0.42, 0.9)), cheese, [0, 0.27, 1.05]);
  add(body, g('bumper', () => new RoundedBoxGeometry(1.5, 0.16, 0.22, 2, 0.07)), dark, [0, 0.26, 1.42]);
  // Cockpit-Verkleidung
  add(body, g('cowl', () => new RoundedBoxGeometry(1.0, 0.3, 0.7, 3, 0.12)), paint, [0, 0.58, 0.55]);
  // Sitz
  add(body, g('seat', () => new RoundedBoxGeometry(0.72, 0.14, 0.6, 2, 0.06)), seatM, [0, 0.56, -0.35]);
  add(body, g('seatback', () => new RoundedBoxGeometry(0.72, 0.7, 0.14, 2, 0.06)), seatM, [0, 0.88, -0.66], [-0.2, 0, 0]);
  // Lenkrad
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(0, 0.86, 0.32);
  wheelPivot.rotation.x = -0.9;
  body.add(wheelPivot);
  add(wheelPivot, g('steer', () => new THREE.TorusGeometry(0.17, 0.03, 8, 20)), dark, [0, 0, 0], null, false);
  add(body, g('column', () => new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6)), dark, [0, 0.74, 0.45], [0.7, 0, 0], false);
  // Motor und Auspuff
  add(body, g('engine', () => new RoundedBoxGeometry(0.8, 0.42, 0.5, 3, 0.08)), dark, [0, 0.62, -1.0]);
  add(body, g('engineTop', () => new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10)), chrome, [0, 0.88, -1.0], [0, 0, Math.PI / 2]);
  const flames = [];
  for (const s of [1, -1]) {
    add(body, g('pipe', () => new THREE.CylinderGeometry(0.075, 0.09, 0.6, 12, 1, true)), chrome, [s * 0.26, 0.6, -1.38], [Math.PI / 2 + 0.25, 0, 0]);
    const fm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    const f = add(body, g('flame', () => new THREE.ConeGeometry(0.11, 0.7, 10, 1, true).translate(0, 0.35, 0)), fm, [s * 0.26, 0.55, -1.66], [-Math.PI / 2 + 0.25, 0, 0], false);
    flames.push(f);
  }
  // Heckflügel: Käsekeil auf Streben
  for (const s of [1, -1]) add(body, g('strut', () => new THREE.BoxGeometry(0.06, 0.45, 0.12)), dark, [s * 0.45, 0.95, -1.25]);
  add(body, g('wing', () => wedgeGeo(1.45, 0.22, 0.6)), cheese, [0, 1.12, -1.55]);
  // Startnummer-Fähnchen in Akzentfarbe
  add(body, g('flag', () => new THREE.PlaneGeometry(0.3, 0.22)), accent, [0.5, 1.55, -1.25], [0, Math.PI / 2, 0], false);
  add(body, g('antenna', () => new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4)), dark, [0.5, 1.35, -1.25], null, false);
  // Rücklichter (leuchten nachts und beim Bremsen)
  const tail = new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff2a1a', emissiveIntensity: 0.6 });
  for (const s of [1, -1]) add(body, g('tail', () => new THREE.BoxGeometry(0.22, 0.08, 0.04)), tail, [s * 0.5, 0.42, -1.21], null, false);

  // Räder
  const wheels = [];
  const rim = accent;
  const defs = [
    [0.78, 0.31, 0.92, 0.3, 0.3, true],
    [-0.78, 0.31, 0.92, 0.3, 0.3, true],
    [0.8, 0.38, -0.86, 0.38, 0.42, false],
    [-0.8, 0.38, -0.86, 0.38, 0.42, false],
  ];
  for (const [x, y, z, r, w, front] of defs) {
    const steer = new THREE.Group();
    steer.position.set(x, y, z);
    body.add(steer);
    const spin = new THREE.Group();
    steer.add(spin);
    add(spin, g('tyre' + r + w, () => tyreGeo(r, w)), rubber);
    add(spin, g('rim' + r + w, () => new THREE.CylinderGeometry(r * 0.58, r * 0.58, w * 1.02, 16)), rim, null, [0, 0, Math.PI / 2], false);
    add(spin, g('hub' + r, () => new THREE.CylinderGeometry(r * 0.22, r * 0.22, w * 1.08, 8)), chrome, null, [0, 0, Math.PI / 2], false);
    // Speichen, damit man das Drehen sieht
    add(spin, g('spoke' + r + w, () => new THREE.BoxGeometry(w * 1.04, r * 0.95, 0.06)), chrome, null, null, false);
    wheels.push({ steer, spin, r, front, baseY: y });
  }

  // --- Maus ------------------------------------------------------------------------------------
  const fur = new THREE.MeshStandardMaterial({ color: driver.fur, map: furTexture(), roughness: 0.85 });
  const belly = new THREE.MeshStandardMaterial({ color: driver.belly, roughness: 0.85 });
  const pink = mat('pink', () => new THREE.MeshStandardMaterial({ color: '#f29aa6', roughness: 0.55 }));
  const eyeM = mat('eye', () => new THREE.MeshPhysicalMaterial({ color: '#0a0a0c', roughness: 0.05, clearcoat: 1 }));
  const white = mat('white', () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.4 }));
  const scarfM = new THREE.MeshStandardMaterial({ color: driver.accent, roughness: 0.75 });

  const mouse = new THREE.Group();
  mouse.position.set(0, 0.62, -0.32);
  body.add(mouse);
  const torso = add(mouse, g('torso', () => new THREE.SphereGeometry(0.34, 20, 14)), fur, [0, 0.3, 0]);
  torso.scale.set(1, 1.15, 0.9);
  add(mouse, g('tummy', () => new THREE.SphereGeometry(0.27, 16, 12)), belly, [0, 0.27, 0.12]).scale.set(1, 1.1, 0.8);
  // Schal
  add(mouse, g('scarf', () => new THREE.TorusGeometry(0.22, 0.07, 8, 18)), scarfM, [0, 0.62, 0], [Math.PI / 2, 0, 0]);
  const scarfTail = add(mouse, g('scarfTail', () => new THREE.BoxGeometry(0.12, 0.04, 0.5).translate(0, 0, -0.25)), scarfM, [0.1, 0.62, -0.18], [0.2, 0.3, 0]);
  // Arme zum Lenkrad
  const arms = [];
  for (const s of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.27, 0.45, 0.05);
    mouse.add(arm);
    const a = add(arm, g('arm', () => new THREE.CapsuleGeometry(0.07, 0.38, 4, 8).rotateX(Math.PI / 2).translate(0, 0, 0.22)), fur, null, [0.35, -s * 0.25, 0]);
    void a;
    add(arm, g('paw', () => new THREE.SphereGeometry(0.075, 10, 8)), pink, [s * -0.1, -0.15, 0.42]);
    arms.push(arm);
  }
  // Kopf
  const head = new THREE.Group();
  head.position.set(0, 0.88, 0.02);
  mouse.add(head);
  add(head, g('head', () => new THREE.SphereGeometry(0.3, 24, 18)), fur);
  const snout = add(head, g('snout', () => new THREE.SphereGeometry(0.2, 18, 14)), belly, [0, -0.06, 0.22]);
  snout.scale.set(0.95, 0.8, 1.25);
  add(head, g('mouseNose', () => new THREE.SphereGeometry(0.065, 12, 10)), pink, [0, -0.02, 0.46]);
  for (const s of [1, -1]) {
    add(head, g('eye', () => new THREE.SphereGeometry(0.06, 14, 10)), eyeM, [s * 0.12, 0.08, 0.24]);
    add(head, g('glint', () => new THREE.SphereGeometry(0.018, 8, 6)), white, [s * 0.12 + 0.02, 0.11, 0.295], null, false);
    // Ohren
    const ear = new THREE.Group();
    ear.position.set(s * 0.25, 0.25, -0.04);
    ear.rotation.set(-0.1, 0, -s * 0.35);
    head.add(ear);
    add(ear, g('ear', () => new THREE.SphereGeometry(0.22, 18, 12)), fur).scale.set(1, 1, 0.28);
    add(ear, g('earIn', () => new THREE.SphereGeometry(0.16, 16, 10)), pink, [0, 0, 0.035]).scale.set(1, 1, 0.2);
    // Schnurrhaare
    for (const k of [-1, 0, 1]) {
      const w = add(head, g('whisker', () => new THREE.CylinderGeometry(0.004, 0.004, 0.36, 3).rotateZ(Math.PI / 2).translate(0.18, 0, 0)), dark, [s * 0.1, -0.06 + k * 0.03, 0.38], [0, 0, k * 0.12 * s], false);
      if (s < 0) w.rotation.y = Math.PI;
    }
  }
  // Fliegerbrille auf der Stirn
  const goggle = mat('goggle', () => new THREE.MeshPhysicalMaterial({ color: '#7fd7ff', roughness: 0.05, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.8 }));
  add(head, g('band', () => new THREE.TorusGeometry(0.29, 0.025, 6, 24)), dark, [0, 0.16, 0], [Math.PI / 2 - 0.3, 0, 0], false);
  for (const s of [1, -1]) add(head, g('lens', () => new THREE.CylinderGeometry(0.075, 0.075, 0.05, 14)), goggle, [s * 0.1, 0.22, 0.22], [Math.PI / 2 - 0.6, 0, 0], false);
  // Schwanz
  const tailCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.1, -0.3), new THREE.Vector3(0, 0.0, -0.75), new THREE.Vector3(0.15, 0.25, -1.1), new THREE.Vector3(-0.05, 0.6, -1.25), new THREE.Vector3(0.1, 0.8, -1.1)]);
  const mouseTail = add(mouse, new THREE.TubeGeometry(tailCurve, 24, 0.035, 6), pink, null, null, false);

  // --- Effekte am Kart ---------------------------------------------------------------------------
  // Parmesan-Panzer: körnige, durchscheinende Kugel mit Fresnel-Rand
  const shieldMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, fade: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float time, fade; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(floor(p*9.0), vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5);
        float grain = h(vP + vec3(0.0, time*0.2, 0.0));
        vec3 c = vec3(1.0, 0.82, 0.35) * (f * 1.6 + grain * 0.12 + 0.05);
        gl_FragColor = vec4(c * fade, 1.0); }`,
  });
  const shield = new THREE.Mesh(g('shield', () => new THREE.SphereGeometry(1.75, 32, 20)), shieldMat);
  shield.position.y = 0.8;
  shield.visible = false;
  tilt.add(shield);

  // Kreisende Emmentaler-Räder
  const orbit = [];
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Group();
    add(w, g('owheel', () => new THREE.CylinderGeometry(0.42, 0.42, 0.3, 24)), cheese, null, [0, 0, Math.PI / 2]);
    add(w, g('owheelRind', () => new THREE.TorusGeometry(0.42, 0.05, 6, 24)), mat('rind', () => new THREE.MeshStandardMaterial({ color: '#d9a326', roughness: 0.6 })), null, [0, Math.PI / 2, 0]);
    w.visible = false;
    root.add(w);
    orbit.push(w);
  }

  // weicher Kontaktschatten unter dem Kart (bleibt am Boden, auch im Sprung)
  const blob = new THREE.Mesh(
    g('blob', () => new THREE.PlaneGeometry(2.6, 3.4).rotateX(-Math.PI / 2)),
    mat('blob', () => new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.55, color: '#000', polygonOffset: true, polygonOffsetFactor: -6 })),
  );
  blob.renderOrder = 1;
  root.add(blob);

  // Animationszustand
  const st = { pitch: 0, roll: 0, bounce: 0, bounceV: 0, yawOff: 0, wheelAngle: 0, lastAir: false, headYaw: 0 };

  function update(k, dt, time) {
    root.position.set(k.x, k.y, k.z);
    // Drift: Heck sichtbar ausgestellt
    const yawTarget = k.drift * -0.38 + k.ls * -0.012;
    st.yawOff += (yawTarget - st.yawOff) * Math.min(1, dt * 8);
    root.rotation.y = k.heading + st.yawOff + k.spinVis;
    const above = Math.max(0, k.y - (k.groundY ?? k.y));
    blob.position.y = -above + 0.03;
    blob.material.opacity = 0.55;
    blob.scale.setScalar(1 + above * 0.15);
    // Neigung aus Überhöhung und Steigung
    const pitchT = k.onGround ? -Math.atan(k.slope ?? 0) : Math.max(-0.35, Math.min(0.35, -k.vy * 0.02));
    const sideBank = k.loc?.bank ?? 0;
    // Überhöhung im Kart-Koordinatensystem: Querneigung abhängig von der Fahrtrichtung relativ zur Strecke
    const rel = Math.cos(k.heading - Math.atan2(k.loc?.tx ?? 0, k.loc?.tz ?? 1));
    const rollT = -Math.atan(sideBank) * rel + k.drift * 0.06 + (k.steerVis * Math.min(1, Math.abs(k.fs) / 25)) * 0.05;
    st.pitch += (pitchT - st.pitch) * Math.min(1, dt * 8);
    st.roll += (rollT - st.roll) * Math.min(1, dt * 8);
    tilt.rotation.set(st.pitch, 0, st.roll, 'YXZ');
    if (k.tumbleT > 0) tilt.rotation.x = st.pitch + (1 - k.tumbleT / 1.35) * Math.PI * 2;
    // Federung: Landungen stauchen
    if (st.lastAir && k.onGround) st.bounceV -= 2.5;
    st.lastAir = !k.onGround;
    st.bounceV += (-st.bounce * 180 - st.bounceV * 12) * dt;
    st.bounce += st.bounceV * dt;
    const rumble = k.offroad && k.onGround ? Math.sin(time * 60) * 0.015 * Math.min(1, Math.abs(k.fs) / 10) : 0;
    body.position.y = st.bounce * 0.12 + rumble + Math.sin(time * 40) * 0.004 * Math.min(1, Math.abs(k.fs) / 5);
    body.scale.y = 1 + st.bounce * 0.15;

    // Räder
    st.wheelAngle += (k.fs * dt) / 0.34;
    for (const w of wheels) {
      w.spin.rotation.x = st.wheelAngle * (0.34 / w.r);
      if (w.front) w.steer.rotation.y = -k.steerVis * 0.42 + (k.drift ? -k.drift * 0.25 : 0);
      w.steer.position.y = w.baseY - st.bounce * 0.12;
    }
    wheelPivot.rotation.z = k.steerVis * 0.9;
    // Fahrer
    st.headYaw += (-k.steerVis * 0.35 - k.drift * 0.2 - st.headYaw) * Math.min(1, dt * 6);
    head.rotation.y = st.headYaw;
    head.rotation.z = k.drift * 0.12;
    mouse.rotation.z = k.drift * 0.15 + k.steerVis * 0.08;
    arms[0].rotation.z = k.steerVis * 0.3;
    arms[1].rotation.z = k.steerVis * 0.3;
    if (k.spinT > 0 || k.tumbleT > 0) head.rotation.z = Math.sin(time * 20) * 0.3;
    scarfTail.rotation.x = 0.2 + Math.sin(time * 18) * 0.15 * Math.min(1, Math.abs(k.fs) / 15);
    scarfTail.rotation.y = 0.3 + Math.sin(time * 13) * 0.25;
    mouseTail.rotation.z = Math.sin(time * 6) * 0.1;

    // Auspuffflammen: Turbo orange-blau, Drift-Stufen blau/orange/lila
    const boosting = k.boostT > 0 || k.goldenT > 0;
    const driftCol = [null, '#4aa8ff', '#ff9a1a', '#c86bff'][k.driftLevel];
    for (const f of flames) {
      const flick = 0.8 + Math.sin(time * 70 + f.position.x * 10) * 0.2;
      if (boosting) {
        f.material.color.set(k.goldenT > 0 ? '#ffd23f' : '#ff8a2a').multiplyScalar(3);
        f.material.opacity = 0.85;
        f.scale.set(1.15 * flick, 1.1 + flick * 0.5, 1.15 * flick);
      } else if (driftCol) {
        f.material.color.set(driftCol).multiplyScalar(2.5);
        f.material.opacity = 0.8;
        f.scale.set(0.9 * flick, 0.9 * flick, 0.9 * flick);
      } else {
        f.material.color.set('#6aa0ff').multiplyScalar(1.5);
        f.material.opacity = k.input.throttle > 0 ? 0.35 : 0.0;
        f.scale.set(0.5 * flick, 0.4 * flick, 0.5 * flick);
      }
    }
    tail.emissiveIntensity = k.input.brake > 0 && k.fs > 1 ? 4 : 0.8;

    // Goldener Gouda: Lack glüht golden
    if (k.goldenT > 0) {
      const p = 0.6 + Math.sin(time * 14) * 0.4;
      paint.emissive.set('#ffb800');
      paint.emissiveIntensity = p * 0.9;
    } else {
      paint.emissiveIntensity = 0;
    }
    // Schild
    shield.visible = k.shieldT > 0;
    if (shield.visible) {
      shieldMat.uniforms.time.value = time;
      shieldMat.uniforms.fade.value = Math.min(1, k.shieldT * 2) * (k.shieldT < 2 ? 0.5 + 0.5 * Math.sin(time * 20) : 1);
    }
    // Kreisende Räder
    for (let i = 0; i < 3; i++) {
      const w = orbit[i];
      w.visible = i < k.orbit;
      if (w.visible) {
        const a = time * 5 + (i / k.orbit) * Math.PI * 2;
        // Weltversatz wie in der Simulation, in Kart-Koordinaten zurückgedreht
        const yaw = root.rotation.y;
        w.position.set(Math.sin(a) * 2.4, 0.6, Math.cos(a) * 2.4).applyAxisAngle(Y_AXIS, -yaw);
        w.rotation.y = a - yaw;
        w.rotation.x = time * 10;
      }
    }
    // Blinken nach Treffern
    root.visible = !(k.invulnT > 0 && k.spinT <= 0 && k.tumbleT <= 0 && Math.floor(time * 16) % 2 === 0);
  }

  return { group: root, update, paint };
}
