// Îles flottantes : dessus fleuri, dessous en strates de couleurs, cristaux, racines et cascades.
import * as THREE from 'three';
import { Builder } from './geo';
import { mulberry32, type Rng } from './model';
import { hangDecor, placeDecor, type DecorCtx, type Emitter } from './decor';
import type { RegionDef } from './regions';

export interface FrameFn {
  (s: number, pos: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void;
}

export interface IslandSpec {
  s0: number;
  s1: number;
  width: number;
  depth: number;
  /** variante de palette */
  biome: number;
  /** région d'un élément posé à s (le hasard décide près des frontières) */
  region: (s: number, roll: number) => RegionDef;
  seed: number;
  /** couloir libre pour la voie */
  corridor: boolean;
  /** densité des décors (qualité) */
  density: number;
}

export interface IslandResult {
  solid: THREE.BufferGeometry;
  falls: THREE.BufferGeometry | null;
  /** cheminées, champignons à spores… */
  emit: Emitter[];
  /** emplacements libres, à l'écart de la voie, pour les habitants */
  spots: Array<{ p: THREE.Vector3; lat: number; region: RegionDef; s: number }>;
}

const tmpC = new THREE.Color();
function pick(r: Rng, arr: number[]): number {
  return arr[Math.floor(r() * arr.length)];
}

function noise1(r: Rng, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(r());
  return out;
}

function smoothAt(arr: number[], t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 0.9999) * (arr.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return arr[i] + (arr[i + 1] - arr[i]) * u;
}

/** construit une île le long d'un repère (la voie, ou une ligne droite pour les îles lointaines) */
export function buildIsland(frame: FrameFn, spec: IslandSpec): IslandResult {
  const r = mulberry32(spec.seed);
  const len = spec.s1 - spec.s0;
  const home = spec.region(spec.s0 + len / 2, r());
  const biome = home.palettes[spec.biome % home.palettes.length];
  const b = new Builder();
  const emit: Emitter[] = [];
  const spots: IslandResult['spots'] = [];
  const step = Math.max(2.5, len / 60);
  const nS = Math.max(4, Math.ceil(len / step));
  const ACROSS = 10;
  const UNDER = 11;
  const wl = noise1(r, 9).map((v) => 0.75 + v * 0.5);
  const wr = noise1(r, 9).map((v) => 0.75 + v * 0.5);
  const dn = noise1(r, 7).map((v) => 0.6 + v * 0.7);
  const P = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3();
  const rows: THREE.Vector3[][] = [];
  const rowCols: THREE.Color[][] = [];
  const grassA = new THREE.Color(), grassB = new THREE.Color();
  const lip = new THREE.Color(0x9c6b55);
  const strata = biome.rock.map((h) => new THREE.Color(h));
  const tip = new THREE.Color(biome.rock[biome.rock.length - 1]).multiplyScalar(0.7);
  // les îles de la voie s'arrêtent net au bord des brèches : rien ne dépasse sous le bout des rails
  const extra = spec.corridor ? 0.5 : 3;

  for (let i = 0; i <= nS; i++) {
    const t = i / nS;
    const s = spec.s0 - extra + (len + extra * 2) * t;
    frame(s, P, R, U);
    const u = t * 2 - 1;
    const shape = Math.sqrt(Math.max(0, 1 - u * u));
    const W = spec.width * (0.42 + 0.58 * shape);
    const L = W * smoothAt(wl, t);
    const Rr = W * smoothAt(wr, t);
    const D = spec.depth * (0.25 + 0.75 * shape) * smoothAt(dn, t);
    const row: THREE.Vector3[] = [];
    const cols: THREE.Color[] = [];
    // dessus : de gauche à droite, plat dans le couloir de la voie, bosselé ailleurs
    for (let k = 0; k <= ACROSS; k++) {
      const a = k / ACROSS;
      const lat = -L + (L + Rr) * a;
      const edge = Math.min(a, 1 - a) * 2;
      const free = spec.corridor ? THREE.MathUtils.smoothstep(Math.abs(lat), 3.5, 7) : 1;
      const bump = (Math.sin(lat * 0.7 + s * 0.21 + spec.seed) * 0.5 + 0.5) * 1.4 * free * Math.min(1, edge * 3);
      const drop = edge < 0.2 ? (0.2 - edge) * 3 : 0;
      row.push(P.clone().addScaledVector(R, lat).addScaledVector(U, -0.45 + bump - drop));
      grassA.setHex(pick(r, biome.grass));
      cols.push(grassA.clone().lerp(grassB.setHex(biome.grass[0]), 0.4).multiplyScalar(0.92 + r() * 0.12));
    }
    // dessous : du bord droit au bord gauche en passant par la pointe
    for (let k = 1; k < UNDER; k++) {
      const phi = (k / UNDER) * Math.PI;
      const c = Math.cos(phi);
      const w = c >= 0 ? Rr : L;
      const sn = Math.sin(phi);
      const lat = Math.sign(c) * Math.pow(Math.abs(c), 0.85) * w * (1 - 0.15 * sn);
      const y = -1.6 - D * Math.pow(sn, 0.9) - (k === 1 || k === UNDER - 1 ? 0 : (r() - 0.5) * 2.2);
      const v = P.clone().addScaledVector(R, lat + (r() - 0.5) * 1.5).addScaledVector(U, y);
      row.push(v);
      const depthT = THREE.MathUtils.clamp(-y / (D + 2), 0, 1);
      if (k === 1 || k === UNDER - 1) cols.push(lip.clone());
      else {
        const band = Math.floor(depthT * strata.length * 1.6 + Math.sin(lat * 0.3) * 0.4) % strata.length;
        cols.push(strata[band].clone().lerp(tip, depthT * depthT * 0.6).multiplyScalar(0.93 + r() * 0.1));
      }
    }
    rows.push(row);
    rowCols.push(cols);
  }

  const M = rows[0].length;
  for (let i = 0; i < nS; i++) {
    const A = rows[i], B = rows[i + 1], ca = rowCols[i], cb = rowCols[i + 1];
    for (let k = 0; k < M; k++) {
      const k2 = (k + 1) % M;
      b.quad(A[k], A[k2], B[k2], B[k], ca[k], ca[k2], cb[k2], cb[k]);
    }
  }
  // falaises aux deux bouts : éventail autour du centre
  for (const [row, cols, flip] of [[rows[0], rowCols[0], true], [rows[nS], rowCols[nS], false]] as const) {
    const center = new THREE.Vector3();
    for (const v of row) center.add(v);
    center.divideScalar(row.length);
    const cc = strata[1].clone();
    for (let k = 0; k < M; k++) {
      const k2 = (k + 1) % M;
      if (flip) b.tri(center, row[k2], row[k], cc, cols[k2], cols[k]);
      else b.tri(center, row[k], row[k2], cc, cols[k], cols[k2]);
    }
  }

  // ---- décors du dessus
  const area = len * spec.width * 1.3;
  // les îles lointaines, vues de loin, gardent peu de décors
  const nDecor = Math.min(spec.corridor ? 80 : 45, Math.floor((area / 55) * spec.density));
  const placed: THREE.Vector3[] = [];
  for (let n = 0; n < nDecor; n++) {
    const t = 0.04 + r() * 0.92;
    const s = spec.s0 + len * t;
    frame(s, P, R, U);
    const u = t * 2 - 1;
    const W = spec.width * (0.42 + 0.58 * Math.sqrt(1 - u * u)) * 0.78;
    const side = r() < 0.5 ? -1 : 1;
    const minLat = spec.corridor ? 6.5 : 0;
    if (W <= minLat + 1) continue;
    const lat = side * (minLat + r() * (W - minLat));
    const base = P.clone().addScaledVector(R, lat).addScaledVector(U, -0.4);
    // pas deux éléments l'un dans l'autre
    if (placed.some((q) => q.distanceToSquared(base) < 9)) continue;
    placed.push(base);
    const ry = r() * Math.PI * 2;
    const reg = spec.region(s, r());
    const ctx: DecorCtx = { b, r, pal: reg.palettes[spec.biome % reg.palettes.length], emit };
    // un emplacement sur cinq reste libre pour une petite scène vivante
    if (spec.corridor && Math.abs(lat) > 7.5 && Math.abs(lat) < 14 && r() < 0.2) {
      spots.push({ p: base, lat, region: reg, s });
      continue;
    }
    placeDecor(ctx, reg, base, ry, spec.corridor ? Math.abs(lat) : 99);
  }

  // ---- dessous : cristaux et racines suspendus
  const nHang = Math.floor((len / 6) * Math.min(1, spec.density + 0.3));
  for (let n = 0; n < nHang; n++) {
    const t = 0.1 + r() * 0.8;
    const s = spec.s0 + len * t;
    frame(s, P, R, U);
    const u = t * 2 - 1;
    const shape = Math.sqrt(1 - u * u);
    const lat = (r() - 0.5) * spec.width * 0.9 * shape;
    const yy = -2 - spec.depth * shape * (0.3 + r() * 0.4) * (1 - Math.abs(lat) / (spec.width + 1));
    const p = P.clone().addScaledVector(R, lat).addScaledVector(U, yy);
    hangDecor({ b, r, pal: biome, emit }, home.under, p);
  }

  // ---- cascades : rubans d'eau qui tombent du bord dans la mer de nuages
  let falls: THREE.BufferGeometry | null = null;
  const nFalls = len > 50 && home.under !== 'ice' && home.under !== 'brass' && r() < 0.75 ? 1 + Math.floor(r() * 2) : 0;
  if (nFalls) {
    const fp: number[] = [], fu: number[] = [];
    for (let n = 0; n < nFalls; n++) {
      const t = 0.3 + r() * 0.4;
      const s = spec.s0 + len * t;
      frame(s, P, R, U);
      const u = t * 2 - 1;
      const side = r() < 0.5 ? -1 : 1;
      const W = spec.width * (0.42 + 0.58 * Math.sqrt(1 - u * u)) * (side < 0 ? smoothAt(wl, t) : smoothAt(wr, t));
      const top = P.clone().addScaledVector(R, side * (W - 0.3)).addScaledVector(U, -0.5);
      const along = new THREE.Vector3();
      frame(s + 1, along, R, U);
      along.sub(P).normalize();
      const halfW = 1.6 + r() * 1.8;
      const out = R.clone().multiplyScalar(side);
      const H = 70 + r() * 50;
      const a = top.clone().addScaledVector(along, -halfW);
      const c = top.clone().addScaledVector(along, halfW);
      const segs = 6;
      for (let k = 0; k < segs; k++) {
        const v0 = k / segs, v1 = (k + 1) / segs;
        // la chute s'éloigne un peu de la falaise en tombant
        const o0 = out.clone().multiplyScalar(Math.sqrt(v0) * 6 + 0.6);
        const o1 = out.clone().multiplyScalar(Math.sqrt(v1) * 6 + 0.6);
        const p00 = a.clone().add(o0).setY(a.y - v0 * H), p10 = c.clone().add(o0).setY(c.y - v0 * H);
        const p01 = a.clone().add(o1).setY(a.y - v1 * H), p11 = c.clone().add(o1).setY(c.y - v1 * H);
        fp.push(...p00.toArray(), ...p10.toArray(), ...p11.toArray(), ...p00.toArray(), ...p11.toArray(), ...p01.toArray());
        fu.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
      }
      // petit bassin au départ de la cascade
      b.add('cyl8', new THREE.Matrix4().compose(new THREE.Vector3(top.x - out.x * 2.5, top.y + 0.05, top.z - out.z * 2.5), new THREE.Quaternion(), new THREE.Vector3(2.4, 0.15, 2.4)), 0x8fe3ff, 0, 0.3);
    }
    falls = new THREE.BufferGeometry();
    falls.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    falls.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
    falls.computeBoundingSphere();
  }

  return { solid: b.geometry(), falls, emit, spots };
}

/** matériau des cascades : stries qui défilent et fondu vers le bas */
export function makeFallsMaterial(uTime: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime, uTint: { value: new THREE.Color(0xe8fbff) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uTint; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float edge = smoothstep(0., .25, vUv.x) * smoothstep(1., .75, vUv.x);
        float streak = n(vec2(vUv.x * 9., vUv.y * 5. - uTime * 2.2)) * .6 + n(vec2(vUv.x * 23., vUv.y * 12. - uTime * 3.4)) * .4;
        float a = (.35 + streak * .65) * edge * pow(1. - vUv.y, 1.2);
        vec3 col = mix(vec3(.62, .86, 1.), uTint, streak);
        gl_FragColor = vec4(col, a * .85);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** repère droit pour les îles lointaines (sans voie) */
export function straightFrame(center: THREE.Vector3, heading: number): FrameFn {
  const fwd = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
  const right = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
  return (s, pos, r, u) => {
    pos.copy(center).addScaledVector(fwd, s);
    r.copy(right);
    u.set(0, 1, 0);
  };
}

export { tmpC };
