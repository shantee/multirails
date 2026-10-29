// Règles du jeu, indépendantes du rendu : choix des calculs, barème, combos, wagons.

export type Mode = 'aventure' | 'entrainement';
export type Difficulty = 'promenade' | 'express' | 'bolide';

export interface DiffPreset {
  label: string;
  hint: string;
  /** vitesse de croisière (m/s) au départ et au maximum de la progression */
  v0: number;
  v1: number;
  /** temps de référence d'une question (s), pour le bonus de rapidité */
  t0: number;
  t1: number;
  /** une bonne réponse plus rapide que ce délai fait progresser le combo */
  combo: number;
}

export const DIFFICULTIES: Record<Difficulty, DiffPreset> = {
  promenade: { label: 'Promenade', hint: 'Le temps de réfléchir', v0: 10, v1: 15, t0: 12, t1: 8, combo: 5 },
  express: { label: 'Express', hint: 'Ça file !', v0: 13, v1: 20, t0: 9, t1: 6, combo: 4 },
  bolide: { label: 'Bolide', hint: 'Pour les as des tables', v0: 16, v1: 25, t0: 7, t1: 4.6, combo: 3 },
};

/** distance (m) au bout de laquelle la difficulté atteint son maximum */
export const PROGRESS_DISTANCE = 4500;
export const MAX_WAGONS = 5;
export const START_WAGONS = 3;
/** erreurs tolérées sur une même brèche avant qu'elle ne s'effondre */
export const CRACKS_PER_GAP = 3;
export const BOIL_COMBO = 6;
export const BOIL_DURATION = 10;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** progression 0..1 selon la distance parcourue : douce au début */
export function progressAt(distance: number): number {
  const p = clamp(distance / PROGRESS_DISTANCE, 0, 1);
  return p * p * (3 - 2 * p) * 0.6 + p * 0.4;
}

export function cruiseSpeed(d: Difficulty, distance: number): number {
  const c = DIFFICULTIES[d];
  return c.v0 + (c.v1 - c.v0) * progressAt(distance);
}

export function referenceTime(d: Difficulty, distance: number): number {
  const c = DIFFICULTIES[d];
  return c.t0 + (c.t1 - c.t0) * progressAt(distance);
}

/** longueur île + brèche qui laisse environ le temps de référence pour répondre */
export function cycleLength(d: Difficulty, distance: number): number {
  return cruiseSpeed(d, distance) * referenceTime(d, distance) * 0.92;
}

// ---------------------------------------------------------------- hasard

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- calculs

export interface Fact {
  a: number;
  b: number;
}

export const answerOf = (f: Fact): number => f.a * f.b;

/** clé commutative : 7 × 8 et 8 × 7 sont le même fait à apprendre */
export function factKey(a: number, b: number): string {
  return a <= b ? `${a}x${b}` : `${b}x${a}`;
}

/** difficulté ressentie d'un fait, de 0 (×1) à 1 (7 × 8…) */
export function factDifficulty(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo === 1) return 0;
  if (hi === 10 || lo === 10) return 0.1;
  if (lo === 2) return 0.15;
  if (lo === 5 || hi === 5) return 0.3;
  if (lo === 3) return 0.35 + hi * 0.02;
  if (lo === hi) return 0.5;
  return 0.45 + (lo + hi - 8) * 0.05;
}

/** toutes les paires (table, facteur 1..10) sans doublon commutatif */
export function factPool(tables: readonly number[]): Fact[] {
  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const t of [...new Set(tables)].sort((x, y) => x - y)) {
    for (let k = 1; k <= 10; k++) {
      const key = factKey(t, k);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: t, b: k });
    }
  }
  return out;
}

export interface FactStat {
  n: number;
  ok: number;
  /** bonnes réponses rapides d'affilée */
  streak: number;
  /** erreurs récentes, s'efface peu à peu */
  heat: number;
  /** temps moyen de réponse (s) */
  avg: number;
}

export type Mastery = Record<string, FactStat>;

export function emptyStat(): FactStat {
  return { n: 0, ok: 0, streak: 0, heat: 0, avg: 0 };
}

/** met à jour la maîtrise d'un fait après une réponse */
export function recordAnswer(m: Mastery, f: Fact, correct: boolean, seconds: number, fastLimit: number): void {
  const key = factKey(f.a, f.b);
  const s = (m[key] ??= emptyStat());
  s.n++;
  s.heat *= 0.6;
  if (correct) {
    s.ok++;
    s.avg = s.avg === 0 ? seconds : s.avg * 0.7 + seconds * 0.3;
    s.streak = seconds <= fastLimit ? s.streak + 1 : 0;
  } else {
    s.heat += 1;
    s.streak = 0;
  }
}

/** poids d'un fait : les faits mal connus reviennent plus souvent */
export function masteryWeight(s: FactStat | undefined, fastLimit: number): number {
  if (!s || s.n === 0) return 1.2;
  let w = 1 + s.heat * 1.6;
  if (s.avg > fastLimit) w += Math.min(1.2, (s.avg - fastLimit) / fastLimit);
  if (s.streak >= 3) w *= 0.45;
  return w;
}

export class QuestionDeck {
  readonly pool: Fact[];
  private recent: string[] = [];
  /** faits ratés à reposer : [fait, nombre de questions avant retour] */
  private retry: Array<{ fact: Fact; wait: number }> = [];
  asked = 0;

  constructor(
    tables: readonly number[],
    private rng: Rng,
    private mastery: Mastery,
    private fastLimit: number,
  ) {
    this.pool = factPool(tables.length ? tables : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  }

  /** le fait raté reviendra après deux autres calculs */
  scheduleRetry(f: Fact): void {
    const key = factKey(f.a, f.b);
    if (!this.retry.some((r) => factKey(r.fact.a, r.fact.b) === key)) this.retry.push({ fact: f, wait: 3 });
  }

  next(progress: number): Fact {
    this.asked++;
    for (const r of this.retry) r.wait--;
    const due = this.retry.findIndex((r) => r.wait <= 0 && !this.recent.slice(-1).includes(factKey(r.fact.a, r.fact.b)));
    let fact: Fact;
    if (due >= 0) {
      fact = this.retry.splice(due, 1)[0].fact;
    } else {
      fact = this.pickWeighted(progress);
    }
    this.recent.push(factKey(fact.a, fact.b));
    if (this.recent.length > 4) this.recent.shift();
    return this.orient(fact);
  }

  private pickWeighted(progress: number): Fact {
    // les calculs difficiles arrivent progressivement
    const allowed = 0.35 + progress * 1.2 + this.asked * 0.035;
    // un fait en attente de retour ne sort pas avant son tour
    const pending = this.retry.map((r) => factKey(r.fact.a, r.fact.b));
    const avoid = this.pool.length > 5 ? [...this.recent, ...pending] : this.recent.slice(-1);
    let total = 0;
    const weights = this.pool.map((f) => {
      const key = factKey(f.a, f.b);
      if (avoid.includes(key) && this.pool.length > 1) return 0;
      let w = masteryWeight(this.mastery[key], this.fastLimit);
      if (factDifficulty(f.a, f.b) > allowed) w *= 0.12;
      total += w;
      return w;
    });
    let r = this.rng() * total;
    for (let i = 0; i < this.pool.length; i++) {
      r -= weights[i];
      if (r <= 0 && weights[i] > 0) return this.pool[i];
    }
    return this.pool[this.pool.length - 1];
  }

  /** 7 × 3 ou 3 × 7 au hasard : les deux écritures sont à connaître */
  private orient(f: Fact): Fact {
    if (f.a === f.b) return { a: f.a, b: f.b };
    return this.rng() < 0.5 ? { a: f.a, b: f.b } : { a: f.b, b: f.a };
  }
}

// ---------------------------------------------------------------- saisie

/** la réponse est validée d'elle-même dès qu'elle a autant de chiffres que le résultat */
export function isEntryComplete(entry: string, f: Fact): boolean {
  return entry.length >= String(answerOf(f)).length;
}

// ---------------------------------------------------------------- barème

export function comboMultiplier(combo: number): number {
  if (combo >= 9) return 4;
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

/** 100 points + jusqu'à 100 de bonus de rapidité, × multiplicateur */
export function answerPoints(seconds: number, refTime: number, multiplier: number): number {
  const speed = clamp(1 - seconds / refTime, 0, 1);
  return Math.round((100 + 100 * speed) / 10) * 10 * multiplier;
}

export interface CorrectResult {
  points: number;
  multiplier: number;
  fast: boolean;
  startBoil: boolean;
}

/** état d'une partie : score, séries, wagons (les vies) */
export class Run {
  score = 0;
  combo = 0;
  bestCombo = 0;
  correct = 0;
  wrong = 0;
  timeouts = 0;
  wagons = START_WAGONS;
  saved = 0;
  bridges = 0;
  times: number[] = [];
  missed = new Map<string, Fact>();
  boilUntil = -1;
  over = false;

  constructor(
    readonly mode: Mode,
    readonly difficulty: Difficulty,
  ) {}

  boiling(now: number): boolean {
    return now < this.boilUntil;
  }

  onCorrect(seconds: number, refTime: number, now: number): CorrectResult {
    const fast = seconds <= DIFFICULTIES[this.difficulty].combo;
    this.combo = fast ? this.combo + 1 : 0;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.correct++;
    this.times.push(seconds);
    let startBoil = false;
    if (fast && this.combo > 0 && this.combo % BOIL_COMBO === 0 && !this.boiling(now)) {
      this.boilUntil = now + BOIL_DURATION;
      startBoil = true;
    }
    const multiplier = comboMultiplier(this.combo) * (this.boiling(now) ? 2 : 1);
    const points = answerPoints(seconds, refTime, multiplier);
    this.score += points;
    return { points, multiplier, fast, startBoil };
  }

  onWrong(f: Fact): void {
    this.wrong++;
    this.combo = 0;
    this.missed.set(factKey(f.a, f.b), f);
  }

  /** brèche non construite à temps : un wagon se sacrifie, ou c'est la fin */
  onFail(f: Fact): { gameOver: boolean } {
    this.timeouts++;
    this.combo = 0;
    this.missed.set(factKey(f.a, f.b), f);
    if (this.mode === 'entrainement') return { gameOver: false };
    if (this.wagons > 0) {
      this.wagons--;
      return { gameOver: false };
    }
    this.over = true;
    return { gameOver: true };
  }

  /** un voyageur sauvé ajoute un wagon (ou des points si le train est complet) */
  onRescue(): { newWagon: boolean; points: number } {
    this.saved++;
    if (this.wagons < MAX_WAGONS) {
      this.wagons++;
      return { newWagon: true, points: 0 };
    }
    this.score += 500;
    return { newWagon: false, points: 500 };
  }

  get accuracy(): number {
    const total = this.correct + this.wrong + this.timeouts;
    return total ? this.correct / total : 0;
  }

  get averageTime(): number {
    return this.times.length ? this.times.reduce((a, b) => a + b, 0) / this.times.length : 0;
  }
}
