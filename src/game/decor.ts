// Décors des régions : chaque région a son « kit » d'éléments posés sur les îles (moulins, champignons géants,
// maisons perchées, cristaux, engrenages, coraux, observatoires…) et sa façon d'habiller le dessous des îles.
// Tout est fusionné en un seul maillage par île ; ce qui bouge (ailes, engrenages, linge, méduses) est animé
// par la carte graphique grâce aux attributs d'animation du matériau partagé.
import * as THREE from 'three';
import { Builder, trs, type Anim } from './geo';
import type { Rng } from './model';
import type { Palette, RegionDef, Underside } from './regions';
import { SHOP_WORDS, signAtlas, shadowFigure, type SignBuilder } from './mer';

/** 'light' : une lanterne dont le reflet se dessine sur l'eau (pas de particules) */
export type EmitKind = 'smoke' | 'spore' | 'zzz' | 'bubble' | 'light';
export interface Emitter {
  p: THREE.Vector3;
  kind: EmitKind;
}

export interface DecorCtx {
  b: Builder;
  r: Rng;
  pal: Palette;
  emit: Emitter[];
  /** enseignes peintes (Mer des Lanternes) */
  signs?: SignBuilder;
  /** voyageurs-ombres */
  shadows?: Builder;
  /** sens de la voie et direction vers elle, là où l'élément est posé */
  fwd?: THREE.Vector3;
  inward?: THREE.Vector3;
}

type Item = (c: DecorCtx, p: THREE.Vector3, ry: number) => void;
/** poids, fonction, distance minimale à la voie (m) */
type KitEntry = [number, Item, number];

const Y = new THREE.Vector3(0, 1, 0);

export function pick<T>(r: Rng, arr: T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

/** point local (x, y, z) d'un objet tourné de ry autour de la verticale */
function L(p: THREE.Vector3, ry: number, x: number, y: number, z: number): THREE.Vector3 {
  const c = Math.cos(ry), s = Math.sin(ry);
  return new THREE.Vector3(p.x + x * c + z * s, p.y + y, p.z - x * s + z * c);
}

function axisL(ry: number, x: number, y: number, z: number): THREE.Vector3 {
  return L(new THREE.Vector3(), ry, x, y, z).normalize();
}

function at(b: Builder, name: string, p: THREE.Vector3, ry: number, sx: number, sy: number, sz: number, color: number | THREE.Color, o: { sway?: number; glow?: number; jitter?: number; rx?: number; rz?: number; anim?: Anim } = {}): void {
  b.add(name, trs(p.x, p.y, p.z, ry, sx, sy, sz, o.rx ?? 0, o.rz ?? 0), color, o.sway ?? 0, o.glow ?? 0, o.jitter ?? 0, o.anim);
}

/** poutre d'un point à un autre (boîte ou cylindre) */
function beam(b: Builder, name: string, a: THREE.Vector3, c: THREE.Vector3, w: number, color: number, anim?: Anim, glow = 0): void {
  const d = c.clone().sub(a);
  const len = d.length();
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), d, Math.abs(d.y) > 0.99 * len ? new THREE.Vector3(1, 0, 0) : Y);
  const mid = a.clone().add(c).multiplyScalar(0.5);
  if (name.startsWith('cyl')) m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  m.scale(new THREE.Vector3(w, name.startsWith('cyl') ? len : w, name.startsWith('cyl') ? w : len)).setPosition(mid);
  b.add(name, m, color, 0, glow, 0, anim);
}

// ------------------------------------------------------------------ éléments communs

function tree(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, pal } = c;
  const h = 2.2 + r() * 2.5;
  at(b, 'cyl6', L(p, ry, 0, h / 2, 0), ry, 0.22, h, 0.22, 0x8a5a44);
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const s = 1.4 + r() * 1.3;
    at(b, 'ico', L(p, ry, (r() - 0.5) * 1.4, h + s * 0.5 + i * 0.6, (r() - 0.5) * 1.4), r() * 6, s, s, s, pick(r, pal.canopy), { sway: 0.5, jitter: 0.18 });
  }
}

function pine(c: DecorCtx, p: THREE.Vector3, _ry: number, snow = false): void {
  const { b, r, pal } = c;
  const h = 4 + r() * 4;
  at(b, 'cyl6', L(p, 0, 0, 0.6, 0), 0, 0.25, 1.2, 0.25, 0x7a4e3a);
  const col = new THREE.Color(pick(r, pal.canopy)).multiplyScalar(snow ? 0.75 : 0.8);
  for (let i = 0; i < 3; i++) {
    const w = (1.8 - i * 0.45) * (h / 6);
    const y = 1 + i * h * 0.22 + h * 0.18;
    at(b, 'cone8', L(p, 0, 0, y, 0), r() * 6, w, h * 0.42, w, snow ? 0x3f7a78 : col, { sway: 0.3, jitter: 0.12 });
    if (snow) at(b, 'cone8', L(p, 0, 0, y + h * 0.1, 0), r() * 6, w * 0.62, h * 0.24, w * 0.62, 0xffffff, { sway: 0.3 });
  }
}

function flowers(c: DecorCtx, p: THREE.Vector3): void {
  const { b, r, pal } = c;
  for (let f = 0; f < 6; f++) at(b, 'tetra', L(p, 0, (r() - 0.5) * 3, 0.25, (r() - 0.5) * 3), r() * 6, 0.22 + r() * 0.15, 0.22, 0.22, pick(r, pal.flower), { sway: 0.6, jitter: 0.15 });
}

function rock(c: DecorCtx, p: THREE.Vector3, ry: number, color = 0xc9b8d8): void {
  const { b, r } = c;
  at(b, 'dodeca', L(p, ry, 0, 0.3, 0), ry, 0.8 + r() * 1.2, 0.6 + r() * 0.8, 0.8 + r() * 1.2, color, { jitter: 0.2 });
}

function lantern(c: DecorCtx, p: THREE.Vector3): void {
  const { b } = c;
  at(b, 'cyl6', L(p, 0, 0, 1.5, 0), 0, 0.08, 3, 0.08, 0x3e3550);
  at(b, 'box', L(p, 0, 0, 3.1, 0), 0.4, 0.45, 0.6, 0.45, 0xffcf70, { glow: 1.4 });
  at(b, 'cone6', L(p, 0, 0, 3.55, 0), 0.4, 0.42, 0.35, 0.42, 0x3e3550);
}

function cottage(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, emit } = c;
  const wall = pick(r, [0xfff3e0, 0xffe0e8, 0xe8f4ff, 0xfff6c8]);
  const roof = pick(r, [0xff7a6b, 0x6b8cff, 0x9b6bff, 0x4fc39b]);
  const w = 3 + r() * 1.5, d = 3 + r() * 1.5, h = 2.4 + r();
  at(b, 'box', L(p, ry, 0, h / 2, 0), ry, w, h, d, wall);
  at(b, 'prism', L(p, ry, 0, h, 0), ry, w * 1.15, 2.4, d * 1.1, roof);
  const ch = L(p, ry, w * 0.25, h + 1.2, 0);
  at(b, 'box', ch, ry, 0.5, 1.6, 0.5, 0xb07060);
  if (r() < 0.5) emit.push({ p: ch.clone().add(new THREE.Vector3(0, 0.9, 0)), kind: 'smoke' });
  // fenêtre qui s'allume la nuit, porte
  at(b, 'box', L(p, ry, 0, h * 0.55, d / 2 + 0.02), ry, 0.8, 0.8, 0.08, 0xffd27a, { glow: 1 });
  at(b, 'box', L(p, ry, 0, h * 0.4, -d / 2 - 0.02), ry, 0.7, 1.3, 0.08, 0x8a5a44);
}

// ------------------------------------------------------------------ Prés-Volants

function windmill(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  const h = 6 + r() * 3;
  at(b, 'cyl8', L(p, ry, 0, h / 2, 0), ry, 1.5, h, 1.5, 0xfff3e0, { jitter: 0.06 });
  at(b, 'cyl8', L(p, ry, 0, 0.4, 0), ry, 1.75, 0.8, 1.75, 0xd8b8a0);
  at(b, 'cone8', L(p, ry, 0, h + 1, 0), ry, 1.9, 2, 1.9, pick(r, [0xff7a6b, 0x6b8cff, 0x9b6bff]));
  at(b, 'box', L(p, ry, 0, 1, 1.52), ry, 0.8, 1.5, 0.1, 0x8a5a44);
  at(b, 'box', L(p, ry, 0, h * 0.62, 1.52), ry, 0.6, 0.6, 0.1, 0xffd27a, { glow: 1 });
  // ailes qui tournent face au vent
  const hub = L(p, ry, 0, h + 0.2, 1.75);
  const axis = axisL(ry, 0, 0, 1);
  const anim: Anim = { kind: 1, pivot: hub, axis, param: 0.9 + r() * 0.5 };
  at(b, 'cyl6', hub, ry, 0.25, 0.25, 0.25, 0x8a5a44, { anim, rx: Math.PI / 2 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const lenB = 4.5;
    const mid = hub.clone().add(new THREE.Vector3(0, Math.cos(a), 0).multiplyScalar(lenB / 2)).add(axisL(ry, Math.sin(a), 0, 0).multiplyScalar(lenB / 2));
    at(b, 'box', mid, ry, 0.12, lenB, 0.1, 0x8a5a44, { anim, rz: -a });
    const sail = hub.clone().add(new THREE.Vector3(0, Math.cos(a), 0).multiplyScalar(lenB * 0.58)).add(axisL(ry, Math.sin(a), 0, 0).multiplyScalar(lenB * 0.58));
    const off = axisL(ry, Math.cos(a), 0, 0).multiplyScalar(0.45).add(new THREE.Vector3(0, -Math.sin(a) * 0.45, 0));
    at(b, 'box', sail.add(off), ry, 0.85, lenB * 0.72, 0.05, 0xfffaf0, { anim, rz: -a });
  }
}

function field(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  const crop = pick(r, [[0xffd65c, 0xf0c050], [0xb48cff, 0x9f7ae8], [0x9be36b, 0x7fcf5a], [0xff9fb8, 0xff7fa0]]);
  at(b, 'box', L(p, ry, 0, 0.05, 0), ry, 6.4, 0.2, 5.2, 0x9c6b55);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) {
    const h = 0.6 + r() * 0.3;
    at(b, 'cone4', L(p, ry, -2.6 + i * 1.3, 0.15 + h / 2, -2.2 + j * 0.88), ry + r(), 0.45, h, 0.45, crop[(i + j) % 2], { sway: 0.8 });
  }
}

function haystack(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  const s = 1 + r() * 0.5;
  at(b, 'cyl8', L(p, ry, 0, 0.7 * s, 0), ry, 1.2 * s, 1.4 * s, 1.2 * s, 0xf0c860, { jitter: 0.12 });
  at(b, 'cap', L(p, ry, 0, 1.4 * s, 0), ry, 1.2 * s, 0.9 * s, 1.2 * s, 0xffd870, { jitter: 0.12 });
}

function sheep(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  for (let k = 0; k < 2 + Math.floor(r() * 3); k++) {
    const q = L(p, ry, (r() - 0.5) * 5, 0, (r() - 0.5) * 5);
    const a = r() * 6;
    at(b, 'ico1', L(q, a, 0, 0.85, 0), a, 0.85, 0.7, 1.05, 0xfffaf2, { jitter: 0.15 });
    for (const [x, z] of [[-0.35, -0.5], [0.35, -0.5], [-0.35, 0.5], [0.35, 0.5]]) at(b, 'cyl6', L(q, a, x, 0.25, z), a, 0.09, 0.5, 0.09, 0x3a3048);
    // tête qui broute (balancement lent)
    const neck = L(q, a, 0, 0.9, -0.85);
    const anim: Anim = { kind: 4, pivot: neck, axis: axisL(a, 1, 0, 0), param: 0.35 };
    at(b, 'box', L(q, a, 0, 0.75, -1.15), a, 0.42, 0.45, 0.55, 0x3a3048, { anim });
    for (const s of [-1, 1]) at(b, 'box', L(q, a, s * 0.28, 0.9, -1.05), a + s * 0.5, 0.28, 0.08, 0.14, 0x3a3048, { anim });
  }
}

function scarecrow(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b } = c;
  at(b, 'cyl6', L(p, ry, 0, 1.4, 0), ry, 0.1, 2.8, 0.1, 0x8a5a44);
  at(b, 'box', L(p, ry, 0, 1.8, 0), ry, 0.7, 0.9, 0.4, 0x6b8cff);
  at(b, 'sph', L(p, ry, 0, 2.55, 0), ry, 0.35, 0.35, 0.35, 0xf0d8a0);
  at(b, 'cone8', L(p, ry, 0, 2.95, 0), ry, 0.55, 0.45, 0.55, 0xd8a040);
  for (const s of [-1, 1]) {
    const sh = L(p, ry, s * 0.35, 2.1, 0);
    at(b, 'box', L(p, ry, s * 0.85, 2.1, 0), ry, 1, 0.16, 0.16, 0xff7a6b, { anim: { kind: 4, pivot: sh, axis: axisL(ry, 0, 0, 1), param: s * 0.3 } });
  }
}

// ------------------------------------------------------------------ Forêt des Spores

function giantMushroom(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, pal, emit } = c;
  const h = 7 + r() * 9;
  const lean = (r() - 0.5) * 0.25;
  const top = L(p, ry, lean * h, h, 0);
  const segs = 3;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const a = L(p, ry, lean * h * t0 * t0, h * t0, 0), cc = L(p, ry, lean * h * t1 * t1, h * t1, 0);
    beam(b, 'cyl8', a, cc, 0.5 + h * 0.05 * (1.2 - t0 * 0.5), 0xfff1dc);
  }
  const w = 3 + h * 0.42;
  const cap = pick(r, pal.canopy);
  at(b, 'cyl12', top.clone().add(new THREE.Vector3(0, -0.15, 0)), ry, w * 0.92, 0.3, w * 0.92, 0xffe0f0, { glow: 0.35 });
  at(b, 'cap', top, ry, w, w * 0.55, w, cap, { glow: 0.25, jitter: 0.1, rz: lean });
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const rr = w * (0.25 + r() * 0.5);
    at(b, 'ico', top.clone().add(new THREE.Vector3(Math.cos(a) * rr, w * 0.55 * Math.sqrt(Math.max(0, 1 - (rr / w) ** 2)), Math.sin(a) * rr)), 0, w * 0.1, w * 0.06, w * 0.1, pick(r, pal.flower), { glow: 1.6 });
  }
  if (r() < 0.6) emit.push({ p: top.clone().add(new THREE.Vector3(0, -0.6, 0)), kind: 'spore' });
}

function glowShrooms(c: DecorCtx, p: THREE.Vector3): void {
  const { b, r, pal } = c;
  for (let i = 0; i < 5; i++) {
    const q = L(p, 0, (r() - 0.5) * 3, 0, (r() - 0.5) * 3);
    const h = 0.4 + r() * 0.9;
    at(b, 'cyl6', L(q, 0, 0, h / 2, 0), 0, 0.1, h, 0.1, 0xfff1dc);
    at(b, 'capLo', L(q, 0, 0, h, 0), 0, 0.35 + h * 0.3, 0.25 + h * 0.2, 0.35 + h * 0.3, pick(r, pal.flower), { glow: 1.8 });
  }
}

function twistedTree(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, pal } = c;
  const n = 6 + Math.floor(r() * 4);
  let q = p.clone();
  let a = r() * 6;
  for (let i = 0; i < n; i++) {
    a += 0.7;
    const nq = q.clone().add(new THREE.Vector3(Math.cos(a) * 0.45, 0.9, Math.sin(a) * 0.45));
    beam(b, 'cyl6', q, nq, 0.32 - i * 0.02, 0x6a4a6a);
    q = nq;
  }
  for (let i = 0; i < 3; i++) at(b, 'ico', q.clone().add(new THREE.Vector3((r() - 0.5) * 2.5, r() * 1.5, (r() - 0.5) * 2.5)), r() * 6, 1.3 + r(), 1 + r() * 0.6, 1.3 + r(), pick(r, pal.canopy), { sway: 0.4, jitter: 0.2 });
  // lanterne-fruit qui pendouille
  const fruit = q.clone().add(new THREE.Vector3(1.2, -1.2, 0));
  at(b, 'sph', fruit, 0, 0.3, 0.38, 0.3, 0xfff1a0, { glow: 2, anim: { kind: 4, pivot: q.clone().add(new THREE.Vector3(1.2, 0, 0)), axis: axisL(ry, 0, 0, 1), param: 0.25 } });
}

function mushroomHouse(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, emit } = c;
  const h = 3 + r() * 1.5;
  at(b, 'cyl12', L(p, ry, 0, h / 2, 0), ry, 1.7, h, 1.7, 0xfff1dc, { jitter: 0.05 });
  const cap = pick(r, [0xff6f7d, 0xffb05c, 0xb48cff, 0x6fd3ff]);
  at(b, 'cap', L(p, ry, 0, h - 0.2, 0), ry, 3, 2.2, 3, cap, { jitter: 0.08 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    at(b, 'ico', L(p, ry, Math.cos(a) * 1.8, h + 1.1, Math.sin(a) * 1.8), 0, 0.32, 0.18, 0.32, 0xffffff);
  }
  at(b, 'box', L(p, ry, 0, 0.75, 1.68), ry, 0.8, 1.5, 0.12, 0x8a5a44);
  at(b, 'cyl8', L(p, ry, 1, h * 0.6, 1.5), ry, 0.35, 0.1, 0.35, 0xffd27a, { glow: 1.4, rx: Math.PI / 2 });
  const ch = L(p, ry, -0.9, h + 1.6, 0.4);
  at(b, 'cyl6', ch, ry, 0.2, 1.2, 0.2, 0x8a6a5a);
  emit.push({ p: ch.clone().add(new THREE.Vector3(0, 0.8, 0)), kind: 'smoke' });
}

function fern(c: DecorCtx, p: THREE.Vector3): void {
  const { b, r, pal } = c;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    let q = p.clone();
    for (let k = 0; k < 5; k++) {
      const nq = q.clone().add(new THREE.Vector3(Math.cos(a) * 0.4, 0.55 - k * 0.15, Math.sin(a) * 0.4));
      at(b, 'tetra', nq, a, 0.35 - k * 0.05, 0.35, 0.35, pick(r, pal.canopy), { sway: 0.9 });
      q = nq;
    }
  }
}

// ------------------------------------------------------------------ Hameaux Perchés

function timberHouse(c: DecorCtx, p: THREE.Vector3, ry: number, stilts = false): void {
  const { b, r, pal, emit } = c;
  const w = 3.4 + r() * 1.6, d = 3 + r() * 1.2, h = 2.6 + r() * 0.8;
  const floors = r() < 0.4 ? 2 : 1;
  const base = stilts ? 1.6 : 0;
  if (stilts) for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) at(b, 'cyl6', L(p, ry, x * w * 0.4, base / 2, z * d * 0.4), ry, 0.15, base, 0.15, 0x7a4e3a);
  const wall = pick(r, [0xfff3e0, 0xffe8c8, 0xf0f4ff, 0xffe0e8]);
  for (let f = 0; f < floors; f++) {
    const y0 = base + f * h;
    const ww = w * (1 + f * 0.08);
    at(b, 'box', L(p, ry, 0, y0 + h / 2, 0), ry, ww, h, d, wall);
    // colombages
    for (const x of [-0.5, 0, 0.5]) at(b, 'box', L(p, ry, x * ww * 0.96, y0 + h / 2, d / 2 + 0.03), ry, 0.14, h, 0.06, 0x8a5a44);
    at(b, 'box', L(p, ry, 0, y0 + h - 0.1, d / 2 + 0.03), ry, ww, 0.14, 0.06, 0x8a5a44);
    for (const s of [-1, 1]) {
      at(b, 'box', L(p, ry, s * ww * 0.26, y0 + h * 0.55, d / 2 + 0.05), ry, 0.7, 0.75, 0.06, 0xffd27a, { glow: 1 });
      // jardinière fleurie sous la fenêtre
      at(b, 'box', L(p, ry, s * ww * 0.26, y0 + h * 0.3, d / 2 + 0.2), ry, 0.8, 0.2, 0.25, 0x9c6b55);
      for (let k = 0; k < 3; k++) at(b, 'tetra', L(p, ry, s * ww * 0.26 + (k - 1) * 0.25, y0 + h * 0.42, d / 2 + 0.22), r() * 6, 0.16, 0.16, 0.16, pick(r, pal.flower));
    }
  }
  const top = base + floors * h;
  at(b, 'prism', L(p, ry, 0, top, 0), ry, w * 1.25, 2.6, d * 1.15, pick(r, [0xff7a6b, 0x6b8cff, 0x9b6bff, 0x4fc39b, 0xffb05c]));
  const ch = L(p, ry, -w * 0.3, top + 1.2, 0);
  at(b, 'box', ch, ry, 0.5, 1.6, 0.5, 0xb07060);
  if (r() < 0.6) emit.push({ p: ch.clone().add(new THREE.Vector3(0, 0.9, 0)), kind: 'smoke' });
  if (!stilts) at(b, 'box', L(p, ry, 0, 0.75, -d / 2 - 0.03), ry, 0.8, 1.5, 0.06, 0x8a5a44);
}

function laundry(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  const len = 5;
  for (const s of [-1, 1]) at(b, 'cyl6', L(p, ry, s * len / 2, 1.2, 0), ry, 0.08, 2.4, 0.08, 0x8a5a44);
  at(b, 'box', L(p, ry, 0, 2.3, 0), ry, len, 0.03, 0.03, 0xffffff);
  for (let i = 0; i < 4; i++) {
    const x = -len / 2 + 0.8 + i * 1.15;
    const pin = L(p, ry, x, 2.3, 0);
    const color = pick(r, [0xff7a6b, 0x6fd3ff, 0xffd34d, 0xffffff, 0xb48cff]);
    at(b, 'box', L(p, ry, x, 1.85, 0), ry, 0.8, 0.85, 0.04, color, { anim: { kind: 2, pivot: pin, axis: axisL(ry, 1, 0, 0), param: 0.25 } });
  }
}

function stall(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, pal } = c;
  at(b, 'box', L(p, ry, 0, 0.5, 0), ry, 2.6, 1, 1.2, 0xc8946a);
  for (const x of [-1.2, 1.2]) for (const z of [-0.5, 0.5]) at(b, 'cyl6', L(p, ry, x, 1.4, z), ry, 0.06, 2.8, 0.06, 0x8a5a44);
  const stripe = pick(r, [0xff7a6b, 0x6b8cff, 0x4fc39b]);
  for (let i = 0; i < 5; i++) at(b, 'box', L(p, ry, -1.1 + i * 0.55, 2.8, 0), ry, 0.55, 0.08, 1.6, i % 2 ? 0xffffff : stripe, { rx: 0.2 });
  for (let i = 0; i < 7; i++) at(b, 'ico', L(p, ry, -1 + (i % 4) * 0.6, 1.15, (i < 4 ? -0.2 : 0.25)), 0, 0.22, 0.22, 0.22, pick(r, [0xff6a4a, 0xffd34d, 0x9be36b, ...pal.flower]));
}

function bellTower(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  const h = 8 + r() * 3;
  at(b, 'box', L(p, ry, 0, h / 2, 0), ry, 2.2, h, 2.2, 0xfff3e0, { jitter: 0.05 });
  at(b, 'box', L(p, ry, 0, h + 0.9, 0), ry, 2.4, 1.8, 2.4, 0xe8d8c8);
  at(b, 'cone4', L(p, ry, 0, h + 3, 0), ry + Math.PI / 4, 2.1, 2.6, 2.1, 0x6b8cff);
  const pivot = L(p, ry, 0, h + 1.6, 0);
  at(b, 'cone8', L(p, ry, 0, h + 1.1, 0), ry, 0.55, 0.9, 0.55, 0xffcf5c, { anim: { kind: 4, pivot, axis: axisL(ry, 1, 0, 0), param: 0.5 } });
  at(b, 'cyl12', L(p, ry, 0, h * 0.75, 1.12), ry, 0.6, 0.06, 0.6, 0xfffaf0, { rx: Math.PI / 2 });
}

function garden(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  at(b, 'box', L(p, ry, 0, 0.05, 0), ry, 5, 0.2, 4, 0x8a5a44);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const q = L(p, ry, -1.8 + i * 1.2, 0.35, -1.4 + j * 0.95);
    if ((i + j) % 3 === 0) at(b, 'ico', q, 0, 0.42, 0.32, 0.42, 0xff9a3a, { jitter: 0.1 });
    else at(b, 'ico', q, r() * 6, 0.32, 0.4, 0.32, 0x6fbf5a, { sway: 0.5 });
  }
}

function balloon(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  const q = L(p, ry, 0, 9 + r() * 6, 0);
  const anim: Anim = { kind: 3, pivot: q, axis: Y, param: 0.9 };
  const col = pick(r, [0xff7a6b, 0xffd34d, 0x6fd3ff, 0xb48cff, 0x9be36b]);
  at(b, 'sph', q, 0, 2.4, 2.8, 2.4, col, { anim, jitter: 0.05 });
  for (let i = 0; i < 4; i++) at(b, 'box', q.clone().add(new THREE.Vector3(0, -0.2 + i * 0.1, 0)), (i / 4) * Math.PI, 2.45, 0.25, 0.3, 0xffffff, { anim });
  at(b, 'box', q.clone().add(new THREE.Vector3(0, -3.9, 0)), ry, 0.9, 0.7, 0.9, 0x9c6b55, { anim });
  for (const [x, z] of [[-0.4, -0.4], [0.4, 0.4]]) at(b, 'cyl6', q.clone().add(new THREE.Vector3(x, -3, z)), 0, 0.03, 1.6, 0.03, 0x3a3048, { anim });
}

// ------------------------------------------------------------------ Cimes de Givre

function crystals(c: DecorCtx, p: THREE.Vector3, ry: number, big = false): void {
  const { b, r, pal } = c;
  const n = big ? 3 : 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = (big ? 7 : 1.5) + r() * (big ? 8 : 3);
    const q = L(p, ry, (r() - 0.5) * (big ? 3 : 2), h * 0.4, (r() - 0.5) * (big ? 3 : 2));
    at(b, 'cone6', q, r() * 6, h * 0.16, h, h * 0.16, i % 3 ? pal.crystal : 0xffffff, { glow: 0.55, rx: (r() - 0.5) * 0.7, rz: (r() - 0.5) * 0.7 });
  }
}

function snowman(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b } = c;
  at(b, 'ico1', L(p, ry, 0, 0.7, 0), ry, 0.85, 0.8, 0.85, 0xffffff);
  at(b, 'sph', L(p, ry, 0, 1.75, 0), ry, 0.6, 0.58, 0.6, 0xffffff);
  at(b, 'sph', L(p, ry, 0, 2.55, 0), ry, 0.42, 0.42, 0.42, 0xffffff);
  at(b, 'cone6', L(p, ry, 0, 2.55, 0.55), ry, 0.08, 0.45, 0.08, 0xff8a3a, { rx: Math.PI / 2 });
  at(b, 'cyl8', L(p, ry, 0, 3.05, 0), ry, 0.3, 0.45, 0.3, 0x2a2140);
  at(b, 'cyl8', L(p, ry, 0, 2.85, 0), ry, 0.48, 0.05, 0.48, 0x2a2140);
  at(b, 'box', L(p, ry, 0, 2.2, 0), ry, 0.9, 0.16, 0.9, 0xff5d73);
  for (const s of [-1, 1]) at(b, 'cyl6', L(p, ry, s * 0.9, 1.95, 0), ry, 0.04, 1, 0.04, 0x7a4e3a, { rz: s * 1 });
}

function iceRock(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  rock(c, p, ry, 0xd0e8ff);
}

// ------------------------------------------------------------------ Cité des Engrenages

function gear(b: Builder, center: THREE.Vector3, axis: THREE.Vector3, ry: number, radius: number, speed: number, color: number, faceX = false): void {
  const anim: Anim = { kind: 1, pivot: center, axis, param: speed };
  const rx = faceX ? 0 : Math.PI / 2;
  const rz = faceX ? Math.PI / 2 : 0;
  at(b, 'cyl12', center, ry, radius, 0.35, radius, color, { anim, rx, rz });
  at(b, 'cyl8', center, ry, radius * 0.25, 0.5, radius * 0.25, 0x5d4a65, { anim, rx, rz });
  const teeth = Math.max(8, Math.round(radius * 6));
  // dents : petites boîtes réparties sur la couronne, dans le plan perpendiculaire à l'axe
  const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : Y).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const q = center.clone().addScaledVector(u, Math.cos(a) * radius * 1.05).addScaledVector(v, Math.sin(a) * radius * 1.05);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), axis, u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a)));
    m.scale(new THREE.Vector3(0.25, 0.32, 0.3)).setPosition(q);
    b.add('box', m, color, 0, 0, 0, anim);
  }
}

function gearTower(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, emit } = c;
  const h = 7 + r() * 5;
  at(b, 'box', L(p, ry, 0, h / 2, 0), ry, 2.6, h, 2.6, 0xc8946a, { jitter: 0.06 });
  for (let y = 1.5; y < h; y += 2.2) at(b, 'box', L(p, ry, 0, y, 0), ry, 2.8, 0.25, 2.8, 0x8c5f5e);
  at(b, 'cap', L(p, ry, 0, h, 0), ry, 1.6, 1.4, 1.6, 0xe0793f);
  const ax = axisL(ry, 0, 0, 1);
  const r1 = 1.5 + r() * 0.5;
  gear(b, L(p, ry, 0, h * 0.7, 1.55), ax, ry, r1, 0.8, 0xffcf5c);
  gear(b, L(p, ry, r1 * 1.55, h * 0.7 - r1 * 0.55, 1.55), ax, ry, r1 * 0.6, -0.8 / 0.6, 0xe0a050);
  const top = L(p, ry, 0.6, h + 2.2, 0);
  at(b, 'cyl8', top, ry, 0.35, 2, 0.35, 0x5d4a65);
  emit.push({ p: top.clone().add(new THREE.Vector3(0, 1.2, 0)), kind: 'smoke' });
}

function chimneyStack(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, emit } = c;
  const h = 8 + r() * 6;
  at(b, 'cyl8', L(p, ry, 0, h / 2, 0), ry, 0.9, h, 0.9, 0xb8785e, { jitter: 0.08 });
  for (let y = 1; y < h; y += 1.8) at(b, 'cyl8', L(p, ry, 0, y, 0), ry, 1, 0.2, 1, 0xffcf5c);
  at(b, 'cyl8', L(p, ry, 0, h + 0.3, 0), ry, 1.15, 0.6, 1.15, 0x5d4a65);
  at(b, 'box', L(p, ry, 0, 0.8, 0), ry, 2.4, 1.6, 2.4, 0x8c5f5e);
  emit.push({ p: L(p, ry, 0, h + 0.9, 0), kind: 'smoke' });
}

function workshop(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  const w = 4 + r() * 1.5, d = 3.4, h = 3;
  at(b, 'box', L(p, ry, 0, h / 2, 0), ry, w, h, d, pick(r, [0xe8d8c8, 0xd8c0a8, 0xf0e0c8]));
  at(b, 'cyl12', L(p, ry, 0, h, 0), ry, d * 0.55, w * 0.98, d * 0.55, 0xe0793f, { rz: Math.PI / 2 });
  gear(b, L(p, ry, 0, h * 0.55, d / 2 + 0.1), axisL(ry, 0, 0, 1), ry, 0.7, 1.2, 0xffd27a);
  at(b, 'cyl8', L(p, ry, 0, h * 0.55, d / 2 + 0.05), ry, 0.6, 0.06, 0.6, 0xffd27a, { glow: 1.2, rx: Math.PI / 2 });
  // tuyaux
  beam(b, 'cyl6', L(p, ry, w / 2, 0.6, 0), L(p, ry, w / 2 + 2, 0.6, 0), 0.22, 0xffcf5c);
  beam(b, 'cyl6', L(p, ry, w / 2 + 2, 0.6, 0), L(p, ry, w / 2 + 2, 3.5, 0), 0.22, 0xffcf5c);
  at(b, 'sph', L(p, ry, w / 2 + 2, 0.6, 0), 0, 0.32, 0.32, 0.32, 0xe0793f);
}

function propeller(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  const h = 4 + r() * 2;
  at(b, 'cyl6', L(p, ry, 0, h / 2, 0), ry, 0.12, h, 0.12, 0x5d4a65);
  const hub = L(p, ry, 0, h, 0);
  const anim: Anim = { kind: 1, pivot: hub, axis: Y, param: 3 + r() * 2 };
  for (let i = 0; i < 3; i++) at(b, 'box', L(hub, ry + (i / 3) * Math.PI * 2, 0.9, 0, 0), ry + (i / 3) * Math.PI * 2, 1.8, 0.05, 0.35, 0xffcf5c, { anim, rx: 0.3 });
  at(b, 'sph', hub, 0, 0.2, 0.2, 0.2, 0xff5d73);
}

// ------------------------------------------------------------------ Récif des Nuées

function coral(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, pal } = c;
  const col = pick(r, pal.canopy);
  const branch = (from: THREE.Vector3, dir: THREE.Vector3, len: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len);
    beam(b, 'cyl6', from, to, 0.18 + depth * 0.08, col);
    if (depth <= 0) {
      at(b, 'ico', to, 0, 0.3, 0.3, 0.3, pick(r, pal.flower), { glow: 0.8 });
      return;
    }
    for (let k = 0; k < 2; k++) {
      const nd = dir.clone().add(new THREE.Vector3((r() - 0.5) * 1.2, 0.3, (r() - 0.5) * 1.2)).normalize();
      branch(to, nd, len * 0.72, depth - 1);
    }
  };
  branch(p.clone(), Y.clone(), 1.6 + r(), 2 + (r() < 0.4 ? 1 : 0));
  void ry;
}

function anemone(c: DecorCtx, p: THREE.Vector3): void {
  const { b, r, pal } = c;
  const col = pick(r, pal.canopy);
  at(b, 'cyl8', L(p, 0, 0, 0.4, 0), 0, 0.7, 0.8, 0.7, col);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const base = L(p, 0, Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5);
    const ax = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    at(b, 'cyl6', base.clone().add(new THREE.Vector3(Math.cos(a) * 0.25, 0.6, Math.sin(a) * 0.25)), a, 0.08, 1.3, 0.08, pick(r, pal.flower), { glow: 0.6, anim: { kind: 4, pivot: base, axis: ax, param: 0.35 }, rz: 0.3 });
  }
}

function brainCoral(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, pal } = c;
  at(b, 'ico1', L(p, ry, 0, 0.6, 0), ry, 1.3 + r(), 0.9 + r() * 0.5, 1.3 + r(), pick(r, pal.canopy), { jitter: 0.35 });
}

function shell(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b } = c;
  at(b, 'cap', L(p, ry, 0, 0.2, 0), ry, 1.8, 1.4, 1.8, 0xfff0f4, { rx: -0.9, jitter: 0.08 });
  at(b, 'sph', L(p, ry, 0, 0.55, 0.4), 0, 0.42, 0.42, 0.42, 0xfffaf0, { glow: 1.2 });
}

function kelp(c: DecorCtx, p: THREE.Vector3): void {
  const { b, r } = c;
  for (let i = 0; i < 3; i++) {
    const h = 4 + r() * 5;
    at(b, 'cone6', L(p, 0, (r() - 0.5) * 1.5, h / 2, (r() - 0.5) * 1.5), r() * 6, 0.35, h, 0.12, 0x6fcf9a, { sway: 1.2 });
  }
}

function jellyfish(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, pal } = c;
  const q = L(p, ry, 0, 5 + r() * 6, 0);
  const anim: Anim = { kind: 3, pivot: q, axis: Y, param: 1.2 };
  const col = pick(r, pal.flower);
  at(b, 'cap', q, 0, 1.3, 1.1, 1.3, col, { glow: 1.1, anim });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    at(b, 'cyl6', q.clone().add(new THREE.Vector3(Math.cos(a) * 0.7, -1, Math.sin(a) * 0.7)), 0, 0.05, 2, 0.05, col, { glow: 0.8, anim });
  }
}

// ------------------------------------------------------------------ Confins Étoilés

function starCrystal(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, pal } = c;
  at(b, 'cyl6', L(p, ry, 0, 0.5, 0), ry, 0.8, 1, 0.8, 0x4a4590);
  const q = L(p, ry, 0, 2.6, 0);
  at(b, 'ico', q, 0, 1, 1, 1, pal.crystal, { glow: 2.2, anim: { kind: 1, pivot: q, axis: Y, param: 0.6 + r() } });
  const ring = { kind: 1 as const, pivot: q, axis: new THREE.Vector3(0.3, 1, 0.2).normalize(), param: -0.9 };
  at(b, 'torus', q, 0, 1.6, 1.6, 1.6, 0xfff1a0, { glow: 1.2, rx: Math.PI / 2 + 0.3, anim: ring });
}

function silverTree(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, pal } = c;
  const h = 3 + r() * 3;
  at(b, 'cyl6', L(p, ry, 0, h / 2, 0), ry, 0.15, h, 0.15, 0xd8dcf0);
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2;
    const from = L(p, ry, 0, h * (0.5 + r() * 0.4), 0);
    const to = from.clone().add(new THREE.Vector3(Math.cos(a) * 1.4, 0.8, Math.sin(a) * 1.4));
    beam(b, 'cyl6', from, to, 0.07, 0xd8dcf0);
    at(b, 'ico', to, 0, 0.32, 0.32, 0.32, pick(r, pal.canopy), { glow: 1.8, sway: 0.4 });
  }
}

function observatory(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b } = c;
  at(b, 'cyl12', L(p, ry, 0, 1.4, 0), ry, 2.4, 2.8, 2.4, 0xe8e4ff);
  const q = L(p, ry, 0, 2.8, 0);
  const anim: Anim = { kind: 1, pivot: q, axis: Y, param: 0.18 };
  at(b, 'cap', q, ry, 2.5, 2.3, 2.5, 0xb8c0e8, { anim });
  // lunette qui balaie le ciel
  const tube = L(p, ry, 1.2, 4.2, 0);
  at(b, 'cyl8', tube, ry, 0.38, 3.2, 0.38, 0xffcf5c, { anim, rz: -0.8 });
  at(b, 'box', L(p, ry, 0, 0.9, 2.42), ry, 0.9, 1.8, 0.08, 0x2a2660);
  at(b, 'box', L(p, ry, 0, 2.2, 2.42), ry, 0.6, 0.6, 0.08, 0xffd27a, { glow: 1.4 });
}

function miniPlanet(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, pal } = c;
  at(b, 'cyl6', L(p, ry, 0, 1.5, 0), ry, 0.06, 3, 0.06, 0xd8dcf0);
  const q = L(p, ry, 0, 3.6, 0);
  const col = pick(r, pal.canopy);
  at(b, 'sph', q, 0, 0.75, 0.75, 0.75, col, { glow: 0.5, anim: { kind: 1, pivot: q, axis: Y, param: 0.5 } });
  at(b, 'torus', q, 0, 1.2, 1.2, 0.5, 0xfff1a0, { glow: 0.9, rx: Math.PI / 2 + 0.4, anim: { kind: 1, pivot: q, axis: new THREE.Vector3(0.4, 1, 0).normalize(), param: 0.7 } });
}

function moonRock(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, pal } = c;
  rock(c, p, ry, 0x6a68a8);
  for (let i = 0; i < 3; i++) at(b, 'tetra', L(p, ry, (r() - 0.5) * 1.6, 0.9 + r() * 0.4, (r() - 0.5) * 1.6), r() * 6, 0.18, 0.18, 0.18, pal.crystal, { glow: 2 });
}

// ------------------------------------------------------------------ Mer des Lanternes

const light = (c: DecorCtx, p: THREE.Vector3) => c.emit.push({ p, kind: 'light' });

function lampPost(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  const h = 3.5 + r() * 1.5;
  at(b, 'cyl6', L(p, ry, 0, h / 2, 0), ry, 0.09, h + 1, 0.09, 0x2a2440);
  at(b, 'box', L(p, ry, 0.35, h, 0), ry, 0.7, 0.06, 0.06, 0x2a2440);
  const lamp = L(p, ry, 0.65, h - 0.45, 0);
  at(b, 'cyl8', lamp, 0, 0.2, 0.42, 0.2, 0xffcf70, { glow: 1.8, anim: { kind: 4, pivot: L(p, ry, 0.65, h, 0), axis: axisL(ry, 0, 0, 1), param: 0.1 } });
  light(c, lamp);
}

/** enseigne verticale peinte, tournée vers le train qui arrive */
function shopSign(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, signs } = c;
  if (!signs || !c.fwd || !c.inward) return lampPost(c, p, ry);
  const h = 4.4 + r() * 1.6;
  // deux montants de bois, l'enseigne entre les deux
  const normal = c.inward.clone().multiplyScalar(0.55).addScaledVector(c.fwd, -0.85).normalize();
  const right = new THREE.Vector3().crossVectors(Y, normal).normalize();
  for (const s of [-1, 1]) at(b, 'cyl6', p.clone().addScaledVector(right, s * 0.42).add(new THREE.Vector3(0, h / 2, 0)), 0, 0.06, h + 1.2, 0.06, 0x3a2a30);
  const cc = p.clone().add(new THREE.Vector3(0, h - 1.7, 0));
  signs.board(cc, right, Y.clone(), 0.62, 4.6, signAtlas().vertical(Math.floor(r() * SHOP_WORDS.length)));
  const top = p.clone().add(new THREE.Vector3(0, h + 0.75, 0));
  at(b, 'cyl8', top, 0, 0.18, 0.36, 0.18, 0xffb347, { glow: 1.8 });
  light(c, top);
}

function stiltHouse(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r, signs } = c;
  const w = 3.6 + r() * 1.6, d = 3.2, h = 2.8;
  const base = 1.5;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) at(b, 'cyl6', L(p, ry, x * w * 0.42, base / 2, z * d * 0.42), ry, 0.12, base + 0.6, 0.12, 0x3a2a30);
  at(b, 'box', L(p, ry, 0, base + 0.05, 0), ry, w + 1.4, 0.15, d + 1.2, 0x5a4034);
  at(b, 'box', L(p, ry, 0, base + h / 2, 0), ry, w, h, d, pick(r, [0xe8d8b8, 0xd8c0a0, 0xc8b8a8]));
  at(b, 'prism', L(p, ry, 0, base + h, 0), ry, w * 1.35, 2.2, d * 1.3, pick(r, [0x2f3f6a, 0x8f2b35, 0x3a4a3a]));
  for (const s of [-1, 1]) at(b, 'box', L(p, ry, s * w * 0.25, base + h * 0.55, d / 2 + 0.03), ry, 0.8, 0.9, 0.06, 0xffc870, { glow: 1.4 });
  const lamp = L(p, ry, w / 2 + 0.3, base + h * 0.8, d / 2);
  at(b, 'cyl8', lamp, 0, 0.18, 0.34, 0.18, 0xff9a5a, { glow: 2 });
  light(c, lamp);
  if (signs && r() < 0.6) {
    const f = L(p, ry, 0, 0, 1).sub(p).normalize();
    const right = new THREE.Vector3().crossVectors(Y, f).normalize();
    signs.board(L(p, ry, w / 2 + 0.05, base + h * 0.55, 0.6), f, Y.clone(), 0.5, 3.6, signAtlas().vertical(Math.floor(r() * SHOP_WORDS.length)));
    void right;
  }
  c.emit.push({ p: L(p, ry, -w * 0.3, base + h + 1.6, 0), kind: 'smoke' });
}

/** une petite maison seule sur son îlot, une lampe allumée à la porte */
function lonelyHouse(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b } = c;
  at(b, 'cyl12', L(p, ry, 0, 0.5, 0), ry, 3.4, 1.4, 3.4, 0x8a8070, { jitter: 0.08 });
  at(b, 'box', L(p, ry, 0, 2.3, 0), ry, 2.6, 2.4, 2.2, 0xe8dcc8);
  at(b, 'prism', L(p, ry, 0, 3.5, 0), ry, 3.2, 1.8, 2.7, 0x3a3048);
  at(b, 'box', L(p, ry, 0, 1.8, 1.12), ry, 0.7, 1.3, 0.06, 0x5a4034);
  const lamp = L(p, ry, 0.7, 2.6, 1.3);
  at(b, 'cyl8', lamp, 0, 0.16, 0.3, 0.16, 0xffcf70, { glow: 2.2 });
  light(c, lamp);
  tree(c, L(p, ry, -1.8, 1.1, -1), ry);
}

function portal(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b } = c;
  const fwd = c.fwd ?? axisL(ry, 0, 0, 1);
  const right = new THREE.Vector3().crossVectors(Y, fwd).normalize();
  const yaw = Math.atan2(right.x, right.z);
  for (const s of [-1, 1]) at(b, 'cyl8', p.clone().addScaledVector(fwd, s * 2.2).add(new THREE.Vector3(0, 3, 0)), 0, 0.22, 6.4, 0.22, 0x9c2f3a);
  at(b, 'box', p.clone().add(new THREE.Vector3(0, 6.1, 0)), yaw, 0.35, 0.35, 6.2, 0x9c2f3a);
  at(b, 'box', p.clone().add(new THREE.Vector3(0, 5.2, 0)), yaw, 0.25, 0.22, 5.2, 0x7a1f2b);
  for (const s of [-1, 1]) {
    const lamp = p.clone().addScaledVector(fwd, s * 1.1).add(new THREE.Vector3(0, 4.4, 0));
    at(b, 'sph', lamp, 0, 0.32, 0.42, 0.32, 0xff8a5a, { glow: 1.8, anim: { kind: 4, pivot: lamp.clone().add(new THREE.Vector3(0, 0.7, 0)), axis: right, param: 0.12 } });
    light(c, lamp);
  }
}

function floatingLanterns(c: DecorCtx, p: THREE.Vector3): void {
  const { b, r } = c;
  for (let i = 0; i < 4; i++) {
    const q = p.clone().add(new THREE.Vector3((r() - 0.5) * 6, 0.85, (r() - 0.5) * 6));
    at(b, 'cyl8', q, r() * 6, 0.22, 0.28, 0.22, pick(r, [0xffcf70, 0xff9a5a, 0xfff1c0]), { glow: 2, anim: { kind: 3, pivot: q, axis: Y, param: 0.06 } });
    if (i === 0) light(c, q);
  }
}

function reeds(c: DecorCtx, p: THREE.Vector3): void {
  const { b, r } = c;
  for (let i = 0; i < 7; i++) at(b, 'cone6', p.clone().add(new THREE.Vector3((r() - 0.5) * 2.4, 1.4, (r() - 0.5) * 2.4)), r() * 6, 0.07, 2.4 + r(), 0.07, 0x5a6a48, { sway: 1 });
}

function islet(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  const { b, r } = c;
  at(b, 'dodeca', L(p, ry, 0, 0.6, 0), ry, 1.8 + r(), 1, 1.6 + r(), 0x6a6478, { jitter: 0.2 });
  if (r() < 0.5) pine(c, L(p, ry, 0, 1.2, 0), ry);
  else tree(c, L(p, ry, 0, 1.2, 0), ry);
}

function waterShadow(c: DecorCtx, p: THREE.Vector3, ry: number): void {
  if (!c.shadows) return reeds(c, p);
  shadowFigure(c.shadows, p.clone().add(new THREE.Vector3(0, 0.6, 0)), ry, c.r);
}

// ------------------------------------------------------------------ kits

export const KITS: Record<RegionDef['key'], KitEntry[]> = {
  pres: [[30, tree, 6.5], [14, flowers, 6.5], [6, (c, p, ry) => pine(c, p, ry), 6.5], [5, windmill, 10], [6, field, 9.5], [5, haystack, 7.5], [6, sheep, 9], [4, cottage, 8], [2, scarecrow, 7], [3, rock, 6.5], [2, lantern, 6.5]],
  champignons: [[10, giantMushroom, 10], [14, glowShrooms, 6.5], [10, twistedTree, 8], [5, mushroomHouse, 9], [10, fern, 6.5], [8, tree, 6.5], [4, flowers, 6.5], [3, lantern, 6.5]],
  hameaux: [[10, (c, p, ry) => timberHouse(c, p, ry), 9], [4, (c, p, ry) => timberHouse(c, p, ry, true), 9.5], [5, laundry, 8], [5, stall, 8], [3, bellTower, 11], [5, garden, 9], [16, tree, 6.5], [8, flowers, 6.5], [2, balloon, 12], [3, lantern, 6.5]],
  cristal: [[16, crystals, 6.5], [4, (c, p, ry) => crystals(c, p, ry, true), 11], [16, (c, p, ry) => pine(c, p, ry, true), 6.5], [3, snowman, 8], [10, iceRock, 6.5], [3, lantern, 6.5]],
  engrenages: [[7, gearTower, 10], [5, chimneyStack, 10], [7, workshop, 9], [5, propeller, 7], [10, tree, 6.5], [4, flowers, 6.5], [6, rock, 6.5], [6, lantern, 6.5]],
  recif: [[16, coral, 6.5], [8, anemone, 6.5], [8, brainCoral, 6.5], [4, shell, 7], [9, kelp, 6.5], [4, jellyfish, 9], [5, flowers, 6.5]],
  mer: [[12, shopSign, 7.5], [10, lampPost, 7.5], [5, stiltHouse, 11], [2, lonelyHouse, 14], [3, portal, 9], [8, floatingLanterns, 7.5], [8, reeds, 7.5], [5, islet, 10], [3, waterShadow, 8]],
  confins: [[9, starCrystal, 7], [14, silverTree, 6.5], [3, observatory, 10], [5, miniPlanet, 7.5], [10, moonRock, 6.5], [8, flowers, 6.5], [4, lantern, 6.5]],
};

/** pose un élément du kit d'une région (minLat : distance à la voie disponible ici) */
export function placeDecor(c: DecorCtx, region: RegionDef, p: THREE.Vector3, ry: number, lat: number): void {
  const kit = KITS[region.key];
  let total = 0;
  for (const [w, , min] of kit) if (lat >= min) total += w;
  let roll = c.r() * total;
  for (const [w, fn, min] of kit) {
    if (lat < min) continue;
    roll -= w;
    if (roll <= 0) {
      fn(c, p, ry);
      return;
    }
  }
}

/** ce qui pend sous les îles, selon la région */
export function hangDecor(c: DecorCtx, under: Underside, p: THREE.Vector3): void {
  const { b, r, pal } = c;
  const down = (h: number, w: number, color: number, glow = 0, sway = 0) =>
    at(b, 'cone6', p.clone().add(new THREE.Vector3(0, -h * 0.5, 0)), r() * 3, w, h, w, color, { glow, sway, rx: Math.PI + (r() - 0.5) * 0.4 });
  switch (under) {
    case 'strata':
      if (r() < 0.55) down(3 + r() * 6, 0.5 + r() * 0.9, pal.crystal, 0.9);
      else if (r() < 0.6) down(4 + r() * 10, 0.25, 0x7a5546, 0.4);
      else {
        // lianes fleuries
        const h = 5 + r() * 8;
        at(b, 'cone6', p.clone().add(new THREE.Vector3(0, -h / 2, 0)), r() * 3, 0.3, h, 0.3, 0x5faa5a, { rx: Math.PI });
        for (let k = 0; k < 3; k++) at(b, 'tetra', p.clone().add(new THREE.Vector3((r() - 0.5) * 0.6, -h * (0.2 + k * 0.25), (r() - 0.5) * 0.6)), r() * 6, 0.3, 0.3, 0.3, pick(r, pal.flower));
      }
      break;
    case 'roots': {
      const h = 5 + r() * 12;
      down(h, 0.22 + r() * 0.2, 0x7a5aa8, 0.5);
      at(b, 'sph', p.clone().add(new THREE.Vector3(0, -h, 0)), 0, 0.45, 0.6, 0.45, pick(r, pal.flower), { glow: 2, anim: { kind: 4, pivot: p.clone(), axis: new THREE.Vector3(1, 0, 0), param: 0.04 } });
      break;
    }
    case 'ice':
      for (let k = 0; k < 2; k++) down(2 + r() * 7, 0.3 + r() * 0.5, k ? 0xffffff : pal.crystal, 0.6);
      break;
    case 'brass':
      if (r() < 0.5) {
        const h = 4 + r() * 8;
        at(b, 'cyl6', p.clone().add(new THREE.Vector3(0, -h / 2, 0)), 0, 0.3, h, 0.3, 0xffcf5c);
        at(b, 'cyl8', p.clone().add(new THREE.Vector3(0, -h, 0)), 0, 0.5, 0.4, 0.5, 0xe0793f);
      } else gear(b, p.clone().add(new THREE.Vector3(0, -3 - r() * 4, 0)), new THREE.Vector3(1, 0, 0), 0, 1.2 + r() * 1.2, (r() - 0.5) * 1.6, 0xd8a050, true);
      break;
    case 'coral': {
      if (r() < 0.5) down(3 + r() * 6, 0.4 + r() * 0.6, pick(r, pal.canopy), 0.5);
      else {
        const h = 5 + r() * 9;
        at(b, 'cone6', p.clone().add(new THREE.Vector3(0, -h / 2, 0)), r() * 3, 0.4, h, 0.15, 0x6fcf9a, { rx: Math.PI, anim: { kind: 4, pivot: p.clone(), axis: new THREE.Vector3(0, 0, 1), param: 0.12 } });
      }
      break;
    }
    case 'basin': {
      // l'eau goutte sous le bassin : longs filets clairs et racines
      if (r() < 0.6) down(4 + r() * 10, 0.12 + r() * 0.12, 0xa8d8ff, 0.5);
      else down(3 + r() * 6, 0.35 + r() * 0.4, pal.rock[2], 0.1);
      break;
    }
    case 'star': {
      down(3 + r() * 6, 0.4 + r() * 0.6, 0x4a4590, 0.2);
      const q = p.clone().add(new THREE.Vector3(0, -4 - r() * 6, 0));
      at(b, 'ico', q, 0, 0.6, 0.6, 0.6, pal.crystal, { glow: 2.4, anim: { kind: 1, pivot: q, axis: Y, param: 1 } });
      break;
    }
  }
}

// ------------------------------------------------------------------ monuments

export interface Landmark {
  name: string;
  /** distance de la voie à laquelle il se dresse */
  s: number;
  center: THREE.Vector3;
  /** hauteur utile pour cadrer */
  height: number;
  geo: THREE.BufferGeometry;
  emit: Emitter[];
}

/**
 * un monument par région, assez loin de la voie pour être admiré d'ensemble ;
 * `base` est le centre au niveau du sol, `side` le côté de la voie (+1 droite, −1 gauche)
 */
export function buildLandmark(key: RegionDef['key'], base: THREE.Vector3, toTrack: THREE.Vector3, r: Rng, pal: Palette): { geo: THREE.BufferGeometry; height: number; emit: Emitter[] } {
  const b = new Builder();
  const emit: Emitter[] = [];
  const c: DecorCtx = { b, r, pal, emit };
  // face tournée vers la voie
  const ry = Math.atan2(toTrack.x, toTrack.z);
  let height = 40;
  const d0 = 12;
  const islandRock = (radius: number, depth: number, top: number) => {
    at(b, 'cyl12', base.clone().add(new THREE.Vector3(0, -0.5, 0)), ry, radius, 1, radius, top, { jitter: 0.05 });
    at(b, 'cone8', base.clone().add(new THREE.Vector3(0, -1 - depth / 2, 0)), ry, radius * 0.98, depth, radius * 0.98, pal.rock[1], { rx: Math.PI, jitter: 0.1 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      at(b, 'cone6', base.clone().add(new THREE.Vector3(Math.cos(a) * radius * 0.5, -depth * 0.8 - 4, Math.sin(a) * radius * 0.5)), 0, radius * 0.08, 12, radius * 0.08, pal.crystal, { glow: 0.9, rx: Math.PI });
    }
  };
  switch (key) {
    case 'pres': {
      // le Grand Moulin : ses ailes balaient le ciel
      islandRock(26, 34, pal.grass[0]);
      const S = 4.5;
      const sub = (fn: Item, x: number, z: number) => fn(c, base.clone().add(new THREE.Vector3(x, 0, z)), ry + Math.PI);
      sub(field, 12, 8);
      sub(field, -12, 9);
      sub(sheep, 6, -12);
      sub(tree, -16, -6);
      sub(tree, 17, -8);
      const h = 9 * S;
      at(b, 'cyl12', base.clone().add(new THREE.Vector3(0, h / 2, 0)), ry, 1.5 * S, h, 1.5 * S, 0xfff3e0, { jitter: 0.04 });
      at(b, 'cone8', base.clone().add(new THREE.Vector3(0, h + 1 * S, 0)), ry, 1.9 * S, 2 * S, 1.9 * S, 0xff7a6b);
      const hub = L(base, ry, 0, h, 1.8 * S);
      const anim: Anim = { kind: 1, pivot: hub, axis: axisL(ry, 0, 0, 1), param: 0.35 };
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const dir = new THREE.Vector3(0, Math.cos(a), 0).add(axisL(ry, Math.sin(a), 0, 0));
        at(b, 'box', hub.clone().addScaledVector(dir, 2.6 * S), ry, 0.15 * S, 5.2 * S, 0.1 * S, 0x8a5a44, { anim, rz: -a });
        const off = axisL(ry, Math.cos(a), 0, 0).multiplyScalar(0.5 * S).add(new THREE.Vector3(0, -Math.sin(a) * 0.5 * S, 0));
        at(b, 'box', hub.clone().addScaledVector(dir, 3 * S).add(off), ry, 0.9 * S, 3.8 * S, 0.06 * S, 0xfffaf0, { anim, rz: -a });
      }
      for (let k = 0; k < 4; k++) at(b, 'box', L(base, ry, 0, 2 + k * 8, 1.5 * S + 0.1), ry, 2, 2.4, 0.2, 0xffd27a, { glow: 1 });
      height = h + 25;
      break;
    }
    case 'champignons': {
      // le Champignon-Lune, phare de la forêt
      islandRock(24, 30, pal.grass[0]);
      const h = 62;
      for (let i = 0; i < 6; i++) {
        const t0 = i / 6, t1 = (i + 1) / 6;
        beam(b, 'cyl12', base.clone().add(new THREE.Vector3(Math.sin(t0 * 2) * 4, h * t0, 0)), base.clone().add(new THREE.Vector3(Math.sin(t1 * 2) * 4, h * t1, 0)), 5 - t0 * 1.5, 0xfff1dc);
      }
      const top = base.clone().add(new THREE.Vector3(Math.sin(2) * 4, h, 0));
      at(b, 'cyl12', top.clone().add(new THREE.Vector3(0, -0.8, 0)), 0, 26, 1, 26, 0xffd0f0, { glow: 0.8 });
      at(b, 'cap', top, 0, 28, 15, 28, pal.canopy[0], { glow: 0.45, jitter: 0.06 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + r();
        const rr = 6 + r() * 18;
        at(b, 'sph', top.clone().add(new THREE.Vector3(Math.cos(a) * rr, 15 * Math.sqrt(Math.max(0, 1 - (rr / 28) ** 2)), Math.sin(a) * rr)), 0, 2.2, 1.2, 2.2, pick(r, pal.flower), { glow: 2 });
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        giantMushroom(c, base.clone().add(new THREE.Vector3(Math.cos(a) * 15, 0, Math.sin(a) * 15)), a);
      }
      emit.push({ p: top.clone().add(new THREE.Vector3(0, -2, 0)), kind: 'spore' }, { p: top.clone().add(new THREE.Vector3(12, -1, 0)), kind: 'spore' });
      height = h + 20;
      break;
    }
    case 'hameaux': {
      // la Ville-Montgolfière : un village entier soulevé par des ballons
      const lift = 30;
      const v = base.clone().add(new THREE.Vector3(0, lift, 0));
      const before = b.pos.length;
      at(b, 'cyl12', v.clone().add(new THREE.Vector3(0, -0.5, 0)), 0, 14, 1, 14, pal.grass[0]);
      at(b, 'cone8', v.clone().add(new THREE.Vector3(0, -6, 0)), 0, 13.5, 10, 13.5, pal.rock[1], { rx: Math.PI });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        timberHouse(c, v.clone().add(new THREE.Vector3(Math.cos(a) * 8, 0, Math.sin(a) * 8)), -a + Math.PI / 2);
      }
      bellTower(c, v.clone(), ry);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.6;
        const q = v.clone().add(new THREE.Vector3(Math.cos(a) * 10, 22 + (i % 2) * 4, Math.sin(a) * 10));
        at(b, 'sph', q, 0, 6, 7, 6, pick(r, [0xff7a6b, 0xffd34d, 0x6fd3ff, 0xb48cff, 0x9be36b]), { jitter: 0.04 });
        beam(b, 'cyl6', q.clone().add(new THREE.Vector3(0, -6.5, 0)), v.clone().add(new THREE.Vector3(Math.cos(a) * 9, 0.5, Math.sin(a) * 9)), 0.08, 0xffffff);
      }
      // tout le village flotte d'un même mouvement
      const n = (b.pos.length - before) / 3;
      for (let i = 0; i < n; i++) {
        const j = (before / 3 + i) * 4;
        if (b.anim[j + 3] === 0) {
          b.anim[j] = v.x; b.anim[j + 1] = v.y; b.anim[j + 2] = v.z; b.anim[j + 3] = 3;
          b.animB[j] = 0; b.animB[j + 1] = 1; b.animB[j + 2] = 0; b.animB[j + 3] = 2.2;
        }
      }
      b.hasAnim = true;
      height = lift + 40;
      break;
    }
    case 'cristal': {
      // la Couronne de Givre : un bouquet de cristaux géants qui scintillent
      islandRock(22, 30, 0xf4f8ff);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const h = 20 + r() * 35;
        at(b, 'cone6', base.clone().add(new THREE.Vector3(Math.cos(a) * 9, h * 0.45, Math.sin(a) * 9)), r() * 6, h * 0.14, h, h * 0.14, i % 2 ? pal.crystal : 0xffffff, { glow: 0.7, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35 });
      }
      at(b, 'cone6', base.clone().add(new THREE.Vector3(0, 32, 0)), 0, 7, 64, 7, pal.crystal, { glow: 0.9 });
      const q = base.clone().add(new THREE.Vector3(0, 70, 0));
      at(b, 'ico', q, 0, 5, 5, 5, 0xffffff, { glow: 2.5, anim: { kind: 1, pivot: q, axis: Y, param: 0.4 } });
      for (let i = 0; i < 8; i++) pine(c, base.clone().add(new THREE.Vector3((r() - 0.5) * 36, 0, (r() - 0.5) * 36)), 0, true);
      height = 80;
      break;
    }
    case 'engrenages': {
      // la Grande Horloge : rouages géants et aiguilles qui tournent
      islandRock(24, 30, pal.grass[0]);
      const h = 55;
      at(b, 'box', base.clone().add(new THREE.Vector3(0, h / 2, 0)), ry, 14, h, 14, 0xd8b890, { jitter: 0.04 });
      for (let y = 6; y < h; y += 8) at(b, 'box', base.clone().add(new THREE.Vector3(0, y, 0)), ry, 15, 0.8, 15, 0x8c5f5e);
      at(b, 'cone4', base.clone().add(new THREE.Vector3(0, h + 8, 0)), ry + Math.PI / 4, 11, 16, 11, 0xe0793f);
      const face = L(base, ry, 0, h - 10, 7.2);
      const ax = axisL(ry, 0, 0, 1);
      at(b, 'cyl12', face, ry, 6, 0.5, 6, 0xfffaf0, { rx: Math.PI / 2, glow: 0.4 });
      at(b, 'torus', face, ry, 6.2, 6.2, 1.5, 0xffcf5c);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        at(b, 'box', face.clone().add(new THREE.Vector3(0, Math.cos(a) * 5, 0)).add(axisL(ry, Math.sin(a) * 5, 0, 0.3)), ry, 0.4, 0.9, 0.2, 0x3a3048, { rz: -a });
      }
      at(b, 'box', face.clone().add(new THREE.Vector3(0, 2, 0)).add(axisL(ry, 0, 0, 0.5)), ry, 0.4, 4, 0.15, 0x2a2140, { anim: { kind: 1, pivot: face, axis: ax, param: -0.5 } });
      at(b, 'box', face.clone().add(new THREE.Vector3(0, 1.3, 0)).add(axisL(ry, 0, 0, 0.6)), ry, 0.55, 2.6, 0.15, 0x2a2140, { anim: { kind: 1, pivot: face, axis: ax, param: -0.06 } });
      gear(b, L(base, ry, 9, h * 0.45, 2), axisL(ry, 1, 0, 0), ry, 8, 0.3, 0xffcf5c, true);
      gear(b, L(base, ry, -9, h * 0.35, -2), axisL(ry, -1, 0, 0), ry, 6, -0.4, 0xe0a050, true);
      gear(b, L(base, ry, -9, h * 0.7, 3), axisL(ry, -1, 0, 0), ry, 4, 0.6, 0xffcf5c, true);
      chimneyStack(c, base.clone().add(new THREE.Vector3(14, 0, -10)), ry);
      chimneyStack(c, base.clone().add(new THREE.Vector3(-15, 0, 9)), ry);
      height = h + 25;
      break;
    }
    case 'recif': {
      // l'Arche de Corail : une immense arche vivante, couverte d'anémones
      islandRock(26, 26, pal.grass[0]);
      const span = 34, H = 42;
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        const a = Math.PI * t;
        const q = L(base, ry, -Math.cos(a) * span / 2, Math.sin(a) * H, 0);
        at(b, 'ico1', q, r() * 6, 4.5 - Math.sin(a) * 1.5, 4.5 - Math.sin(a) * 1.5, 4.5 - Math.sin(a) * 1.5, pick(r, pal.canopy), { jitter: 0.3 });
        if (i % 3 === 0) anemone(c, q.clone().add(new THREE.Vector3(0, 3, 0)));
      }
      for (let i = 0; i < 6; i++) coral(c, base.clone().add(new THREE.Vector3((r() - 0.5) * 34, 0, (r() - 0.5) * 30)), 0);
      for (let i = 0; i < 4; i++) jellyfish(c, base.clone().add(new THREE.Vector3((r() - 0.5) * 40, 20 + r() * 25, (r() - 0.5) * 30)), 0);
      height = H + 16;
      break;
    }
    case 'mer': {
      // le Grand Hôtel des Brumes : des étages de toits recourbés, des centaines de fenêtres allumées
      islandRock(30, 22, 0x8a8070);
      const tiers = 6;
      let y = 0;
      for (let k = 0; k < tiers; k++) {
        const w = 30 - k * 3.6, d = 20 - k * 2.4, h = 6 + (k === 0 ? 3 : 0);
        at(b, 'box', base.clone().add(new THREE.Vector3(0, y + h / 2, 0)), ry, w, h, d, k % 2 ? 0xd8c8a8 : 0xe8d8b8);
        // fenêtres sur la façade tournée vers la voie
        const cols = Math.floor(w / 2.4);
        for (let i = 0; i < cols; i++) {
          if (r() < 0.25) continue;
          at(b, 'box', L(base, ry, -w / 2 + 1.2 + i * 2.4, y + h * 0.5, d / 2 + 0.05), ry, 1.2, 1.8, 0.1, r() < 0.8 ? 0xffc870 : 0xff8a5a, { glow: 1.6 });
        }
        // toit débordant, rouge sombre, aux coins relevés
        at(b, 'box', base.clone().add(new THREE.Vector3(0, y + h + 0.3, 0)), ry, w + 5, 0.6, d + 5, 0x6a2430);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) at(b, 'cone4', L(base, ry, sx * (w / 2 + 2.6), y + h + 0.9, sz * (d / 2 + 2.6)), ry, 0.5, 1.4, 0.5, 0x6a2430);
        for (let i = 0; i < 6; i++) {
          const lp = L(base, ry, -w / 2 + (i + 0.5) * (w / 6), y + h - 0.6, d / 2 + 2.2);
          at(b, 'sph', lp, 0, 0.45, 0.6, 0.45, 0xff6a4a, { glow: 2 });
          if (i % 2 === 0) emit.push({ p: lp, kind: 'light' });
        }
        y += h + 0.6;
      }
      at(b, 'cone4', base.clone().add(new THREE.Vector3(0, y + 3, 0)), ry + Math.PI / 4, 6, 6, 6, 0x6a2430);
      for (const sx of [-1, 1]) {
        const ch = L(base, ry, sx * 9, y - 2, -4);
        at(b, 'cyl8', ch, 0, 1, 10, 1, 0x5a4034);
        emit.push({ p: ch.clone().add(new THREE.Vector3(0, 5.5, 0)), kind: 'smoke' });
      }
      // un pont rouge qui descend vers l'eau
      for (let i = 0; i < 10; i++) {
        const t2 = i / 9;
        at(b, 'box', L(base, ry, 0, 1.2 + Math.sin(t2 * Math.PI) * 3, d0 + t2 * 26), ry, 4, 0.4, 2.8, 0x9c2f3a);
      }
      height = y + 12;
      break;
    }
    case 'confins': {
      // l'Observatoire de la Lune : un dôme, sa lunette géante et une lune apprivoisée
      islandRock(22, 30, pal.grass[0]);
      at(b, 'cyl12', base.clone().add(new THREE.Vector3(0, 6, 0)), ry, 12, 12, 12, 0xe8e4ff);
      const dome = base.clone().add(new THREE.Vector3(0, 12, 0));
      const anim: Anim = { kind: 1, pivot: dome, axis: Y, param: 0.08 };
      at(b, 'cap', dome, 0, 12.5, 11, 12.5, 0xb8c0e8, { anim });
      at(b, 'cyl12', base.clone().add(new THREE.Vector3(7, 22, 0)), 0, 2, 16, 2, 0xffcf5c, { anim, rz: -0.9 });
      const moon = base.clone().add(new THREE.Vector3(0, 58, 0));
      at(b, 'sph', moon, 0, 11, 11, 11, 0xfff6d8, { glow: 1.4, jitter: 0.06, anim: { kind: 3, pivot: moon, axis: Y, param: 2 } });
      at(b, 'torus', moon, 0, 17, 17, 4, 0xffd0f0, { glow: 1, rx: Math.PI / 2 + 0.35, anim: { kind: 1, pivot: moon, axis: new THREE.Vector3(0.34, 1, 0).normalize(), param: 0.2 } });
      for (let i = 0; i < 6; i++) silverTree(c, base.clone().add(new THREE.Vector3((r() - 0.5) * 36, 0, (r() - 0.5) * 36)), 0);
      height = 75;
      break;
    }
  }
  return { geo: b.geometry(), height, emit };
}
