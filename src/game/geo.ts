// Assemblage de géométries « low-poly » à couleurs de sommets, fusionnées en un seul maillage.
import * as THREE from 'three';

const prims = new Map<string, THREE.BufferGeometry>();

/** primitives non indexées (facettes nettes), mises en cache */
export function prim(name: string): THREE.BufferGeometry {
  let g = prims.get(name);
  if (g) return g;
  switch (name) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'ico': g = new THREE.IcosahedronGeometry(1, 0); break;
    case 'ico1': g = new THREE.IcosahedronGeometry(1, 1); break;
    case 'cone6': g = new THREE.ConeGeometry(1, 1, 6, 1); break;
    case 'cone8': g = new THREE.ConeGeometry(1, 1, 8, 1); break;
    case 'cyl6': g = new THREE.CylinderGeometry(1, 1, 1, 6, 1); break;
    case 'cyl8': g = new THREE.CylinderGeometry(1, 1, 1, 8, 1); break;
    case 'dodeca': g = new THREE.DodecahedronGeometry(1, 0); break;
    case 'tetra': g = new THREE.TetrahedronGeometry(1, 0); break;
    case 'cap': g = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); break;
    case 'capLo': g = new THREE.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2); break;
    case 'sph': g = new THREE.SphereGeometry(1, 8, 5); break;
    case 'torus': g = new THREE.TorusGeometry(1, 0.22, 5, 14); break;
    case 'cone4': g = new THREE.ConeGeometry(1, 1, 4, 1); break;
    case 'cyl12': g = new THREE.CylinderGeometry(1, 1, 1, 12, 1); break;
    case 'prism': {
      const s = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 0.6)]);
      g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      break;
    }
    default: throw new Error(name);
  }
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  prims.set(name, g);
  return g;
}

/**
 * animation calculée sur la carte graphique, autour d'un pivot (coordonnées du maillage) :
 * 1 rotation continue (param = vitesse rad/s), 2 balancement (param = amplitude rad, ~5 rad/s),
 * 3 flottement le long de l'axe (param = amplitude m), 4 balancement lent (respiration),
 * 5 battement rapide (ailes, marteau)
 */
export interface Anim {
  kind: 1 | 2 | 3 | 4 | 5;
  pivot: THREE.Vector3;
  axis: THREE.Vector3;
  param: number;
}

export class Builder {
  pos: number[] = [];
  col: number[] = [];
  sway: number[] = [];
  glow: number[] = [];
  anim: number[] = [];
  animB: number[] = [];
  hasAnim = false;
  private v = new THREE.Vector3();
  private c = new THREE.Color();

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb = ca, cc = ca, sway = 0, glow = 0): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
    for (let i = 0; i < 3; i++) {
      this.sway.push(sway);
      this.glow.push(glow);
      this.anim.push(0, 0, 0, 0);
      this.animB.push(0, 0, 0, 0);
    }
  }

  /** quadrilatère a-b-c-d (sens trigonométrique vu de face) */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ca: THREE.Color, cb = ca, cc = cb, cd = ca): void {
    this.tri(a, b, c, ca, cb, cc);
    this.tri(a, c, d, ca, cc, cd);
  }

  /** ajoute une primitive transformée ; `sway` > 0 la fait onduler au vent (pondéré par la hauteur locale) */
  add(name: string, m: THREE.Matrix4, color: THREE.Color | number, sway = 0, glow = 0, jitter = 0, anim?: Anim): void {
    if (anim) this.hasAnim = true;
    const g = prim(name);
    const p = g.getAttribute('position');
    const base = typeof color === 'number' ? this.c.set(color) : this.c.copy(color);
    const r0 = base.r, g0 = base.g, b0 = base.b;
    for (let i = 0; i < p.count; i += 3) {
      // une teinte par facette, légèrement variée : effet peint à la main
      const j = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
      for (let k = 0; k < 3; k++) {
        this.v.fromBufferAttribute(p, i + k);
        const local = this.v.y;
        this.v.applyMatrix4(m);
        this.pos.push(this.v.x, this.v.y, this.v.z);
        this.col.push(r0 * j, g0 * j, b0 * j);
        this.sway.push(sway * Math.max(0, local + 0.5));
        this.glow.push(glow);
        if (anim) {
          this.anim.push(anim.pivot.x, anim.pivot.y, anim.pivot.z, anim.kind);
          this.animB.push(anim.axis.x, anim.axis.y, anim.axis.z, anim.param);
        } else {
          this.anim.push(0, 0, 0, 0);
          this.animB.push(0, 0, 0, 0);
        }
      }
    }
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    // toujours présents : un seul programme pour tous les décors
    g.setAttribute('aAnim', new THREE.Float32BufferAttribute(this.hasAnim ? this.anim : new Float32Array(this.pos.length / 3 * 4), 4));
    g.setAttribute('aAnimB', new THREE.Float32BufferAttribute(this.hasAnim ? this.animB : new Float32Array(this.pos.length / 3 * 4), 4));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();

/** matrice position / rotation (yaw, pitch, roll) / échelle */
export function trs(x: number, y: number, z: number, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0): THREE.Matrix4 {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz, 'YXZ'));
  return tmpM.compose(tmpS.set(x, y, z), tmpQ, new THREE.Vector3(sx, sy, sz));
}

/** matériau partagé des décors : couleurs de sommets, vent, lumières de nuit */
export function makeWorldMaterial(uniforms: { uTime: { value: number }; uNight: { value: number } }): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uNight = uniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSway; attribute float aGlow; attribute vec4 aAnim; attribute vec4 aAnimB; varying float vGlow; uniform float uTime;
        vec3 rotK(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1. - c); }`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGlow = aGlow;
        if (aAnim.w > .5) {
          vec3 pv = aAnim.xyz;
          float ph = dot(pv, vec3(.37, .11, .29));
          #ifdef USE_INSTANCING
          ph += instanceMatrix[3].x * .31 + instanceMatrix[3].z * .17;
          #endif
          float k = aAnim.w;
          if (k < 1.5) transformed = pv + rotK(transformed - pv, aAnimB.xyz, uTime * aAnimB.w + ph);
          else if (k < 2.5) transformed = pv + rotK(transformed - pv, aAnimB.xyz, sin(uTime * 5. + ph) * aAnimB.w);
          else if (k < 3.5) transformed += aAnimB.xyz * sin(uTime * 1.7 + ph) * aAnimB.w;
          else if (k < 4.5) transformed = pv + rotK(transformed - pv, aAnimB.xyz, sin(uTime * 1.6 + ph) * aAnimB.w);
          else transformed = pv + rotK(transformed - pv, aAnimB.xyz, sin(uTime * 15. + ph) * aAnimB.w);
        }
        if (aSway > 0.) {
          float ph = uTime * 1.6 + position.x * .13 + position.z * .09;
          transformed.x += sin(ph) * .22 * aSway;
          transformed.z += cos(ph * .8) * .16 * aSway;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow; uniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * (.35 + uNight * 2.6);');
  };
  return mat;
}
