// Voie ferrée : rails posés sur les îles, ponts qui se construisent pièce par pièce au-dessus du vide.
// Chaque pièce (traverse, tronçon de rail, poutre, lanterne…) vole jusqu'à sa place dans le vertex shader :
// des centaines de pièces animées sans aucun calcul côté processeur.
import * as THREE from 'three';
import { prim } from './geo';
import { mulberry32 } from './model';
import type { Segment, TrackPath, Frame } from './track';

export const GAUGE = 0.75;
const SLEEPER_STEP = 1.25;
export const FLIGHT = 0.62;

class PieceBuilder {
  pos: number[] = [];
  col: number[] = [];
  pivot: number[] = [];
  fly: number[] = [];
  axis: number[] = [];
  wob: number[] = [];
  private v = new THREE.Vector3();
  private c = new THREE.Color();

  add(name: string, m: THREE.Matrix4, color: number | THREE.Color, scatter: THREE.Vector3, delay: number, wob = 0, axis?: THREE.Vector3): void {
    const g = prim(name);
    const p = g.getAttribute('position');
    const piv = new THREE.Vector3().setFromMatrixPosition(m);
    const ax = axis ?? new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    typeof color === 'number' ? this.c.set(color) : this.c.copy(color);
    for (let i = 0; i < p.count; i++) {
      this.v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      const j = 1 + (((i / 3) | 0) % 3 - 1) * 0.04;
      this.col.push(this.c.r * j, this.c.g * j, this.c.b * j);
      this.pivot.push(piv.x, piv.y, piv.z);
      this.fly.push(scatter.x, scatter.y, scatter.z, delay);
      this.axis.push(ax.x, ax.y, ax.z);
      this.wob.push(wob);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.pivot, 3));
    g.setAttribute('aFly', new THREE.Float32BufferAttribute(this.fly, 4));
    g.setAttribute('aAxis', new THREE.Float32BufferAttribute(this.axis, 3));
    g.setAttribute('aWob', new THREE.Float32BufferAttribute(this.wob, 1));
    g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius += 60;
    return g;
  }
}

export interface PieceUniforms {
  uTime: { value: number };
  uStart: { value: number };
  uRainbow: { value: number };
  uTrain: { value: THREE.Vector3 };
  uNight: { value: number };
}

function makePieceMaterial(shared: { uTime: { value: number }; uTrain: { value: THREE.Vector3 }; uNight: { value: number } }, start: number): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const u: PieceUniforms = { uTime: shared.uTime, uTrain: shared.uTrain, uNight: shared.uNight, uStart: { value: start }, uRainbow: { value: 0 } };
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aPivot; attribute vec4 aFly; attribute vec3 aAxis; attribute float aWob;
        uniform float uTime, uStart, uRainbow; uniform vec3 uTrain;
        varying float vFlash; varying vec3 vRain;
        vec3 rotK(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1. - c); }`,
      )
      .replace(
        '#include <begin_vertex>',
        `float since = uTime - uStart - aFly.w;
        float t = clamp(since / ${FLIGHT.toFixed(3)}, 0., 1.);
        float tm = t - 1.;
        float e = 1. + 2.4 * tm * tm * tm + 1.4 * tm * tm;
        vec3 local = rotK(position - aPivot, aAxis, (1. - t) * (1. - t) * 8.) * (t <= 0. ? 0. : mix(.25, 1., e));
        vec3 off = aFly.xyz * (1. - e);
        // les pièces montent en tourbillon autour de leur place, chacune dans un sens
        float sw = (1. - e) * 2.6 * (fract(aPivot.x * .13 + aPivot.z * .07) > .5 ? 1. : -1.);
        off.xz = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * off.xz;
        if (aWob > 0.) {
          float d = distance(aPivot, uTrain);
          off.y += aWob * (sin(uTime * 3. + aPivot.x * .7 + aPivot.z) * .05 - exp(-d * d / 30.) * (.18 + sin(uTime * 30. + aPivot.z) * .05));
        }
        vec3 transformed = aPivot + local + off;
        vFlash = since < 0. ? 0. : (t < 1. ? .5 + t * .5 : exp(-(since - ${FLIGHT.toFixed(3)}) * 4.));
        float hue = aPivot.x * .05 + aPivot.z * .05 + uTime * .5;
        vRain = .5 + .5 * cos(6.2831 * (hue + vec3(0., .33, .67)));`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash; varying vec3 vRain; uniform float uRainbow; uniform float uNight;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vRain, uRainbow * .55);')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += (diffuseColor.rgb * .8 + vec3(1., .85, .5)) * vFlash * .9 + diffuseColor.rgb * uRainbow * .25;',
      );
  };
  return mat;
}

/** plan holographique d'une brèche : pointillés lumineux qui disparaissent quand les pièces arrivent */
function makeGhostMaterial(shared: { uTime: { value: number } }, start: { value: number }, danger: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: shared.uTime, uStart: start, uDanger: danger },
    vertexShader: /* glsl */ `
      attribute float aS; attribute float aDelay;
      varying float vS; varying float vGone;
      uniform float uTime, uStart;
      void main(){
        vS = aS;
        vGone = step(0., uTime - uStart - aDelay);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uDanger;
      varying float vS; varying float vGone;
      void main(){
        if (vGone > .5) discard;
        float dash = step(.45, fract(vS * .5 - uTime * 1.6));
        float pulse = .55 + .45 * sin(uTime * (4. + uDanger * 10.) - vS * .3);
        vec3 calm = vec3(.55, .95, 1.);
        vec3 alarm = vec3(1., .35, .3);
        vec3 col = mix(calm, alarm, uDanger);
        gl_FragColor = vec4(col * (.6 + dash * 1.1) * pulse * 1.4, 1.);
        #include <colorspace_fragment>
      }`,
  });
}

export interface RailEntry {
  seg: Segment;
  mesh: THREE.Mesh;
  ghost?: THREE.Mesh;
  ghostStart?: { value: number };
  danger?: { value: number };
}

const RIGHT = new THREE.Vector3();
const basis = new THREE.Matrix4();
const scaleM = new THREE.Matrix4();

/** matrice d'une pièce orientée selon la voie */
function pieceMatrix(f: Frame, lat: number, up: number, along: number, sx: number, sy: number, sz: number, extra?: THREE.Matrix4): THREE.Matrix4 {
  const back = f.fwd.clone().negate();
  basis.makeBasis(f.right, f.up, back);
  const p = f.pos.clone().addScaledVector(f.right, lat).addScaledVector(f.up, up).addScaledVector(f.fwd, along);
  basis.setPosition(p);
  scaleM.makeScale(sx, sy, sz);
  const m = basis.clone().multiply(scaleM);
  if (extra) m.multiply(extra);
  return m;
}

export class RailSystem {
  readonly group = new THREE.Group();
  readonly entries = new Map<number, RailEntry>();
  readonly shared = { uTime: { value: 0 }, uTrain: { value: new THREE.Vector3() }, uNight: { value: 0 } };
  private frame: Frame = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), bank: 0 };

  constructor(private path: TrackPath) {}

  private f(s: number): Frame {
    // repère neuf à chaque appel : les pièces gardent leurs vecteurs
    return this.path.frame(s);
  }

  add(seg: Segment): void {
    if (this.entries.has(seg.id)) return;
    const entry: RailEntry = { seg, mesh: this.buildMesh(seg, seg.kind === 'island' ? -1e6 : 1e9) };
    if (seg.kind === 'gap') {
      entry.ghostStart = (entry.mesh.material as THREE.MeshLambertMaterial).userData.u.uStart;
      entry.danger = { value: 0 };
      entry.ghost = this.buildGhost(seg, entry.ghostStart!, entry.danger);
      this.group.add(entry.ghost);
    }
    this.group.add(entry.mesh);
    this.entries.set(seg.id, entry);
  }

  remove(seg: Segment): void {
    const e = this.entries.get(seg.id);
    if (!e) return;
    for (const m of [e.mesh, e.ghost]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.entries.delete(seg.id);
  }

  /** lance la construction : les pièces surgissent du vide */
  build(seg: Segment, now: number, rainbow: boolean): void {
    const e = this.entries.get(seg.id);
    if (!e) return;
    const u = (e.mesh.material as THREE.MeshLambertMaterial).userData.u as PieceUniforms;
    u.uStart.value = now;
    u.uRainbow.value = rainbow ? 1 : 0;
  }

  /** pont de secours : un wagon se démonte et ses planches filent vers la brèche */
  buildRescue(seg: Segment, now: number, from: THREE.Vector3): void {
    const old = this.entries.get(seg.id);
    if (old) this.remove(seg);
    const mesh = this.buildMesh(seg, now, from);
    this.group.add(mesh);
    this.entries.set(seg.id, { seg, mesh });
  }

  setDanger(seg: Segment, v: number): void {
    const e = this.entries.get(seg.id);
    if (e?.danger) e.danger.value = v;
  }

  /** durée totale de construction d'une brèche (s) */
  static buildDuration(seg: Segment): number {
    return (seg.s1 - seg.s0) / buildSpeed(seg) + FLIGHT + 0.35;
  }

  private buildMesh(seg: Segment, start: number, rescueFrom?: THREE.Vector3): THREE.Mesh {
    const b = new PieceBuilder();
    const r = mulberry32(seg.id * 7919 + (rescueFrom ? 3 : 0));
    const len = seg.s1 - seg.s0;
    const n = Math.max(2, Math.round(len / SLEEPER_STEP));
    const step = len / n;
    const speed = buildSpeed(seg);
    const zero = new THREE.Vector3();
    const scatter = (p: THREE.Vector3): THREE.Vector3 => {
      if (seg.kind === 'island') return zero;
      if (rescueFrom) return rescueFrom.clone().sub(p).add(new THREE.Vector3((r() - 0.5) * 2, 2 + r() * 3, (r() - 0.5) * 2));
      return new THREE.Vector3((r() - 0.5) * 34, -22 - r() * 34, (r() - 0.5) * 18);
    };
    const delayAt = (s: number, jitter = 0.12) => (seg.kind === 'island' ? 0 : (s - seg.s0) / speed + r() * jitter);
    const island = seg.kind === 'island';
    const rescue = !!rescueFrom;
    const sleeperC = island ? 0x6e4a3e : rescue ? 0x9a7a5c : seg.style === 'grand' ? 0xf4e3c3 : 0xe9b56f;
    const railC = island ? 0x8d8aa8 : rescue ? 0x6b5a4a : 0xffcf5c;

    for (let i = 0; i < n; i++) {
      const s = seg.s0 + (i + 0.5) * step;
      const f = this.f(s);
      const d = delayAt(s);
      const wob = rescue ? 1 : 0;
      if (rescue) {
        // planches de travers, un peu de guingois
        const m = pieceMatrix(f, (r() - 0.5) * 0.3, -0.08, 0, 2.3 + r() * 0.5, 0.12, 0.5 + r() * 0.2, new THREE.Matrix4().makeRotationY((r() - 0.5) * 0.25));
        b.add('box', m, r() < 0.3 ? 0x7d6048 : sleeperC, scatter(f.pos), d, wob);
      } else {
        b.add('box', pieceMatrix(f, 0, -0.06, 0, 2.3, 0.16, 0.4), sleeperC, scatter(f.pos), d);
      }
      for (const side of [-1, 1]) {
        const m = pieceMatrix(f, side * GAUGE, 0.06, 0, rescue ? 0.09 : 0.12, rescue ? 0.12 : 0.16, step * 1.02);
        b.add('box', m, railC, scatter(f.pos), d + 0.04, wob);
      }
      if (island) {
        // ballast sous la voie
        b.add('box', pieceMatrix(f, 0, -0.3, 0, 3.1, 0.3, step * 1.02), 0xb7a99a, zero, 0);
        continue;
      }
      if (rescue) {
        if (i % 2 === 0) for (const side of [-1, 1]) b.add('box', pieceMatrix(f, side * 1.25, 0.5, 0, 0.05, 0.05, step * 2.1), 0x4a3a30, scatter(f.pos), d + 0.1, wob);
        continue;
      }
      // longerons latéraux
      for (const side of [-1, 1]) b.add('box', pieceMatrix(f, side * 1.2, -0.25, 0, 0.22, 0.3, step * 1.02), seg.style === 'grand' ? 0xd8c7ff : 0xff9fb8, scatter(f.pos), d + 0.08);
      // lanternes de part et d'autre
      if (i % 7 === 3) {
        const side = (i / 7) % 2 < 1 ? -1 : 1;
        b.add('cyl6', pieceMatrix(f, side * 1.35, 0.9, 0, 0.06, 1.8, 0.06), 0x4a3f66, scatter(f.pos), d + 0.15);
        b.add('ico', pieceMatrix(f, side * 1.35, 1.95, 0, 0.26, 0.3, 0.26), 0xfff0a0, scatter(f.pos), d + 0.2);
      }
    }

    if (!island && !rescue) {
      if (seg.style === 'grand') this.grandArch(b, seg, scatter, delayAt, r);
      else this.candyArch(b, seg, scatter, delayAt, r);
    }

    const mesh = new THREE.Mesh(b.geometry(), makePieceMaterial(this.shared, start));
    mesh.frustumCulled = !island ? false : true;
    return mesh;
  }

  /** pont ordinaire : arche dragée sous le tablier, suspentes et pompons */
  private candyArch(b: PieceBuilder, seg: Segment, scatter: (p: THREE.Vector3) => THREE.Vector3, delayAt: (s: number) => number, r: () => number): void {
    const len = seg.s1 - seg.s0;
    const k = Math.max(8, Math.round(len / 2.2));
    const sag = Math.min(9, len * 0.2);
    const colors = [0x9ff0d8, 0xffc4dc, 0xfff1b8, 0xc9b8ff];
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= k; i++) {
      const t = i / k;
      const s = seg.s0 + len * t;
      const f = this.f(s);
      const y = -0.6 - Math.sin(Math.PI * t) * sag;
      for (const side of [-1, 1]) {
        const p = f.pos.clone().addScaledVector(f.right, side * 1.15).addScaledVector(f.up, y);
        if (prev && side === 1) {
          // poutre d'arche entre deux points successifs
          const mid = p.clone().add(prev).multiplyScalar(0.5);
          const dir = p.clone().sub(prev);
          const L = dir.length();
          for (const sd of [-1, 1]) {
            const mm = mid.clone().addScaledVector(f.right, sd === 1 ? 0 : -2.3);
            const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, f.up);
            m.scale(new THREE.Vector3(0.32, 0.32, L * 1.05)).setPosition(mm);
            b.add('box', m, colors[i % colors.length], scatter(mm), delayAt(s) + 0.1);
          }
        }
        if (side === 1) prev = p;
        if (i % 2 === 1 && t > 0.08 && t < 0.92) {
          // suspente verticale jusqu'au tablier
          const h = -y - 0.4;
          b.add('cyl6', pieceMatrix(f, side * 1.15, y + h / 2, 0, 0.07, h, 0.07), 0xffffff, scatter(f.pos), delayAt(s) + 0.18);
        }
      }
      if (i % 3 === 0 && t > 0.1 && t < 0.9) {
        b.add('ico', pieceMatrix(f, 0, y - 0.7, 0, 0.55, 0.55, 0.55), colors[(i + 1) % colors.length], scatter(f.pos), delayAt(s) + 0.22);
      }
    }
    void r;
  }

  /** grand pont : arche de pierre claire, clé de voûte en cristal, pile qui plonge dans les nuages */
  private grandArch(b: PieceBuilder, seg: Segment, scatter: (p: THREE.Vector3) => THREE.Vector3, delayAt: (s: number) => number, r: () => number): void {
    const len = seg.s1 - seg.s0;
    const k = Math.round(len / 1.6);
    const rise = 7;
    for (let i = 0; i <= k; i++) {
      const t = i / k;
      const s = seg.s0 + len * t;
      const f = this.f(s);
      // voûte en pierres, épaisse aux appuis
      const y = -1.1 - (1 - Math.sin(Math.PI * t)) * rise;
      const thick = 1 + (1 - Math.sin(Math.PI * t)) * 1.4;
      const stone = i % 2 === 0 ? 0xfff6ea : 0xe8dcff;
      b.add('box', pieceMatrix(f, 0, y - thick / 2 + 0.4, 0, 2.6, thick + 0.6, (len / k) * 1.25), stone, scatter(f.pos), delayAt(s) + 0.1);
      if (Math.abs(t - 0.5) < 0.04) {
        b.add('cone6', pieceMatrix(f, 0, y - 1.2, 0, 1.1, 2.6, 1.1, new THREE.Matrix4().makeRotationX(Math.PI)), 0x9ff3ff, scatter(f.pos), delayAt(s) + 0.3);
      }
      // parapets à créneaux
      if (i % 2 === 0) for (const side of [-1, 1]) b.add('box', pieceMatrix(f, side * 1.32, 0.35, 0, 0.18, 0.7, 1.2), 0xd8c7ff, scatter(f.pos), delayAt(s) + 0.15);
    }
    // pile au bout de la travée (sauf la dernière, qui repose sur l'île)
    if (seg.span < seg.spans - 1) {
      const f = this.f(seg.s1);
      let y = -2;
      for (let j = 0; j < 14; j++) {
        const w = 3.4 - j * 0.12;
        const h = 3.5 + r() * 1.5;
        b.add('box', pieceMatrix(f, 0, y - h / 2, 0, w, h, w * 0.8, new THREE.Matrix4().makeRotationY(j * 0.15)), j % 2 ? 0xf3e6ff : 0xffe9d6, scatter(f.pos), delayAt(seg.s1) + j * 0.05);
        y -= h;
      }
      b.add('ico', pieceMatrix(f, 0, y - 1, 0, 1.6, 2.2, 1.6), 0xb8f4ff, scatter(f.pos), delayAt(seg.s1) + 0.8);
    }
  }

  private buildGhost(seg: Segment, start: { value: number }, danger: { value: number }): THREE.Mesh {
    const pos: number[] = [], aS: number[] = [], aD: number[] = [];
    const len = seg.s1 - seg.s0;
    const n = Math.max(2, Math.round(len / SLEEPER_STEP));
    const step = len / n;
    const speed = buildSpeed(seg);
    const v = new THREE.Vector3();
    const quad = (a: THREE.Vector3, b2: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, s: number) => {
      for (const p of [a, b2, c, a, c, d]) {
        pos.push(p.x, p.y, p.z);
        aS.push(s);
        aD.push((s - seg.s0) / speed);
      }
    };
    for (let i = 0; i < n; i++) {
      const s = seg.s0 + i * step;
      const f = this.f(s);
      const g = this.f(s + step);
      for (const side of [-1, 1]) {
        // filet lumineux à plat à la place de chaque rail
        const a = f.pos.clone().addScaledVector(f.right, side * GAUGE - 0.11);
        const bb = f.pos.clone().addScaledVector(f.right, side * GAUGE + 0.11);
        const c = g.pos.clone().addScaledVector(g.right, side * GAUGE + 0.11);
        const d = g.pos.clone().addScaledVector(g.right, side * GAUGE - 0.11);
        quad(a, bb, c, d, s);
      }
      {
        const a = f.pos.clone().addScaledVector(f.right, -1.15).addScaledVector(f.fwd, -0.09);
        const bb = f.pos.clone().addScaledVector(f.right, 1.15).addScaledVector(f.fwd, -0.04);
        const c = bb.clone().addScaledVector(f.fwd, 0.18);
        const d = a.clone().addScaledVector(f.fwd, 0.18);
        quad(a, bb, c, d, s);
      }
    }
    void v;
    void RIGHT;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
    geo.setAttribute('aDelay', new THREE.Float32BufferAttribute(aD, 1));
    const mesh = new THREE.Mesh(geo, makeGhostMaterial(this.shared, start, danger));
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    return mesh;
  }
}

function buildSpeed(seg: Segment): number {
  return seg.style === 'grand' ? 38 : 55;
}
