// La réalisatrice : choisit les plans et passe de l'un à l'autre en douceur.
// - poursuite vivante pendant les calculs (léger roulis, respiration, glissements vers un plan bas ou haut) ;
// - profil au bord du vide quand Bouillotte approche d'une voie incomplète ;
// - plan sur le chantier quand un pont lointain se construit ;
// - grands panoramas pendant les contemplations, regard vers les monuments ;
// - plan de côté du Grand Pont, et la chute (fournie par la scène de chute).
// Toutes les caméras « de côté » se placent au-dessus du vide, hors de l'emprise des îles : aucune ne traverse le décor.
import * as THREE from 'three';
import type { TrackPath } from './track';

export type ShotName = 'title' | 'follow' | 'edge' | 'flyby' | 'panorama' | 'landmark' | 'grand' | 'fall' | 'travelling';

export interface CamPose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  roll: number;
}

export interface ShotInput {
  t: number;
  dt: number;
  s: number;
  v: number;
  path: TrackPath;
  portrait: boolean;
  /** 1 = caméra vivante, petite valeur = caméra calme */
  life: number;
  danger: number;
  boiling: boolean;
  /** brèche filmée (profil ou chantier) et côté de la caméra */
  gap?: { s0: number; s1: number; side: number };
  grand?: { a: number; b: number };
  landmark?: { center: THREE.Vector3; height: number };
  /** pose imposée (chute) */
  forced?: CamPose;
  /** côté du travelling */
  side?: number;
}

const Y = new THREE.Vector3(0, 1, 0);
const ease = (k: number) => k * k * (3 - 2 * k);

function pose(): CamPose {
  return { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 58, roll: 0 };
}

function copyPose(a: CamPose, b: CamPose): CamPose {
  a.pos.copy(b.pos);
  a.look.copy(b.look);
  a.fov = b.fov;
  a.roll = b.roll;
  return a;
}

/** variantes de la poursuite : la caméra glisse doucement de l'une à l'autre */
const VARIANTS = {
  base: { back: 11.5, up: 7.4, ahead: 22, fov: 0 },
  low: { back: 9, up: 4.4, ahead: 26, fov: 4 },
  high: { back: 17, up: 14.5, ahead: 30, fov: -4 },
  close: { back: 8.5, up: 5.6, ahead: 18, fov: 2 },
};
type Variant = keyof typeof VARIANTS;

export class Director {
  shot: ShotName = 'title';
  /** temps passé dans le plan courant */
  since = 0;
  private from = pose();
  private out = pose();
  private target = pose();
  private blendAt = -1e9;
  private blendDur = 1;
  private hump = 0;
  private variant: Variant = 'base';
  private vcur = { ...VARIANTS.base };
  private nextVariantAt = 18;
  private t = 0;

  /** passe à un autre plan, en fondu (durée en s) ; 0 = coupe franche */
  go(name: ShotName, dur = 1.4, hump = 3): void {
    if (name === this.shot) return;
    copyPose(this.from, this.out);
    this.shot = name;
    this.since = 0;
    this.blendAt = this.t;
    this.blendDur = Math.max(0.001, dur);
    this.hump = hump;
  }

  /** la poursuite revient à son cadrage de base (danger, ébullition…) */
  calmVariant(): void {
    this.variant = 'base';
    this.nextVariantAt = this.t + 14;
  }

  update(i: ShotInput): CamPose {
    this.t = i.t;
    this.since += i.dt;
    const T = this.target;
    switch (this.shot) {
      case 'title': this.title(i, T); break;
      case 'follow': this.follow(i, T); break;
      case 'edge': this.edge(i, T, false); break;
      case 'flyby': this.edge(i, T, true); break;
      case 'panorama': this.panorama(i, T); break;
      case 'landmark': this.landmarkShot(i, T); break;
      case 'grand': this.grandShot(i, T); break;
      case 'travelling': this.travelling(i, T); break;
      case 'fall': if (i.forced) copyPose(T, i.forced); break;
    }
    const k = ease(Math.min(1, (i.t - this.blendAt) / this.blendDur));
    const o = this.out;
    o.pos.lerpVectors(this.from.pos, T.pos, k).addScaledVector(Y, Math.sin(Math.PI * k) * this.hump);
    o.look.lerpVectors(this.from.look, T.look, k);
    o.fov = this.from.fov + (T.fov - this.from.fov) * k;
    o.roll = this.from.roll + (T.roll - this.from.roll) * k;
    return o;
  }

  private title(i: ShotInput, T: CamPose): void {
    const a = i.t * 0.11;
    const c = i.path.frame(Math.max(0, i.s - 9));
    const rr = i.portrait ? 1.35 : 1;
    T.pos.copy(c.pos).addScaledVector(c.right, Math.sin(a) * 16 * rr).addScaledVector(c.fwd, Math.cos(a) * 18 * rr).addScaledVector(Y, 4.5 + Math.sin(i.t * 0.23) * 2.5);
    // sur grand écran, le train se tient à droite du menu ; en portrait, sous le menu
    T.look.copy(c.pos).addScaledVector(Y, i.portrait ? 7 : 1.5);
    if (!i.portrait) T.look.addScaledVector(c.right, -Math.cos(a) * 6).addScaledVector(c.fwd, Math.sin(a) * 6);
    T.fov = (i.portrait ? 66 : 56) + Math.min(10, i.v * 0.25);
    T.roll = 0;
  }

  private follow(i: ShotInput, T: CamPose): void {
    const L = i.life;
    // glissements occasionnels vers un plan bas, haut ou rapproché, jamais pendant le danger
    if (i.danger > 0.2 || i.boiling) {
      this.variant = 'base';
      this.nextVariantAt = Math.max(this.nextVariantAt, i.t + 10);
    } else if (L > 0.5 && i.t > this.nextVariantAt) {
      const pool: Variant[] = this.variant === 'base' ? ['low', 'high', 'close'] : ['base'];
      this.variant = pool[Math.floor(Math.random() * pool.length)];
      this.nextVariantAt = i.t + (this.variant === 'base' ? 16 + Math.random() * 14 : 7 + Math.random() * 4);
    }
    const want = VARIANTS[this.variant];
    const kk = Math.min(1, i.dt * 0.7);
    for (const key of ['back', 'up', 'ahead', 'fov'] as const) this.vcur[key] += (want[key] - this.vcur[key]) * kk;
    const v = this.vcur;
    const f = i.path.frame(Math.max(0, i.s - 3));
    const t = i.t;
    // respiration de la caméra : petits mouvements lents, sans à-coups
    const sway = (Math.sin(t * 0.13) * 1.0 + Math.sin(t * 0.051 + 1) * 0.6) * L;
    // dans les virages, elle se décale vers l'extérieur pour montrer la courbe
    const lean = THREE.MathUtils.clamp(-i.path.curv(i.s + 18) * 220, -0.8, 0.8) * L;
    const dz = i.danger;
    const back = v.back - dz * 1.5 - (i.boiling ? 0.8 : 0) + Math.sin(t * 0.067 + 2) * 1.2 * L;
    const up = v.up - dz * 0.8 - (i.boiling ? 0.6 : 0) + Math.sin(t * 0.083) * 0.9 * L;
    T.pos.copy(f.pos).addScaledVector(f.fwd, -back).addScaledVector(f.right, sway + lean).addScaledVector(Y, up);
    i.path.point(i.s + v.ahead + dz * 12, T.look).addScaledVector(Y, 1.2).addScaledVector(f.right, sway * 0.3);
    T.fov = (i.portrait ? 66 : 56) + Math.min(10, i.v * 0.25) + v.fov + (i.boiling ? 8 : 0);
    T.roll = f.bank * 0.35 + (i.boiling ? Math.sin(t * 1.7) * 0.03 : 0) + Math.sin(t * 0.21) * 0.012 * L;
  }

  /**
   * au bord du vide : la caméra flotte au-dessus de la brèche, un peu de côté, et regarde Bouillotte arriver
   * vers la voie incomplète (le vide au premier plan). Pour `flyby`, elle filme le chantier d'un pont lointain.
   */
  private edge(i: ShotInput, T: CamPose, flyby: boolean): void {
    const g = i.gap;
    if (!g) return;
    const len = g.s1 - g.s0;
    const drift = Math.sin(i.t * 0.4) * 0.5;
    if (flyby) {
      const F = i.path.frame(g.s0 + Math.min(9, len * 0.3));
      T.pos.copy(F.pos).addScaledVector(F.right, g.side * 15).addScaledVector(Y, 3 + drift).addScaledVector(F.fwd, 4);
      T.look.copy(i.path.point(g.s0 + len * 0.5)).addScaledVector(Y, -1);
    } else {
      const F = i.path.frame(g.s0 + len * 0.62);
      T.pos.copy(F.pos).addScaledVector(F.right, g.side * 7.5).addScaledVector(Y, 2.6 + drift);
      const edgeP = i.path.point(g.s0).addScaledVector(Y, 0.4);
      const train = i.path.point(i.s - 2).addScaledVector(Y, 1.4);
      T.look.lerpVectors(edgeP, train, 0.55);
    }
    // lentement, la caméra monte pendant que le pont se construit
    T.pos.addScaledVector(Y, Math.min(2.5, this.since * 0.4));
    T.fov = i.portrait ? 66 : 52;
    T.roll = 0;
  }

  /** contemplation : grand mouvement qui s'élève et dévoile le paysage */
  private panorama(i: ShotInput, T: CamPose): void {
    const side = i.gap?.side ?? 1;
    const u = ease(Math.min(1, this.since / 9));
    const F = i.path.frame(i.s);
    // elle s'élève et glisse le long du train, qui reste dans le cadre, le paysage s'ouvre derrière lui
    // (au-delà de l'emprise des îles et au-dessus des plus grands champignons)
    T.pos.copy(F.pos).addScaledVector(F.right, side * (34 + 8 * u)).addScaledVector(Y, 12 + 10 * u).addScaledVector(F.fwd, -18 + 12 * u);
    const near = i.path.point(i.s + 2).addScaledVector(Y, 1.5);
    const far = i.path.point(i.s + 160).addScaledVector(Y, 6);
    T.look.lerpVectors(near, far, 0.1 + u * 0.12);
    T.fov = i.portrait ? 70 : 60;
    T.roll = 0;
  }

  /** en hauteur, derrière le train : Bouillotte au premier plan, le monument de la région au loin */
  private landmarkShot(i: ShotInput, T: CamPose): void {
    const lm = i.landmark;
    const train = i.path.point(i.s - 2);
    if (!lm) {
      T.look.copy(train);
      return;
    }
    const target = lm.center.clone().addScaledVector(Y, lm.height * 0.35);
    const dir = target.clone().sub(train).setY(0).normalize();
    // la caméra s'élève lentement de l'autre côté du train
    const u = ease(Math.min(1, this.since / 6));
    T.pos.copy(train).addScaledVector(dir, -(18 + 4 * u)).addScaledVector(Y, 19 + 3 * u);
    // regard entre les deux : le train en bas du cadre, le monument à l'horizon
    const toTrain = train.clone().sub(T.pos).normalize();
    const toMark = target.clone().sub(T.pos).normalize();
    T.look.copy(T.pos).add(toTrain.multiplyScalar(0.55).add(toMark.multiplyScalar(0.45)).multiplyScalar(40));
    T.fov = i.portrait ? 76 : 64;
    T.roll = 0;
  }

  /**
   * travelling au ras de l'eau : la caméra glisse le long du train, juste au-dessus de la surface,
   * comme un voyageur qui regarde par la fenêtre ; les gares et les enseignes défilent derrière
   */
  private travelling(i: ShotInput, T: CamPose): void {
    const side = i.side ?? 1;
    const F = i.path.frame(Math.max(0, i.s - 4));
    const u = ease(Math.min(1, this.since / 8));
    T.pos.copy(F.pos).addScaledVector(F.right, side * 7.2).addScaledVector(Y, 2 + Math.sin(i.t * 0.5) * 0.15).addScaledVector(F.fwd, 2 - u * 3);
    i.path.point(i.s - 2, T.look).addScaledVector(Y, 1.7).addScaledVector(F.right, -side * 4);
    T.fov = i.portrait ? 70 : 54;
    T.roll = 0;
  }

  /** plan de côté qui accompagne le train sur les arches du Grand Pont */
  private grandShot(i: ShotInput, T: CamPose): void {
    const g = i.grand;
    if (!g) return;
    const cs = THREE.MathUtils.clamp(i.s + 6, g.a, g.b);
    const F = i.path.frame(cs);
    T.pos.copy(F.pos).addScaledVector(F.right, 34).addScaledVector(Y, -4 + Math.sin(i.t * 0.3) * 1.5).addScaledVector(F.fwd, -6);
    i.path.point(i.s - 4, T.look).addScaledVector(Y, -1.5);
    T.fov = i.portrait ? 70 : 52;
    T.roll = 0;
  }
}
