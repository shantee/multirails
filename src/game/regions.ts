// Les régions du voyage : chaque kilomètre change de paysage, de lumière et d'habitants, et la voie monte
// toujours un peu plus haut au-dessus de la mer de nuages. L'ordre varie d'une partie à l'autre (graine).
import * as THREE from 'three';
import { mulberry32 } from './model';
import type { Ambience } from './sky';

export interface Palette {
  grass: number[];
  rock: number[];
  canopy: number[];
  flower: number[];
  crystal: number;
}

/** façon de sculpter le dessous des îles */
export type Underside = 'strata' | 'roots' | 'ice' | 'brass' | 'coral' | 'star' | 'basin';
/** particules d'ambiance qui flottent autour du train */
export type MoteKind = 'pollen' | 'spores' | 'petals' | 'snow' | 'sparks' | 'bubbles' | 'stardust' | 'fireflies';

export interface RegionDef {
  key: 'pres' | 'champignons' | 'hameaux' | 'cristal' | 'engrenages' | 'recif' | 'confins' | 'mer';
  /** pluie (0..1) */
  rain: number;
  name: string;
  emoji: string;
  /** sous-titre de la bannière d'entrée */
  tagline: string;
  palettes: Palette[];
  under: Underside;
  motes: { kind: MoteKind; color: number };
  amb: Ambience;
}

const C = (hex: number) => new THREE.Color(hex);
function amb(name: string, emoji: string, o: Record<string, number> & { mist?: number }): Ambience {
  return {
    name, emoji, top: C(o.top), horizon: C(o.horizon), sun: C(o.sun), elev: o.elev, azim: o.azim, cloudLit: C(o.lit),
    cloudShade: C(o.shade), hemiSky: C(o.hs), hemiGround: C(o.hg), sunPower: o.power, night: o.night, mist: o.mist ?? 0,
  };
}

export const REGIONS: RegionDef[] = [
  {
    key: 'pres', name: 'Les Prés-Volants', emoji: '🌼', tagline: 'moulins, moutons et champs de fleurs',
    palettes: [
      { grass: [0x9ad66b, 0xb8e070, 0x7cc46a], rock: [0xe2a77d, 0xc98577, 0xa56f93, 0x7a6aa8], canopy: [0x6fbf5a, 0x9bd25e, 0x4fa86a], flower: [0xffffff, 0xffe06b, 0xff8fb2], crystal: 0x8fe8ff },
      { grass: [0xa8dc72, 0xc4e67a, 0x8ccf6c], rock: [0xf0b48a, 0xd99a86, 0xb07aa0, 0x8a78b8], canopy: [0x7fcf62, 0xffb3d1, 0x5fb070], flower: [0xff7fae, 0xffffff, 0xffd36b], crystal: 0xffa8e0 },
    ],
    rain: 0, under: 'strata', motes: { kind: 'pollen', color: 0xfff2a8 },
    amb: amb('Les Prés-Volants', '🌼', { top: 0x6f9be8, horizon: 0xffd9cf, sun: 0xffe2b8, elev: 0.3, azim: 0.6, lit: 0xfff4ee, shade: 0xb9a3dc, hs: 0xdcd6ff, hg: 0xb8d890, power: 2.4, night: 0 }),
  },
  {
    key: 'champignons', name: 'La Forêt des Spores', emoji: '🍄', tagline: 'champignons géants et lucioles',
    palettes: [
      { grass: [0x7fd6b8, 0x9be0c4, 0x6cc4b4], rock: [0xc7a0e8, 0xa47fd6, 0x7f66c4, 0x5a4fa8], canopy: [0xb48cff, 0xff8fc8, 0x6fe0d0], flower: [0x9ff7e0, 0xffb0f0, 0xfff1a0], crystal: 0x9ff7e0 },
      { grass: [0xa6d98a, 0xc0e09a, 0x8fcf96], rock: [0xf0a888, 0xd78aa8, 0xa070c0, 0x6a5aa8], canopy: [0xffa060, 0xff7f9f, 0xc98bff], flower: [0xfff1a0, 0x9ff7e0, 0xff9fd0], crystal: 0xffb0f0 },
    ],
    rain: 0, under: 'roots', motes: { kind: 'spores', color: 0x9ff7e0 },
    amb: amb('La Forêt des Spores', '🍄', { top: 0x4a3f9e, horizon: 0xf7a6c8, sun: 0xffb48a, elev: 0.12, azim: -0.3, lit: 0xffd6e6, shade: 0x7a5aa8, hs: 0xe0b0ff, hg: 0x6a4a9a, power: 1.9, night: 0.45 }),
  },
  {
    key: 'hameaux', name: 'Les Hameaux Perchés', emoji: '🏡', tagline: 'villages suspendus et montgolfières',
    palettes: [
      { grass: [0x9fd86e, 0xbfe37a, 0x86cc72], rock: [0xe8b88a, 0xd09a7a, 0xa87c8f, 0x7f6f9f], canopy: [0x6fbf5a, 0xffc04d, 0x4fa86a], flower: [0xff6a6a, 0xffffff, 0xffd34d], crystal: 0xffd36b },
      { grass: [0xb6e08a, 0xd7ec92, 0xa7d985], rock: [0xf0b9a0, 0xd99ab8, 0xb184c9, 0x8a7fd0], canopy: [0xffb3d1, 0xff9cc4, 0x7fcf62], flower: [0xff7fae, 0xffffff, 0xc98bff], crystal: 0xffa8e0 },
    ],
    rain: 0, under: 'strata', motes: { kind: 'petals', color: 0xffb3d1 },
    amb: amb('Les Hameaux Perchés', '🏡', { top: 0x3d8fe8, horizon: 0xc4ecff, sun: 0xfff4dc, elev: 0.75, azim: -0.4, lit: 0xffffff, shade: 0x9fbfe6, hs: 0xcfe9ff, hg: 0x9fd6a0, power: 2.6, night: 0 }),
  },
  {
    key: 'cristal', name: 'Les Cimes de Givre', emoji: '💎', tagline: 'cristaux chantants et neige qui tombe',
    palettes: [
      { grass: [0xf4f8ff, 0xe4eeff, 0xd8e8fb], rock: [0xbfd8f0, 0x9fb8e8, 0x8f92d6, 0x6f70b8], canopy: [0xe8f4ff, 0x9fd8e8, 0x7fb8d0], flower: [0x9ff3ff, 0xd8c0ff, 0xffffff], crystal: 0x9ff3ff },
      { grass: [0xe8f6f8, 0xd8eef4, 0xf8fbff], rock: [0xd0c8f0, 0xb0a8e8, 0x9088d0, 0x6f68b0], canopy: [0xd8c8ff, 0xbfe8ff, 0xffffff], flower: [0xd8a8ff, 0x9ff3ff, 0xffffff], crystal: 0xd8a8ff },
    ],
    rain: 0, under: 'ice', motes: { kind: 'snow', color: 0xffffff },
    amb: amb('Les Cimes de Givre', '💎', { top: 0x5f86d8, horizon: 0xe2f4ff, sun: 0xfff6ee, elev: 0.22, azim: 0.8, lit: 0xffffff, shade: 0xa8bce8, hs: 0xe6f2ff, hg: 0xa8c8e8, power: 2.3, night: 0.12 }),
  },
  {
    key: 'engrenages', name: 'La Cité des Engrenages', emoji: '⚙️', tagline: 'horloges, cheminées et robots bricoleurs',
    palettes: [
      { grass: [0xc8cf6a, 0xd8c25e, 0xb8bf6a], rock: [0xd89a6a, 0xb8785e, 0x8c5f5e, 0x5d4a65], canopy: [0xe8a040, 0xffc04d, 0xc8643a], flower: [0xffd36b, 0xff8a4a, 0xfff1c0], crystal: 0xffb050 },
      { grass: [0xb8c870, 0xd0d080, 0xa0b868], rock: [0xc8a080, 0xa88068, 0x806070, 0x504860], canopy: [0x88b860, 0xe8b050, 0x6a9a58], flower: [0xff8a4a, 0xfff1c0, 0xffd36b], crystal: 0x7fe0d0 },
    ],
    rain: 0, under: 'brass', motes: { kind: 'sparks', color: 0xffb060 },
    amb: amb('La Cité des Engrenages', '⚙️', { top: 0x5a86d6, horizon: 0xffd89a, sun: 0xffc070, elev: 0.28, azim: 0.9, lit: 0xfff1cf, shade: 0xd59a8a, hs: 0xffe1b0, hg: 0xd7a37a, power: 2.5, night: 0.08 }),
  },
  {
    key: 'recif', name: 'Le Récif des Nuées', emoji: '🐢', tagline: 'coraux du ciel et poissons volants',
    palettes: [
      { grass: [0x8fe0c8, 0xa8ecd0, 0x7fd0c0], rock: [0xffa8a0, 0xff8fb0, 0xd078c0, 0x8a68c0], canopy: [0xff7f9f, 0xffb060, 0x6fe0e0], flower: [0xfff1a0, 0xff9fd0, 0x9ff7ff], crystal: 0x9ff7ff },
      { grass: [0xa8e8d8, 0xc0f0e0, 0x90d8d0], rock: [0xffc0a0, 0xffa0a8, 0xe08ab8, 0x9a78c8], canopy: [0xff9f6f, 0xffd36b, 0xb48cff], flower: [0xffffff, 0xffb0f0, 0x9ff7ff], crystal: 0xffb0f0 },
    ],
    rain: 0, under: 'coral', motes: { kind: 'bubbles', color: 0xc8f4ff },
    amb: amb('Le Récif des Nuées', '🐢', { top: 0x2d4f8f, horizon: 0xff9f8a, sun: 0xffa070, elev: 0.07, azim: -0.2, lit: 0xffc4b0, shade: 0x5f5a9e, hs: 0xffb0c0, hg: 0x4a7aa0, power: 2.0, night: 0.3 }),
  },
  {
    key: 'confins', name: 'Les Confins Étoilés', emoji: '✨', tagline: 'si haut qu’on touche les étoiles',
    palettes: [
      { grass: [0x8f9fe8, 0xa8b4f0, 0x7f8fd8], rock: [0x5a5aa8, 0x4a4590, 0x3a3478, 0x2a2660], canopy: [0xc8d8ff, 0xffe8a0, 0x9fb0ff], flower: [0xfff1a0, 0xffffff, 0x9ff3ff], crystal: 0xfff1a0 },
      { grass: [0xa090e0, 0xb8a8f0, 0x8878d0], rock: [0x6a58a8, 0x544890, 0x403878, 0x2c2860], canopy: [0xffd0f0, 0xb8f0ff, 0xfff1a0], flower: [0x9ff3ff, 0xffd0f0, 0xffffff], crystal: 0x9ff3ff },
    ],
    rain: 0, under: 'star', motes: { kind: 'stardust', color: 0xd8e4ff },
    amb: amb('Les Confins Étoilés', '✨', { top: 0x0b1240, horizon: 0x3a3f8f, sun: 0xbfd4ff, elev: 0.55, azim: 0.3, lit: 0x9aa9e6, shade: 0x2a2766, hs: 0x6f7fd6, hg: 0x2b2f6e, power: 0.9, night: 1 }),
  },
  {
    key: 'mer', name: 'La Mer des Lanternes', emoji: '🏮', tagline: 'la voie s’enfonce dans l’eau, la nuit tombe',
    palettes: [
      { grass: [0xb8ab95, 0xa89a86, 0xc6b8a0], rock: [0x5f6f8f, 0x4a5578, 0x3a3f66, 0x2a2c50], canopy: [0x2f5a4a, 0x8f2b35, 0x3f6a50], flower: [0xffcf70, 0xff9a5a, 0xffe9b8], crystal: 0xffcf70 },
      { grass: [0xa8a090, 0x988f80, 0xb8b0a0], rock: [0x6a5f8a, 0x534a78, 0x3f3866, 0x2c2850], canopy: [0x8f2b35, 0x2f4a5a, 0xb0603a], flower: [0xffd27a, 0xffb0a0, 0xfff1d0], crystal: 0xffb347 },
    ],
    rain: 0.85, under: 'basin', motes: { kind: 'fireflies', color: 0xffc870 },
    amb: amb('La Mer des Lanternes', '🏮', { top: 0x141a40, horizon: 0xd98c80, sun: 0xffa070, elev: 0.03, azim: 0.15, lit: 0xf0b8a8, shade: 0x3a3f78, hs: 0x8f8fd0, hg: 0x2a3060, power: 1.2, night: 0.72, mist: 0.65 }),
  },
];

/** montée de la voie à chaque nouvelle région (m) et longueur de la rampe */
export const CLIMB = 16;
const RAMP = 420;
/** fondu des couleurs du ciel avant la frontière (m) */
const SKY_BLEND = 340;

export interface RegionMix {
  /** rang dans le voyage (0 = première région) */
  k: number;
  a: RegionDef;
  b: RegionDef;
  /** 0..1 : passage des couleurs de a vers b */
  t: number;
}

export class Regions {
  /** début de chaque région, dans l'ordre du voyage */
  readonly starts: number[] = [0];
  /** index dans REGIONS pour chaque rang */
  readonly order: number[] = [0];
  private rng: ReturnType<typeof mulberry32>;

  constructor(seed: number) {
    this.rng = mulberry32(seed ^ 0x2c1b3c6d);
    // la première région est un peu plus courte : on découvre vite qu'on voyage
    this.push(1);
    this.push(2);
    // la Mer des Lanternes : le premier grand dépaysement du voyage
    this.push(7);
    this.cycle([3, 4, 5]);
    this.push(6);
  }

  private push(idx: number): void {
    const prev = this.starts[this.starts.length - 1];
    const len = this.order.length === 1 ? 760 : 880 + this.rng() * 220;
    this.starts.push(prev + len);
    this.order.push(idx);
  }

  private cycle(ids: number[]): void {
    const a = [...ids];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    // jamais deux fois la même région d'affilée
    if (a[0] === this.order[this.order.length - 1]) a.push(a.shift()!);
    for (const i of a) this.push(i);
  }

  private ensure(s: number): void {
    while (this.starts[this.starts.length - 1] < s + 3000) {
      this.cycle([1, 2, 3, 4, 5, 7]);
      this.push(6);
    }
  }

  /** rang de la région à la distance s */
  rankAt(s: number): number {
    this.ensure(s);
    let k = 0;
    while (k + 1 < this.starts.length && this.starts[k + 1] <= s) k++;
    return k;
  }

  def(k: number): RegionDef {
    this.ensure(this.starts[Math.min(k, this.starts.length - 1)]);
    return REGIONS[this.order[k]];
  }

  start(k: number): number {
    this.ensure(this.starts[Math.min(k, this.starts.length - 1)]);
    return this.starts[k];
  }

  /** prochaine frontière strictement après s */
  nextStart(s: number): number {
    return this.start(this.rankAt(s) + 1);
  }

  /** couleurs du ciel : on glisse vers la région suivante avant la frontière */
  mix(s: number): RegionMix {
    const k = this.rankAt(s);
    const end = this.start(k + 1);
    let t = THREE.MathUtils.clamp((s - (end - SKY_BLEND)) / SKY_BLEND, 0, 1);
    t = t * t * (3 - 2 * t);
    return { k, a: this.def(k), b: this.def(k + 1), t };
  }

  /**
   * région d'un élément de décor posé à s : les premiers signes de la région suivante apparaissent
   * peu à peu avant la frontière, et quelques restes de la précédente persistent juste après.
   */
  pick(s: number, roll: number): number {
    const k = this.rankAt(s);
    const into = s - this.start(k);
    const len = this.start(k + 1) - this.start(k);
    const ahead = THREE.MathUtils.smoothstep(into, len - 520, len) * 0.6;
    if (roll < ahead) return k + 1;
    const behind = (1 - THREE.MathUtils.smoothstep(into, 0, 260)) * 0.45;
    if (k > 0 && roll > 1 - behind) return k - 1;
    return k;
  }

  /** altitude de la voie : une rampe douce à l'approche de chaque frontière */
  altitude(s: number): number {
    this.ensure(s);
    let y = 0;
    for (let k = 1; k < this.starts.length; k++) {
      const b = this.starts[k];
      if (b - RAMP > s) break;
      y += CLIMB * THREE.MathUtils.smoothstep(s, b - RAMP, b - 40);
    }
    return y;
  }
}

/** ambiance (ciel, lumières) interpolée entre deux régions */
export function ambienceAt(regions: Regions, s: number, out: Ambience): Ambience {
  const m = regions.mix(s);
  const a = m.a.amb, b = m.b.amb, t = m.t;
  out.name = a.name;
  out.emoji = a.emoji;
  for (const key of ['top', 'horizon', 'sun', 'cloudLit', 'cloudShade', 'hemiSky', 'hemiGround'] as const) out[key].copy(a[key]).lerp(b[key], t);
  out.elev = a.elev + (b.elev - a.elev) * t;
  out.azim = a.azim + (b.azim - a.azim) * t;
  out.sunPower = a.sunPower + (b.sunPower - a.sunPower) * t;
  out.night = a.night + (b.night - a.night) * t;
  out.mist = a.mist + (b.mist - a.mist) * t;
  return out;
}
