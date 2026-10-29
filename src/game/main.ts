// MULTIRAIL — chef d'orchestre : boucle de jeu, conduite du train, calculs, caméra et mise en scène.
import '@fontsource-variable/fredoka';
import './style.css';
import * as THREE from 'three';
import { Audio } from './audio';
import { SkyWhale } from './creatures';
import { Debris, Fx } from './fx';
import { makeWorldMaterial } from './geo';
import { buildIsland, makeFallsMaterial, straightFrame, BIOMES } from './islands';
import {
  CRACKS_PER_GAP, DIFFICULTIES, MAX_WAGONS, QuestionDeck, Run, START_WAGONS, answerOf, comboMultiplier, cruiseSpeed,
  factKey, isEntryComplete, mulberry32, progressAt, recordAnswer, referenceTime, type Fact, type Mastery,
} from './model';
import { Post } from './post';
import { FLIGHT, RailSystem } from './rails';
import { Sky, ambienceIndex, AMBIENCES } from './sky';
import { Layout, TrackPath, type Segment } from './track';
import { Car, Passenger, Train } from './train';
import { UI, type Prefs, formatDist } from './ui';

type State = 'title' | 'playing' | 'paused' | 'falling' | 'over';

// ------------------------------------------------------------------ stockage local

const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? { ...fallback, ...JSON.parse(v) } : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, v: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* navigation privée ou stockage plein : on joue quand même */
    }
  },
};

const coarse = matchMedia('(pointer: coarse)').matches;
const prefs: Prefs = store.get<Prefs>('multirail-prefs', {
  tables: [2, 3, 4, 5], mode: 'aventure', difficulty: 'promenade', sound: true, music: true, quality: 'auto', pad: true,
});
const records = store.get<Record<string, { score: number; distance: number }>>('multirail-records', {});
const mastery: Mastery = store.get<Mastery>('multirail-mastery', {});
const params = new URLSearchParams(location.search);
const AUTO = params.get('auto'); // tests : réponses automatiques
const DEPART = Number(params.get('depart') ?? 0) * 1000;

// ------------------------------------------------------------------ rendu

const canvas = document.getElementById('world') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 5000);
const post = new Post(renderer);

const QUALITY = {
  haute: { ratio: 2, post: true, rays: true, puffs: 170, density: 1, bg: 12 },
  moyenne: { ratio: 1.35, post: true, rays: false, puffs: 110, density: 0.7, bg: 8 },
  basse: { ratio: 0.9, post: false, rays: false, puffs: 60, density: 0.45, bg: 4 },
};
type QName = keyof typeof QUALITY;
let quality: QName = prefs.quality === 'auto' ? (coarse ? 'moyenne' : 'haute') : prefs.quality;

const sky = new Sky(scene, QUALITY.haute.puffs);
const worldU = { uTime: { value: 0 }, uNight: { value: 0 } };
const worldMat = makeWorldMaterial(worldU);
const fallsMat = makeFallsMaterial(worldU.uTime);
const fx = new Fx();
const debris = new Debris();
scene.add(fx.group, debris.mesh);
const whale = new SkyWhale(scene);
const audio = new Audio();
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envDome = new THREE.Mesh(sky.dome.geometry, sky.dome.material);
envScene.add(envDome);
let envTex: THREE.Texture | null = null;
let envAt = -1e9;

function applyQuality(): void {
  const q = QUALITY[quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.ratio));
  post.enabled = q.post;
  post.rays = q.rays;
  sky.setPuffCount(q.puffs);
  fx.density = q.density;
  resize();
}

function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio();
  post.setSize(Math.floor(w * pr), Math.floor(h * pr));
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ monde

let seed = Number(params.get('graine')) || Math.floor(Math.random() * 1e9);
let path = new TrackPath(seed);
let layout = new Layout(seed, prefs.difficulty);
let rails = new RailSystem(path);
scene.add(rails.group);
const train = new Train(START_WAGONS);
scene.add(train.group);
const islandObjs = new Map<number, THREE.Object3D[]>();
const bgIslands: Array<{ objs: THREE.Object3D[]; anchor: number }> = [];
let bgCursor = 300;
const buildStart = new Map<number, number>();
const activeBuilds: Array<{ seg: Segment; start: number; rainbow: boolean }> = [];
const haltes = new Map<number, { group: THREE.Group; passenger: Passenger }>();
const floaters: Array<{ obj: THREE.Object3D; vel: THREE.Vector3; age: number; p?: Passenger; jump: boolean }> = [];

function disposeObj(o: THREE.Object3D): void {
  o.removeFromParent();
  o.traverse((c) => {
    if ((c as THREE.Mesh).geometry && c.userData.own) (c as THREE.Mesh).geometry.dispose();
  });
}

function resetWorld(newSeed: number): void {
  for (const objs of islandObjs.values()) objs.forEach(disposeObj);
  islandObjs.clear();
  for (const b of bgIslands) b.objs.forEach(disposeObj);
  bgIslands.length = 0;
  for (const hl of haltes.values()) disposeObj(hl.group);
  haltes.clear();
  for (const f of floaters) f.obj.removeFromParent();
  floaters.length = 0;
  for (const seg of [...rails.entries.values()].map((e) => e.seg)) rails.remove(seg);
  scene.remove(rails.group);
  seed = newSeed;
  path = new TrackPath(seed);
  layout = new Layout(seed, prefs.difficulty);
  rails = new RailSystem(path);
  scene.add(rails.group);
  buildStart.clear();
  activeBuilds.length = 0;
  bgCursor = 300;
  fx.clear();
  envAt = -1e9;
}

function islandFrame(s: number, pos: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
  const f = path.frame(s);
  pos.copy(f.pos);
  right.copy(f.right);
  up.copy(f.up);
}

function meshOf(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.userData.own = true;
  return m;
}

/** construit au plus une île par image pour garder la fluidité */
function ensureIslands(s: number, budget: number): void {
  for (const seg of layout.segments) {
    if (budget <= 0) return;
    if (seg.s0 > s + 950) break;
    if (seg.kind !== 'island' || islandObjs.has(seg.id)) continue;
    const r = mulberry32(seg.id * 131 + seed);
    const res = buildIsland(islandFrame, {
      s0: seg.s0, s1: seg.s1, width: 13 + r() * 9, depth: 18 + r() * 20, biome: seg.biome, seed: seg.id * 977 + seed, corridor: true,
      density: QUALITY[quality].density,
    });
    const objs: THREE.Object3D[] = [meshOf(res.solid, worldMat)];
    if (res.falls) objs.push(meshOf(res.falls, fallsMat));
    objs.forEach((o) => scene.add(o));
    islandObjs.set(seg.id, objs);
    budget--;
  }
  // îles lointaines pour la profondeur
  if (budget > 0 && bgIslands.length < QUALITY[quality].bg && bgCursor < s + 1400) {
    const r = mulberry32(Math.floor(bgCursor) * 17 + seed);
    bgCursor = Math.max(bgCursor, s + 250) + 60 + r() * 140;
    const f = path.frame(bgCursor);
    const side = r() < 0.5 ? -1 : 1;
    const lat = side * (150 + r() * 380);
    const up = r() < 0.45 ? 45 + r() * 50 : -(35 + r() * 30);
    const center = f.pos.clone().addScaledVector(f.right, lat).add(new THREE.Vector3(0, up, 0));
    const len = 70 + r() * 140;
    const res = buildIsland(straightFrame(center, r() * Math.PI * 2), {
      s0: -len / 2, s1: len / 2, width: 25 + r() * 35, depth: 40 + r() * 70, biome: Math.floor(r() * BIOMES.length), seed: Math.floor(r() * 1e6),
      corridor: false, density: QUALITY[quality].density * 0.5,
    });
    const objs: THREE.Object3D[] = [meshOf(res.solid, worldMat)];
    if (res.falls) objs.push(meshOf(res.falls, fallsMat));
    objs.forEach((o) => scene.add(o));
    bgIslands.push({ objs, anchor: bgCursor });
  }
}

/** halte flottante où un voyageur attend d'être embarqué */
function addHalte(seg: Segment): void {
  const f = path.frame(seg.s0 - 4);
  const center = f.pos.clone().addScaledVector(f.right, -6.5).addScaledVector(f.up, -0.2);
  const group = new THREE.Group();
  const res = buildIsland(straightFrame(new THREE.Vector3(), path.heading(seg.s0)), {
    s0: -3, s1: 3, width: 3.2, depth: 5, biome: seg.biome, seed: seg.id, corridor: false, density: 0.6,
  });
  group.add(meshOf(res.solid, worldMat));
  const passenger = new Passenger({ body: [0xffb05c, 0xc98bff, 0x6fd3ff, 0xff8fb2][seg.id % 4], shape: seg.id % 2 ? 'round' : 'tall', hat: seg.id % 3 ? 'top' : 'cap' });
  passenger.root.position.set(0, -0.4, 0);
  passenger.root.rotation.y = path.heading(seg.s0) + Math.PI / 2;
  passenger.setMood('wave', 0, 9999);
  group.add(passenger.root);
  // pancarte « ? »
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.08), new THREE.MeshStandardMaterial({ color: 0xfff8ec }));
  sign.position.set(1.2, 1.6, 0);
  sign.userData.own = true;
  group.add(sign);
  group.position.copy(center);
  scene.add(group);
  haltes.set(seg.id, { group, passenger });
}

function syncWorld(s: number): void {
  layout.extend(s + 1100);
  for (const seg of layout.segments) {
    if (seg.s0 > s + 950) break;
    if (!rails.entries.has(seg.id)) {
      rails.add(seg);
      if (seg.passenger) addHalte(seg);
    }
  }
  for (const seg of layout.prune(s - 220)) {
    rails.remove(seg);
    islandObjs.get(seg.id)?.forEach(disposeObj);
    islandObjs.delete(seg.id);
    const hl = haltes.get(seg.id);
    if (hl) disposeObj(hl.group);
    haltes.delete(seg.id);
    buildStart.delete(seg.id);
  }
  for (let i = bgIslands.length - 1; i >= 0; i--) {
    if (bgIslands[i].anchor < s - 350) {
      bgIslands[i].objs.forEach(disposeObj);
      bgIslands.splice(i, 1);
    }
  }
  path.prune(s - 400);
}

// ------------------------------------------------------------------ partie

let state: State = 'title';
let run = new Run(prefs.mode, prefs.difficulty);
let deck = new QuestionDeck(prefs.tables, Math.random, mastery, DIFFICULTIES[prefs.difficulty].combo);
let s = 0;
let v = 0;
let gt = 0;
let joltUntil = 0;
let zone = 0;
let zonesSeen = 1;
interface Question {
  fact: Fact;
  seg: Segment;
  start: number;
  entry: string;
  cracks: number;
  window: number;
  braked: boolean;
  stuck: number;
}
let q: Question | null = null;
let fall: { t: number; vel: THREE.Vector3; cam: THREE.Vector3; fwd: THREE.Vector3; chute?: THREE.Group } | null = null;
/** brèche condamnée : le train roule jusqu'au bord, puis plonge */
let doomed: Segment | null = null;
let shake = 0;
let flash = new THREE.Vector4();
let lastHud = 0;

const ui = new UI(prefs, {
  start: () => startRun(),
  digit: (d) => typeDigit(d),
  erase: () => {
    if (!q) return;
    q.entry = q.entry.slice(0, -1);
    ui.setEntry(q.entry);
    audio.key();
  },
  submit: () => submit(),
  pause: () => setPaused(true),
  resume: () => setPaused(false),
  menu: () => toTitle(),
  replay: () => startRun(),
  finishTraining: () => endRun(),
  prefs: (p) => {
    Object.assign(prefs, p);
    store.set('multirail-prefs', prefs);
    audio.setSound(prefs.sound);
    audio.setMusic(prefs.music);
    const wanted: QName = prefs.quality === 'auto' ? quality : prefs.quality;
    if (wanted !== quality) {
      quality = wanted;
      applyQuality();
    }
    ui.renderTitle(records[prefs.difficulty]);
  },
});
ui.renderTitle(records[prefs.difficulty]);
ui.showTitle(true);
audio.setSound(prefs.sound);
audio.setMusic(prefs.music);

const curtain = document.createElement('div');
curtain.className = 'curtain';
curtain.style.cssText = 'position:fixed;inset:0;background:#fff8ec;opacity:0;pointer-events:none;transition:opacity .35s';
document.body.appendChild(curtain);

function startRun(): void {
  audio.unlock();
  audio.click();
  curtain.style.opacity = '1';
  ui.showTitle(false);
  ui.showEnd(null);
  ui.showPause(false);
  window.setTimeout(() => {
    resetWorld(Number(params.get('graine')) || Math.floor(Math.random() * 1e9));
    run = new Run(prefs.mode, prefs.difficulty);
    deck = new QuestionDeck(prefs.tables, Math.random, mastery, DIFFICULTIES[prefs.difficulty].combo);
    train.reset(START_WAGONS);
    train.loco.root.rotation.set(0, 0, 0);
    if (fall?.chute) fall.chute.removeFromParent();
    fall = null;
    doomed = null;
    s = DEPART;
    v = 0;
    q = null;
    zone = ambienceIndex(s);
    zonesSeen = 1;
    syncWorld(s);
    ensureIslands(s, 12);
    state = 'playing';
    ui.setPlaying(true, run.mode);
    ui.setWagons(run.wagons, run.mode === 'entrainement');
    ui.setScore(0, 1, 0, false);
    ui.showQuestion(null, '', 0, false, '');
    audio.playing = true;
    curtain.style.opacity = '0';
    ui.showBanner(`${AMBIENCES[zone % AMBIENCES.length].emoji} ${AMBIENCES[zone % AMBIENCES.length].name}<small>En voiture !</small>`, '', 2200);
    train.loco.setMood('happy', gt, 1.5);
    audio.whistle();
  }, 360);
}

function toTitle(): void {
  setPaused(false, true);
  state = 'title';
  q = null;
  doomed = null;
  audio.playing = false;
  audio.danger = 0;
  ui.setPlaying(false, run.mode);
  ui.showQuestion(null, '', 0, false, '');
  ui.showEnd(null);
  ui.renderTitle(records[prefs.difficulty]);
  ui.showTitle(true);
  if (fall) startRunWorldForTitle();
}

function startRunWorldForTitle(): void {
  if (fall?.chute) fall.chute.removeFromParent();
  fall = null;
  resetWorld(Math.floor(Math.random() * 1e9));
  train.reset(START_WAGONS);
  train.loco.root.rotation.set(0, 0, 0);
  s = 0;
  v = 0;
}

function setPaused(p: boolean, silent = false): void {
  if (p && state === 'playing') {
    state = 'paused';
    ui.showPause(true);
    audio.suspend(true);
  } else if (!p && state === 'paused') {
    state = 'playing';
    ui.showPause(false);
    audio.suspend(false);
    if (!silent) audio.click();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});
window.addEventListener('blur', () => setPaused(true));

function ask(seg: Segment): void {
  const fact = deck.next(progressAt(s));
  const win = Math.max(20, seg.s0 - s);
  q = { fact, seg, start: gt, entry: '', cracks: 0, window: win, braked: false, stuck: 0 };
  ui.showQuestion(fact, '', 0, seg.passenger && run.mode === 'aventure', grandLabel(seg));
  if (seg.style === 'grand' && seg.span === 0) ui.showBanner('✦ Le Grand Pont<small>3 calculs pour le traverser</small>', '', 2200);
  if (AUTO) scheduleAuto(fact);
}

function grandLabel(seg: Segment): string {
  return seg.style === 'grand' ? `✦ Grand pont ${seg.span + 1}/${seg.spans}` : '';
}

/** tests automatiques : ?auto=1.2 répond juste après 1,2 s ; ?auto=faux répond faux */
function scheduleAuto(f: Fact): void {
  const wrong = AUTO === 'faux';
  const delay = wrong ? 1.5 : Number(AUTO) || 1.5;
  const myQ = q;
  window.setTimeout(() => {
    if (q !== myQ || !q || q.fact !== f || state !== 'playing') return;
    const ans = String(wrong ? answerOf(f) + 1 : answerOf(f));
    for (const d of ans) typeDigit(d);
    if (q && q.fact === f) submit();
  }, delay * 1000);
}

function typeDigit(d: string): void {
  if (state !== 'playing' || !q) return;
  audio.unlock();
  if (q.entry.length >= 3) return;
  q.entry += d;
  audio.key();
  ui.setEntry(q.entry);
  if (isEntryComplete(q.entry, q.fact)) submit();
}

function submit(): void {
  if (state !== 'playing' || !q || !q.entry) return;
  const value = Number(q.entry);
  if (value === answerOf(q.fact)) onCorrect(q);
  else onWrong(q);
}

const tmpV = new THREE.Vector3();

function onCorrect(cur: Question): void {
  const seconds = gt - cur.start;
  const ref = referenceTime(run.difficulty, s);
  const res = run.onCorrect(seconds, ref, gt);
  recordAnswer(mastery, cur.fact, true, seconds, DIFFICULTIES[run.difficulty].combo);
  store.set('multirail-mastery', mastery);
  const rainbow = run.boiling(gt);
  const seg = cur.seg;
  seg.built = true;
  rails.build(seg, gt, rainbow);
  buildStart.set(seg.id, gt);
  activeBuilds.push({ seg, start: gt, rainbow });
  audio.correct(run.combo);
  audio.buildRun(RailSystem.buildDuration(seg), rainbow);
  q = null;
  ui.showQuestion(null, '', 0, false, '');
  ui.plateFlash('good');
  ui.hideCorrection();
  ui.floatText(`+${res.points}${res.multiplier > 1 ? `<small>×${res.multiplier}</small>` : ''}`, res.fast ? 'fast' : '');
  ui.setScore(run.score, comboMultiplier(run.combo) * (rainbow ? 2 : 1), run.combo, rainbow);
  train.loco.setMood(res.fast ? 'proud' : 'happy', gt, 1.4);
  train.loco.kick(0.15);
  // tous les voyageurs applaudissent si c'est rapide, quelques-uns sinon
  for (const p of train.allPassengers()) if (res.fast || Math.random() < 0.5) p.setMood('cheer', gt, 1.3);
  if (res.fast) audio.cheer(4);
  flash.set(1, 0.9, 0.6, 0.08);
  fx.sparks(path.point(seg.s0, tmpV).clone().add(new THREE.Vector3(0, 0.5, 0)), 24, rainbow);
  if (seg.style === 'grand' && seg.span === seg.spans - 1) {
    run.score += 300;
    run.bridges++;
    window.setTimeout(() => {
      ui.showBanner('✦ Grand pont bâti !<small>+300</small>', '', 1800);
      audio.rescue();
    }, 500);
  }
  if (seg.passenger && run.mode === 'aventure') rescuePassenger(seg);
  if (res.startBoil) startBoil();
}

function rescuePassenger(seg: Segment): void {
  const hl = haltes.get(seg.id);
  const r = run.onRescue();
  audio.rescue();
  if (hl) {
    hl.passenger.setMood('cheer', gt, 3);
    // il saute vers le train et disparaît dans un nuage de confettis
    const start = new THREE.Vector3();
    hl.passenger.root.getWorldPosition(start);
    scene.attach(hl.passenger.root);
    floaters.push({ obj: hl.passenger.root, vel: new THREE.Vector3(0, 9, 0).addScaledVector(path.frame(seg.s0).right, 3), age: 0, p: hl.passenger, jump: true });
  }
  if (r.newWagon) {
    window.setTimeout(() => {
      if (state !== 'playing') return;
      train.addCar(true);
      ui.setWagons(run.wagons, false);
      ui.floatText('+1 wagon 🎈', 'rescue');
    }, 450);
  } else ui.floatText('Voyageur sauvé +500', 'rescue');
}

function startBoil(): void {
  ui.showBanner('ÉBULLITION !<small>points ×2</small>', 'boil', 2200);
  audio.boil();
  train.loco.setMood('boil', gt, 10);
  for (const p of train.allPassengers()) p.setMood('cheer', gt, 2.5);
  fx.stars(train.loco.chimneyTop.getWorldPosition(new THREE.Vector3()), 40);
  shake = Math.max(shake, 0.25);
  // la baleine-nuage vient saluer la bouilloire qui bout
  if (!whale.active) {
    const f = path.frame(s);
    whale.launch(f.pos, f.fwd, f.right, true, v);
  }
}

function onWrong(cur: Question): void {
  run.onWrong(cur.fact);
  recordAnswer(mastery, cur.fact, false, gt - cur.start, DIFFICULTIES[run.difficulty].combo);
  store.set('multirail-mastery', mastery);
  deck.scheduleRetry(cur.fact);
  audio.wrong();
  ui.plateFlash('bad');
  ui.showCorrection(cur.fact);
  ui.setScore(run.score, 1, 0, run.boiling(gt));
  train.loco.setMood('scared', gt, 0.9);
  fx.soot(train.loco.chimneyTop.getWorldPosition(new THREE.Vector3()));
  joltUntil = gt + 1.1;
  shake = Math.max(shake, 0.35);
  // la pièce fragile se forme puis s'effondre dans le vide
  const f = path.frame(cur.seg.s0 + 3);
  debris.burst(f.pos, f.fwd, 26, [0xe9b56f, 0xffcf5c, 0xff9fb8, 0x9ff0d8]);
  fx.dust(f.pos, 6);
  for (const p of train.allPassengers()) if (Math.random() < 0.6) p.setMood('panic', gt, 0.8);
  cur.cracks++;
  if (run.mode === 'aventure' && cur.cracks >= CRACKS_PER_GAP) {
    failGap(cur);
    return;
  }
  // nouveau calcul aussitôt pour la même brèche
  cur.fact = deck.next(progressAt(s));
  cur.start = gt;
  cur.entry = '';
  ui.showQuestion(cur.fact, '', cur.cracks, cur.seg.passenger && run.mode === 'aventure', grandLabel(cur.seg));
  if (AUTO) scheduleAuto(cur.fact);
}

/** la brèche n'a pas été construite : un wagon se sacrifie… ou c'est le grand plongeon */
function failGap(cur: Question): void {
  const r = run.onFail(cur.fact);
  recordAnswer(mastery, cur.fact, false, gt - cur.start, DIFFICULTIES[run.difficulty].combo);
  deck.scheduleRetry(cur.fact);
  ui.showCorrection(cur.fact);
  ui.plateFlash('fail');
  q = null;
  ui.showQuestion(null, '', 0, false, '');
  ui.setScore(run.score, 1, 0, false);
  const hl = haltes.get(cur.seg.id);
  if (hl) hl.passenger.setMood('sad', gt, 9999);
  if (r.gameOver) {
    doomed = cur.seg;
    audio.danger = 1;
    train.loco.setMood('scared', gt, 20);
    return;
  }
  audio.fail();
  const car = train.detachLast();
  const from = new THREE.Vector3();
  if (car) {
    car.root.getWorldPosition(from);
    sacrificeCar(car);
  } else from.copy(path.point(s - 8)).add(new THREE.Vector3(0, 3, 0));
  rails.buildRescue(cur.seg, gt + 0.25, from);
  cur.seg.built = true;
  cur.seg.rescue = true;
  buildStart.set(cur.seg.id, gt + 0.25);
  activeBuilds.push({ seg: cur.seg, start: gt + 0.25, rainbow: false });
  audio.hammer(RailSystem.buildDuration(cur.seg));
  ui.setWagons(run.wagons, run.mode === 'entrainement');
  ui.floatText('Un wagon devient pont !', 'bad');
  train.loco.setMood('sad', gt, 2);
  for (const p of train.allPassengers()) p.setMood('sad', gt, 1.6);
  flash.set(1, 0.42, 0.48, 0.12);
  shake = Math.max(shake, 0.5);
}

/** le wagon se démonte ; son voyageur s'envole sous un parapluie en faisant coucou */
function sacrificeCar(car: Car): void {
  const pos = new THREE.Vector3();
  car.root.getWorldPosition(pos);
  fx.dust(pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 14, 0xfff1e0);
  fx.confetti(pos, 20, 3);
  audio.pop();
  const p = car.passengers[0];
  if (p) {
    const g = new THREE.Group();
    scene.add(g);
    g.position.copy(pos).add(new THREE.Vector3(0, 1.5, 0));
    p.root.position.set(0, 0, 0);
    g.add(p.root);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.7, 8, 1, true), new THREE.MeshStandardMaterial({ color: [0xff5d73, 0x6fd3ff, 0xffcf5c][Math.floor(Math.random() * 3)], side: THREE.DoubleSide }));
    umb.position.y = 2.6;
    umb.userData.own = true;
    g.add(umb);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8), new THREE.MeshStandardMaterial({ color: 0x3b2352 }));
    stick.position.set(0.3, 1.7, 0);
    stick.userData.own = true;
    g.add(stick);
    p.setMood('wave', gt, 9999);
    floaters.push({ obj: g, vel: path.frame(s).right.clone().multiplyScalar(Math.random() < 0.5 ? 2 : -2).add(new THREE.Vector3(0, -1.6, 0)), age: 0, p, jump: false });
  }
  car.root.removeFromParent();
}

function startFall(): void {
  state = 'falling';
  audio.gameOver();
  audio.danger = 0;
  ui.setPlaying(false, run.mode);
  train.loco.setMood('scared', gt, 10);
  for (const p of train.allPassengers()) p.setMood('panic', gt, 10);
  const f = path.frame(s - 3);
  fall = { t: 0, vel: f.fwd.clone().multiplyScalar(3), cam: camPos.clone().add(new THREE.Vector3(0, 3, 0)).addScaledVector(f.fwd, 4), fwd: f.fwd.clone() };
}

function updateFall(dt: number): void {
  if (!fall) return;
  fall.t += dt;
  const loco = train.loco.root;
  if (fall.t < 0.9) {
    // la locomotive bascule doucement au bord du vide
    loco.position.addScaledVector(fall.fwd, dt * 3.2);
    loco.rotateX(-dt * 0.8);
  } else {
    if (!fall.chute) {
      fall.chute = makeParachute();
      loco.add(fall.chute);
      audio.pop();
      fx.confetti(loco.position.clone().add(new THREE.Vector3(0, 6, 0)), 30, 4);
    }
    const k = Math.min(1, (fall.t - 0.9) / 0.6);
    fall.chute.scale.setScalar(0.2 + k * 0.8);
    fall.vel.y += (-(fall.t < 1.3 ? 12 : 2.5) - fall.vel.y) * Math.min(1, dt * (fall.t < 1.3 ? 1 : 3));
    fall.vel.x *= Math.exp(-dt);
    fall.vel.z *= Math.exp(-dt);
    loco.position.addScaledVector(fall.vel, dt);
    // balancement sous le parachute, retour à l'horizontale
    loco.rotation.x += (0 - loco.rotation.x) * Math.min(1, dt * 2);
    loco.rotation.z = Math.sin(fall.t * 2.2) * 0.18;
  }
  train.loco.update(gt, dt, s, gt * 2, false);
  train.loco.driver.update(gt, dt, gt * 2);
  if (fall.t > 4.2 && state === 'falling') endRun();
}

function makeParachute(): THREE.Group {
  const g = new THREE.Group();
  const colors = [0xff5d73, 0xfff8ec, 0xffcf5c, 0x6fd3ff];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 4, 8, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI / 2.4),
      new THREE.MeshStandardMaterial({ color: colors[i % 4], side: THREE.DoubleSide, roughness: 0.6 }),
    );
    m.userData.own = true;
    g.add(m);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    rope.position.set(Math.cos(a) * 1.6, -1.9, Math.sin(a) * 1.6);
    rope.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
    rope.userData.own = true;
    g.add(rope);
  }
  g.position.set(0, 7.4, -0.5);
  return g;
}

function endRun(): void {
  const prev = records[run.difficulty]?.score ?? 0;
  const isRecord = run.mode === 'aventure' && run.score > prev;
  if (isRecord) {
    records[run.difficulty] = { score: run.score, distance: s };
    store.set('multirail-records', records);
  }
  state = 'over';
  q = null;
  audio.playing = false;
  audio.danger = 0;
  ui.setPlaying(false, run.mode);
  ui.showQuestion(null, '', 0, false, '');
  ui.showEnd({
    score: run.score, record: isRecord, best: prev, distance: s, correct: run.correct, accuracy: run.accuracy, avg: run.averageTime,
    bestCombo: run.bestCombo, saved: run.saved, zones: zonesSeen, bridges: run.bridges, missed: [...run.missed.values()], mode: run.mode,
  });
}

// ------------------------------------------------------------------ conduite

function stopPoint(): number {
  for (const g of layout.segments) {
    if (g.kind !== 'gap' || g.s1 <= s - 1) continue;
    if (!g.built) return g.s0 - 0.4;
    const st = buildStart.get(g.id);
    if (st === undefined) continue;
    const speed = g.style === 'grand' ? 38 : 55;
    const front = g.s0 + Math.max(0, (gt - st - FLIGHT - 0.12) * speed);
    if (front < g.s1) return front - 0.4;
  }
  return Infinity;
}

let steamAcc = 0;
let lastZone = -1;

function drive(dt: number): void {
  const title = state === 'title';
  if (title) {
    // démonstration : les ponts se construisent tout seuls
    const g = layout.nextUnbuilt(s);
    if (g && g.s0 - s < 55) {
      g.built = true;
      const rainbow = Math.random() < 0.25;
      rails.build(g, gt, rainbow);
      buildStart.set(g.id, gt);
      activeBuilds.push({ seg: g, start: gt, rainbow });
      if (Math.random() < 0.5) for (const p of train.allPassengers()) if (Math.random() < 0.5) p.setMood('cheer', gt, 1.2);
    }
  }
  const boiling = run.boiling(gt) && !title;
  // avance du joueur : plus les ponts sont bâtis loin devant, plus le train file
  const base = cruiseSpeed(run.difficulty, s);
  const cycle = base * referenceTime(run.difficulty, s);
  const nextGap = layout.nextUnbuilt(s);
  const lead = nextGap ? (nextGap.s0 - s) / cycle : 3;
  const rush = title ? 0 : THREE.MathUtils.clamp((lead - 0.9) / 1.1, 0, 1) * 0.7;
  const cruise = title ? 12 : base * (1 + rush) * (boiling ? 1.2 : 1) * (gt < joltUntil ? 0.55 : 1);
  const stop = stopPoint();
  const brake = run.mode === 'entrainement' && !title ? 4 : 6.5;
  const vMax = Math.sqrt(2 * brake * Math.max(0, stop - s));
  const target = Math.min(cruise, vMax);
  if (v < target) v = Math.min(target, v + 5 * dt);
  else v = Math.max(target, v - 9 * dt);
  v = Math.min(v, vMax);
  s += v * dt;
  audio.speed = v;
  audio.boiling = boiling;
  audio.intensity = title ? 0 : Math.min(2, Math.floor(run.combo / 3) + (progressAt(s) > 0.5 ? 1 : 0));

  if (!title && state === 'playing') {
    // un calcul pour la prochaine brèche, dès qu'elle est à portée
    const next = layout.nextUnbuilt(s);
    if (!q && next && !doomed) {
      // jusqu'à deux brèches d'avance : un joueur rapide enchaîne sans attendre
      if (next.s0 - s <= cycle * 2.1) ask(next);
    }
    if (doomed && v < 0.4 && doomed.s0 - s < 2.5) {
      doomed = null;
      startFall();
    }
    if (q) {
      const dist = q.seg.s0 - s;
      const gauge = Math.max(0, dist) / q.window;
      const aventure = run.mode === 'aventure';
      ui.setGauge(gauge, aventure);
      const danger = aventure ? THREE.MathUtils.clamp(1 - gauge * 1.6, 0, 1) : 0;
      audio.danger = danger;
      rails.setDanger(q.seg, danger);
      if (aventure && !q.braked && vMax < cruise * 0.92 && dist < 45) {
        q.braked = true;
        audio.brake();
        audio.panic();
        train.loco.setMood('scared', gt, 6);
        for (const p of train.allPassengers()) p.setMood('panic', gt, 2.5);
      }
      if (dist < 6 && v > 2 && aventure) {
        // étincelles des freins
        const wp = train.loco.root.position;
        if (Math.random() < 0.6) fx.sparks(wp.clone().add(path.frame(s).right.multiplyScalar(Math.random() < 0.5 ? 1 : -1)), 2);
      }
      if (v < 0.4 && dist < 2) {
        q.stuck += dt;
        if (aventure && q.stuck > 1.1) failGap(q);
        else if (!aventure && q.stuck > 0.5) train.loco.setMood('idle', gt);
      }
    } else {
      audio.danger = 0;
    }
  }
  // zones traversées
  const z = ambienceIndex(s);
  if (z !== lastZone) {
    if (lastZone >= 0 && state === 'playing') {
      const a = AMBIENCES[z % AMBIENCES.length];
      ui.showBanner(`${a.emoji} ${a.name}`, '', 2600);
      audio.zone();
      zonesSeen++;
    }
    lastZone = z;
    zone = z;
  }
}

// ------------------------------------------------------------------ caméra

const camPos = new THREE.Vector3(0, 8, 20);
const camLook = new THREE.Vector3();
const dPos = new THREE.Vector3();
const dLook = new THREE.Vector3();
let fov = 58;

/** le train est-il sur le Grand Pont (tout construit) ? renvoie l'étendue du gouffre */
function grandCam(): { a: number; b: number } | null {
  if (state !== 'playing') return null;
  const spans = layout.segments.filter((g) => g.style === 'grand' && g.s0 < s + 10 && g.s1 > s - 30);
  if (!spans.length || spans.some((g) => !g.built)) return null;
  const all = layout.segments.filter((g) => g.style === 'grand' && Math.abs(g.s0 - spans[0].s0) < 200);
  const a = Math.min(...all.map((g) => g.s0));
  const b = Math.max(...all.map((g) => g.s1));
  return s > a - 8 && s < b + 12 ? { a, b } : null;
}

function updateCamera(dt: number): void {
  const portrait = window.innerHeight > window.innerWidth;
  const f = path.frame(Math.max(0, s - 3));
  const boiling = run.boiling(gt) && state === 'playing';
  let wantFov = (portrait ? 66 : 56) + Math.min(10, v * 0.25);
  if (state === 'title') {
    const a = gt * 0.11;
    const c = path.frame(Math.max(0, s - 9));
    const rr = portrait ? 1.35 : 1;
    dPos.copy(c.pos).addScaledVector(c.right, Math.sin(a) * 16 * rr).addScaledVector(c.fwd, Math.cos(a) * 18 * rr).add(new THREE.Vector3(0, 4.5 + Math.sin(gt * 0.23) * 2.5, 0));
    // sur grand écran, le train se tient à droite du menu ; en portrait, sous le menu
    dLook.copy(c.pos).add(new THREE.Vector3(0, portrait ? 7 : 1.5, 0));
    if (!portrait) dLook.addScaledVector(c.right, -Math.cos(a) * 6).addScaledVector(c.fwd, Math.sin(a) * 6);
  } else if (fall && (state === 'falling' || state === 'over')) {
    const lp = train.loco.root.position;
    dLook.copy(lp);
    dPos.copy(fall.cam);
  } else if (grandCam()) {
    // plan de côté : le train sur les arches du Grand Pont, au-dessus des nuages
    const g = grandCam()!;
    const mid = path.frame((g.a + g.b) / 2);
    dPos.copy(mid.pos).addScaledVector(mid.right, 36).add(new THREE.Vector3(0, -4, 0)).addScaledVector(mid.fwd, -10);
    dLook.copy(path.point(s - 6, tmpV)).add(new THREE.Vector3(0, -1, 0));
    wantFov = portrait ? 70 : 52;
  } else {
    const danger = audio.danger;
    // au-dessus du premier wagon : on voit la locomotive, ses voyageurs et la voie qui se construit
    const back = 11.5 - danger * 1.5 - (boiling ? 0.8 : 0);
    const up = 7.4 - danger * 0.8 - (boiling ? 0.6 : 0);
    dPos.copy(f.pos).addScaledVector(f.fwd, -back).add(new THREE.Vector3(0, up, 0));
    const ahead = 22 + danger * 12;
    dLook.copy(path.point(s + ahead, tmpV)).add(new THREE.Vector3(0, 1.2, 0));
    if (boiling) wantFov += 8;
  }
  const k = 1 - Math.exp(-dt * 3.2);
  camPos.lerp(dPos, k);
  camLook.lerp(dLook, 1 - Math.exp(-dt * 5));
  fov += (wantFov - fov) * Math.min(1, dt * 2);
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    shake = Math.max(0, shake - dt * 1.2);
  }
  camera.lookAt(camLook);
  if (state === 'playing') camera.rotateZ(f.bank * 0.35);
  camera.fov = fov;
  // décale le cadrage pour que le pavé ne cache pas le train
  const w = window.innerWidth, h = window.innerHeight;
  const inset = ui.padInset();
  const pr = inset.right * 0.85, pb = inset.bottom * 0.85;
  camera.aspect = (w + pr) / (h + pb);
  if (pr || pb) camera.setViewOffset(w + pr, h + pb, pr, pb, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ effets continus

const chimney = new THREE.Vector3();
const trainVel = new THREE.Vector3();
const steamTint = new THREE.Color();

function updateEffects(dt: number): void {
  const boiling = run.boiling(gt) && state === 'playing';
  if (state !== 'falling' && state !== 'over') {
    train.loco.chimneyTop.getWorldPosition(chimney);
    trainVel.copy(path.frame(s).fwd).multiplyScalar(v);
    steamAcc += dt * (3.5 + v * 0.3) * (boiling ? 2.2 : 1) * Math.max(0.5, fx.density);
    steamTint.copy(sky.amb.cloudLit).lerp(new THREE.Color(1, 1, 1), 0.5);
    while (steamAcc > 1) {
      steamAcc--;
      fx.steam(chimney, trainVel, Math.min(1, v / 20), boiling, steamTint);
    }
  }
  // front de construction : gerbes d'étincelles
  for (let i = activeBuilds.length - 1; i >= 0; i--) {
    const b = activeBuilds[i];
    const speed = b.seg.style === 'grand' ? 38 : 55;
    const front = b.seg.s0 + (gt - b.start - FLIGHT * 0.6) * speed;
    if (front > b.seg.s1 + 2) {
      activeBuilds.splice(i, 1);
      if (state === 'playing' || state === 'title') fx.sparks(path.point(b.seg.s1, tmpV).clone().add(new THREE.Vector3(0, 0.4, 0)), 10, b.rainbow);
      continue;
    }
    if (front > b.seg.s0 && Math.random() < 0.8 * fx.density) {
      fx.sparks(path.point(front, tmpV).clone().add(new THREE.Vector3(0, 0.3, 0)), 2, b.rainbow);
      if (b.seg.style === 'grand' && Math.random() < 0.3) fx.stars(path.point(front, tmpV).clone().add(new THREE.Vector3(0, -3, 0)), 1);
    }
  }
  // voyageurs qui s'envolent (parapluie) ou qui sautent dans le train
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.age += dt;
    f.obj.position.addScaledVector(f.vel, dt);
    if (f.jump) f.vel.y -= 14 * dt;
    f.obj.rotation.z = Math.sin(f.age * 2) * 0.15;
    f.p?.update(gt, dt, gt);
    if (f.jump && f.age > 0.9) {
      fx.confetti(f.obj.position, 18, 2);
      f.obj.removeFromParent();
      floaters.splice(i, 1);
      continue;
    }
    if (f.age > 8) {
      f.obj.removeFromParent();
      floaters.splice(i, 1);
    }
  }
  for (const hl of haltes.values()) hl.passenger.update(gt, dt, gt * 1.5);
  const wf = path.frame(s);
  whale.update(dt, gt, wf.pos, wf.fwd, wf.right, state === 'playing' || state === 'title');
  if (whale.active && whale.spout && Math.random() < 0.5) fx.spout(whale.blowhole(tmpV).clone());
  fx.update(dt);
  debris.update(dt);
}

// ------------------------------------------------------------------ boucle

let lastT = performance.now();
let frameAcc = 0;
let frameN = 0;
let lastDowngrade = 0;

function frame(): void {
  requestAnimationFrame(frame);
  renderer.info.reset();
  const nowMs = performance.now();
  const raw = Math.min(0.05, (nowMs - lastT) / 1000);
  lastT = nowMs;
  const dt = state === 'paused' ? 0 : raw;
  gt += dt;
  if (state === 'title' || state === 'playing') {
    drive(dt);
    syncWorld(s);
    ensureIslands(s, 1);
    const popped = (car: Car) => {
      audio.pop();
      const p = new THREE.Vector3();
      car.root.getWorldPosition(p);
      fx.confetti(p.add(new THREE.Vector3(0, 5, 0)), 30, 3);
      for (const pp of car.passengers) pp.setMood('cheer', gt, 2);
    };
    const beat = gt * (1 + v * 0.06);
    train.place(path, s, dt, gt, beat, run.boiling(gt) && state === 'playing', 0, popped);
    rails.shared.uTrain.value.copy(train.loco.root.position);
  } else if (state === 'falling' || state === 'over') {
    updateFall(dt);
  }
  // dorure de la chaudière pendant l'ébullition
  const boiling = run.boiling(gt) && state === 'playing';
  const bm = train.loco.boilerMat;
  if (boiling) {
    bm.color.setHSL((gt * 0.3) % 1, 0.65, 0.55);
    bm.emissive.setHSL((gt * 0.3) % 1, 0.8, 0.3);
  } else {
    bm.color.lerp(new THREE.Color(0x2fb7a6), Math.min(1, dt * 3));
    bm.emissive.lerp(new THREE.Color(0x000000), Math.min(1, dt * 3));
  }
  updateEffects(dt);
  updateCamera(raw);
  sky.update(s, camera.position, path.heading(s), gt);
  worldU.uTime.value = gt;
  worldU.uNight.value = sky.amb.night;
  rails.shared.uTime.value = gt;
  rails.shared.uNight.value = sky.amb.night;
  scene.fog = sky.fog;
  for (const p of [fx.soft, fx.glow]) p.mesh.material.uniforms.uFog.value.copy(sky.fog.color);
  // reflets de la chaudière : environnement recalculé de temps en temps
  if (Math.abs(s - envAt) > 180 || envAt < -1e8) {
    envAt = s;
    const old = envTex;
    envDome.position.set(0, 0, 0);
    envTex = pmrem.fromScene(envScene, 0.04, 0.1, 4000).texture;
    scene.environment = envTex;
    old?.dispose();
  }
  // post-traitement
  const u = post.mat.uniforms;
  const sunWorld = camera.position.clone().addScaledVector(sky.sunDir, 1000);
  const sp = sunWorld.project(camera);
  const facing = camera.getWorldDirection(tmpV).dot(sky.sunDir);
  u.uSun.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
  u.uSunVis.value = facing > 0 ? THREE.MathUtils.smoothstep(facing, 0.2, 0.7) * (1 - sky.amb.night * 0.7) : 0;
  u.uSunCol.value.copy(sky.amb.sun);
  u.uBlur.value += ((boiling ? 0.45 : 0) - u.uBlur.value) * Math.min(1, raw * 3);
  flash.w = Math.max(0, flash.w - raw * 0.5);
  u.uFlash.value.copy(flash);
  post.render(scene, camera);

  if (state === 'playing' && gt - lastHud > 0.2) {
    lastHud = gt;
    ui.setDistance(s);
    ui.setScore(run.score, comboMultiplier(run.combo) * (boiling ? 2 : 1), run.combo, boiling);
  }
  // qualité automatique : on allège si l'image ralentit
  if (prefs.quality === 'auto' && state !== 'paused') {
    frameAcc += raw;
    frameN++;
    if (frameN >= 90) {
      const avg = frameAcc / frameN;
      frameAcc = 0;
      frameN = 0;
      if (avg > 1 / 42 && gt - lastDowngrade > 4 && quality !== 'basse') {
        quality = quality === 'haute' ? 'moyenne' : 'basse';
        lastDowngrade = gt;
        applyQuality();
      }
    }
  }
}

// ------------------------------------------------------------------ clavier

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key;
  if (state === 'title' && (k === 'Enter' || k === ' ')) {
    e.preventDefault();
    startRun();
    return;
  }
  if (state === 'over' && k === 'Enter') {
    startRun();
    return;
  }
  if (k === 'Escape' || k === 'p' || k === 'P') {
    if (state === 'playing') setPaused(true);
    else if (state === 'paused') setPaused(false);
    return;
  }
  if (k === 'm' || k === 'M') {
    prefs.sound = !prefs.sound;
    prefs.music = prefs.sound;
    audio.setSound(prefs.sound);
    audio.setMusic(prefs.music);
    store.set('multirail-prefs', prefs);
    return;
  }
  if (state !== 'playing') return;
  if (/^[0-9]$/.test(k)) {
    e.preventDefault();
    typeDigit(k);
  } else if (k === 'Backspace' || k === 'Delete') {
    e.preventDefault();
    if (q) {
      q.entry = q.entry.slice(0, -1);
      ui.setEntry(q.entry);
    }
  } else if (k === 'Enter') submit();
});
window.addEventListener('pointerdown', () => audio.unlock(), { once: false, passive: true });

// ------------------------------------------------------------------ démarrage

applyQuality();
syncWorld(0);
ensureIslands(0, 10);
frame();

// accès pour les tests automatisés
(window as unknown as Record<string, unknown>).__multirail = {
  get state() { return state; },
  get s() { return s; },
  get v() { return v; },
  get question() { return q ? { a: q.fact.a, b: q.fact.b, entry: q.entry, cracks: q.cracks, key: factKey(q.fact.a, q.fact.b) } : null; },
  get run() { return { score: run.score, combo: run.combo, wagons: run.wagons, correct: run.correct, wrong: run.wrong, timeouts: run.timeouts, saved: run.saved }; },
  get quality() { return quality; },
  get fps() { return frameN ? frameN / frameAcc : 0; },
  info: () => ({ renderer: renderer.info.render, memory: renderer.info.memory, segments: layout.segments.length, islands: islandObjs.size, bg: bgIslands.length }),
  setQuality: (qn: QName) => { quality = qn; applyQuality(); },
  segs: () => layout.segments.map((g) => ({ kind: g.kind, s0: Math.round(g.s0), s1: Math.round(g.s1), built: g.built, style: g.style, passenger: g.passenger })),
  start: () => startRun(),
};
void MAX_WAGONS;
void formatDist;
