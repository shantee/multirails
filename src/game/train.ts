// Bouillotte, la locomotive-bouilloire aux yeux-lanternes, et ses wagons-objets avec leurs voyageurs.
import * as THREE from 'three';
import type { TrackPath } from './track';

const mats = new Map<string, THREE.MeshStandardMaterial>();
function M(color: number, metal = 0, rough = 0.55, emissive = 0): THREE.MeshStandardMaterial {
  const key = `${color}-${metal}-${rough}-${emissive}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
    if (emissive) {
      m.emissive.setHex(color);
      m.emissiveIntensity = emissive;
    }
    mats.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}

const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  sphereLo: new THREE.SphereGeometry(1, 12, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  wheel: new THREE.CylinderGeometry(1, 1, 0.16, 22).rotateZ(Math.PI / 2),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 24),
  capsule: new THREE.CapsuleGeometry(0.1, 0.45, 4, 8),
  halfSphere: new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
};

function lathe(points: Array<[number, number]>, seg = 24): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

/** anneau arrondi extrudé vers le haut : baignoire, boîte de sardines */
function roundedTub(w: number, l: number, r: number, h: number, wall: number): THREE.ExtrudeGeometry {
  const rr = (W: number, L: number, R: number) => {
    const s = new THREE.Shape();
    s.moveTo(-W / 2 + R, -L / 2);
    s.lineTo(W / 2 - R, -L / 2);
    s.quadraticCurveTo(W / 2, -L / 2, W / 2, -L / 2 + R);
    s.lineTo(W / 2, L / 2 - R);
    s.quadraticCurveTo(W / 2, L / 2, W / 2 - R, L / 2);
    s.lineTo(-W / 2 + R, L / 2);
    s.quadraticCurveTo(-W / 2, L / 2, -W / 2, L / 2 - R);
    s.lineTo(-W / 2, -L / 2 + R);
    s.quadraticCurveTo(-W / 2, -L / 2, -W / 2 + R, -L / 2);
    return s;
  };
  const outer = rr(w, l, r);
  const inner = rr(w - wall * 2, l - wall * 2, Math.max(0.05, r - wall));
  outer.holes.push(new THREE.Path(inner.getPoints(8)));
  const g = new THREE.ExtrudeGeometry(outer, { depth: h, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  return g;
}

// ------------------------------------------------------------------ voyageurs

export type Mood = 'idle' | 'cheer' | 'panic' | 'sad' | 'wave';

export interface PassengerLook {
  body: number;
  shape: 'round' | 'tall' | 'egg' | 'fish' | 'cactus';
  hat?: 'top' | 'cap' | 'flower' | 'shower' | 'shell' | 'none';
  scale?: number;
}

export class Passenger {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private pupils: THREE.Mesh[] = [];
  private lids: THREE.Mesh[] = [];
  private smile: THREE.Mesh;
  private oMouth: THREE.Mesh;
  mood: Mood = 'idle';
  private moodUntil = 0;
  private phase = Math.random() * 10;
  private blinkAt = Math.random() * 4;

  constructor(look: PassengerLook) {
    const s = look.scale ?? 1;
    this.root.add(this.body);
    this.body.scale.setScalar(s);
    const skin = M(look.body, 0, 0.6);
    // regard tourné vers l'arrière du train : les voyageurs regardent le joueur
    const face = 1;
    let headY = 0.55;
    if (look.shape === 'round') mesh(G.sphere, skin, 0, 0.5, 0, this.body).scale.set(0.5, 0.48, 0.48);
    if (look.shape === 'tall') {
      mesh(G.sphere, skin, 0, 0.62, 0, this.body).scale.set(0.38, 0.62, 0.38);
      headY = 0.78;
    }
    if (look.shape === 'egg') {
      mesh(G.sphere, M(0xfffaf0, 0, 0.35), 0, 0.6, 0, this.body).scale.set(0.42, 0.58, 0.42);
      headY = 0.7;
    }
    if (look.shape === 'fish') {
      mesh(G.sphere, skin, 0, 0.55, 0, this.body).scale.set(0.3, 0.55, 0.3);
      const fin = mesh(new THREE.ConeGeometry(0.2, 0.3, 4), M(0x7fa8d8, 0.3, 0.4), 0, 1.1, 0, this.body);
      fin.rotation.x = Math.PI;
      headY = 0.7;
    }
    if (look.shape === 'cactus') {
      mesh(G.capsule, skin, 0, 0.6, 0, this.body).scale.set(3.4, 1.2, 3.4);
      headY = 0.75;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const sp = mesh(new THREE.ConeGeometry(0.02, 0.12, 3), M(0xfff6c8), Math.cos(a) * 0.34, 0.4 + (i % 3) * 0.2, Math.sin(a) * 0.34, this.body);
        sp.rotation.z = -Math.cos(a) * 1.4;
        sp.rotation.x = Math.sin(a) * 1.4;
      }
    }
    // yeux
    for (const side of [-1, 1]) {
      const eye = mesh(G.sphereLo, M(0xffffff, 0, 0.3), side * 0.16, headY, 0.43 * face, this.body);
      eye.scale.setScalar(0.13);
      const pupil = mesh(G.sphereLo, M(0x1d1630, 0, 0.3), side * 0.16, headY, 0.545 * face, this.body);
      pupil.scale.setScalar(0.065);
      this.pupils.push(pupil);
      const lid = mesh(G.halfSphere, skin, side * 0.16, headY, 0.43 * face, this.body);
      lid.scale.setScalar(0.14);
      lid.rotation.x = -0.4;
      this.lids.push(lid);
    }
    this.smile = mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI), M(0x5a1f3a), 0, headY - 0.17, 0.46 * face, this.body);
    this.smile.rotation.z = Math.PI;
    this.oMouth = mesh(G.sphereLo, M(0x5a1f3a), 0, headY - 0.2, 0.46 * face, this.body);
    this.oMouth.scale.set(0.07, 0.09, 0.03);
    this.oMouth.visible = false;
    // bras
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.position.set(side * 0.42, 0.45, 0.05);
      this.body.add(arm);
      const a = mesh(G.capsule, skin, 0, 0.28, 0, arm);
      a.scale.set(0.9, 0.9, 0.9);
      mesh(G.sphereLo, M(0xffffff, 0, 0.5), 0, 0.6, 0, arm).scale.setScalar(0.09);
    }
    // chapeaux
    const top = headY + 0.4;
    switch (look.hat) {
      case 'top':
        mesh(G.cyl, M(0x2a2140, 0, 0.5), 0, top + 0.2, 0, this.body).scale.set(0.24, 0.4, 0.24);
        mesh(G.cyl, M(0x2a2140, 0, 0.5), 0, top, 0, this.body).scale.set(0.38, 0.04, 0.38);
        mesh(G.cyl, M(0xff5d73, 0, 0.5), 0, top + 0.06, 0, this.body).scale.set(0.25, 0.07, 0.25);
        break;
      case 'cap':
        mesh(G.halfSphere, M(0x3b5bdb, 0, 0.6), 0, top - 0.08, 0, this.body).scale.set(0.34, 0.22, 0.34);
        mesh(G.box, M(0x3b5bdb, 0, 0.6), 0, top - 0.06, 0.3, this.body).scale.set(0.34, 0.04, 0.22);
        break;
      case 'flower': {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          mesh(G.sphereLo, M(0xff7fae, 0, 0.5), Math.cos(a) * 0.12, top + 0.05, Math.sin(a) * 0.12, this.body).scale.set(0.09, 0.05, 0.09);
        }
        mesh(G.sphereLo, M(0xffe06b, 0, 0.5), 0, top + 0.07, 0, this.body).scale.setScalar(0.07);
        break;
      }
      case 'shower':
        mesh(G.halfSphere, M(0x9ff0d8, 0, 0.3), 0, top - 0.15, 0, this.body).scale.set(0.5, 0.32, 0.5);
        break;
      case 'shell': {
        const shell = mesh(G.halfSphere, M(0xfffaf0, 0, 0.35), 0.04, top + 0.05, 0, this.body);
        shell.scale.set(0.3, 0.2, 0.3);
        shell.rotation.z = 0.35;
        break;
      }
    }
  }

  setMood(m: Mood, now: number, duration = 1.4): void {
    this.mood = m;
    this.moodUntil = now + duration * (0.85 + Math.random() * 0.3);
  }

  update(now: number, dt: number, beat: number): void {
    if (this.mood !== 'idle' && now > this.moodUntil) this.mood = 'idle';
    const t = now + this.phase;
    let bob = Math.abs(Math.sin(beat * Math.PI)) * 0.04;
    let armA = 0.25, armB = 0.25, shake = 0, squint = 0, wide = 0;
    switch (this.mood) {
      case 'cheer':
        bob = Math.abs(Math.sin(t * 9)) * 0.35;
        armA = 2.6 + Math.sin(t * 16) * 0.4;
        armB = 2.6 + Math.cos(t * 16) * 0.4;
        squint = 1;
        break;
      case 'panic':
        shake = Math.sin(t * 40) * 0.06;
        armA = 2.2 + Math.sin(t * 25) * 0.7;
        armB = 2.2 + Math.cos(t * 23) * 0.7;
        wide = 1;
        break;
      case 'sad':
        bob = -0.05;
        armA = armB = 0.05;
        break;
      case 'wave':
        armB = 2.4 + Math.sin(t * 10) * 0.6;
        squint = 0.6;
        break;
    }
    this.body.position.y += (bob - this.body.position.y) * Math.min(1, dt * 14);
    this.body.position.x = shake;
    this.armL.rotation.z += (-armA - this.armL.rotation.z) * Math.min(1, dt * 12);
    this.armR.rotation.z += (armB - this.armR.rotation.z) * Math.min(1, dt * 12);
    // clignement et regard
    let blink = 0;
    if (now > this.blinkAt) {
      blink = 1;
      if (now > this.blinkAt + 0.12) this.blinkAt = now + 2 + Math.random() * 4;
    }
    const close = Math.max(blink, squint * 0.55) * (1 - wide);
    for (const lid of this.lids) lid.rotation.x = -0.4 + close * 1.5 - wide * 0.6;
    const look = Math.sin(t * 0.37) * 0.04;
    for (const p of this.pupils) {
      p.position.x = Math.sign(p.position.x) * 0.16 + look;
      p.scale.setScalar(wide ? 0.045 : 0.065);
    }
    this.smile.visible = this.mood !== 'panic' && this.mood !== 'sad';
    this.oMouth.visible = !this.smile.visible;
    this.smile.scale.setScalar(this.mood === 'cheer' ? 1.35 : 1);
  }
}

// ------------------------------------------------------------------ wagons

type CarKind = 'cup' | 'tub' | 'pot' | 'egg' | 'sardine';
const CAR_ORDER: CarKind[] = ['cup', 'tub', 'pot', 'egg', 'sardine'];

class Wheelset {
  constructor(readonly group: THREE.Group, readonly radius: number) {}
}

function addWheels(parent: THREE.Object3D, zs: number[], r: number, color = 0xe2453c): Wheelset[] {
  const out: Wheelset[] = [];
  for (const z of zs) {
    const g = new THREE.Group();
    g.position.set(0, r, z);
    parent.add(g);
    for (const side of [-1, 1]) {
      const w = mesh(G.wheel, M(color, 0.2, 0.45), side * 0.82, 0, 0, g);
      w.scale.set(1, r, r);
      mesh(G.wheel, M(0xfff1d6, 0.3, 0.4), side * 0.9, 0, 0, g).scale.set(0.5, r * 0.35, r * 0.35);
      const spoke = mesh(G.box, M(0xfff1d6, 0.3, 0.4), side * 0.9, 0, 0, g);
      spoke.scale.set(0.05, r * 1.6, 0.08);
    }
    out.push(new Wheelset(g, r));
  }
  return out;
}

export class Car {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly wheels: Wheelset[];
  readonly passengers: Passenger[] = [];
  readonly length = 4.2;

  constructor(readonly kind: CarKind) {
    this.root.add(this.body);
    // plateau commun
    mesh(G.box, M(0x4b2f5e, 0.2, 0.5), 0, 0.72, 0, this.body).scale.set(1.9, 0.22, 3.8);
    mesh(G.box, M(0xffcf5c, 0.6, 0.35), 0, 0.72, 0, this.body).scale.set(1.96, 0.08, 3.86);
    mesh(G.cyl, M(0x2a2140, 0.4, 0.4), 0, 0.72, -2.05, this.body).rotateX(Math.PI / 2).scale.set(0.12, 0.3, 0.12);
    this.wheels = addWheels(this.body, [-1.25, 1.25], 0.36, 0x6fd3ff);
    const deck = 0.84;
    switch (kind) {
      case 'cup': {
        const cup = mesh(lathe([[0, 0], [0.7, 0.02], [0.95, 0.3], [1.1, 0.9], [1.18, 1.35], [1.1, 1.35], [1.0, 0.92], [0.85, 0.35], [0, 0.32]], 28), M(0xfffaf3, 0, 0.25), 0, deck + 0.12, 0, this.body);
        cup.material = M(0xfffaf3, 0, 0.25);
        mesh(G.cyl, M(0xffffff, 0, 0.3), 0, deck + 0.05, 0, this.body).scale.set(1.5, 0.08, 1.5);
        mesh(G.torus, M(0xff8fb2, 0, 0.3), 0, deck + 1.18, 0, this.body).rotateX(Math.PI / 2).scale.set(1.12, 1.12, 0.5);
        const handle = mesh(G.torus, M(0xfffaf3, 0, 0.25), 1.18, deck + 0.85, 0, this.body);
        handle.scale.set(0.38, 0.38, 1.6);
        handle.rotation.y = Math.PI / 2;
        this.seat({ body: 0x6fa8ff, shape: 'round', hat: 'top' }, 0, deck + 0.75, 0);
        break;
      }
      case 'tub': {
        mesh(roundedTub(1.7, 3.3, 0.7, 0.85, 0.12), M(0xffffff, 0, 0.2), 0, deck + 0.32, 0, this.body);
        mesh(G.box, M(0xffffff, 0, 0.3), 0, deck + 0.3, 0, this.body).scale.set(1.5, 0.12, 3.1);
        for (const [x, z] of [[-0.7, -1.3], [0.7, -1.3], [-0.7, 1.3], [0.7, 1.3]]) mesh(G.sphereLo, M(0xffcf5c, 0.7, 0.3), x, deck + 0.18, z, this.body).scale.setScalar(0.17);
        mesh(G.cyl, M(0xc9cde0, 0.8, 0.2), 0, deck + 1.35, 1.45, this.body).scale.set(0.05, 0.9, 0.05);
        this.seat({ body: 0xff9fc6, shape: 'round', hat: 'shower' }, 0, deck + 0.7, 0.35);
        // canard en caoutchouc
        const duck = new THREE.Group();
        mesh(G.sphereLo, M(0xffd93b, 0, 0.4), 0, 0, 0, duck).scale.set(0.24, 0.18, 0.3);
        mesh(G.sphereLo, M(0xffd93b, 0, 0.4), 0, 0.2, 0.12, duck).scale.setScalar(0.14);
        mesh(G.sphereLo, M(0xff8a3b, 0, 0.4), 0, 0.18, 0.27, duck).scale.set(0.07, 0.04, 0.08);
        duck.position.set(0.45, deck + 1.05, -1);
        this.body.add(duck);
        break;
      }
      case 'pot': {
        mesh(lathe([[0, 0], [0.75, 0], [0.82, 0.1], [1.05, 1.2], [1.2, 1.25], [1.22, 1.45], [1.08, 1.45], [0.95, 1.25], [0, 1.2]], 20), M(0xe0795a, 0, 0.75), 0, deck + 0.05, 0, this.body);
        mesh(G.cyl, M(0x7a4e3a, 0, 0.9), 0, deck + 1.25, 0, this.body).scale.set(0.98, 0.05, 0.98);
        this.seat({ body: 0x5fbf6a, shape: 'cactus', hat: 'flower' }, 0, deck + 1.15, 0);
        break;
      }
      case 'egg': {
        mesh(lathe([[0, 0], [0.6, 0], [0.6, 0.1], [0.22, 0.25], [0.22, 0.55], [0.95, 0.85], [1.1, 1.3], [1.0, 1.3], [0.85, 0.95], [0, 0.85]], 24), M(0xffcf5c, 0.65, 0.3), 0, deck, 0, this.body);
        this.seat({ body: 0xfffaf0, shape: 'egg', hat: 'shell' }, 0, deck + 0.85, 0);
        break;
      }
      case 'sardine': {
        mesh(roundedTub(1.75, 3.4, 0.5, 0.55, 0.08), M(0xc9d3e6, 0.85, 0.25), 0, deck + 0.05, 0, this.body);
        mesh(G.box, M(0xc9d3e6, 0.85, 0.25), 0, deck + 0.08, 0, this.body).scale.set(1.6, 0.06, 3.3);
        const lid = mesh(G.cyl, M(0xdfe6f5, 0.85, 0.25), 0, deck + 0.75, 1.75, this.body);
        lid.scale.set(0.28, 1.7, 0.28);
        lid.rotation.z = Math.PI / 2;
        mesh(G.box, M(0xff5d73, 0, 0.5), 0, deck + 0.35, -1.71, this.body).scale.set(1.2, 0.3, 0.02);
        for (let i = 0; i < 3; i++) this.seat({ body: 0x8fb8e6, shape: 'fish', hat: i === 1 ? 'cap' : 'none', scale: 0.72 }, (i - 1) * 0.5, deck + 0.05, 0.4 - i * 0.55);
        break;
      }
    }
  }

  private seat(look: PassengerLook, x: number, y: number, z: number): void {
    const p = new Passenger(look);
    p.root.position.set(x, y, z);
    this.body.add(p.root);
    this.passengers.push(p);
  }
}

// ------------------------------------------------------------------ locomotive

export type LocoMood = 'happy' | 'scared' | 'proud' | 'sad' | 'idle' | 'boil';

export class Locomotive {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly wheels: Wheelset[];
  readonly length = 6.2;
  readonly chimneyTop = new THREE.Object3D();
  readonly whistleTop = new THREE.Object3D();
  readonly boilerMat: THREE.MeshStandardMaterial;
  private eyes: Array<{ stalk: THREE.Group; ball: THREE.Group; lidT: THREE.Mesh; lidB: THREE.Mesh; pupil: THREE.Group }> = [];
  private lid: THREE.Group;
  private rods: THREE.Mesh[] = [];
  readonly driver: Passenger;
  mood: LocoMood = 'idle';
  private moodUntil = 0;
  private blinkAt = 2;
  private squash = 0;
  private squashV = 0;
  private lookBack = 0;

  constructor() {
    this.root.add(this.body);
    const b = this.body;
    const plum = M(0x4b2f5e, 0.25, 0.5);
    const brass = M(0xffcf5c, 0.8, 0.28);
    this.boilerMat = new THREE.MeshStandardMaterial({ color: 0x2fb7a6, metalness: 0.35, roughness: 0.32 });
    const copper = M(0xe0793f, 0.75, 0.3);
    // châssis et chasse-pierres
    mesh(G.box, plum, 0, 0.8, 0, b).scale.set(1.9, 0.32, 5.9);
    const cow = mesh(new THREE.ConeGeometry(1, 1, 4, 1), M(0x59377a, 0.3, 0.5), 0, 0.5, -3.0, b);
    cow.scale.set(0.95, 0.5, 0.6);
    cow.rotation.set(-Math.PI / 2, Math.PI / 4, 0);
    // moustache en laiton sous le nez : la touche de caractère
    for (const side of [-1, 1]) {
      const curl = mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 16, Math.PI * 1.3), brass, side * 0.3, 1.38, -2.74, b);
      curl.rotation.set(0, 0, side < 0 ? Math.PI * 0.95 : -Math.PI * 0.25);
      curl.scale.set(side, 1, 1);
    }
    // chaudière émaillée, cerclée de laiton
    const boiler = mesh(G.cyl, this.boilerMat, 0, 1.85, -0.55, b);
    boiler.scale.set(0.88, 3.6, 0.88);
    boiler.rotation.x = Math.PI / 2;
    for (const z of [-2.1, -1.1, 0, 1.0]) {
      const band = mesh(G.torus, brass, 0, 1.85, z, b);
      band.scale.set(0.9, 0.9, 0.6);
    }
    // avant bombé en cuivre (la « bouilloire »)
    const nose = mesh(G.sphere, copper, 0, 1.85, -2.35, b);
    nose.scale.set(0.88, 0.88, 0.45);
    mesh(G.sphereLo, M(0xfff5c0, 0, 0.2, 1.2), 0, 1.85, -2.78, b).scale.set(0.22, 0.22, 0.08);
    // couvercle de bouilloire qui saute quand ça bout
    this.lid = new THREE.Group();
    this.lid.position.set(0, 2.62, -0.3);
    b.add(this.lid);
    mesh(G.halfSphere, copper, 0, 0, 0, this.lid).scale.set(0.55, 0.35, 0.55);
    mesh(G.sphereLo, M(0xff5d73, 0.1, 0.4), 0, 0.42, 0, this.lid).scale.setScalar(0.14);
    mesh(G.cyl, copper, 0, 0.36, 0, this.lid).scale.set(0.05, 0.12, 0.05);
    // cheminée évasée
    const chim = mesh(lathe([[0.22, 0], [0.24, 0.5], [0.33, 0.85], [0.48, 1.05], [0.42, 1.08], [0.3, 0.95], [0, 0.95]], 20), copper, 0, 2.55, -1.75, b);
    chim.scale.setScalar(1);
    mesh(G.torus, brass, 0, 3.6, -1.75, b).rotateX(Math.PI / 2).scale.set(0.47, 0.47, 0.6);
    this.chimneyTop.position.set(0, 3.7, -1.75);
    b.add(this.chimneyTop);
    // yeux-lanternes sur tiges
    for (const side of [-1, 1]) {
      const stalk = new THREE.Group();
      stalk.position.set(side * 0.52, 2.5, -2.05);
      b.add(stalk);
      mesh(G.cyl, brass, 0, 0.2, 0, stalk).scale.set(0.08, 0.4, 0.08);
      const ball = new THREE.Group();
      ball.position.y = 0.62;
      stalk.add(ball);
      mesh(G.sphere, M(0xfffdf5, 0, 0.18), 0, 0, 0, ball).scale.setScalar(0.4);
      mesh(G.torus, brass, 0, 0, -0.12, ball).scale.set(0.38, 0.38, 0.5);
      const pupil = new THREE.Group();
      ball.add(pupil);
      mesh(G.sphereLo, M(0x2d6cdf, 0, 0.3), 0, 0, -0.33, pupil).scale.set(0.2, 0.2, 0.1);
      mesh(G.sphereLo, M(0x120d1f, 0, 0.2), 0, 0, -0.38, pupil).scale.set(0.11, 0.11, 0.06);
      mesh(G.sphereLo, M(0xffffff, 0, 0.1, 0.6), 0.05, 0.06, -0.41, pupil).scale.setScalar(0.035);
      const lidT = mesh(G.halfSphere, copper, 0, 0, 0, ball);
      lidT.scale.setScalar(0.43);
      const lidB = mesh(G.halfSphere, copper, 0, 0, 0, ball);
      lidB.scale.setScalar(0.43);
      // sourcil
      const brow = mesh(G.box, M(0x2a2140), 0, 0.52, -0.1, ball);
      brow.scale.set(0.42, 0.07, 0.08);
      brow.rotation.z = side * -0.15;
      this.eyes.push({ stalk, ball, lidT, lidB, pupil });
    }
    // cabine
    const cabMat = M(0xff8fb2, 0.1, 0.45);
    mesh(G.box, cabMat, 0, 1.95, 2.0, b).scale.set(2.0, 1.75, 1.55);
    const roof = mesh(G.cyl, plum, 0, 2.85, 2.0, b);
    roof.scale.set(1.45, 1.8, 0.5);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(0.5, 2.25, 1.0);
    for (const side of [-1, 1]) {
      const win = mesh(G.cyl, M(0xfff0b0, 0, 0.3, 0.5), side * 1.01, 2.15, 2.0, b);
      win.scale.set(0.34, 0.04, 0.34);
      win.rotation.z = Math.PI / 2;
      mesh(G.torus, brass, side * 1.02, 2.15, 2.0, b).rotateY(Math.PI / 2).scale.set(0.36, 0.36, 0.5);
    }
    // ouverture arrière de la cabine (on y voit la conductrice)
    mesh(G.box, M(0x2a1f3d, 0, 0.8), 0, 2.05, 2.78, b).scale.set(1.4, 1.2, 0.04);
    this.driver = new Passenger({ body: 0x9be36b, shape: 'round', hat: 'cap', scale: 0.85 });
    this.driver.root.position.set(0, 1.25, 2.55);
    b.add(this.driver.root);
    // sifflet sur le toit
    mesh(G.cyl, brass, 0.5, 3.15, 1.5, b).scale.set(0.09, 0.4, 0.09);
    this.whistleTop.position.set(0.5, 3.4, 1.5);
    b.add(this.whistleTop);
    // roues motrices et bielles
    this.wheels = [...addWheels(b, [-2.2, -1.4], 0.4), ...addWheels(b, [0.15, 1.55], 0.62)];
    for (const side of [-1, 1]) {
      const rod = mesh(G.box, M(0xd8dbe8, 0.85, 0.25), side * 1.0, 0.62, 0.85, b);
      rod.scale.set(0.07, 0.1, 1.7);
      this.rods.push(rod);
    }
    // tampons
    for (const side of [-1, 1]) mesh(G.cyl, brass, side * 0.65, 0.85, -3.0, b).rotateX(Math.PI / 2).scale.set(0.14, 0.25, 0.14);
  }

  setMood(m: LocoMood, now: number, duration = 1.6): void {
    this.mood = m;
    this.moodUntil = now + duration;
    if (m === 'happy' || m === 'proud' || m === 'boil') this.kick(0.12);
    if (m === 'scared') this.kick(-0.08);
  }

  kick(v: number): void {
    this.squashV += v * 10;
  }

  update(now: number, dt: number, travelled: number, beat: number, boiling: boolean): void {
    if (this.mood !== 'idle' && now > this.moodUntil && !(this.mood === 'boil' && boiling)) this.mood = 'idle';
    // ressort d'écrasement / étirement façon dessin animé
    this.squashV += (-this.squash * 90 - this.squashV * 9) * dt;
    this.squash += this.squashV * dt;
    const chug = Math.sin(beat * Math.PI * 2) * 0.012;
    this.body.scale.set(1 - this.squash * 0.5, 1 + this.squash + chug, 1 - this.squash * 0.3);
    for (const w of this.wheels) w.group.rotation.x = -travelled / w.radius;
    const crank = -travelled / 0.62;
    for (const rod of this.rods) {
      rod.position.y = 0.62 + Math.sin(crank) * 0.28;
      rod.position.z = 0.85 + Math.cos(crank) * 0.28;
    }
    // couvercle : saute quand ça bout ou de joie
    const hop = boiling ? Math.abs(Math.sin(now * 14)) * 0.18 : this.mood === 'happy' ? Math.abs(Math.sin(now * 10)) * 0.1 : 0;
    this.lid.position.y = 2.62 + hop;
    this.lid.rotation.z = boiling ? Math.sin(now * 23) * 0.15 : 0;
    // les yeux se retournent vers le joueur quand le train est content
    const wantBack = this.mood === 'happy' || this.mood === 'proud' || this.mood === 'boil' || this.mood === 'sad' ? 1 : 0;
    this.lookBack += (wantBack - this.lookBack) * Math.min(1, dt * 7);
    let blink = 0;
    if (now > this.blinkAt) {
      blink = 1;
      if (now > this.blinkAt + 0.13) this.blinkAt = now + 2.5 + Math.random() * 3;
    }
    const scared = this.mood === 'scared';
    const happy = this.mood === 'happy' || this.mood === 'proud' || this.mood === 'boil';
    this.eyes.forEach((e, i) => {
      const side = i === 0 ? -1 : 1;
      e.stalk.rotation.y = this.lookBack * Math.PI * (side < 0 ? -0.95 : 0.95) + (scared ? Math.sin(now * 31 + i) * 0.08 : 0);
      e.stalk.rotation.z = scared ? side * 0.25 : happy ? Math.sin(now * 8 + i) * 0.15 : Math.sin(now * 1.3 + i) * 0.05;
      e.ball.scale.setScalar(scared ? 1.22 : 1);
      e.pupil.scale.setScalar(scared ? 0.7 : 1);
      e.pupil.rotation.y = Math.sin(now * 0.6 + i * 0.3) * 0.18;
      e.pupil.rotation.x = this.mood === 'sad' ? -0.35 : 0.08;
      // paupières : ouvertes (écartées), plissées de joie, fermées pour cligner
      const open = scared ? 1.7 : 1.35;
      const closeT = Math.max(blink, happy ? 0.5 : this.mood === 'sad' ? 0.42 : 0);
      const closeB = Math.max(blink, happy ? 0.38 : 0);
      e.lidT.rotation.x = open * (1 - closeT);
      e.lidB.rotation.x = Math.PI - open * (1 - closeB);
    });
  }
}

// ------------------------------------------------------------------ convoi

export interface DetachedCar {
  car: Car;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
}

export class Train {
  readonly group = new THREE.Group();
  readonly loco = new Locomotive();
  cars: Car[] = [];
  private nextKind = 0;
  /** wagons qui arrivent du ciel sous un ballon */
  private arriving: Array<{ car: Car; t: number }> = [];
  private balloons = new Map<Car, THREE.Group>();
  travelled = 0;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private m = new THREE.Matrix4();
  readonly gapBetween = 0.55;

  constructor(wagons: number) {
    this.group.add(this.loco.root);
    for (let i = 0; i < wagons; i++) this.addCar(false);
  }

  reset(wagons: number): void {
    for (const c of this.cars) this.group.remove(c.root);
    for (const b of this.balloons.values()) b.removeFromParent();
    this.balloons.clear();
    this.arriving = [];
    this.cars = [];
    this.nextKind = 0;
    for (let i = 0; i < wagons; i++) this.addCar(false);
    this.loco.root.visible = true;
  }

  addCar(fromSky: boolean): Car {
    const car = new Car(CAR_ORDER[this.nextKind++ % CAR_ORDER.length]);
    this.cars.push(car);
    this.group.add(car.root);
    if (fromSky) {
      this.arriving.push({ car, t: 0 });
      const balloon = new THREE.Group();
      const colors = [0xff5d73, 0xffcf5c, 0x6fd3ff, 0x9be36b, 0xc98bff];
      mesh(G.sphere, M(colors[this.cars.length % colors.length], 0, 0.35), 0, 4.8, 0, balloon).scale.set(1.4, 1.6, 1.4);
      for (const [x, z] of [[-0.7, -1.4], [0.7, -1.4], [-0.7, 1.4], [0.7, 1.4]]) {
        const rope = mesh(G.cyl, M(0xffffff), x * 0.5, 2.6, z * 0.4, balloon);
        rope.scale.set(0.02, 3.4, 0.02);
        rope.rotation.set(z * 0.12, 0, -x * 0.2);
      }
      car.body.add(balloon);
      this.balloons.set(car, balloon);
    }
    return car;
  }

  /** le dernier wagon quitte le convoi (pour construire le pont de secours) */
  detachLast(): Car | undefined {
    const car = this.cars.pop();
    if (car) {
      this.arriving = this.arriving.filter((a) => a.car !== car);
      this.balloons.delete(car);
    }
    return car;
  }

  get length(): number {
    return this.loco.length + this.cars.length * (4.2 + this.gapBetween);
  }

  allPassengers(): Passenger[] {
    return [this.loco.driver, ...this.cars.flatMap((c) => c.passengers)];
  }

  /** pose le convoi sur la voie : s = avant de la locomotive */
  place(path: TrackPath, s: number, dt: number, now: number, beat: number, boiling: boolean, tilt: number, popped: (car: Car) => void): void {
    this.travelled = s;
    let offset = this.loco.length / 2;
    this.orient(this.loco.root, path, s - offset, this.loco.length * 0.6, tilt);
    this.loco.update(now, dt, s, beat, boiling);
    this.loco.driver.update(now, dt, beat);
    offset = this.loco.length + this.gapBetween;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      const cs = s - offset - c.length / 2;
      this.orient(c.root, path, cs, c.length * 0.6, 0);
      // petit cahot décalé de wagon en wagon
      c.body.position.y = Math.abs(Math.sin((beat - i * 0.17) * Math.PI)) * 0.03;
      for (const w of c.wheels) w.group.rotation.x = -cs / w.radius;
      for (const p of c.passengers) p.update(now, dt, beat - i * 0.17);
      offset += c.length + this.gapBetween;
    }
    // arrivée en ballon : descente puis le ballon éclate
    for (const a of this.arriving) {
      a.t += dt;
      const k = Math.min(1, a.t / 1.6);
      const e = 1 - Math.pow(1 - k, 3);
      a.car.body.position.y += (1 - e) * 14;
      a.car.body.rotation.z = Math.sin(a.t * 3) * 0.2 * (1 - e);
      if (k >= 1) {
        const b = this.balloons.get(a.car);
        if (b) {
          b.removeFromParent();
          this.balloons.delete(a.car);
          popped(a.car);
        }
      }
    }
    this.arriving = this.arriving.filter((a) => a.t < 1.6);
  }

  private orient(obj: THREE.Object3D, path: TrackPath, s: number, half: number, tilt: number): void {
    const a = path.point(s + half, this.tmpA);
    const b = path.point(s - half, this.tmpB);
    const f = path.frame(s);
    const fwd = a.sub(b).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, f.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);
    this.m.makeBasis(right, up, fwd.clone().negate());
    obj.quaternion.setFromRotationMatrix(this.m);
    if (tilt) obj.rotateX(-tilt);
    obj.position.copy(f.pos);
  }
}
