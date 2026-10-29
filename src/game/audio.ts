// Sons et musique entièrement synthétisés (Web Audio) : tchou-tchou rythmé, kalimba, sifflet de bouilloire.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const ROOT = 53; // fa
const CHORDS = [
  [0, 4, 7], // fa
  [-3, 0, 4], // ré mineur
  [-7, -3, 0], // si bémol
  [-5, -1, 2], // do
];
// mi bémol mineur rêveur : fa mineur, ré bémol, mi bémol sus, do
const DREAM = [
  [0, 3, 7],
  [-4, 0, 3],
  [-2, 3, 5],
  [-5, -1, 2],
];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  private wind?: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode };
  private timer = 0;
  private nextStep = 0;
  private step = 0;
  private nextChug = 0;
  private chugN = 0;
  soundOn = true;
  musicOn = true;
  /** état du jeu lu par le séquenceur */
  speed = 0;
  intensity = 0;
  danger = 0;
  boiling = false;
  playing = false;
  /** moment de contemplation : la musique respire */
  calm = false;
  /** pluie (0..1) et passage rêveur de la Mer des Lanternes (0..1) */
  rain = 0;
  dream = 0;
  private rainNode?: { gain: GainNode };
  private lastBuild = 0;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.5 : 0;
    this.music.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.soundOn ? 0.9 : 0;
    this.sfx.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // vent continu
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.sfx);
    src.start();
    this.wind = { src, gain, filter };
    // pluie : bruit clair et feutré
    const rs = ctx.createBufferSource();
    rs.buffer = this.noise;
    rs.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 2600;
    rf.Q.value = 0.4;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    rs.connect(rf).connect(rg).connect(this.sfx);
    rs.start(0, 0.7);
    this.rainNode = { gain: rg };
    this.nextStep = ctx.currentTime + 0.1;
    this.nextChug = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  setSound(on: boolean): void {
    this.soundOn = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.1);
  }

  suspend(paused: boolean): void {
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  // --------------------------------------------------------- synthèse de base

  private env(g: GainNode, t: number, a: number, peak: number, dec: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  private tone(freq: number, t: number, dur: number, vol: number, type: OscillatorType = 'sine', out: AudioNode = this.sfx, attack = 0.005): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    this.env(g, t, attack, vol, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  private burst(t: number, dur: number, vol: number, freq: number, q: number, type: BiquadFilterType = 'bandpass', out: AudioNode = this.sfx): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.004, vol, dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  /** note de kalimba : sinus + harmonique, attaque claquée */
  private pluck(n: number, t: number, vol: number, out: AudioNode, dur = 0.5): void {
    this.tone(midi(n), t, dur, vol, 'sine', out, 0.003);
    this.tone(midi(n) * 3.01, t, dur * 0.25, vol * 0.25, 'sine', out, 0.002);
  }

  // --------------------------------------------------------- séquenceur

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const ahead = ctx.currentTime + 0.12;
    // tchou-tchou : la cadence suit la vitesse du train
    if (this.playing && this.speed > 0.5) {
      while (this.nextChug < ahead) {
        const accent = this.chugN % 2 === 0;
        this.burst(this.nextChug, accent ? 0.09 : 0.05, accent ? 0.22 : 0.12, accent ? 900 : 1600, 1.4);
        if (this.chugN % 4 === 0) this.tone(70, this.nextChug, 0.08, 0.12, 'sine');
        this.chugN++;
        this.nextChug += 60 / (110 + this.speed * 7) / 2;
      }
    } else this.nextChug = ahead;
    if (this.wind) {
      this.wind.gain.gain.setTargetAtTime(this.playing ? 0.04 + this.speed * 0.004 : 0.02, ctx.currentTime, 0.4);
      this.wind.filter.frequency.setTargetAtTime(300 + this.speed * 30, ctx.currentTime, 0.4);
    }
    if (this.rainNode) this.rainNode.gain.gain.setTargetAtTime(this.rain * 0.07, ctx.currentTime, 0.8);
    // gouttes sur les toits et sur l'eau
    if (this.rain > 0.2 && Math.random() < this.rain * 0.35) this.tone(2200 + Math.random() * 2600, ctx.currentTime + Math.random() * 0.1, 0.02, 0.012 * this.rain, 'sine');
    const bpm = (108 + this.intensity * 8 + (this.boiling ? 10 : 0)) * (1 - this.dream * 0.22);
    const st = 60 / bpm / 4;
    while (this.nextStep < ahead) {
      this.musicStep(this.step, this.nextStep, st);
      this.step++;
      this.nextStep += st;
    }
  }

  private musicStep(step: number, t: number, st: number): void {
    const bar = Math.floor(step / 16) % 4;
    const s16 = step % 16;
    // dans la Mer des Lanternes, des accords mineurs et suspendus, plus lents
    const dreamy = this.dream > 0.5;
    const chord = dreamy ? DREAM[bar] : CHORDS[bar];
    if (dreamy) {
      const m = this.music;
      if (s16 === 0) for (const n of chord) this.tone(midi(ROOT + 12 + n), t, st * 15, 0.03, 'triangle', m, 0.6);
      if (s16 === 0 || s16 === 10) this.tone(midi(ROOT - 12 + chord[0]), t, st * 6, 0.11, 'sine', m, 0.05);
      if (s16 % 4 === 0 && (step * 5 + bar) % 3 !== 1) {
        const n = ROOT + 24 + chord[(s16 / 4 + bar) % 3] + (s16 === 8 ? 12 : 0);
        this.pluck(n, t, 0.045, m, 1.6);
      }
      if (this.danger > 0.35 && this.playing && s16 % 4 === 0) this.tone(1050, t, 0.04, 0.05 + this.danger * 0.05, 'square', m, 0.001);
      return;
    }
    const m = this.music;
    const lvl = this.boiling ? 3 : this.calm ? 0 : this.intensity;
    if (s16 === 0) {
      // nappe douce
      for (const n of chord) this.tone(midi(ROOT + 12 + n), t, st * 15, 0.035, 'triangle', m, 0.4);
    }
    // basse
    if (s16 === 0 || s16 === 8 || (lvl >= 1 && (s16 === 6 || s16 === 14))) {
      this.tone(midi(ROOT - 12 + chord[0]), t, st * 3, s16 % 8 === 0 ? 0.16 : 0.09, 'triangle', m, 0.01);
    }
    // kalimba : arpège pentatonique (très aéré pendant les contemplations)
    const density = this.calm ? 8 : lvl >= 2 ? 1 : lvl >= 1 ? 2 : 4;
    if (s16 % density === 0) {
      const h = (step * 7 + bar * 3) % 11;
      if (lvl > 0 || h % 3 !== 1) {
        const n = ROOT + 12 + chord[0] + PENTA[(h + (s16 >> 2)) % 8];
        this.pluck(n, t, 0.07, m, 0.6);
      }
    }
    if (lvl >= 1 && s16 % 2 === 0) this.burst(t, 0.03, s16 % 4 === 2 ? 0.05 : 0.025, 8000, 0.8, 'highpass', m);
    if (lvl >= 3) {
      // ébullition : arpège brillant et cloches
      const n = ROOT + 24 + chord[s16 % 3] + (s16 >= 8 ? 12 : 0);
      this.tone(midi(n), t, st * 0.9, 0.035, 'square', m, 0.002);
      if (s16 === 0) this.pluck(ROOT + 36 + chord[0], t, 0.08, m, 1.2);
    }
    // tension : tic-tac de bois qui s'accélère
    if (this.danger > 0.35 && this.playing) {
      const every = this.danger > 0.75 ? 2 : 4;
      if (s16 % every === 0) this.tone(s16 % 8 === 0 ? 1400 : 1050, t, 0.04, 0.05 + this.danger * 0.05, 'square', m, 0.001);
    }
  }

  // --------------------------------------------------------- effets

  private get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private ok(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  key(): void {
    if (!this.ok()) return;
    this.tone(1800, this.now, 0.03, 0.05, 'sine');
  }

  /** sifflet de bouilloire : deux sinus désaccordés avec vibrato, souffle de vapeur */
  whistle(t = this.now, dur = 0.42, pitch = 1, vol = 0.12): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    for (const [f, v] of [[1180, 1], [1410, 0.7]]) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * pitch * 0.94, t);
      o.frequency.exponentialRampToValueAtTime(f * pitch, t + 0.06);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const lg = ctx.createGain();
      lg.gain.value = 14 * pitch;
      lfo.connect(lg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.04);
      g.gain.setValueAtTime(vol * v, t + dur - 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.sfx);
      o.start(t);
      lfo.start(t);
      o.stop(t + dur + 0.05);
      lfo.stop(t + dur + 0.05);
    }
    this.burst(t, dur, 0.05, 3000, 0.7, 'bandpass');
  }

  correct(combo: number): void {
    if (!this.ok()) return;
    const t = this.now;
    this.whistle(t, 0.32, 1 + Math.min(combo, 8) * 0.03);
    const base = ROOT + 24;
    for (let i = 0; i < 3; i++) this.pluck(base + PENTA[(Math.min(combo, 6) + i * 2) % PENTA.length], t + 0.05 + i * 0.06, 0.09, this.sfx, 0.5);
  }

  /** chaque pièce qui se pose joue une note : le pont se construit en musique */
  buildRun(duration: number, rainbow: boolean): void {
    if (!this.ok()) return;
    const t = this.now;
    if (t - this.lastBuild < 0.2) return;
    this.lastBuild = t;
    const n = Math.min(16, Math.round(duration * 9));
    for (let i = 0; i < n; i++) {
      const tt = t + 0.35 + (i / n) * duration * 0.85;
      this.pluck(ROOT + 12 + PENTA[i % PENTA.length] + (rainbow ? 12 : 0), tt, 0.06, this.sfx, 0.25);
      this.burst(tt, 0.02, 0.06, 2500, 4);
    }
    this.tone(midi(ROOT + 36), t + 0.35 + duration * 0.9, 0.6, 0.06, 'sine');
  }

  wrong(): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.25);
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.25, 0.3);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.4);
    this.burst(t + 0.05, 0.25, 0.1, 400, 2, 'lowpass');
    // la pièce fragile se fissure et tombe
    for (let i = 0; i < 6; i++) this.burst(t + 0.15 + i * 0.07, 0.05, 0.08, 1200 + Math.random() * 2000, 3);
  }

  brake(): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = this.now;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(2300, t);
    o.frequency.linearRampToValueAtTime(1700, t + 1.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2200;
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 1.4);
    this.burst(t, 1.1, 0.12, 3500, 1.5);
  }

  /** trombone triste « wouah wouah » (sans dramatiser) */
  fail(): void {
    if (!this.ok()) return;
    const t = this.now;
    [62, 61, 60, 59].forEach((n, i) => {
      const o = this.tone(midi(n - 12), t + i * 0.28, i === 3 ? 0.7 : 0.24, 0.1, 'sawtooth', this.sfx, 0.03);
      if (i === 3) {
        const lfo = this.ctx!.createOscillator();
        lfo.frequency.value = 6;
        const lg = this.ctx!.createGain();
        lg.gain.value = 3;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t + i * 0.28);
        lfo.stop(t + 2);
      }
    });
  }

  /** marteaux : le wagon se démonte et devient pont */
  hammer(duration: number): void {
    if (!this.ok()) return;
    const t = this.now;
    for (let i = 0; i < 10; i++) {
      const tt = t + (i / 10) * duration;
      this.burst(tt, 0.06, 0.16, 500 + (i % 3) * 300, 4);
      this.tone(220 + (i % 4) * 40, tt, 0.06, 0.05, 'square');
    }
  }

  pop(): void {
    if (!this.ok()) return;
    const t = this.now;
    this.burst(t, 0.08, 0.3, 1500, 0.7);
    this.tone(90, t + 0.15, 0.12, 0.2, 'sine');
    this.burst(t + 0.15, 0.06, 0.15, 300, 2);
  }

  /** petits cris de joie des voyageurs */
  cheer(n = 5): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = this.now;
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * 0.35;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const f0 = 500 + Math.random() * 600;
      o.frequency.setValueAtTime(f0, tt);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.8, tt + 0.12);
      const g = ctx.createGain();
      this.env(g, tt, 0.01, 0.04, 0.14);
      o.connect(g).connect(this.sfx);
      o.start(tt);
      o.stop(tt + 0.2);
    }
  }

  panic(): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = this.now;
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.09;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(900 + i * 80, tt);
      o.frequency.exponentialRampToValueAtTime(600, tt + 0.08);
      const g = ctx.createGain();
      this.env(g, tt, 0.005, 0.035, 0.08);
      o.connect(g).connect(this.sfx);
      o.start(tt);
      o.stop(tt + 0.12);
    }
  }

  boil(): void {
    if (!this.ok()) return;
    const t = this.now;
    [0, 4, 7, 12, 16].forEach((n, i) => this.pluck(ROOT + 24 + n, t + i * 0.07, 0.1, this.sfx, 0.7));
    this.whistle(t + 0.35, 0.25, 1.0);
    this.whistle(t + 0.62, 0.25, 1.12);
    this.whistle(t + 0.9, 0.6, 1.26);
  }

  rescue(): void {
    if (!this.ok()) return;
    const t = this.now;
    [0, 7, 12].forEach((n, i) => this.pluck(ROOT + 12 + n, t + i * 0.1, 0.1, this.sfx, 0.6));
    this.cheer(6);
  }

  zone(): void {
    if (!this.ok()) return;
    const t = this.now;
    [0, 4, 7, 11, 14].forEach((n, i) => this.pluck(ROOT + 24 + n, t + i * 0.12, 0.06, this.sfx, 1.2));
  }

  gameOver(): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = this.now;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(1300, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 1.6);
    const g = ctx.createGain();
    this.env(g, t, 0.02, 0.1, 1.6);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 1.8);
    this.burst(t + 1.7, 0.5, 0.2, 300, 1, 'lowpass');
  }

  /** cloche de gare : partiels inharmoniques, longue résonance */
  bell(): void {
    if (!this.ok()) return;
    const t = this.now;
    for (const [k, [ratio, vol, dur]] of ([[1, 0.09, 2.6], [2.76, 0.05, 1.6], [5.4, 0.03, 0.9], [8.93, 0.015, 0.5]] as const).entries()) {
      void k;
      this.tone(523 * ratio, t, dur, vol, 'sine', this.sfx, 0.004);
      this.tone(523 * ratio, t + 0.9, dur * 0.8, vol * 0.6, 'sine', this.sfx, 0.004);
    }
    this.burst(t, 0.03, 0.08, 3000, 2);
  }

  /** grincements au bord du vide, puis « glups » */
  teeter(): void {
    if (!this.ok()) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      const o = this.tone(180 + i * 25, t + i * 0.42, 0.3, 0.05, 'sawtooth', this.sfx, 0.08);
      o.frequency.linearRampToValueAtTime(140 + i * 20, t + i * 0.42 + 0.35);
    }
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(420, t + 1.35);
    o.frequency.exponentialRampToValueAtTime(160, t + 1.5);
    const g = ctx.createGain();
    this.env(g, t + 1.35, 0.01, 0.18, 0.15);
    o.connect(g).connect(this.sfx);
    o.start(t + 1.35);
    o.stop(t + 1.6);
  }

  /** soupape de soulagement : un long « pschhhh » et un petit sifflet heureux */
  relief(): void {
    if (!this.ok()) return;
    const t = this.now;
    this.burst(t, 1.3, 0.16, 5000, 0.6, 'highpass');
    this.burst(t, 0.9, 0.08, 1800, 1, 'bandpass');
    this.whistle(t + 1.1, 0.18, 1.1, 0.08);
    this.whistle(t + 1.32, 0.35, 1.35, 0.08);
  }

  /** atterrissage moelleux dans la mer de nuages */
  splash(): void {
    if (!this.ok()) return;
    const t = this.now;
    this.burst(t, 0.7, 0.22, 500, 0.8, 'lowpass');
    this.tone(70, t, 0.4, 0.18, 'sine');
    [0, 4, 7].forEach((n, i) => this.pluck(ROOT + 24 + n, t + 0.5 + i * 0.12, 0.06, this.sfx, 0.8));
  }

  /** « couic » du canard en caoutchouc */
  squeak(): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = this.now;
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.22;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(1100, tt);
      o.frequency.exponentialRampToValueAtTime(1700, tt + 0.08);
      o.frequency.exponentialRampToValueAtTime(1200, tt + 0.16);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 3;
      const g = ctx.createGain();
      this.env(g, tt, 0.01, 0.07, 0.15);
      o.connect(f).connect(g).connect(this.sfx);
      o.start(tt);
      o.stop(tt + 0.2);
    }
  }

  /** les pièces jaillissent du vide : souffle montant */
  rise(): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = this.now;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
    const g = ctx.createGain();
    this.env(g, t, 0.15, 0.1, 0.35);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + 0.6);
  }

  /** la dernière pièce s'emboîte : « clac » et scintillement */
  lock(): void {
    if (!this.ok()) return;
    const t = this.now;
    this.burst(t, 0.05, 0.2, 2200, 3);
    this.tone(150, t, 0.08, 0.12, 'triangle');
    [24, 31, 36].forEach((n, i) => this.tone(midi(ROOT + n), t + 0.04 + i * 0.05, 0.4, 0.03, 'sine'));
  }

  click(): void {
    if (!this.ok()) return;
    this.tone(900, this.now, 0.05, 0.06, 'triangle');
  }

  dispose(): void {
    window.clearInterval(this.timer);
  }
}
