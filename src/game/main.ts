// MULTIRAIL — chef d'orchestre : boucle de jeu, conduite du train, calculs, monde vivant et mise en scène.
import '@fontsource-variable/fredoka';
import './style.css';
import * as THREE from 'three';
import { Audio } from './audio';
import { SkyWhale } from './creatures';
import { buildLandmark, type Emitter } from './decor';
import { Director, type ShotName } from './director';
import { FallScene, makeUmbrella } from './fall';
import { Debris, Fx } from './fx';
import { makeWorldMaterial } from './geo';
import { buildIsland, makeFallsMaterial, straightFrame } from './islands';
import { Flock, Motes, VIGNETTES, Vignette } from './life';
import { MAX_LIGHTS, Rain, makeWaterMaterial, shadowMaterial, signAtlas, type StationInfo } from './mer';
import {
  CRACKS_PER_GAP, DIFFICULTIES, QuestionDeck, Run, START_WAGONS, answerOf, comboMultiplier, cruiseSpeed,
  factKey, isEntryComplete, mulberry32, progressAt, recordAnswer, referenceTime, type Fact, type Mastery,
} from './model';
import { Post } from './post';
import { FLIGHT, RailSystem } from './rails';
import { REGIONS, Regions, ambienceAt } from './regions';
import { Sky, cloneAmbience, AMBIENCES } from './sky';
import { Layout, TrackPath, type Segment } from './track';
import { Car, Passenger, Train } from './train';
import { UI, type Prefs } from './ui';

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
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const prefs: Prefs = store.get<Prefs>('multirail-prefs', {
  tables: [2, 3, 4, 5], mode: 'aventure', difficulty: 'promenade', sound: true, music: true, quality: 'auto', pad: true,
  camera: reducedMotion ? 'calme' : 'vivante',
});
const records = store.get<Record<string, { score: number; distance: number }>>('multirail-records', {});
const mastery: Mastery = store.get<Mastery>('multirail-mastery', {});
const params = new URLSearchParams(location.search);
const AUTO = params.get('auto'); // tests : réponses automatiques
const DEPART = Number(params.get('depart') ?? 0) * 1000;
/** outils de test : en développement, ou avec ?test dans l'adresse */
const TEST = import.meta.env.DEV || params.has('test');
/** tests : accélère le temps du jeu (?vite=3) */
const TIME = TEST ? Number(params.get('vite') ?? 1) || 1 : 1;

// ------------------------------------------------------------------ rendu

const canvas = document.getElementById('world') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 5000);
const post = new Post(renderer);

const QUALITY = {
  haute: { ratio: 2, post: true, rays: true, puffs: 170, density: 1, bg: 12, motes: 420, vignettes: 2, rain: 700, lights: 12 },
  moyenne: { ratio: 1.35, post: true, rays: false, puffs: 110, density: 0.7, bg: 8, motes: 260, vignettes: 1, rain: 380, lights: 8 },
  basse: { ratio: 0.9, post: false, rays: false, puffs: 60, density: 0.45, bg: 4, motes: 120, vignettes: 1, rain: 160, lights: 4 },
};
type QName = keyof typeof QUALITY;
let quality: QName = prefs.quality === 'auto' ? (coarse ? 'moyenne' : 'haute') : prefs.quality;

const sky = new Sky(scene, QUALITY.haute.puffs);
const ambience = cloneAmbience(AMBIENCES[0]);
const worldU = { uTime: { value: 0 }, uNight: { value: 0 } };
const worldMat = makeWorldMaterial(worldU);
const fallsMat = makeFallsMaterial(worldU.uTime);
const fx = new Fx();
const debris = new Debris();
scene.add(fx.group, debris.mesh);
const whale = new SkyWhale(scene);
const motes = new Motes();
scene.add(motes.mesh);
const flock = new Flock(worldMat);
scene.add(flock.mesh);
const waterMat = makeWaterMaterial();
const rain = new Rain();
scene.add(rain.mesh);
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
  motes.setCount(q.motes);
  rain.setCount(q.rain);
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
let regions = new Regions(seed);
let path = new TrackPath(seed, regions);
let layout = new Layout(seed, prefs.difficulty, regions);
let rails = new RailSystem(path);
scene.add(rails.group);
const train = new Train(START_WAGONS);
scene.add(train.group);

interface IslandEntry {
  objs: THREE.Object3D[];
  emit: Emitter[];
  life: Vignette[];
  /** lanternes dont le reflet se dessine sur l'eau */
  lights: THREE.Vector3[];
  stations: Array<StationInfo & { rung: boolean }>;
}
const islands = new Map<number, IslandEntry>();
const bgIslands: Array<{ objs: THREE.Object3D[]; anchor: number }> = [];
const bgLights: THREE.Vector3[] = [];
let bgCursor = 300;
interface LandmarkEntry {
  k: number;
  s: number;
  center: THREE.Vector3;
  height: number;
  mesh: THREE.Mesh;
  emit: Emitter[];
  lights: THREE.Vector3[];
  seen: boolean;
}
const landmarks: LandmarkEntry[] = [];
let landmarkRank = 0;
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

function dropIsland(id: number): void {
  const e = islands.get(id);
  if (!e) return;
  e.objs.forEach(disposeObj);
  e.life.forEach((v) => v.dispose());
  islands.delete(id);
}

function resetWorld(newSeed: number): void {
  for (const id of [...islands.keys()]) dropIsland(id);
  for (const b of bgIslands) b.objs.forEach(disposeObj);
  bgIslands.length = 0;
  bgLights.length = 0;
  for (const l of landmarks) disposeObj(l.mesh);
  landmarks.length = 0;
  landmarkRank = 0;
  for (const hl of haltes.values()) disposeObj(hl.group);
  haltes.clear();
  for (const f of floaters) f.obj.removeFromParent();
  floaters.length = 0;
  for (const seg of [...rails.entries.values()].map((e) => e.seg)) rails.remove(seg);
  scene.remove(rails.group);
  seed = newSeed;
  regions = new Regions(seed);
  path = new TrackPath(seed, regions);
  layout = new Layout(seed, prefs.difficulty, regions);
  rails = new RailSystem(path);
  scene.add(rails.group);
  buildStart.clear();
  activeBuilds.length = 0;
  bgCursor = 300;
  fx.clear();
  envAt = -1e9;
  lastRank = -1;
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

/** maillages d'une île : sol et décors, cascades, eau, enseignes, ombres */
function islandMeshes(res: ReturnType<typeof buildIsland>): THREE.Object3D[] {
  const objs: THREE.Object3D[] = [meshOf(res.solid, worldMat)];
  if (res.falls) objs.push(meshOf(res.falls, fallsMat));
  if (res.water) objs.push(meshOf(res.water, waterMat));
  if (res.signs) objs.push(meshOf(res.signs, signAtlas().mat));
  if (res.shadows) {
    const m = meshOf(res.shadows, shadowMaterial());
    m.renderOrder = 1;
    objs.push(m);
  }
  objs.forEach((o) => scene.add(o));
  return objs;
}

/** région d'un élément de décor posé à la distance s de la voie */
const regionPicker = (anchor?: number) => (s: number, roll: number) => regions.def(regions.pick(anchor ?? s, roll));

/** construit au plus une île par image pour garder la fluidité */
function ensureIslands(s: number, budget: number): void {
  for (const seg of layout.segments) {
    if (budget <= 0) return;
    if (seg.s0 > s + 950) break;
    if (seg.kind !== 'island' || islands.has(seg.id)) continue;
    const r = mulberry32(seg.id * 131 + seed);
    const res = buildIsland(islandFrame, {
      s0: seg.s0, s1: seg.s1, width: 13 + r() * 9, depth: 18 + r() * 20, biome: seg.biome, region: regionPicker(), seed: seg.id * 977 + seed,
      corridor: true, density: QUALITY[quality].density, station: seg.station ?? undefined,
    });
    const objs = islandMeshes(res);
    // petites scènes vivantes sur les emplacements laissés libres
    const life: Vignette[] = [];
    const max = QUALITY[quality].vignettes;
    for (const spot of res.spots) {
      if (life.length >= max) break;
      const kinds = VIGNETTES[spot.region.key];
      const kind = kinds[Math.floor(r() * kinds.length)];
      const f = path.frame(spot.s);
      const toTrack = f.pos.clone().sub(spot.p).setY(0).normalize();
      const v = new Vignette(kind, spot.p, toTrack, worldMat, r);
      scene.add(v.group);
      life.push(v);
    }
    islands.set(seg.id, {
      objs, life, emit: res.emit.filter((e) => e.kind !== 'light'), lights: res.emit.filter((e) => e.kind === 'light').map((e) => e.p),
      stations: res.stations.map((st) => ({ ...st, rung: false })),
    });
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
      s0: -len / 2, s1: len / 2, width: 25 + r() * 35, depth: 40 + r() * 70, biome: Math.floor(r() * 2), region: regionPicker(bgCursor),
      seed: Math.floor(r() * 1e6), corridor: false, density: QUALITY[quality].density * 0.3,
    });
    const objs = islandMeshes(res);
    for (const e of res.emit) if (e.kind === 'light') bgLights.push(e.p);
    bgIslands.push({ objs, anchor: bgCursor });
  }
  // le monument de chaque région, posé au loin, bien dégagé de la voie
  if (budget > 0) {
    const k = landmarkRank + 1;
    const at = regions.start(k) + (regions.start(k + 1) - regions.start(k)) * 0.5;
    if (at < s + 1200) {
      landmarkRank = k;
      const r = mulberry32(k * 7717 + seed);
      const f = path.frame(at);
      const side = r() < 0.5 ? -1 : 1;
      let center = new THREE.Vector3();
      for (const lat of [130, 170, 220, 280]) {
        center = f.pos.clone().addScaledVector(f.right, side * lat).add(new THREE.Vector3(0, -8 + r() * 10, 0));
        let min = Infinity;
        for (let d = -260; d <= 400; d += 10) min = Math.min(min, path.point(at + d).distanceTo(center));
        if (min > 80) break;
      }
      const def = regions.def(k);
      const res = buildLandmark(def.key, center, f.pos.clone().sub(center).setY(0).normalize(), r, def.palettes[0]);
      const mesh = meshOf(res.geo, worldMat);
      scene.add(mesh);
      landmarks.push({ k, s: at, center, height: res.height, mesh, emit: res.emit.filter((e) => e.kind !== 'light'), lights: res.emit.filter((e) => e.kind === 'light').map((e) => e.p), seen: false });
    }
  }
}

/** halte flottante où un voyageur attend d'être embarqué */
function addHalte(seg: Segment): void {
  const f = path.frame(seg.s0 - 4);
  const center = f.pos.clone().addScaledVector(f.right, -6.5).addScaledVector(f.up, -0.2);
  const group = new THREE.Group();
  const res = buildIsland(straightFrame(new THREE.Vector3(), path.heading(seg.s0)), {
    s0: -3, s1: 3, width: 3.2, depth: 5, biome: seg.biome, region: regionPicker(seg.s0), seed: seg.id, corridor: false, density: 0,
  });
  group.add(meshOf(res.solid, worldMat));
  if (res.water) group.add(meshOf(res.water, waterMat));
  if (res.falls) group.add(meshOf(res.falls, fallsMat));
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
    dropIsland(seg.id);
    const hl = haltes.get(seg.id);
    if (hl) disposeObj(hl.group);
    haltes.delete(seg.id);
    buildStart.delete(seg.id);
  }
  // reflets des îles lointaines : on ne garde que les plus récents
  if (bgLights.length > 60) bgLights.splice(0, bgLights.length - 60);
  for (let i = bgIslands.length - 1; i >= 0; i--) {
    if (bgIslands[i].anchor < s - 350) {
      bgIslands[i].objs.forEach(disposeObj);
      bgIslands.splice(i, 1);
    }
  }
  for (let i = landmarks.length - 1; i >= 0; i--) {
    if (landmarks[i].s < s - 500) {
      disposeObj(landmarks[i].mesh);
      landmarks.splice(i, 1);
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
let lastRank = -1;
let regionsSeen: Array<{ emoji: string; name: string }> = [];
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
let fall: FallScene | null = null;
/** brèche condamnée : le train roule jusqu'au bord, puis plonge */
let doomed: Segment | null = null;
/** voyageurs perdus pendant la partie (ils reviennent pendant la chute) */
let lostFriends = 0;
let shake = 0;
let flash = new THREE.Vector4();
let lastHud = 0;
/** dernière brèche construite (pour filmer le chantier) */
let justBuilt: { seg: Segment; t: number } | null = null;

const bars = ['top', 'bottom'].map((k) => {
  const e = document.createElement('div');
  e.className = `cinebar ${k}`;
  document.body.appendChild(e);
  return e;
});
void bars;
const skipHint = document.createElement('div');
skipHint.className = 'skip-hint';
skipHint.textContent = 'Toucher pour passer';
document.body.appendChild(skipHint);

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

function clearFall(): void {
  fall?.dispose();
  fall = null;
  skipHint.classList.remove('show');
}

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
    clearFall();
    doomed = null;
    lostFriends = 0;
    justBuilt = null;
    s = DEPART;
    // départ de test au milieu d'une brèche : on se pose sur l'île suivante
    layout.extend(s + 1100);
    const at = layout.at(s);
    if (at && at.kind === 'gap') s = at.s1 + 3;
    v = 0;
    q = null;
    regionsSeen = [];
    syncWorld(s);
    ensureIslands(s, 14);
    state = 'playing';
    director.go('follow', 0);
    snapCam = true;
    runT0 = gt;
    ui.setPlaying(true, run.mode);
    ui.setWagons(run.wagons, run.mode === 'entrainement');
    ui.setScore(0, 1, 0, false);
    ui.showQuestion(null, '', 0, false, '');
    audio.playing = true;
    curtain.style.opacity = '0';
    const def = regions.def(regions.rankAt(s));
    ui.showBanner(`${def.emoji} ${def.name}<small>En voiture !</small>`, '', 2200);
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
  audio.calm = false;
  ui.setPlaying(false, run.mode);
  ui.showQuestion(null, '', 0, false, '');
  ui.showEnd(null);
  ui.renderTitle(records[prefs.difficulty]);
  ui.showTitle(true);
  director.go('title', 0);
  if (fall) startRunWorldForTitle();
}

function startRunWorldForTitle(): void {
  clearFall();
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
  justBuilt = { seg, t: gt };
  audio.correct(run.combo);
  audio.rise();
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
  // jaillissement au pied de la brèche : les pièces montent du vide
  const base = path.point(seg.s0, tmpV).clone();
  fx.sparks(base.clone().add(new THREE.Vector3(0, 0.5, 0)), 24, rainbow);
  fx.stars(base.clone().add(new THREE.Vector3(0, -6, 0)), 10);
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
  lostFriends++;
  const p = car.passengers[0];
  if (p) {
    const g = makeUmbrella([0xff5d73, 0x6fd3ff, 0xffcf5c][Math.floor(Math.random() * 3)]);
    scene.add(g);
    g.position.copy(pos).add(new THREE.Vector3(0, 1.5, 0));
    p.root.position.set(0, 0, 0);
    g.add(p.root);
    p.setMood('wave', gt, 9999);
    floaters.push({ obj: g, vel: path.frame(s).right.clone().multiplyScalar(Math.random() < 0.5 ? 2 : -2).add(new THREE.Vector3(0, -1.6, 0)), age: 0, p, jump: false });
  }
  car.root.removeFromParent();
}

function startFall(seg: Segment): void {
  state = 'falling';
  audio.danger = 0;
  ui.setPlaying(false, run.mode);
  for (const p of train.allPassengers()) p.setMood('panic', gt, 10);
  // elle dérive du côté opposé à la halte du voyageur (s'il y en a une)
  const side = seg.passenger ? 1 : seg.id % 2 ? 1 : -1;
  fall = new FallScene({
    scene, path, edge: seg.s0, gapLen: seg.s1 - seg.s0, side, seaY: sky.seaY, loco: train.loco, friends: lostFriends, fx, audio,
  });
  director.go('fall', 0.9, 0);
  window.setTimeout(() => {
    if (state === 'falling') skipHint.classList.add('show');
  }, 1500);
}

function skipFall(): void {
  if (state !== 'falling' || !fall || fall.t < 1) return;
  fall.skip();
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
  audio.calm = false;
  skipHint.classList.remove('show');
  ui.setPlaying(false, run.mode);
  ui.showQuestion(null, '', 0, false, '');
  ui.showEnd({
    score: run.score, record: isRecord, best: prev, distance: s, correct: run.correct, accuracy: run.accuracy, avg: run.averageTime,
    bestCombo: run.bestCombo, saved: run.saved, regions: regionsSeen, bridges: run.bridges, missed: [...run.missed.values()], mode: run.mode,
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
let wakeAcc = 0;

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
  const here = layout.at(s);
  const calm = !!here?.calm && !title;
  // avance du joueur : plus les ponts sont bâtis loin devant, plus le train file
  const base = cruiseSpeed(run.difficulty, s);
  const cycle = base * referenceTime(run.difficulty, s);
  const nextGap = layout.nextUnbuilt(s);
  const lead = nextGap ? (nextGap.s0 - s) / cycle : 3;
  // pendant une contemplation, le train flâne au lieu de foncer
  const rush = title || calm ? 0 : THREE.MathUtils.clamp((lead - 0.9) / 1.1, 0, 1) * 0.7;
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
  audio.calm = calm && !q;
  audio.intensity = title ? 0 : Math.min(2, Math.floor(run.combo / 3) + (progressAt(s) > 0.5 ? 1 : 0));

  if (!title && state === 'playing') {
    // un calcul pour la prochaine brèche, dès qu'elle est à portée
    const next = layout.nextUnbuilt(s);
    if (!q && next && !doomed) {
      // jusqu'à deux brèches d'avance ; sur une île de contemplation, on attend la fin de la vue
      if (next.s0 - s <= cycle * (calm ? 1 : 2.1)) ask(next);
    }
    if (doomed && v < 0.4 && doomed.s0 - s < 2.5) {
      const seg = doomed;
      doomed = null;
      startFall(seg);
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
    } else if (!doomed) {
      audio.danger = 0;
    }
  }
  // régions traversées : bannière et petite fanfare à chaque frontière
  const k = regions.rankAt(s);
  if (k !== lastRank) {
    const def = regions.def(k);
    if (lastRank >= 0 && state === 'playing') {
      ui.showBanner(`${def.emoji} ${def.name}<small>${def.tagline}</small>`, '', 3400);
      audio.zone();
    }
    if (state === 'playing') regionsSeen.push({ emoji: def.emoji, name: def.name });
    lastRank = k;
  }
}

// ------------------------------------------------------------------ caméra

const director = new Director();
const camPos = new THREE.Vector3(0, 8, 20);
const camLook = new THREE.Vector3();
let fov = 58;
let cineCooldown = 0;
/** brèche filmée par les plans de profil ou de chantier */
let shotGap: { seg: Segment; side: number } | null = null;
let panoramaFor = -1;
/** coupe franche au départ d'une partie */
let snapCam = false;
/** début de la partie : pas de plan spectaculaire pendant les premières secondes */
let runT0 = 0;

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

function gapSide(seg: Segment): number {
  // la caméra se met du côté opposé à la halte du voyageur
  return seg.passenger ? 1 : seg.id % 2 ? 1 : -1;
}

/** le monument visible devant, s'il y en a un */
function landmarkAhead(): LandmarkEntry | null {
  for (const l of landmarks) if (!l.seen && l.s - s > 60 && l.s - s < 260) return l;
  return null;
}

/** choisit le plan : la jouabilité d'abord, le spectacle quand on a le temps */
function chooseShot(): ShotName {
  if (state === 'title') return 'title';
  if (fall) return 'fall';
  if (grandCam()) return 'grand';
  const lively = prefs.camera !== 'calme' && state === 'playing';
  const cur = director.shot;
  const aventure = run.mode === 'aventure';
  const danger = audio.danger;
  // un plan en cours se termine-t-il ?
  if ((cur === 'edge' || cur === 'flyby') && shotGap) {
    const g = shotGap.seg;
    const camS = cur === 'edge' ? g.s0 + (g.s1 - g.s0) * 0.62 : g.s0;
    const st = buildStart.get(g.id);
    const keep = cur === 'edge'
      ? s < camS - 9 && (!g.built || (st !== undefined && gt - st < 6)) && (g.built || q?.seg === g || doomed === g)
      : director.since < 2.6;
    if (keep && lively) return cur;
    shotGap = null;
    cineCooldown = gt + (cur === 'edge' ? 5 : 12);
  }
  if (cur === 'panorama') {
    if (lively && !q && director.since < 10) return cur;
    cineCooldown = gt + 6;
  }
  if (cur === 'landmark') {
    if (lively && director.since < 6 && danger < 0.3) return cur;
    cineCooldown = gt + 8;
  }
  if (cur === 'travelling') {
    if (lively && director.since < 8 && danger < 0.3) return cur;
    cineCooldown = gt + 7;
  }
  if (!lively || gt - runT0 < 4) return 'follow';
  // suspense : Bouillotte arrive au bord d'une voie incomplète
  if (q && q.seg.s0 - s < 42 && ((aventure && danger > 0.55) || (!aventure && v < 1.5 && q.seg.s0 - s < 8))) {
    shotGap = { seg: q.seg, side: gapSide(q.seg) };
    return 'edge';
  }
  // pont de secours : on regarde le wagon devenir pont
  if (doomed && doomed.s0 - s < 40) {
    shotGap = { seg: doomed, side: gapSide(doomed) };
    return 'edge';
  }
  if (justBuilt && gt - justBuilt.t < 0.3 && gt > cineCooldown) {
    const g = justBuilt.seg;
    const d = g.s0 - s;
    // le pont se construit juste devant : on le filme de profil
    if (d > 6 && d < 34) {
      shotGap = { seg: g, side: gapSide(g) };
      justBuilt = null;
      return 'edge';
    }
    // il se construit loin devant et on a de l'avance : plan sur le chantier
    const next = layout.nextUnbuilt(s);
    const comfy = !q || (next && next.s0 - s > cruiseSpeed(run.difficulty, s) * referenceTime(run.difficulty, s) * 0.9);
    if (d > 50 && d < 150 && comfy && Math.random() < 0.55 && g.style !== 'grand') {
      shotGap = { seg: g, side: gapSide(g) };
      justBuilt = null;
      return 'flyby';
    }
  }
  // contemplation à la frontière d'une région
  const here = layout.at(s);
  if (here?.calm && !q && panoramaFor !== here.id && s > here.s1 - 230 && s < here.s1 - 60) {
    panoramaFor = here.id;
    return 'panorama';
  }
  // dans la Mer des Lanternes : travelling au ras de l'eau, le long du train (et devant les gares)
  if (here?.theme === 'mer' && here.kind === 'island' && gt > cineCooldown && (!q || danger < 0.05)) {
    for (const e of islands.values()) {
      for (const st of e.stations) {
        if (st.s - s > 25 && st.s - s < 70) {
          travelSide = -st.side;
          return 'travelling';
        }
      }
    }
    if (gt > nextTravelAt) {
      nextTravelAt = gt + 18 + Math.random() * 10;
      travelSide = Math.random() < 0.5 ? -1 : 1;
      return 'travelling';
    }
  }
  // un monument se dévoile
  const lm = landmarkAhead();
  if (lm && gt > cineCooldown && (!q || danger < 0.05)) {
    lm.seen = true;
    landmarkShot = lm;
    return 'landmark';
  }
  return 'follow';
}
let landmarkShot: LandmarkEntry | null = null;
let travelSide = 1;
let nextTravelAt = 0;

function updateCamera(dt: number): void {
  const portrait = window.innerHeight > window.innerWidth;
  const want = chooseShot();
  if (want !== director.shot) {
    if (TEST) console.log(`[T] plan ${want} à ${Math.round(s)} m, danger ${audio.danger.toFixed(2)}`);
    const dur: Partial<Record<ShotName, number>> = { edge: 1.3, flyby: 1.1, panorama: 2.4, landmark: 2.2, grand: 1.8, fall: 0.9, follow: 1.6, travelling: 2 };
    director.go(want, dur[want] ?? 1.4, want === 'fall' || want === 'title' ? 0 : 2.5);
  }
  const f = path.frame(Math.max(0, s - 3));
  const pose = director.update({
    t: gt, dt, s, v, path, portrait, life: prefs.camera === 'calme' ? 0.25 : 1, danger: audio.danger,
    boiling: run.boiling(gt) && state === 'playing',
    gap: shotGap ? { s0: shotGap.seg.s0, s1: shotGap.seg.s1, side: shotGap.side } : { s0: s, s1: s + 20, side: here() },
    grand: grandCam() ?? undefined,
    landmark: landmarkShot ? { center: landmarkShot.center, height: landmarkShot.height } : undefined,
    forced: fall ? fall.camera(dt) : undefined,
    side: travelSide,
  });
  // un léger lissage par-dessus les fondus de la réalisatrice
  const follow = director.shot === 'follow' || director.shot === 'title';
  const k = snapCam ? 1 : 1 - Math.exp(-dt * (follow ? 3.2 : 7));
  camPos.lerp(pose.pos, k);
  camLook.lerp(pose.look, snapCam ? 1 : 1 - Math.exp(-dt * (follow ? 5 : 8)));
  if (snapCam) fov = pose.fov;
  snapCam = false;
  fov += (pose.fov - fov) * Math.min(1, dt * 2);
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    shake = Math.max(0, shake - dt * 1.2);
  }
  camera.lookAt(camLook);
  if (state === 'playing') camera.rotateZ(pose.roll);
  void f;
  camera.fov = fov;
  // bandes de cinéma pendant les grands plans sans calcul
  document.body.classList.toggle('cine', director.shot === 'panorama' || director.shot === 'landmark' || director.shot === 'fall' || director.shot === 'travelling');
  // décale le cadrage pour que le pavé ne cache pas le train (sauf pendant la chute)
  const w = window.innerWidth, h = window.innerHeight;
  const inset = director.shot === 'fall' ? { right: 0, bottom: 0 } : ui.padInset();
  const pr = inset.right * 0.85, pb = inset.bottom * 0.85;
  camera.aspect = (w + pr) / (h + pb);
  if (pr || pb) camera.setViewOffset(w + pr, h + pb, pr, pb, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

/** côté du panorama : celui où la voie tourne (on voit la courbe et le paysage) */
function here(): number {
  return path.curv(s + 40) > 0 ? -1 : 1;
}

// ------------------------------------------------------------------ effets continus

const chimney = new THREE.Vector3();
const trainVel = new THREE.Vector3();
const steamTint = new THREE.Color();
let nextFlockAt = 12;
const lifeFx = {
  sparks: (p: THREE.Vector3, n: number) => fx.sparks(p, n),
  stars: (p: THREE.Vector3, n: number) => fx.stars(p, n),
  zzz: (p: THREE.Vector3) => fx.zzz(p),
};

function emitAll(list: Emitter[], dt: number): void {
  for (const e of list) {
    if (e.kind === 'light') continue;
    const d2 = e.p.distanceToSquared(camera.position);
    if (d2 > 160 * 160) continue;
    const rate = e.kind === 'smoke' ? 2.2 : e.kind === 'spore' ? 3 : 1;
    if (Math.random() > dt * rate * fx.density) continue;
    if (e.kind === 'smoke') fx.smoke(e.p);
    else if (e.kind === 'spore') fx.spore(e.p);
    else fx.zzz(e.p);
  }
}

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
  // front de construction : gerbes d'étincelles, étoiles qui montent du vide, « clac » final
  for (let i = activeBuilds.length - 1; i >= 0; i--) {
    const b = activeBuilds[i];
    const speed = b.seg.style === 'grand' ? 38 : 55;
    const front = b.seg.s0 + (gt - b.start - FLIGHT * 0.6) * speed;
    if (front > b.seg.s1 + 2) {
      activeBuilds.splice(i, 1);
      if (state === 'playing' || state === 'title') {
        fx.sparks(path.point(b.seg.s1, tmpV).clone().add(new THREE.Vector3(0, 0.4, 0)), 10, b.rainbow);
        if (state === 'playing' && !b.seg.rescue) audio.lock();
      }
      continue;
    }
    if (front > b.seg.s0 && Math.random() < 0.8 * fx.density) {
      fx.sparks(path.point(front, tmpV).clone().add(new THREE.Vector3(0, 0.3, 0)), 2, b.rainbow);
      if (Math.random() < (b.seg.style === 'grand' ? 0.3 : 0.15)) fx.stars(path.point(front, tmpV).clone().add(new THREE.Vector3(0, -3, 0)), 1);
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
  // le monde vivant : habitants, cheminées, spores, monuments
  const trainPos = train.loco.root.position;
  for (const e of islands.values()) {
    for (const vg of e.life) if (vg.group.position.distanceToSquared(camera.position) < 200 * 200) vg.update(gt, dt, trainPos, lifeFx);
    emitAll(e.emit, dt);
  }
  for (const l of landmarks) emitAll(l.emit, dt * 3);
  // les gares : la cloche sonne au passage, le nom s'affiche
  if (state === 'playing') {
    for (const e of islands.values()) {
      for (const st of e.stations) {
        if (!st.rung && s > st.s - 14 && s < st.s + 20) {
          st.rung = true;
          audio.bell();
          ui.showBanner(`🔔 ${st.name}`, 'station', 2600);
          if (TEST) console.log(`[T] gare ${st.name} à ${Math.round(s)} m`);
        }
      }
    }
  }
  // sillage : la locomotive fend l'eau des bassins
  const seg = layout.at(s);
  if (seg?.theme === 'mer' && seg.kind === 'island' && v > 1.5 && (state === 'playing' || state === 'title')) {
    wakeAcc += dt * (4 + v * 0.8) * fx.density;
    while (wakeAcc > 1) {
      wakeAcc--;
      const side = Math.random() < 0.5 ? -1 : 1;
      const p = train.loco.root.localToWorld(tmpV.set(side * 1.05, 0.05, -2.6 + Math.random() * 5));
      fx.splash(p, path.frame(s).right.clone().multiplyScalar(side), v);
    }
  }
  // volées qui traversent le ciel de temps en temps
  if ((state === 'playing' || state === 'title') && !flock.active && gt > nextFlockAt) {
    const f = path.frame(s);
    flock.launch(regions.def(regions.rankAt(s + 100)), f.pos, f.fwd, f.right, Math.random);
    nextFlockAt = gt + 22 + Math.random() * 20;
  }
  flock.update(dt, gt);
  const wf = path.frame(s);
  whale.update(dt, gt, wf.pos, wf.fwd, wf.right, state === 'playing' || state === 'title');
  if (whale.active && whale.spout && Math.random() < 0.5) fx.spout(whale.blowhole(tmpV).clone());
  fx.update(dt);
  debris.update(dt);
}

// ------------------------------------------------------------------ eau

const lightList: Array<{ p: THREE.Vector3; d: number }> = [];
const lampPos = new THREE.Vector3();
const deepTeal = new THREE.Color(0x1e5a70);

/** l'eau des bassins reflète le ciel et les lanternes les plus proches */
function updateWater(rainAmount: number, dream: number): void {
  const u = waterMat.uniforms;
  u.uTime.value = gt;
  u.uCam.value.copy(camera.position);
  u.uTop.value.copy(sky.amb.top);
  u.uHorizon.value.copy(sky.amb.horizon);
  u.uSun.value.copy(sky.amb.sun);
  u.uSunDir.value.copy(sky.sunDir);
  u.uFog.value.copy(sky.fog.color);
  u.uFogNear.value = sky.fog.near;
  u.uFogFar.value = sky.fog.far;
  u.uDeep.value.copy(sky.amb.top).lerp(deepTeal, 0.6).multiplyScalar(0.75);
  u.uRain.value = rainAmount;
  if (dream < 0.01 && bgLights.length === 0) {
    u.uNL.value = 0;
    return;
  }
  lightList.length = 0;
  const cam = camera.position;
  const consider = (p: THREE.Vector3) => {
    const d = p.distanceToSquared(cam);
    if (d < 230 * 230) lightList.push({ p, d });
  };
  for (const e of islands.values()) {
    for (const p of e.lights) consider(p);
    for (const vg of e.life) if (vg.light) consider(vg.light.getWorldPosition(new THREE.Vector3()));
  }
  for (const p of bgLights) consider(p);
  for (const l of landmarks) for (const p of l.lights) consider(p);
  // la lanterne avant de Bouillotte
  if (!fall) consider(train.loco.root.localToWorld(lampPos.set(0, 1.85, -3)));
  lightList.sort((a, b) => a.d - b.d);
  const n = Math.min(QUALITY[quality].lights, lightList.length, MAX_LIGHTS);
  const arr = u.uLights.value as THREE.Vector4[];
  for (let i = 0; i < n; i++) arr[i].set(lightList[i].p.x, 2.5, lightList[i].p.z, 1);
  u.uNL.value = n;
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
  const raw = Math.min(0.05, (nowMs - lastT) / 1000) * TIME;
  lastT = nowMs;
  // ralenti pendant la bascule de la chute
  const dt = state === 'paused' ? 0 : raw * (fall ? fall.timeScale : 1);
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
  } else if ((state === 'falling' || state === 'over') && fall) {
    fall.update(raw, gt);
    if (fall.done && state === 'falling') endRun();
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
  ambienceAt(regions, s, ambience);
  sky.update(ambience, regions.altitude(s), camera.position, path.heading(s), gt);
  const mix = regions.mix(s);
  motes.update(gt, camera.position, mix.a, mix.b, mix.t);
  const rainAmount = mix.a.rain + (mix.b.rain - mix.a.rain) * mix.t;
  rain.update(gt, camera.position, state === 'title' ? rainAmount * 0.5 : rainAmount);
  const dream = (mix.a.key === 'mer' ? 1 - mix.t : 0) + (mix.b.key === 'mer' ? mix.t : 0);
  audio.rain = rainAmount * (state === 'playing' || state === 'title' ? 1 : 0.5);
  audio.dream = dream;
  updateWater(rainAmount, dream);
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
      if (avg > 1 / 42 && gt - lastDowngrade > 4 && quality !== 'basse' && !TEST) {
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
  if (state === 'falling' && (k === 'Enter' || k === ' ' || k === 'Escape')) {
    e.preventDefault();
    skipFall();
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
window.addEventListener('pointerdown', () => {
  audio.unlock();
  skipFall();
}, { passive: true });

// ------------------------------------------------------------------ démarrage

applyQuality();
syncWorld(0);
ensureIslands(0, 12);
frame();

// accès pour les tests automatisés (en développement, ou avec ?test)
if (TEST) {
  (window as unknown as Record<string, unknown>).__multirail = {
    get state() { return state; },
    get s() { return s; },
    get v() { return v; },
    get shot() { return director.shot; },
    get landmark() { return landmarkShot ? { s: Math.round(landmarkShot.s), c: landmarkShot.center.toArray().map(Math.round), h: landmarkShot.height, k: landmarkShot.k } : null; },
    get cam() { const r = (x: THREE.Vector3) => x.toArray().map((n) => Math.round(n)); return { cam: r(camera.position), train: r(train.loco.root.position), look: r(camLook) }; },
    get region() { const d = regions.def(regions.rankAt(s)); return { rank: regions.rankAt(s), key: d.key, name: d.name, altitude: Math.round(regions.altitude(s)) }; },
    get question() { return q ? { a: q.fact.a, b: q.fact.b, entry: q.entry, cracks: q.cracks, key: factKey(q.fact.a, q.fact.b) } : null; },
    get run() { return { score: run.score, combo: run.combo, wagons: run.wagons, correct: run.correct, wrong: run.wrong, timeouts: run.timeouts, saved: run.saved }; },
    get quality() { return quality; },
    get fps() { return frameN ? frameN / frameAcc : 0; },
    get fall() { return fall ? { phase: fall.phase, t: +fall.t.toFixed(2), y: +train.loco.root.position.y.toFixed(1), sea: +sky.seaY.toFixed(1) } : null; },
    info: () => ({ renderer: renderer.info.render, memory: renderer.info.memory, segments: layout.segments.length, islands: islands.size, bg: bgIslands.length, landmarks: landmarks.length }),
    setQuality: (qn: QName) => { quality = qn; applyQuality(); },
    segs: () => layout.segments.map((g) => ({ kind: g.kind, s0: Math.round(g.s0), s1: Math.round(g.s1), built: g.built, style: g.style, passenger: g.passenger, calm: g.calm })),
    regions: () => regions.starts.slice(0, 10).map((st, i) => ({ s: Math.round(st), key: REGIONS[regions.order[i]].key })),
    start: () => startRun(),
    /** plus aucun wagon : la prochaine brèche ratée sera la dernière */
    lose: () => {
      run.wagons = 0;
      for (const c of [...train.cars]) {
        train.detachLast();
        c.root.removeFromParent();
      }
      lostFriends = 3;
      ui.setWagons(0, false);
    },
    camera: (c: 'vivante' | 'calme') => { prefs.camera = c; },
    water: waterMat,
    project: (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).project(camera).toArray().map((n) => +n.toFixed(2)),
    lms: () => landmarks.map((l) => ({ k: l.k, key: regions.def(l.k).key, s: Math.round(l.s), c: l.center.toArray().map(Math.round), r: Math.round(l.mesh.geometry.boundingSphere?.radius ?? 0), tris: l.mesh.geometry.getAttribute('position').count / 3 })),
  };
}
