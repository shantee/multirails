// Interface : écran d'accueil, plaque du calcul, pavé tactile, effets de score, pause et fin de voyage.
import { DIFFICULTIES, MAX_WAGONS, CRACKS_PER_GAP, type Difficulty, type Fact, type Mode } from './model';

export interface Prefs {
  tables: number[];
  mode: Mode;
  difficulty: Difficulty;
  sound: boolean;
  music: boolean;
  quality: 'auto' | 'haute' | 'moyenne' | 'basse';
  pad: boolean;
}

export interface EndStats {
  score: number;
  record: boolean;
  best: number;
  distance: number;
  correct: number;
  accuracy: number;
  avg: number;
  bestCombo: number;
  saved: number;
  zones: number;
  bridges: number;
  missed: Fact[];
  mode: Mode;
}

export interface UIHandlers {
  start(): void;
  digit(d: string): void;
  erase(): void;
  submit(): void;
  pause(): void;
  resume(): void;
  menu(): void;
  replay(): void;
  finishTraining(): void;
  prefs(p: Prefs): void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const WAGON_COLORS = ['#fffaf3', '#ffffff', '#e0795a', '#ffcf5c', '#c9d3e6'];

const ICON = {
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke-width="2" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke-width="2" stroke-linecap="round"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  erase: '<svg viewBox="0 0 24 24"><path d="M9 5h11v14H9l-6-7z" fill="none" stroke-width="2" stroke-linejoin="round"/><path d="M12 9l5 6M17 9l-5 6" fill="none" stroke-width="2" stroke-linecap="round"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pad: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="4" height="4" rx="1"/><rect x="10" y="3" width="4" height="4" rx="1"/><rect x="16" y="3" width="4" height="4" rx="1"/><rect x="4" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/><rect x="16" y="10" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/></svg>',
};

function wagonSvg(color: string, empty = false): string {
  return `<svg viewBox="0 0 30 20" class="wg${empty ? ' empty' : ''}"><rect x="2" y="4" width="26" height="9" rx="4" fill="${empty ? 'none' : color}" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="16" r="2.6" fill="currentColor"/><circle cx="21" cy="16" r="2.6" fill="currentColor"/></svg>`;
}

export class UI {
  readonly root = h('div', 'ui');
  private hud = h('div', 'hud');
  private scoreEl = h('div', 'score');
  private multEl = h('div', 'mult');
  private comboEl = h('div', 'combo');
  private wagonsEl = h('div', 'wagons');
  private distEl = h('div', 'dist');
  private plate = h('div', 'plate');
  private qA = h('span', 'qa');
  private qB = h('span', 'qb');
  private qAns = h('span', 'qans');
  private gauge = h('div', 'gauge');
  private gaugeFill = h('i');
  private cracksEl = h('div', 'cracks');
  private tagEl = h('div', 'ptag');
  private correction = h('div', 'correction');
  readonly pad = h('div', 'pad');
  private fxLayer = h('div', 'fxlayer');
  private banner = h('div', 'banner');
  private title = h('div', 'screen title');
  private pauseScreen = h('div', 'screen pause');
  private endScreen = h('div', 'screen end');
  private soundBtn = h('button', 'icon', ICON.sound);
  private trainingBtn = h('button', 'pill finish', 'Terminer');
  private bannerTimer = 0;
  private correctionTimer = 0;
  prefs: Prefs;

  constructor(prefs: Prefs, private on: UIHandlers) {
    this.prefs = prefs;
    document.body.appendChild(this.root);
    this.buildHud();
    this.buildPad();
    this.buildTitle();
    this.buildPause();
    this.root.append(this.fxLayer, this.banner, this.endScreen);
  }

  // ------------------------------------------------------------ HUD

  private buildHud(): void {
    const left = h('div', 'hud-left');
    const sc = h('div', 'score-box');
    sc.append(this.scoreEl, this.multEl);
    left.append(sc, this.comboEl, this.wagonsEl, this.distEl);
    const right = h('div', 'hud-right');
    const pauseBtn = h('button', 'icon', ICON.pause);
    pauseBtn.setAttribute('aria-label', 'Pause');
    pauseBtn.onclick = () => this.on.pause();
    this.soundBtn.setAttribute('aria-label', 'Son');
    this.soundBtn.onclick = () => {
      this.prefs.sound = !this.prefs.sound;
      this.prefs.music = this.prefs.sound;
      this.refreshSound();
      this.on.prefs(this.prefs);
    };
    const padBtn = h('button', 'icon padtoggle', ICON.pad);
    padBtn.setAttribute('aria-label', 'Afficher ou masquer le pavé');
    padBtn.onclick = () => {
      this.prefs.pad = !this.prefs.pad;
      this.applyPad();
      this.on.prefs(this.prefs);
    };
    const fullBtn = h('button', 'icon', ICON.full);
    fullBtn.setAttribute('aria-label', 'Plein écran');
    fullBtn.onclick = () => toggleFullscreen();
    this.trainingBtn.onclick = () => this.on.finishTraining();
    right.append(this.trainingBtn, padBtn, this.soundBtn, fullBtn, pauseBtn);
    // plaque émaillée du calcul
    const eq = h('div', 'eq');
    eq.append(this.qA, h('span', 'op', '×'), this.qB, h('span', 'op', '='), this.qAns);
    this.gauge.append(this.gaugeFill);
    const meta = h('div', 'plate-meta');
    meta.append(this.cracksEl, this.tagEl);
    this.plate.append(h('div', 'rivets'), eq, this.gauge, meta);
    this.hud.append(left, right, this.plate, this.correction);
    this.root.append(this.hud);
    this.refreshSound();
  }

  private refreshSound(): void {
    this.soundBtn.innerHTML = this.prefs.sound ? ICON.sound : ICON.mute;
  }

  private buildPad(): void {
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'erase', '0', 'ok'];
    for (const k of keys) {
      const b = h('button', `key k${k}`);
      b.innerHTML = k === 'erase' ? ICON.erase : k === 'ok' ? ICON.ok : k;
      b.setAttribute('aria-label', k === 'erase' ? 'Effacer' : k === 'ok' ? 'Valider' : k);
      // pointerdown : réaction immédiate, sans le délai du clic sur tablette
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.classList.remove('hit');
        void b.offsetWidth;
        b.classList.add('hit');
        if (k === 'erase') this.on.erase();
        else if (k === 'ok') this.on.submit();
        else this.on.digit(k);
      });
      this.pad.append(b);
    }
    this.root.append(this.pad);
    this.applyPad();
  }

  applyPad(): void {
    this.root.classList.toggle('no-pad', !this.prefs.pad);
  }

  setPlaying(playing: boolean, mode: Mode): void {
    this.root.classList.toggle('playing', playing);
    this.trainingBtn.style.display = playing && mode === 'entrainement' ? '' : 'none';
  }

  setScore(score: number, mult: number, combo: number, boiling: boolean): void {
    this.scoreEl.textContent = score.toLocaleString('fr-FR');
    this.multEl.textContent = `×${mult}`;
    this.multEl.classList.toggle('on', mult > 1);
    this.multEl.classList.toggle('boil', boiling);
    const pips = Math.min(6, combo % 6 === 0 && combo > 0 ? 6 : combo % 6);
    this.comboEl.innerHTML = Array.from({ length: 6 }, (_, i) => `<i class="${i < pips ? 'on' : ''}"></i>`).join('');
    this.comboEl.classList.toggle('boil', boiling);
  }

  setWagons(n: number, training: boolean): void {
    if (training) {
      this.wagonsEl.innerHTML = '';
      return;
    }
    let html = '';
    for (let i = 0; i < MAX_WAGONS; i++) html += wagonSvg(WAGON_COLORS[i], i >= n);
    this.wagonsEl.innerHTML = html;
  }

  setDistance(m: number): void {
    this.distEl.textContent = m < 1000 ? `${Math.floor(m)} m` : `${(m / 1000).toFixed(2).replace('.', ',')} km`;
  }

  showQuestion(f: Fact | null, entry: string, cracks: number, passenger: boolean, grand: string): void {
    this.plate.classList.toggle('show', !!f);
    if (!f) return;
    this.qA.textContent = String(f.a);
    this.qB.textContent = String(f.b);
    this.qAns.textContent = entry || '?';
    this.qAns.classList.toggle('empty', !entry);
    this.cracksEl.innerHTML = this.prefs.mode === 'entrainement' ? '' : Array.from({ length: CRACKS_PER_GAP - 1 }, (_, i) => `<i class="${i < cracks ? 'on' : ''}"></i>`).join('');
    this.tagEl.textContent = passenger ? '🙋 Un voyageur attend !' : grand;
    this.tagEl.classList.toggle('show', passenger || !!grand);
  }

  setEntry(entry: string): void {
    this.qAns.textContent = entry || '?';
    this.qAns.classList.toggle('empty', !entry);
  }

  /** jauge de distance avant le vide : vert → orange → rouge */
  setGauge(v: number, visible: boolean): void {
    this.gauge.style.visibility = visible ? 'visible' : 'hidden';
    this.gaugeFill.style.transform = `scaleX(${Math.max(0, Math.min(1, v))})`;
    this.gauge.dataset.level = v < 0.25 ? 'red' : v < 0.5 ? 'orange' : 'green';
  }

  plateFlash(kind: 'good' | 'bad' | 'fail'): void {
    this.plate.classList.remove('good', 'bad', 'fail');
    void this.plate.offsetWidth;
    this.plate.classList.add(kind);
  }

  showCorrection(f: Fact): void {
    this.correction.innerHTML = `${f.a} × ${f.b} = <b>${f.a * f.b}</b>`;
    this.correction.classList.add('show');
    window.clearTimeout(this.correctionTimer);
    this.correctionTimer = window.setTimeout(() => this.correction.classList.remove('show'), 2600);
  }

  hideCorrection(): void {
    this.correction.classList.remove('show');
  }

  /** gain flottant au-dessus de la plaque */
  floatText(html: string, cls = ''): void {
    const e = h('div', `float ${cls}`, html);
    this.fxLayer.append(e);
    window.setTimeout(() => e.remove(), 1500);
  }

  showBanner(html: string, cls = '', ms = 2400): void {
    this.banner.className = `banner ${cls}`;
    this.banner.innerHTML = html;
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('show'), ms);
  }

  // ------------------------------------------------------------ accueil

  private buildTitle(): void {
    const t = this.title;
    t.innerHTML = `
      <div class="logo">
        <div class="logo-main">MULTI<span>RAIL</span></div>
        <div class="logo-sub">L'Express des Nuages</div>
      </div>
      <p class="pitch">Les rails ne sont pas encore construits&nbsp;! Résous les multiplications pour bâtir la voie devant Bouillotte, la locomotive-bouilloire.</p>
      <div class="card">
        <div class="row modes"></div>
        <div class="label">Tables</div>
        <div class="row tables"></div>
        <div class="label">Vitesse</div>
        <div class="row diffs"></div>
        <button class="go">En voiture&nbsp;!</button>
        <div class="record"></div>
        <div class="row settings"></div>
      </div>
      <p class="keys">Clavier : chiffres, Entrée, Retour arrière · Échap : pause</p>`;
    this.root.append(t);
    this.renderTitle();
    t.querySelector<HTMLButtonElement>('.go')!.onclick = () => this.on.start();
  }

  renderTitle(record?: { score: number; distance: number }): void {
    const t = this.title;
    const p = this.prefs;
    const modes = t.querySelector('.modes')!;
    modes.innerHTML = '';
    for (const [m, label, sub] of [['aventure', 'Aventure', 'Va le plus loin possible'], ['entrainement', 'Entraînement', 'Sans pression, le train attend']] as const) {
      const b = h('button', `mode ${p.mode === m ? 'sel' : ''}`, `<b>${label}</b><small>${sub}</small>`);
      b.onclick = () => {
        p.mode = m;
        this.on.prefs(p);
        this.renderTitle(record);
      };
      modes.append(b);
    }
    const tables = t.querySelector('.tables')!;
    tables.innerHTML = '';
    const all = p.tables.length === 10;
    const allBtn = h('button', `chip all ${all ? 'sel' : ''}`, 'Toutes');
    allBtn.onclick = () => {
      p.tables = all ? [7] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      this.on.prefs(p);
      this.renderTitle(record);
    };
    tables.append(allBtn);
    for (let n = 1; n <= 10; n++) {
      const sel = p.tables.includes(n);
      const b = h('button', `chip ${sel && !all ? 'sel' : sel ? 'sel soft' : ''}`, String(n));
      b.setAttribute('aria-pressed', String(sel));
      b.onclick = () => {
        if (all) p.tables = [n];
        else if (sel) {
          if (p.tables.length > 1) p.tables = p.tables.filter((x) => x !== n);
        } else p.tables = [...p.tables, n].sort((a, b2) => a - b2);
        this.on.prefs(p);
        this.renderTitle(record);
      };
      tables.append(b);
    }
    const diffs = t.querySelector('.diffs')!;
    diffs.innerHTML = '';
    for (const d of Object.keys(DIFFICULTIES) as Difficulty[]) {
      const c = DIFFICULTIES[d];
      const b = h('button', `diff ${p.difficulty === d ? 'sel' : ''}`, `<b>${c.label}</b><small>${c.hint}</small>`);
      b.onclick = () => {
        p.difficulty = d;
        this.on.prefs(p);
        this.renderTitle(record);
      };
      diffs.append(b);
    }
    const rec = t.querySelector('.record')!;
    rec.innerHTML = record && record.score > 0 ? `🏆 Record ${DIFFICULTIES[p.difficulty].label} : <b>${record.score.toLocaleString('fr-FR')}</b> · ${formatDist(record.distance)}` : '';
    const settings = t.querySelector('.settings')!;
    settings.innerHTML = '';
    const q = h('button', 'pill', `Graphismes : <b>${p.quality === 'auto' ? 'auto' : p.quality}</b>`);
    q.onclick = () => {
      const order: Prefs['quality'][] = ['auto', 'haute', 'moyenne', 'basse'];
      p.quality = order[(order.indexOf(p.quality) + 1) % order.length];
      this.on.prefs(p);
      this.renderTitle(record);
    };
    const mu = h('button', 'pill', `Musique : <b>${p.music ? 'oui' : 'non'}</b>`);
    mu.onclick = () => {
      p.music = !p.music;
      this.on.prefs(p);
      this.renderTitle(record);
    };
    const so = h('button', 'pill', `Sons : <b>${p.sound ? 'oui' : 'non'}</b>`);
    so.onclick = () => {
      p.sound = !p.sound;
      this.refreshSound();
      this.on.prefs(p);
      this.renderTitle(record);
    };
    settings.append(q, mu, so);
  }

  showTitle(show: boolean): void {
    this.title.classList.toggle('show', show);
  }

  // ------------------------------------------------------------ pause et fin

  private buildPause(): void {
    this.pauseScreen.innerHTML = `<div class="card small"><h2>Pause</h2><p>Bouillotte reprend son souffle…</p></div>`;
    const card = this.pauseScreen.querySelector('.card')!;
    const resume = h('button', 'go', 'Reprendre');
    resume.onclick = () => this.on.resume();
    const menu = h('button', 'pill', 'Retour au menu');
    menu.onclick = () => this.on.menu();
    card.append(resume, menu);
    this.root.append(this.pauseScreen);
  }

  showPause(show: boolean): void {
    this.pauseScreen.classList.toggle('show', show);
  }

  showEnd(s: EndStats | null): void {
    this.endScreen.classList.toggle('show', !!s);
    if (!s) return;
    const missed = s.missed.slice(0, 8).map((f) => `<span>${f.a} × ${f.b} = <b>${f.a * f.b}</b></span>`).join('');
    const title = s.mode === 'entrainement' ? 'Fin de l\'entraînement' : 'Terminus !';
    this.endScreen.innerHTML = `
      <div class="card end-card">
        <h2>${title}</h2>
        ${s.record ? '<div class="newrec">🏆 Nouveau record !</div>' : ''}
        <div class="big-score">${s.score.toLocaleString('fr-FR')}<small>points</small></div>
        <div class="stats">
          <div><b>${formatDist(s.distance)}</b><small>parcourus</small></div>
          <div><b>${s.correct}</b><small>ponts construits</small></div>
          <div><b>${Math.round(s.accuracy * 100)} %</b><small>précision</small></div>
          <div><b>${s.avg ? s.avg.toFixed(1).replace('.', ',') + ' s' : '–'}</b><small>par calcul</small></div>
          <div><b>${s.bestCombo}</b><small>meilleure série</small></div>
          <div><b>${s.saved}</b><small>voyageurs sauvés</small></div>
        </div>
        ${missed ? `<div class="label">À revoir</div><div class="missed">${missed}</div>` : '<div class="perfect">Aucune erreur, bravo !</div>'}
        ${s.mode === 'aventure' && !s.record && s.best > 0 ? `<div class="best">Record : ${s.best.toLocaleString('fr-FR')}</div>` : ''}
        <button class="go replay">Rejouer</button>
        <button class="pill menu">Changer de tables</button>
      </div>`;
    this.endScreen.querySelector<HTMLButtonElement>('.replay')!.onclick = () => this.on.replay();
    this.endScreen.querySelector<HTMLButtonElement>('.menu')!.onclick = () => this.on.menu();
  }

  /** rectangle occupé par le pavé, pour décaler le cadrage de la caméra */
  padInset(): { right: number; bottom: number } {
    if (!this.prefs.pad || !this.root.classList.contains('playing')) return { right: 0, bottom: 0 };
    const r = this.pad.getBoundingClientRect();
    const w = window.innerWidth, hh = window.innerHeight;
    if (r.width === 0) return { right: 0, bottom: 0 };
    // pavé sur le côté (paysage) ou en bas (portrait)
    if (r.height > hh * 0.5 && r.left > w * 0.45) return { right: w - r.left, bottom: 0 };
    return { right: 0, bottom: hh - r.top };
  }
}

export function formatDist(m: number): string {
  return m < 1000 ? `${Math.floor(m)} m` : `${(m / 1000).toFixed(2).replace('.', ',')} km`;
}

export function toggleFullscreen(): void {
  const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement || d.webkitFullscreenElement) {
    if (document.exitFullscreen) void document.exitFullscreen();
    else d.webkitExitFullscreen?.();
  } else if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
  else el.webkitRequestFullscreen?.();
}
