// Tracé procédural de la voie et découpage en îles (rails déjà posés) et brèches (rails à construire).
import * as THREE from 'three';
import { cycleLength, mulberry32, type Difficulty, type Rng } from './model';
import { Regions } from './regions';

export interface Frame {
  pos: THREE.Vector3;
  fwd: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  bank: number;
}

/** courbe infinie échantillonnée au mètre, générée au fur et à mesure */
export class TrackPath {
  private base = 0;
  private xs: number[] = [];
  private ys: number[] = [];
  private zs: number[] = [];
  private hs: number[] = [];
  private cs: number[] = [];
  private x = 0;
  private z = 0;
  private h = 0;
  private waves: Array<[number, number, number]>;
  private hills: Array<[number, number, number]>;

  constructor(
    seed: number,
    private regions = new Regions(seed),
  ) {
    const r = mulberry32(seed);
    // courbure = somme de sinusoïdes lentes : virages amples, jamais brusques
    this.waves = [
      [0.0042, 1 / 260, r() * 7],
      [0.0026, 1 / 117, r() * 7],
      [0.0012, 1 / 53, r() * 7],
    ];
    this.hills = [
      [7, 1 / 190, r() * 7],
      [3, 1 / 71, r() * 7],
    ];
    this.extend(600);
  }

  private curvature(s: number): number {
    let c = 0;
    for (const [a, f, p] of this.waves) c += a * Math.sin(s * f + p);
    // départ en ligne droite
    return c * Math.min(1, Math.max(0, (s - 40) / 160));
  }

  private height(s: number): number {
    let y = 0;
    for (const [a, f, p] of this.hills) y += a * Math.sin(s * f + p);
    // relief doux + montée de région en région : le voyage gagne de la hauteur
    return y * Math.min(1, s / 200) + this.regions.altitude(s);
  }

  get end(): number {
    return this.base + this.xs.length - 1;
  }

  extend(to: number): void {
    while (this.end < to) {
      const s = this.base + this.xs.length;
      const c = this.curvature(s);
      if (this.xs.length) {
        this.h += c;
        this.x += Math.sin(this.h);
        this.z -= Math.cos(this.h);
      }
      this.xs.push(this.x);
      this.ys.push(this.height(s));
      this.zs.push(this.z);
      this.hs.push(this.h);
      this.cs.push(c);
    }
  }

  /** oublie ce qui est loin derrière */
  prune(before: number): void {
    const n = Math.floor(before - this.base);
    if (n < 500) return;
    for (const arr of [this.xs, this.ys, this.zs, this.hs, this.cs]) arr.splice(0, n);
    this.base += n;
  }

  private idx(s: number): [number, number] {
    if (s > this.end - 2) this.extend(s + 400);
    const f = Math.max(0, s - this.base);
    const i = Math.min(Math.floor(f), this.xs.length - 2);
    return [i, f - i];
  }

  point(s: number, out = new THREE.Vector3()): THREE.Vector3 {
    const [i, t] = this.idx(s);
    return out.set(
      this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t,
      this.ys[i] + (this.ys[i + 1] - this.ys[i]) * t,
      this.zs[i] + (this.zs[i + 1] - this.zs[i]) * t,
    );
  }

  heading(s: number): number {
    const [i, t] = this.idx(s);
    return this.hs[i] + (this.hs[i + 1] - this.hs[i]) * t;
  }

  curv(s: number): number {
    const [i, t] = this.idx(s);
    return this.cs[i] + (this.cs[i + 1] - this.cs[i]) * t;
  }

  /** repère local : avant, droite, haut (avec le dévers des virages) */
  frame(s: number, out?: Frame): Frame {
    const f = out ?? { pos: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), bank: 0 };
    this.point(s, f.pos);
    const h = this.heading(s);
    const slope = (this.height(s + 2) - this.height(s - 2)) / 4;
    f.fwd.set(Math.sin(h), slope, -Math.cos(h)).normalize();
    f.right.set(Math.cos(h), 0, Math.sin(h));
    f.bank = -this.curv(s) * 38;
    f.up.crossVectors(f.right, f.fwd).normalize();
    f.right.applyAxisAngle(f.fwd, f.bank);
    f.up.applyAxisAngle(f.fwd, f.bank);
    return f;
  }
}

export type SegmentKind = 'island' | 'gap';
export type BridgeStyle = 'plain' | 'grand';

export interface Segment {
  id: number;
  kind: SegmentKind;
  s0: number;
  s1: number;
  /** brèches : construite (par le calcul) ou non */
  built: boolean;
  /** construite par un wagon sacrifié : planches branlantes */
  rescue: boolean;
  style: BridgeStyle;
  /** grand pont : rang de la travée (0..n-1) et nombre de travées */
  span: number;
  spans: number;
  /** un voyageur attend sur une halte à côté de cette brèche */
  passenger: boolean;
  /** îles : variante de palette */
  biome: number;
  /** rang de la région traversée */
  region: number;
  /** île de contemplation (frontière de région) : pas de calcul, la caméra admire le paysage */
  calm: boolean;
  /** région traversée (clé) : décide du style des ponts */
  theme: string;
  /** une gare au milieu de l'île : côté de la voie et nom */
  station: { side: number; name: number } | null;
}

/** plan de la voie : alternance d'îles et de brèches, calibrée sur le temps de réponse */
export class Layout {
  segments: Segment[] = [];
  private nextId = 1;
  private cursor = 0;
  private sinceGrand = 0;
  private sinceRescue = 0;
  private sinceStation = 0;
  private stationName = 0;
  private rng: Rng;
  /** demandé par le jeu : faut-il proposer des voyageurs à sauver ? */
  wantPassengers = 0;

  constructor(
    seed: number,
    private difficulty: Difficulty,
    readonly regions = new Regions(seed),
  ) {
    this.rng = mulberry32(seed ^ 0x5bd1e995);
    // île de départ, longue : le temps de découvrir le train
    this.push('island', 100, 0);
  }

  private push(kind: SegmentKind, len: number, biome: number, extra: Partial<Segment> = {}): Segment {
    const seg: Segment = {
      id: this.nextId++, kind, s0: this.cursor, s1: this.cursor + len, built: kind === 'island', rescue: false,
      style: 'plain', span: 0, spans: 1, passenger: false, biome, region: this.regions.rankAt(this.cursor), calm: false,
      theme: this.regions.def(this.regions.rankAt(this.cursor)).key, station: null, ...extra,
    };
    this.cursor += len;
    this.segments.push(seg);
    return seg;
  }

  extend(to: number): void {
    while (this.cursor < to) {
      const cyc = cycleLength(this.difficulty, this.cursor);
      const biome = Math.floor(this.rng() * 4);
      // à chaque frontière de région : une longue île sans calcul pour admirer le nouveau paysage
      const border = this.regions.nextStart(this.cursor);
      if (this.cursor > 300 && border - this.cursor < cyc * 1.15) {
        this.push('island', border - this.cursor + 150 + this.rng() * 40, biome, { calm: true });
        continue;
      }
      this.sinceGrand++;
      this.sinceRescue++;
      // le Grand Pont ne chevauche jamais une frontière de région
      if (this.sinceGrand >= 7 && this.cursor > 600 && border - this.cursor > cyc * 1.6 + 160 + cyc * 1.15) {
        // le grand pont : trois calculs d'affilée au-dessus d'un gouffre
        this.sinceGrand = 0;
        const spanLen = 34 + this.rng() * 6;
        const approach = Math.max(80, cyc * 1.6 - spanLen);
        this.push('island', approach, biome);
        for (let k = 0; k < 3; k++) this.push('gap', spanLen, biome, { style: 'grand', span: k, spans: 3 });
        continue;
      }
      const gapLen = 26 + this.rng() * 18;
      const isl = this.push('island', Math.max(60, cyc - gapLen), biome);
      // des gares : souvent dans la Mer des Lanternes, parfois dans les hameaux
      this.sinceStation++;
      const every = isl.theme === 'mer' ? 3 : isl.theme === 'hameaux' ? 5 : 0;
      if (every && this.sinceStation >= every && isl.s1 - isl.s0 > 55) {
        this.sinceStation = 0;
        const name = isl.theme === 'hameaux' ? 6 + (this.stationName % 2) : this.stationName % 6;
        this.stationName++;
        isl.station = { side: this.rng() < 0.5 ? -1 : 1, name };
      }
      const passenger = this.wantPassengers > 0 && this.sinceRescue >= (this.wantPassengers > 1 ? 3 : 6);
      if (passenger) this.sinceRescue = 0;
      this.push('gap', gapLen, biome, { passenger });
    }
  }

  prune(before: number): Segment[] {
    const gone: Segment[] = [];
    while (this.segments.length && this.segments[0].s1 < before) gone.push(this.segments.shift()!);
    return gone;
  }

  at(s: number): Segment | undefined {
    return this.segments.find((g) => s >= g.s0 && s < g.s1);
  }

  /** première brèche pas encore construite devant s */
  nextUnbuilt(s: number): Segment | undefined {
    return this.segments.find((g) => g.kind === 'gap' && !g.built && g.s1 > s);
  }
}
