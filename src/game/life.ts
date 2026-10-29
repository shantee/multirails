// La vie du monde : petites scènes sur les îles (un paysan court après sa poule, un monstre fait la sieste
// sous un champignon, un robot répare une maison…), habitants qui saluent le train, volées d'oiseaux,
// poissons volants ou lanternes, et poussières d'ambiance (pollen, spores, neige, bulles, poussière d'étoiles).
import * as THREE from 'three';
import { Builder, trs, type Anim } from './geo';
import { mulberry32, type Rng } from './model';
import type { MoteKind, RegionDef } from './regions';
import { shadowFigure, shadowMaterial } from './mer';

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

function put(b: Builder, name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, o: { glow?: number; anim?: Anim; rx?: number; ry?: number; rz?: number; jitter?: number } = {}): void {
  b.add(name, trs(x, y, z, o.ry ?? 0, sx, sy, sz, o.rx ?? 0, o.rz ?? 0), color, 0, o.glow ?? 0, o.jitter ?? 0, o.anim);
}

const swingArm = (side: number, wave: boolean, y = 0.95, x = 0.38): Anim => ({
  kind: wave ? 2 : 4, pivot: new THREE.Vector3(side * x, y, 0), axis: Z, param: wave ? side * 0.55 : side * 0.12,
});

// ------------------------------------------------------------------ personnages (géométries partagées)

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: (b: Builder) => void): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    const b = new Builder();
    make(b);
    b.hasAnim = true;
    g = b.geometry();
    cache.set(key, g);
  }
  return g;
}

function eyes(b: Builder, y: number, z: number, spread = 0.13, size = 0.07): void {
  for (const s of [-1, 1]) {
    put(b, 'sph', s * spread, y, z, size * 1.6, size * 1.6, size, 0xffffff);
    put(b, 'sph', s * spread, y, z + size * 0.7, size * 0.8, size * 0.9, size * 0.5, 0x1d1630);
  }
}

/** habitant : corps rond, tête, bras (qui saluent si `wave`), chapeau */
function villager(body: number, hat: number, wave: boolean, small = false, hatKind = 0): THREE.BufferGeometry {
  return cached(`v${body}-${hat}-${wave}-${small}-${hatKind}`, (b) => {
    const k = small ? 0.7 : 1;
    put(b, 'cyl6', -0.15 * k, 0.2 * k, 0, 0.08 * k, 0.4 * k, 0.08 * k, 0x3a3048);
    put(b, 'cyl6', 0.15 * k, 0.2 * k, 0, 0.08 * k, 0.4 * k, 0.08 * k, 0x3a3048);
    put(b, 'sph', 0, 0.75 * k, 0, 0.36 * k, 0.45 * k, 0.32 * k, body, { jitter: 0.05 });
    put(b, 'sph', 0, 1.38 * k, 0, 0.3 * k, 0.3 * k, 0.3 * k, 0xffd8b8);
    eyes(b, 1.42 * k, 0.24 * k, 0.11 * k, 0.06 * k);
    put(b, 'sph', 0, 1.3 * k, 0.29 * k, 0.05 * k, 0.04 * k, 0.03 * k, 0xff8f9f);
    for (const s of [-1, 1]) {
      const anim = swingArm(s, wave, 1.0 * k, 0.32 * k);
      put(b, 'box', s * 0.4 * k, (wave ? 1.3 : 0.75) * k, 0, 0.12 * k, 0.55 * k, 0.12 * k, body, { anim, rz: wave ? s * -0.3 : s * 0.15 });
      put(b, 'sph', s * 0.44 * k, (wave ? 1.6 : 0.47) * k, 0, 0.09 * k, 0.09 * k, 0.09 * k, 0xffd8b8, { anim });
    }
    if (hatKind === 0) {
      put(b, 'cyl8', 0, 1.62 * k, 0, 0.36 * k, 0.05 * k, 0.36 * k, hat);
      put(b, 'cyl8', 0, 1.72 * k, 0, 0.2 * k, 0.2 * k, 0.2 * k, hat);
    } else if (hatKind === 1) {
      // chapeau pointu d'astronome, constellé
      put(b, 'cone8', 0, 1.9 * k, 0, 0.3 * k, 0.7 * k, 0.3 * k, hat);
      put(b, 'tetra', 0.1 * k, 1.85 * k, 0.2 * k, 0.07 * k, 0.07 * k, 0.07 * k, 0xfff1a0, { glow: 2 });
    } else put(b, 'cap', 0, 1.55 * k, 0, 0.32 * k, 0.22 * k, 0.32 * k, hat);
  });
}

const hen = () => cached('hen', (b) => {
  put(b, 'sph', 0, 0.4, 0, 0.3, 0.28, 0.38, 0xfffaf2);
  put(b, 'sph', 0, 0.7, 0.25, 0.17, 0.17, 0.17, 0xfffaf2);
  put(b, 'box', 0, 0.9, 0.25, 0.04, 0.12, 0.14, 0xff4a5a);
  put(b, 'cone4', 0, 0.68, 0.45, 0.06, 0.12, 0.06, 0xffb030, { rx: Math.PI / 2 });
  eyes(b, 0.74, 0.37, 0.08, 0.035);
  for (const s of [-1, 1]) put(b, 'box', s * 0.3, 0.45, 0, 0.05, 0.2, 0.3, 0xf0e8d8, { anim: { kind: 5, pivot: new THREE.Vector3(s * 0.26, 0.55, 0), axis: Z, param: s * 0.6 } });
  for (const s of [-1, 1]) put(b, 'cyl6', s * 0.1, 0.1, 0, 0.03, 0.22, 0.03, 0xffb030);
});

const sheepGeo = () => cached('sheep', (b) => {
  put(b, 'ico1', 0, 0.85, 0, 0.85, 0.7, 1.05, 0xfffaf2, { jitter: 0.15 });
  for (const [x, z] of [[-0.35, -0.5], [0.35, -0.5], [-0.35, 0.5], [0.35, 0.5]]) put(b, 'cyl6', x, 0.25, z, 0.09, 0.5, 0.09, 0x3a3048);
  put(b, 'box', 0, 0.95, 1.05, 0.42, 0.45, 0.5, 0x3a3048);
  eyes(b, 1.05, 1.32, 0.12, 0.05);
});

const monster = () => cached('monster', (b) => {
  put(b, 'ico1', 0, 0.9, 0, 1.3, 0.95, 1.1, 0x9f7ae8, { jitter: 0.12 });
  put(b, 'sph', 0, 0.7, 0.9, 0.55, 0.35, 0.3, 0xc8b0ff);
  for (const s of [-1, 1]) {
    put(b, 'cone6', s * 0.6, 1.95, 0.1, 0.16, 0.5, 0.16, 0xfff1dc, { rz: -s * 0.4 });
    // yeux fermés : deux petits traits
    put(b, 'box', s * 0.35, 1.25, 1.02, 0.25, 0.05, 0.05, 0x2a1f3d);
    put(b, 'sph', s * 0.9, 0.2, 0.6, 0.3, 0.2, 0.4, 0x9f7ae8);
  }
  put(b, 'box', 0, 0.85, 1.12, 0.3, 0.06, 0.04, 0x5a1f3a);
});

const fairy = () => cached('fairy', (b) => {
  put(b, 'sph', 0, 0, 0, 0.14, 0.22, 0.14, 0x9ff7e0, { glow: 1 });
  put(b, 'sph', 0, 0.28, 0, 0.12, 0.12, 0.12, 0xffe8d8);
  put(b, 'cone6', 0, 0.45, 0, 0.1, 0.2, 0.1, 0xff9fd0);
  for (const s of [-1, 1]) {
    const anim: Anim = { kind: 5, pivot: new THREE.Vector3(0, 0.05, -0.05), axis: Y, param: s * 0.7 };
    put(b, 'sph', s * 0.32, 0.12, -0.1, 0.3, 0.2, 0.03, 0xe8fbff, { glow: 1.6, anim, ry: s * 0.4 });
  }
  // arrosoir
  put(b, 'cyl8', 0.25, -0.05, 0.15, 0.1, 0.14, 0.1, 0xffcf5c);
  put(b, 'cyl6', 0.4, -0.02, 0.22, 0.02, 0.2, 0.02, 0xffcf5c, { rz: 0.9 });
});

const frog = () => cached('frog', (b) => {
  put(b, 'sph', 0, 0.35, 0, 0.45, 0.32, 0.5, 0x6fd38a);
  put(b, 'sph', 0, 0.3, 0.2, 0.36, 0.22, 0.35, 0xc8f0a0);
  for (const s of [-1, 1]) {
    put(b, 'sph', s * 0.22, 0.65, 0.25, 0.15, 0.15, 0.15, 0x6fd38a);
    put(b, 'sph', s * 0.22, 0.7, 0.36, 0.08, 0.08, 0.05, 0x1d1630);
    put(b, 'sph', s * 0.4, 0.12, -0.2, 0.18, 0.1, 0.3, 0x5fc07a);
  }
});

const yeti = () => cached('yeti', (b) => {
  put(b, 'ico1', 0, 1.2, 0, 0.9, 1.15, 0.8, 0xffffff, { jitter: 0.1 });
  put(b, 'sph', 0, 1.6, 0.6, 0.45, 0.4, 0.25, 0xbfd8f0);
  eyes(b, 1.75, 0.82, 0.16, 0.08);
  put(b, 'box', 0, 1.45, 0.86, 0.25, 0.05, 0.04, 0x5a1f3a);
  for (const s of [-1, 1]) {
    put(b, 'cyl6', s * 0.35, 0.25, 0, 0.22, 0.5, 0.22, 0xffffff);
    put(b, 'box', s * 0.95, 1.6, 0.3, 0.3, 0.9, 0.3, 0xffffff, { rz: s * -0.5, rx: -0.6 });
  }
});

const penguin = () => cached('penguin', (b) => {
  put(b, 'sph', 0, 0.5, 0, 0.32, 0.5, 0.3, 0x2a2660);
  put(b, 'sph', 0, 0.45, 0.12, 0.25, 0.4, 0.22, 0xffffff);
  put(b, 'cone4', 0, 0.75, 0.33, 0.06, 0.14, 0.06, 0xffb030, { rx: Math.PI / 2 });
  eyes(b, 0.82, 0.24, 0.09, 0.04);
  for (const s of [-1, 1]) put(b, 'box', s * 0.32, 0.55, 0, 0.05, 0.4, 0.2, 0x2a2660, { anim: { kind: 2, pivot: new THREE.Vector3(s * 0.3, 0.75, 0), axis: Z, param: s * 0.5 } });
});

const robot = () => cached('robot', (b) => {
  put(b, 'box', 0, 0.9, 0, 0.8, 0.9, 0.55, 0xd8dcf0);
  put(b, 'box', 0, 1.6, 0, 0.6, 0.5, 0.5, 0xc0c8e0);
  for (const s of [-1, 1]) put(b, 'cyl8', s * 0.15, 1.62, 0.26, 0.1, 0.05, 0.1, 0x9ff7ff, { glow: 2, rx: Math.PI / 2 });
  put(b, 'cyl6', 0, 2, 0, 0.03, 0.35, 0.03, 0x5d4a65);
  put(b, 'sph', 0, 2.2, 0, 0.09, 0.09, 0.09, 0xff5d73, { glow: 2 });
  put(b, 'cyl8', 0, 0.3, 0, 0.35, 0.6, 0.35, 0x8c8aa8);
  put(b, 'box', -0.5, 0.9, 0, 0.15, 0.6, 0.15, 0xc0c8e0);
  // bras-marteau qui frappe
  const anim: Anim = { kind: 5, pivot: new THREE.Vector3(0.48, 1.2, 0), axis: X, param: 0.55 };
  put(b, 'box', 0.5, 1.2, 0.35, 0.14, 0.14, 0.7, 0xc0c8e0, { anim });
  put(b, 'cyl8', 0.5, 1.2, 0.8, 0.16, 0.45, 0.16, 0xffcf5c, { anim });
});

const robodog = () => cached('robodog', (b) => {
  put(b, 'box', 0, 0.5, 0, 0.4, 0.32, 0.8, 0xffcf5c);
  put(b, 'box', 0, 0.75, 0.48, 0.32, 0.3, 0.32, 0xe0a050);
  put(b, 'cyl8', 0, 0.75, 0.65, 0.08, 0.04, 0.08, 0x9ff7ff, { glow: 2, rx: Math.PI / 2 });
  for (const s of [-1, 1]) put(b, 'box', s * 0.13, 0.95, 0.42, 0.05, 0.18, 0.08, 0x5d4a65);
  put(b, 'cyl6', 0, 0.75, -0.5, 0.03, 0.4, 0.03, 0x5d4a65, { anim: { kind: 5, pivot: new THREE.Vector3(0, 0.6, -0.4), axis: Z, param: 0.6 }, rx: -0.8 });
  for (const [x, z] of [[-0.15, -0.3], [0.15, -0.3], [-0.15, 0.3], [0.15, 0.3]]) put(b, 'cyl6', x, 0.18, z, 0.05, 0.36, 0.05, 0x5d4a65);
});

const crab = () => cached('crab', (b) => {
  put(b, 'sph', 0, 0.35, 0, 0.6, 0.3, 0.45, 0xff6a4a);
  for (const s of [-1, 1]) {
    put(b, 'cyl6', s * 0.15, 0.7, 0.2, 0.03, 0.3, 0.03, 0xff6a4a);
    put(b, 'sph', s * 0.15, 0.88, 0.2, 0.09, 0.09, 0.09, 0xffffff);
    put(b, 'sph', s * 0.15, 0.88, 0.27, 0.05, 0.05, 0.03, 0x1d1630);
    const anim: Anim = { kind: 2, pivot: new THREE.Vector3(s * 0.5, 0.4, 0.2), axis: Z, param: s * 0.45 };
    put(b, 'box', s * 0.7, 0.6, 0.35, 0.15, 0.4, 0.15, 0xff6a4a, { anim, rz: s * 0.5 });
    put(b, 'sph', s * 0.85, 0.85, 0.4, 0.2, 0.15, 0.12, 0xff8a6a, { anim });
    for (let k = 0; k < 3; k++) put(b, 'cyl6', s * 0.55, 0.15, -0.2 + k * 0.2, 0.03, 0.3, 0.03, 0xe05a3a, { rz: s * 1 });
  }
});

const octopus = () => cached('octopus', (b) => {
  put(b, 'sph', 0, 1.3, 0, 0.6, 0.7, 0.6, 0xc98bff);
  eyes(b, 1.3, 0.52, 0.2, 0.09);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const base = new THREE.Vector3(Math.cos(a) * 0.35, 0.75, Math.sin(a) * 0.35);
    const anim: Anim = { kind: i % 2 ? 2 : 4, pivot: base, axis: new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), param: 0.4 };
    put(b, 'cone6', Math.cos(a) * 0.55, 0.4, Math.sin(a) * 0.55, 0.13, 0.8, 0.13, 0xb070f0, { anim, rx: Math.PI + Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 });
  }
});

const rabbit = () => cached('rabbit', (b) => {
  put(b, 'sph', 0, 0.35, 0, 0.3, 0.32, 0.38, 0xf4f2ff);
  put(b, 'sph', 0, 0.68, 0.22, 0.22, 0.22, 0.22, 0xf4f2ff);
  eyes(b, 0.72, 0.4, 0.08, 0.04);
  for (const s of [-1, 1]) put(b, 'sph', s * 0.08, 1.02, 0.18, 0.06, 0.25, 0.04, 0xffd0f0, { rz: s * -0.2 });
  put(b, 'sph', 0, 0.38, -0.38, 0.1, 0.1, 0.1, 0xffffff);
});

const boat = () => cached('boat', (b) => {
  put(b, 'box', 0, 0.25, 0, 1.3, 0.45, 3.2, 0x6a4a3a);
  put(b, 'box', 0, 0.48, 0, 1.1, 0.1, 3, 0x8a6a50);
  put(b, 'cone4', 0, 0.3, 1.9, 0.65, 0.8, 0.3, 0x6a4a3a, { rx: Math.PI / 2, ry: Math.PI / 4 });
  // perche et lanterne à la proue
  put(b, 'cyl6', 0, 1.4, 1.5, 0.04, 2.2, 0.04, 0x3a2a30);
  put(b, 'cyl8', 0, 2.3, 1.9, 0.18, 0.34, 0.18, 0xffcf70, { glow: 2.2 });
  put(b, 'cyl6', 0.45, 1.2, -0.6, 0.025, 3, 0.025, 0x3a2a30, { rz: -0.6, anim: { kind: 4, pivot: new THREE.Vector3(0.3, 0.8, -0.6), axis: Z, param: 0.08 } });
});

const shadowGeo = (k: number) => cached(`shadow${k}`, (b) => shadowFigure(b, new THREE.Vector3(), 0, mulberry32(k + 5)));

const moth = () => cached('moth', (b) => {
  put(b, 'sph', 0, 0, 0, 0.12, 0.12, 0.35, 0x6a4a6a);
  for (const s of [-1, 1]) put(b, 'sph', s * 0.45, 0, 0, 0.5, 0.03, 0.35, 0xffb0f0, { glow: 1.4, anim: { kind: 5, pivot: new THREE.Vector3(0, 0, 0), axis: Z, param: s * 0.7 } });
});

const bird = (col: number) => cached(`bird${col}`, (b) => {
  put(b, 'sph', 0, 0, 0, 0.18, 0.16, 0.42, col);
  put(b, 'cone4', 0, 0, 0.45, 0.06, 0.15, 0.06, 0xffb030, { rx: Math.PI / 2 });
  for (const s of [-1, 1]) put(b, 'box', s * 0.45, 0, -0.05, 0.75, 0.03, 0.28, col, { anim: { kind: 5, pivot: new THREE.Vector3(0, 0, 0), axis: Z, param: s * 0.6 } });
});

const flyingFish = () => cached('ffish', (b) => {
  put(b, 'sph', 0, 0, 0, 0.16, 0.2, 0.5, 0x6fd3ff);
  put(b, 'cone4', 0, 0, -0.55, 0.18, 0.3, 0.05, 0xff9fd0, { rx: -Math.PI / 2 });
  for (const s of [-1, 1]) put(b, 'box', s * 0.35, 0.05, 0.1, 0.55, 0.02, 0.3, 0xe8fbff, { glow: 0.5, anim: { kind: 5, pivot: new THREE.Vector3(0, 0, 0), axis: Z, param: s * 0.45 } });
});

const drone = () => cached('drone', (b) => {
  put(b, 'sph', 0, 0, 0, 0.35, 0.3, 0.6, 0xffcf5c);
  put(b, 'box', 0, -0.25, 0, 0.2, 0.15, 0.3, 0x8c5f5e);
  put(b, 'sph', 0, 0, 0.55, 0.12, 0.12, 0.05, 0x9ff7ff, { glow: 2 });
  const anim: Anim = { kind: 1, pivot: new THREE.Vector3(0, 0.38, 0), axis: Y, param: 18 };
  for (let i = 0; i < 2; i++) put(b, 'box', 0, 0.38, 0, 1, 0.02, 0.1, 0x5d4a65, { anim, ry: i * Math.PI / 2 });
});

const skyLantern = () => cached('slantern', (b) => {
  put(b, 'cyl8', 0, 0, 0, 0.35, 0.6, 0.35, 0xffcf70, { glow: 2.2 });
  put(b, 'cyl8', 0, 0.32, 0, 0.38, 0.05, 0.38, 0xd86040);
});

// ------------------------------------------------------------------ petites scènes

export interface LifeFx {
  sparks(p: THREE.Vector3, n: number): void;
  stars(p: THREE.Vector3, n: number): void;
  zzz(p: THREE.Vector3): void;
}

interface Actor {
  mesh: THREE.Mesh;
  idle: THREE.BufferGeometry;
  wave?: THREE.BufferGeometry;
}

/** une petite scène vivante posée sur une île, à côté de la voie */
export class Vignette {
  readonly group = new THREE.Group();
  private actors: Actor[] = [];
  private t0: number;
  private near = 0;
  private lastFx = 0;
  /** lanterne de la scène, dont le reflet se dessine sur l'eau */
  light: THREE.Object3D | null = null;

  constructor(
    readonly kind: string,
    private home: THREE.Vector3,
    /** direction vers la voie (horizontale) */
    toTrack: THREE.Vector3,
    private mat: THREE.Material,
    r: Rng,
  ) {
    this.t0 = r() * 100;
    this.group.position.copy(home);
    const look = Math.atan2(toTrack.x, toTrack.z);
    this.group.rotation.y = look;
    const add = (idle: THREE.BufferGeometry, wave?: THREE.BufferGeometry, x = 0, z = 0) => {
      const m = new THREE.Mesh(idle, mat);
      m.position.set(x, 0, z);
      this.group.add(m);
      this.actors.push({ mesh: m, idle, wave });
      return m;
    };
    const vill = (small = false, hatKind = 0) => {
      const body = [0xff7a6b, 0x6fd3ff, 0xffcf5c, 0x9be36b, 0xc98bff][Math.floor(r() * 5)];
      const hat = [0x8a5a44, 0x3b5bdb, 0xff5d73, 0x2a2140][Math.floor(r() * 4)];
      return [villager(body, hat, false, small, hatKind), villager(body, hat, true, small, hatKind)] as const;
    };
    switch (kind) {
      case 'poule': {
        const [a, w] = vill();
        add(a, w);
        add(hen());
        break;
      }
      case 'moutons':
        for (let i = 0; i < 3; i++) add(sheepGeo(), undefined, (i - 1) * 2, r() * 2);
        break;
      case 'famille':
      case 'villageois':
        for (let i = 0; i < 3; i++) {
          const [a, w] = vill(i === 2);
          add(a, w, (i - 1) * 1.2, (r() - 0.5) * 0.8);
        }
        break;
      case 'ronde':
        for (let i = 0; i < 4; i++) {
          const [a, w] = vill(true);
          add(a, w);
        }
        break;
      case 'sieste': {
        add(monster(), undefined, 0, 0);
        break;
      }
      case 'fee':
        add(fairy());
        break;
      case 'grenouilles':
        for (let i = 0; i < 3; i++) add(frog());
        break;
      case 'yeti':
        add(yeti(), undefined, -1, 0);
        break;
      case 'pingouins':
        for (let i = 0; i < 4; i++) add(penguin());
        break;
      case 'robot':
        add(robot(), undefined, 0, 0);
        break;
      case 'chien':
        add(robodog());
        break;
      case 'crabe':
        for (let i = 0; i < 2; i++) add(crab(), undefined, i * 1.8 - 0.9, 0);
        break;
      case 'pieuvre':
        add(octopus());
        break;
      case 'astronome': {
        const [a, w] = vill(false, 1);
        add(a, w, 0, 0.6);
        break;
      }
      case 'lapins':
        for (let i = 0; i < 3; i++) add(rabbit());
        break;
      case 'pecheur': {
        // la barque flotte à la surface (le sol du bassin est sous l'eau)
        const bt = add(boat());
        bt.position.y = 0.72;
        const [a] = vill(false, 2);
        const man = add(a);
        man.scale.setScalar(0.85);
        man.position.set(0, 1.0, -0.5);
        this.light = new THREE.Object3D();
        this.light.position.set(0, 3.0, 1.9);
        bt.add(this.light);
        break;
      }
      case 'ombres':
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(shadowGeo(i), shadowMaterial());
          m.position.set((i - 1) * 1.6, 0.75, (r() - 0.5) * 1.2);
          this.group.add(m);
          this.actors.push({ mesh: m, idle: m.geometry });
        }
        break;
    }
    this.props(kind, r);
  }

  /** décor propre à la scène (champignon-abri, établi, bonhomme de neige…) */
  private props(kind: string, r: Rng): void {
    const b = new Builder();
    switch (kind) {
      case 'sieste':
        put(b, 'cyl8', 1.2, 1.6, -1.2, 0.35, 3.2, 0.35, 0xfff1dc);
        put(b, 'cap', 1.2, 3.1, -1.2, 2.6, 1.6, 2.6, 0xff6f7d);
        for (let i = 0; i < 5; i++) put(b, 'sph', 1.2 + Math.cos(i * 1.3) * 1.6, 4.2, -1.2 + Math.sin(i * 1.3) * 1.6, 0.25, 0.15, 0.25, 0xffffff);
        break;
      case 'fee':
        put(b, 'cyl6', 0, 1.2, 0, 0.12, 2.4, 0.12, 0x5faa5a);
        for (let i = 0; i < 6; i++) put(b, 'sph', Math.cos(i) * 0.6, 2.5, Math.sin(i) * 0.6, 0.45, 0.15, 0.25, 0xff9fd0, { ry: i, glow: 0.4 });
        put(b, 'sph', 0, 2.55, 0, 0.3, 0.3, 0.3, 0xfff1a0, { glow: 1.5 });
        break;
      case 'yeti':
        put(b, 'sph', 1.2, 0.6, 0, 0.7, 0.65, 0.7, 0xffffff);
        put(b, 'sph', 1.2, 1.45, 0, 0.5, 0.48, 0.5, 0xffffff);
        put(b, 'cone6', 1.2, 1.5, 0.5, 0.06, 0.35, 0.06, 0xff8a3a, { rx: Math.PI / 2 });
        break;
      case 'robot':
        put(b, 'box', 1.6, 1.3, -0.4, 2.2, 2.6, 2, 0xe8d8c8);
        put(b, 'prism', 1.6, 2.6, -0.4, 2.5, 1.6, 2.2, 0xe0793f);
        put(b, 'box', 0.48, 1.2, -0.2, 0.06, 0.6, 0.6, 0x8a5a44);
        break;
      case 'astronome':
        put(b, 'cyl6', 0.6, 0.6, 0, 0.05, 1.2, 0.05, 0x5d4a65, { rz: 0.3 });
        put(b, 'cyl6', 0.4, 0.6, 0, 0.05, 1.2, 0.05, 0x5d4a65, { rz: -0.3 });
        put(b, 'cyl8', 0.5, 1.4, 0.1, 0.16, 1.5, 0.16, 0xffcf5c, { rx: -0.9 });
        break;
      case 'ronde':
        put(b, 'cyl6', 0, 1.5, 0, 0.2, 3, 0.2, 0x8a5a44);
        put(b, 'ico', 0, 3.5, 0, 1.6, 1.4, 1.6, 0x9bd25e, { jitter: 0.2 });
        break;
      case 'poule':
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          put(b, 'box', Math.cos(a) * 3.6, 0.45, Math.sin(a) * 3.6, 0.1, 0.9, 0.1, 0x8a5a44);
        }
        break;
      default:
        void r;
        return;
    }
    if (!b.empty) {
      const m = new THREE.Mesh(b.geometry(), this.mat);
      m.userData.own = true;
      this.group.add(m);
    }
  }

  update(now: number, dt: number, train: THREE.Vector3, fx: LifeFx): void {
    const t = now + this.t0;
    const d = this.home.distanceTo(train);
    // le train approche : tout le monde se tourne vers lui
    const wantNear = d < 38 ? 1 : 0;
    this.near += (wantNear - this.near) * Math.min(1, dt * 3);
    const excited = this.near > 0.5;
    const local = this.group.worldToLocal(train.clone());
    const faceTrain = Math.atan2(local.x, local.z);
    const A = this.actors;
    const face = (a: Actor, yaw: number) => {
      a.mesh.rotation.y = excited && a.wave ? faceTrain : yaw;
      if (a.wave) a.mesh.geometry = excited ? a.wave : a.idle;
    };
    switch (this.kind) {
      case 'poule': {
        const w = 2.2;
        const hA = t * w;
        const fA = hA - 0.8;
        const R = 2.6;
        A[1].mesh.position.set(Math.cos(hA) * R, Math.abs(Math.sin(t * 14)) * 0.15, Math.sin(hA) * R);
        A[1].mesh.rotation.y = -hA;
        A[0].mesh.position.set(Math.cos(fA) * R, Math.abs(Math.sin(t * 10)) * 0.2, Math.sin(fA) * R);
        face(A[0], -fA);
        break;
      }
      case 'moutons':
        A.forEach((a, i) => {
          const ph = t * 0.25 + i * 2.1;
          a.mesh.position.x = (i - 1) * 2 + Math.sin(ph) * 1.2;
          a.mesh.position.y = i === 1 && Math.sin(t * 0.7) > 0.8 ? Math.abs(Math.sin(t * 9)) * 0.5 : 0;
          a.mesh.rotation.y = Math.cos(ph) > 0 ? Math.PI / 2 : -Math.PI / 2;
        });
        break;
      case 'famille':
      case 'villageois':
        A.forEach((a, i) => {
          a.mesh.position.y = excited ? Math.abs(Math.sin(t * 7 + i)) * 0.45 : 0;
          face(a, Math.sin(t * 0.3 + i) * 0.6);
        });
        break;
      case 'ronde':
        A.forEach((a, i) => {
          const ang = t * 1.4 + (i / A.length) * Math.PI * 2;
          a.mesh.position.set(Math.cos(ang) * 2, Math.abs(Math.sin(t * 8 + i)) * 0.25, Math.sin(ang) * 2);
          face(a, -ang);
        });
        break;
      case 'sieste': {
        const breath = 1 + Math.sin(t * 1.4) * 0.06;
        A[0].mesh.scale.set(breath, 1 / breath, breath);
        // le passage du train le réveille à moitié : il sursaute, puis se rendort
        A[0].mesh.position.y = excited ? Math.max(0, Math.sin(t * 3)) * 0.4 : 0;
        if (now - this.lastFx > 1.6) {
          this.lastFx = now;
          fx.zzz(this.group.localToWorld(new THREE.Vector3(0.3, 2.4, 0.6)));
        }
        break;
      }
      case 'fee': {
        const a = A[0].mesh;
        a.position.set(Math.sin(t * 0.9) * 1.6, 2.8 + Math.sin(t * 2.3) * 0.4, Math.sin(t * 1.8) * 0.9);
        a.rotation.y = Math.cos(t * 0.9) > 0 ? -1.2 : 1.2;
        if (now - this.lastFx > 0.5) {
          this.lastFx = now;
          fx.stars(this.group.localToWorld(a.position.clone()), 1);
        }
        break;
      }
      case 'grenouilles':
        A.forEach((a, i) => {
          const ph = (t * 0.8 + i * 0.33) % 1;
          const k = Math.floor(t * 0.8 + i * 0.33);
          const ang = k * 1.7 + i * 2;
          const hop = ph < 0.4 ? Math.sin((ph / 0.4) * Math.PI) : 0;
          a.mesh.position.set(Math.cos(ang) * 2 + Math.cos(ang + 1.6) * ph * 0.8, hop * 1.1, Math.sin(ang) * 2 + Math.sin(ang + 1.6) * ph * 0.8);
          a.mesh.rotation.y = -ang;
          a.mesh.scale.set(1, 1 + hop * 0.3, 1);
        });
        break;
      case 'yeti': {
        // il soulève une boule de neige, la pose sur le bonhomme… et recommence
        const ph = (t * 0.35) % 1;
        A[0].mesh.position.y = Math.abs(Math.sin(ph * Math.PI * 2)) * 0.2;
        A[0].mesh.rotation.z = Math.sin(t * 2) * 0.08;
        A[0].mesh.rotation.y = excited ? faceTrain : 1;
        break;
      }
      case 'pingouins':
        A.forEach((a, i) => {
          const ph = t * 0.6 + i * 0.5;
          const x = Math.sin(ph) * 3;
          a.mesh.position.set(x, 0, i * 0.9 - 1.3);
          const dir = Math.cos(ph) > 0 ? 1 : -1;
          a.mesh.rotation.set(Math.abs(Math.cos(ph)) > 0.4 ? 1.2 : 0, dir * Math.PI / 2, 0);
        });
        break;
      case 'robot':
        A[0].mesh.rotation.y = excited ? faceTrain : Math.PI / 2;
        A[0].mesh.position.y = excited ? Math.abs(Math.sin(t * 6)) * 0.2 : 0;
        if (!excited && Math.sin(now * 15 + 1.5) > 0.97 && now - this.lastFx > 0.25) {
          this.lastFx = now;
          fx.sparks(this.group.localToWorld(new THREE.Vector3(0.5, 1.2, 0.9)), 3);
        }
        break;
      case 'chien': {
        const ang = t * 3;
        A[0].mesh.position.set(Math.cos(ang) * 0.6, Math.abs(Math.sin(t * 12)) * 0.1, Math.sin(ang) * 0.6);
        A[0].mesh.rotation.y = -ang;
        break;
      }
      case 'crabe':
        A.forEach((a, i) => {
          a.mesh.position.x = i * 1.8 - 0.9 + Math.sin(t * 2 + i) * 0.9;
          a.mesh.position.y = Math.abs(Math.sin(t * 8 + i)) * 0.1;
          a.mesh.rotation.y = excited ? faceTrain : 0;
        });
        break;
      case 'pieuvre':
        A[0].mesh.position.y = Math.sin(t * 1.3) * 0.25 + (excited ? 0.6 : 0);
        A[0].mesh.rotation.y = excited ? faceTrain : Math.sin(t * 0.4);
        break;
      case 'astronome':
        A[0].mesh.position.y = excited ? Math.abs(Math.sin(t * 7)) * 0.4 : 0;
        face(A[0], Math.PI / 2 + Math.sin(t * 0.3) * 0.3);
        break;
      case 'pecheur': {
        // la barque se balance doucement ; le pêcheur salue d'un signe de tête
        const bt = A[0].mesh;
        bt.position.y = 0.72 + Math.sin(t * 1.3) * 0.06;
        bt.rotation.z = Math.sin(t * 1.1) * 0.05;
        bt.rotation.x = Math.sin(t * 0.8) * 0.03;
        A[1].mesh.position.y = bt.position.y + 0.28;
        A[1].mesh.rotation.y = excited ? faceTrain : Math.PI;
        A[1].mesh.rotation.x = excited ? Math.sin(t * 4) * 0.12 : 0;
        break;
      }
      case 'ombres':
        // elles se tournent lentement vers le train qui passe
        A.forEach((a, i) => {
          const want = excited ? faceTrain : Math.sin(t * 0.1 + i) * 0.4;
          a.mesh.rotation.y += (want - a.mesh.rotation.y) * Math.min(1, dt * 0.8);
        });
        break;
      case 'lapins':
        A.forEach((a, i) => {
          // gravité lunaire : de grands bonds lents
          const ph = (t * 0.45 + i * 0.4) % 1;
          const k = Math.floor(t * 0.45 + i * 0.4);
          const ang = k * 2.3 + i;
          a.mesh.position.set(Math.cos(ang) * 1.8 + Math.cos(ang + 1.5) * ph * 1.5, Math.sin(ph * Math.PI) * 2.2, Math.sin(ang) * 1.8 + Math.sin(ang + 1.5) * ph * 1.5);
          a.mesh.rotation.y = -ang - 1.5;
        });
        break;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).geometry && o.userData.own) (o as THREE.Mesh).geometry.dispose();
    });
  }
}

/** les scènes possibles dans chaque région */
export const VIGNETTES: Record<RegionDef['key'], string[]> = {
  pres: ['poule', 'moutons', 'famille'],
  champignons: ['sieste', 'fee', 'grenouilles'],
  hameaux: ['villageois', 'ronde', 'villageois'],
  cristal: ['yeti', 'pingouins'],
  engrenages: ['robot', 'chien', 'villageois'],
  recif: ['crabe', 'pieuvre'],
  confins: ['astronome', 'lapins'],
  mer: ['pecheur', 'ombres', 'pecheur'],
};

// ------------------------------------------------------------------ volées

interface Flier {
  off: THREE.Vector3;
  phase: number;
}

/** une volée qui traverse le ciel devant le train : oiseaux, poissons volants, papillons de nuit, drones… */
export class Flock {
  readonly mesh: THREE.InstancedMesh;
  private fliers: Flier[] = [];
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private t = 0;
  private dur = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private style: 'fly' | 'rise' | 'hop' = 'fly';
  active = false;

  constructor(mat: THREE.Material, private max = 24) {
    this.mesh = new THREE.InstancedMesh(bird(0x6fd3ff), mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /** lance une volée adaptée à la région, à `ahead` mètres devant */
  launch(region: RegionDef, center: THREE.Vector3, fwd: THREE.Vector3, right: THREE.Vector3, r: Rng): void {
    const k = region.key;
    let n = 10 + Math.floor(r() * 8);
    let geo: THREE.BufferGeometry;
    let speed = 14;
    this.style = 'fly';
    if (k === 'recif') {
      geo = flyingFish();
      this.style = 'hop';
      n = 14;
    } else if (k === 'champignons') {
      geo = moth();
      speed = 6;
      n = 8;
    } else if (k === 'engrenages') {
      geo = drone();
      speed = 9;
      n = 5;
    } else if (k === 'confins' || k === 'mer') {
      geo = skyLantern();
      this.style = 'rise';
      speed = 2;
      n = 20;
    } else geo = bird(k === 'cristal' ? 0xffffff : [0x6fd3ff, 0xff9fb8, 0xffcf5c][Math.floor(r() * 3)]);
    this.mesh.geometry = geo;
    n = Math.min(n, this.max);
    const side = r() < 0.5 ? -1 : 1;
    const ahead = 70 + r() * 60;
    const height = this.style === 'rise' ? -25 : 8 + r() * 16;
    this.pos.copy(center).addScaledVector(fwd, ahead).addScaledVector(right, side * 70).add(new THREE.Vector3(0, height, 0));
    // traverse la voie de biais, vers l'avant
    this.vel.copy(right).multiplyScalar(-side).addScaledVector(fwd, 0.6).normalize().multiplyScalar(speed);
    if (this.style === 'rise') this.vel.set(0, speed, 0).addScaledVector(right, -side * 2);
    this.fliers = [];
    for (let i = 0; i < n; i++) {
      // formation en V (oiseaux) ou nuée
      const row = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      const off = this.style === 'fly' && k !== 'champignons' && k !== 'engrenages'
        ? new THREE.Vector3(row * 1.6, (r() - 0.5) * 0.6, -Math.abs(row) * 1.4)
        : new THREE.Vector3((r() - 0.5) * 30, (r() - 0.5) * 14, (r() - 0.5) * 30);
      this.fliers.push({ off, phase: r() * 10 });
    }
    this.mesh.count = n;
    this.t = 0;
    this.dur = this.style === 'rise' ? 40 : 14;
    this.active = true;
  }

  update(dt: number, now: number): void {
    if (!this.active) return;
    this.t += dt;
    this.pos.addScaledVector(this.vel, dt);
    const heading = Math.atan2(this.vel.x, this.vel.z);
    for (let i = 0; i < this.fliers.length; i++) {
      const f = this.fliers[i];
      const p = this.pos.clone();
      // la formation suit la direction de vol
      p.add(f.off.clone().applyAxisAngle(Y, heading));
      let pitch = 0;
      if (this.style === 'hop') {
        // les poissons volants bondissent par vagues
        const ph = (now * 0.7 + f.phase) % 2;
        p.y += Math.sin(ph * Math.PI) * 4;
        pitch = -Math.cos(ph * Math.PI) * 0.6;
      } else p.y += Math.sin(now * 1.3 + f.phase) * 0.6;
      this.q.setFromEuler(new THREE.Euler(pitch, heading, 0, 'YXZ'));
      const s = this.style === 'rise' ? 1.4 : 1.2;
      this.m.compose(p, this.q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.t > this.dur) {
      this.active = false;
      this.mesh.count = 0;
    }
  }
}

// ------------------------------------------------------------------ poussières d'ambiance

const MOTES: Record<MoteKind, { size: number; fall: number; drift: number; glow: number; twinkle: number }> = {
  pollen: { size: 0.09, fall: -0.15, drift: 0.6, glow: 0.4, twinkle: 0 },
  spores: { size: 0.13, fall: -0.35, drift: 0.5, glow: 1.6, twinkle: 1 },
  petals: { size: 0.16, fall: 0.6, drift: 1.4, glow: 0.2, twinkle: 0 },
  snow: { size: 0.14, fall: 1.4, drift: 0.7, glow: 0.3, twinkle: 0 },
  sparks: { size: 0.07, fall: -0.9, drift: 0.8, glow: 1.8, twinkle: 1 },
  bubbles: { size: 0.18, fall: -0.7, drift: 0.4, glow: 0.5, twinkle: 0 },
  stardust: { size: 0.1, fall: 0.1, drift: 0.3, glow: 2, twinkle: 1 },
  fireflies: { size: 0.12, fall: -0.05, drift: 1.2, glow: 2.2, twinkle: 1 },
};

/** points flottants autour de la caméra, entièrement calculés par la carte graphique */
export class Motes {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor(count = 420) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const seeds = new Float32Array(count * 4);
    const r = mulberry32(99);
    for (let i = 0; i < count * 4; i++) seeds[i] = r();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color() },
        uSize: { value: 0.1 }, uFall: { value: 0 }, uDrift: { value: 0.5 }, uGlow: { value: 1 }, uTwinkle: { value: 0 }, uAmount: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uSize, uFall, uDrift, uAmount; uniform vec3 uCam;
        varying vec2 vUv; varying float vFade; varying float vSeed;
        void main(){
          float box = 46.;
          vec3 p = aSeed.xyz * box;
          p.y -= uTime * uFall * (.6 + aSeed.w * .8);
          p.x += sin(uTime * .5 + aSeed.w * 30.) * uDrift * 2.;
          p.z += cos(uTime * .4 + aSeed.x * 30.) * uDrift * 2.;
          p = uCam + mod(p - uCam + box * .5, box) - box * .5;
          vec4 mv = viewMatrix * vec4(p, 1.);
          float d = -mv.z;
          vFade = smoothstep(1.5, 5., d) * (1. - smoothstep(16., 23., d)) * step(aSeed.w, uAmount);
          mv.xy += position.xy * uSize * (1. + aSeed.y);
          vUv = uv; vSeed = aSeed.w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uGlow, uTwinkle, uTime;
        varying vec2 vUv; varying float vFade; varying float vSeed;
        void main(){
          float d = length(vUv - .5) * 2.;
          float a = smoothstep(1., .2, d);
          float tw = mix(1., .4 + .6 * sin(uTime * 4. + vSeed * 60.), uTwinkle);
          gl_FragColor = vec4(uColor * a * vFade * uGlow * tw, 1.);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  setCount(n: number): void {
    this.mesh.geometry.instanceCount = Math.min(n, (this.mesh.geometry.getAttribute('aSeed') as THREE.InstancedBufferAttribute).count);
  }

  /** mélange les poussières de deux régions selon t */
  update(time: number, cam: THREE.Vector3, a: RegionDef, b: RegionDef, t: number): void {
    const u = this.mesh.material.uniforms;
    const A = MOTES[a.motes.kind], B = MOTES[b.motes.kind];
    const lerp = (x: number, y: number) => x + (y - x) * t;
    u.uTime.value = time;
    u.uCam.value.copy(cam);
    u.uColor.value.set(a.motes.color).lerp(new THREE.Color(b.motes.color), t);
    u.uSize.value = lerp(A.size, B.size);
    u.uFall.value = lerp(A.fall, B.fall);
    u.uDrift.value = lerp(A.drift, B.drift);
    u.uGlow.value = lerp(A.glow, B.glow) * 0.55;
    u.uTwinkle.value = lerp(A.twinkle, B.twinkle);
  }
}
