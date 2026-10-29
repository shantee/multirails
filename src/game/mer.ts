// La Mer des Lanternes : des bassins flottants où la voie file au ras de l'eau, à la tombée de la nuit.
// Eau qui reflète le ciel et les lanternes (sans second rendu : tout est calculé dans un seul shader),
// ronds de pluie, pluie en traits, enseignes peintes qui défilent, gares inondées avec leur cloche et
// leurs voyageurs-ombres. Un hommage aux trains rêveurs du cinéma d'animation, avec nos propres décors.
import * as THREE from 'three';
import { Builder, trs, type Anim } from './geo';
import type { Rng } from './model';

// ------------------------------------------------------------------ enseignes

export const SHOP_WORDS = [
  'THÉ', 'BAINS', 'LUNE', 'SOUPE', 'RÊVES', 'OMBRES', 'LANTERNES', 'POISSONS',
  'HORLOGES', 'BONBONS', 'MIROIRS', 'ÉTOILES', 'PARFUMS', 'HÔTEL', 'PLUIE', 'NUAGES',
];
export const STATION_NAMES = [
  'Gare des Lanternes', 'Halte du Marais Bleu', 'Quai des Ombres', 'Gare des Parapluies',
  'Halte de la Lune Basse', 'Gare des Bains', 'Gare des Hameaux', 'Halte des Cloches',
];
const BOARDS = [
  { bg: '#9c2f3a', fg: '#ffe9b8', edge: '#f2c46b' },
  { bg: '#1f5f5a', fg: '#f6f0dc', edge: '#9fe0c8' },
  { bg: '#f3e6c8', fg: '#7a1f2b', edge: '#7a1f2b' },
  { bg: '#2a2f5a', fg: '#ffd27a', edge: '#ffd27a' },
];

const ATLAS = 1024;
interface Rect { x: number; y: number; w: number; h: number }

class SignAtlas {
  readonly canvas = document.createElement('canvas');
  readonly tex: THREE.CanvasTexture;
  readonly mat: THREE.MeshBasicMaterial;

  constructor() {
    this.canvas.width = this.canvas.height = ATLAS;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    // éclairées de l'intérieur : elles brillent dans la nuit sans dépendre des lumières de la scène
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, color: 0xd8d0c8 });
    this.draw();
    // la police arrive après coup : on repeint quand elle est prête
    void document.fonts?.load('700 48px "Fredoka Variable"').then(() => this.draw());
  }

  vertical(i: number): Rect {
    return { x: (i % 16) * 64, y: 0, w: 64, h: 512 };
  }

  horizontal(i: number): Rect {
    return { x: (i % 2) * 512, y: 512 + Math.floor((i % 8) / 2) * 128, w: 512, h: 128 };
  }

  private draw(): void {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    const font = (px: number) => `700 ${px}px "Fredoka Variable", "Fredoka", system-ui, sans-serif`;
    SHOP_WORDS.forEach((word, i) => {
      const r = this.vertical(i);
      const c = BOARDS[i % BOARDS.length];
      g.fillStyle = c.bg;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = c.edge;
      g.lineWidth = 4;
      g.strokeRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10);
      const letters = [...word];
      const step = (r.h - 40) / letters.length;
      g.fillStyle = c.fg;
      g.font = font(Math.min(44, step * 0.86));
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      letters.forEach((ch, k) => g.fillText(ch, r.x + r.w / 2, r.y + 20 + step * (k + 0.5)));
    });
    STATION_NAMES.forEach((name, i) => {
      const r = this.horizontal(i);
      g.fillStyle = '#f3e6c8';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = '#2a2f5a';
      g.fillRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
      g.strokeStyle = '#ffd27a';
      g.lineWidth = 3;
      g.strokeRect(r.x + 16, r.y + 16, r.w - 32, r.h - 32);
      g.fillStyle = '#fff4dc';
      g.font = font(name.length > 18 ? 38 : 44);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name, r.x + r.w / 2, r.y + r.h / 2 + 2);
    });
    this.tex.needsUpdate = true;
  }
}

let atlas: SignAtlas | null = null;
export function signAtlas(): SignAtlas {
  atlas ??= new SignAtlas();
  return atlas;
}

/** panneaux texturés (positions + coordonnées dans l'atlas), fusionnés par île */
export class SignBuilder {
  pos: number[] = [];
  uv: number[] = [];

  get empty(): boolean {
    return this.pos.length === 0;
  }

  /** panneau recto verso : centre, axe horizontal et axe vertical (unitaires), taille en mètres */
  board(c: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, w: number, h: number, r: Rect): void {
    const u0 = r.x / ATLAS, u1 = (r.x + r.w) / ATLAS;
    const v0 = 1 - (r.y + r.h) / ATLAS, v1 = 1 - r.y / ATLAS;
    const normal = new THREE.Vector3().crossVectors(right, up).normalize().multiplyScalar(0.03);
    for (const face of [1, -1]) {
      const R = right.clone().multiplyScalar((w / 2) * face);
      const U = up.clone().multiplyScalar(h / 2);
      const o = c.clone().addScaledVector(normal, face);
      const a = o.clone().sub(R).sub(U), b = o.clone().add(R).sub(U), cc = o.clone().add(R).add(U), d = o.clone().sub(R).add(U);
      for (const [p, uu, vv] of [[a, u0, v0], [b, u1, v0], [cc, u1, v1], [a, u0, v0], [cc, u1, v1], [d, u0, v1]] as const) {
        this.pos.push(p.x, p.y, p.z);
        this.uv.push(uu, vv);
      }
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ eau

export const MAX_LIGHTS = 12;

/**
 * eau des bassins : vaguelettes, ronds de pluie, reflet du ciel (Fresnel), traînées dorées sous les lanternes,
 * brume au loin. Les lumières les plus proches sont passées au shader à chaque image.
 */
export function makeWaterMaterial(): THREE.ShaderMaterial {
  const lights = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -1e5, 0, 0));
  return new THREE.ShaderMaterial({
    fog: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uRain: { value: 0 }, uCam: { value: new THREE.Vector3() },
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uDeep: { value: new THREE.Color(0x10203a) },
      uSun: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uFog: { value: new THREE.Color() },
      uFogNear: { value: 100 }, uFogFar: { value: 1000 }, uLights: { value: lights }, uLightCol: { value: new THREE.Color(1, 0.72, 0.38) },
      uNL: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uRain, uFogNear, uFogFar; uniform int uNL;
      uniform vec3 uCam, uTop, uHorizon, uDeep, uSun, uSunDir, uFog, uLightCol;
      uniform vec4 uLights[${MAX_LIGHTS}];
      varying vec3 vW;
      float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      vec2 rings(vec2 p, float scale, float t){
        vec2 q = p / scale;
        vec2 c = floor(q);
        vec2 f = fract(q) - .5 - (vec2(h12(c), h12(c + 7.1)) - .5) * .5;
        float ph = fract(t + h12(c + 3.3));
        float r = length(f) * scale;
        float rad = ph * scale * .45;
        float ring = sin((r - rad) * 34.) * smoothstep(.16, 0., abs(r - rad)) * (1. - ph);
        return normalize(f + 1e-4) * ring;
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // vaguelettes lentes
        vec2 g = vec2(cos(p.x * .31 + t * .9) + cos(dot(p, vec2(.6, .8)) * .53 - t * 1.3) * .7,
                      cos(p.y * .27 - t * .8) + cos(dot(p, vec2(-.7, .5)) * .61 + t * 1.1) * .7) * .035;
        // ronds de pluie
        g += (rings(p, 1.3, t * .9) + rings(p + 17.3, 1.9, t * .7) * .7) * .22 * uRain;
        vec3 n = normalize(vec3(-g.x, 1., -g.y));
        vec3 toCam = uCam - vW;
        float dist = length(toCam);
        vec3 v = toCam / dist;
        vec3 r = reflect(-v, n);
        float fres = .02 + .98 * pow(1. - max(dot(n, v), 0.), 5.);
        // au loin l'horizon doré, plus près le haut du ciel, bleu nuit
        vec3 sky = mix(uHorizon, uTop, pow(clamp(r.y * 1.8 + .02, 0., 1.), .5));
        sky += uSun * pow(max(dot(r, uSunDir), 0.), 120.) * 1.6;
        vec3 col = mix(uDeep, sky, clamp(fres * .95 + .1, 0., 1.));
        // reflet sombre et net des berges lointaines : un léger dégradé vers l'horizon
        col = mix(col, uDeep * .6, smoothstep(.0, .5, 1. - fres) * .25);
        // traînées de lumière des lanternes, étirées vers la caméra et brisées par les vaguelettes
        vec2 vd = normalize(p - uCam.xz);
        vec2 side = vec2(-vd.y, vd.x);
        float wob = (g.x + g.y) * 6.;
        for (int i = 0; i < ${MAX_LIGHTS}; i++) {
          if (i >= uNL) break;
          vec4 L = uLights[i];
          vec2 d = p - L.xz;
          float along = dot(d, vd);
          float lat = dot(d, side) + wob * .35;
          float w = .28 + abs(along) * .03;
          float len = along < 0. ? 3. + L.y * 1.6 : 1.;
          float s = exp(-lat * lat / (w * w)) * exp(-along * along / (len * len));
          col += uLightCol * s * L.w * (.55 + fres);
        }
        float fogF = smoothstep(uFogNear * 1.8, uFogFar, dist) * .9;
        col = mix(col, uFog, fogF);
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ------------------------------------------------------------------ pluie

/** fines traînées de pluie autour de la caméra, entièrement calculées par la carte graphique */
export class Rain {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor(count = 700) {
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uColor: { value: new THREE.Color(0.7, 0.8, 1) } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uAmount; uniform vec3 uCam;
        varying vec2 vUv; varying float vFade;
        void main(){
          float box = 34.;
          vec3 p = aSeed.xyz * box;
          p.y -= uTime * 15. * (.85 + aSeed.w * .3);
          p.x -= uTime * 1.8;
          p = uCam + mod(p - uCam + box * .5, box) - box * .5;
          vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
          vec3 dir = normalize(vec3(-.12, -1., 0.));
          vec3 wp = p + right * position.x * .035 - dir * position.y * (.7 + aSeed.y * .5);
          float d = distance(p, uCam);
          vFade = step(aSeed.w, uAmount) * smoothstep(1.5, 4., d) * (1. - smoothstep(12., 17., d));
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec2 vUv; varying float vFade;
        void main(){
          float a = (1. - abs(vUv.x * 2. - 1.)) * smoothstep(0., .4, vUv.y) * vFade;
          gl_FragColor = vec4(uColor * a * .32, 1.);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  setCount(n: number): void {
    this.mesh.geometry.instanceCount = Math.min(n, (this.mesh.geometry.getAttribute('aSeed') as THREE.InstancedBufferAttribute).count);
  }

  update(time: number, cam: THREE.Vector3, amount: number): void {
    const u = this.mesh.material.uniforms;
    u.uTime.value = time;
    u.uCam.value.copy(cam);
    u.uAmount.value = amount;
    this.mesh.visible = amount > 0.01;
  }
}

// ------------------------------------------------------------------ ombres

let shadowMat: THREE.MeshBasicMaterial | null = null;
/** voyageurs-ombres : silhouettes bleu nuit à demi transparentes */
export function shadowMaterial(): THREE.MeshBasicMaterial {
  shadowMat ??= new THREE.MeshBasicMaterial({ color: 0x1b2448, transparent: true, opacity: 0.62, depthWrite: false });
  return shadowMat;
}

/** une silhouette debout (parfois avec un parapluie ou une petite lanterne) */
export function shadowFigure(b: Builder, p: THREE.Vector3, ry: number, r: Rng, lights?: THREE.Vector3[]): void {
  const h = 1.5 + r() * 0.5;
  b.add('cyl8', trs(p.x, p.y + h * 0.4, p.z, ry, 0.26, h * 0.8, 0.22), 0x000000);
  b.add('sph', trs(p.x, p.y + h * 0.88, p.z, ry, 0.2, 0.22, 0.2), 0x000000);
  const roll = r();
  if (roll < 0.35) {
    b.add('cone8', trs(p.x, p.y + h + 0.45, p.z, ry, 0.75, 0.35, 0.75), 0x000000);
    b.add('cyl6', trs(p.x + 0.12, p.y + h * 0.75, p.z, 0, 0.02, 0.9, 0.02), 0x000000);
  } else if (roll < 0.5 && lights) {
    lights.push(new THREE.Vector3(p.x + 0.3, p.y + h * 0.55, p.z));
  }
}

// ------------------------------------------------------------------ gares

export interface StationInfo {
  s: number;
  name: string;
  side: number;
}

/**
 * gare au bord de la voie : quai (dans l'eau si `flooded`), auvent, enseigne au nom de la gare, clocheton à cloche,
 * lanternes et voyageurs-ombres qui attendent. Tout est posé dans le repère de la voie à la distance s.
 */
export function buildStation(
  b: Builder, signs: SignBuilder, shadows: Builder, lights: THREE.Vector3[],
  F: { pos: THREE.Vector3; fwd: THREE.Vector3; right: THREE.Vector3 }, side: number, flooded: boolean, nameIdx: number, r: Rng,
): void {
  const fwd = F.fwd.clone().setY(0).normalize();
  const right = F.right.clone().setY(0).normalize().multiplyScalar(side);
  const at = (along: number, lat: number, up: number) => F.pos.clone().addScaledVector(fwd, along).addScaledVector(right, lat).add(new THREE.Vector3(0, up, 0));
  const ry = Math.atan2(fwd.x, fwd.z);
  const box = (p: THREE.Vector3, sx: number, sy: number, sz: number, color: number, glow = 0, anim?: Anim) =>
    b.add('box', trs(p.x, p.y, p.z, ry, sx, sy, sz), color, 0, glow, 0, anim);
  const L = 22;
  const deck = flooded ? -0.25 : 0.05;
  // quai en pierre (un peu sous l'eau quand la gare est inondée)
  // (sur la terre ferme, le quai s'enfonce assez pour ne jamais flotter au-dessus des bosses)
  const base = flooded ? 1 : 2.4;
  box(at(0, 5.2, deck - base / 2), 4.4, base, L, 0xb8a890);
  box(at(0, 3.1, deck), 0.3, 0.12, L, 0xe8d8b0);
  // piliers et auvent
  for (let k = -2; k <= 2; k++) {
    for (const lat of [4.2, 6.8]) b.add('cyl8', trs(...at(k * 4.6, lat, deck + 1.6).toArray() as [number, number, number], ry, 0.14, 3.2, 0.14), 0x6a2430);
  }
  box(at(0, 5.5, deck + 3.3), 4.2, 0.22, L + 1.4, 0x8f2b35);
  box(at(0, 5.5, deck + 3.6), 3.2, 0.5, L + 0.6, 0x2f3f6a);
  b.add('prism', trs(...at(0, 5.5, deck + 3.8).toArray() as [number, number, number], ry + Math.PI / 2, L + 1.8, 1.5, 4.8), 0x2f3f6a);
  // lanternes sous l'auvent
  for (let k = -2; k <= 2; k++) {
    const p = at(k * 4.6 + 2.3, 4.4, deck + 2.75);
    b.add('cyl8', trs(p.x, p.y, p.z, 0, 0.22, 0.42, 0.22), 0xffcf70, 0, 1.6, 0, { kind: 4, pivot: p.clone().add(new THREE.Vector3(0, 0.5, 0)), axis: fwd, param: 0.08 });
    lights.push(p);
  }
  // enseigne au nom de la gare, suspendue face à la voie
  const signC = at(0, 3.6, deck + 2.6);
  signs.board(signC, fwd.clone(), new THREE.Vector3(0, 1, 0), 5.2, 1.3, signAtlas().horizontal(nameIdx));
  box(at(0, 3.62, deck + 3.2), 0.05, 0.6, 0.05, 0x3a3048);
  // clocheton et sa cloche
  const tower = at(L / 2 + 2, 6, 0);
  box(tower.clone().add(new THREE.Vector3(0, 3.5, 0)), 1.8, 7, 1.8, 0xe8dcc0);
  box(tower.clone().add(new THREE.Vector3(0, 7.6, 0)), 2.2, 1.6, 2.2, 0x8f2b35);
  b.add('cone4', trs(tower.x, tower.y + 9.4, tower.z, ry + Math.PI / 4, 1.9, 2.2, 1.9), 0x2f3f6a);
  const pivot = tower.clone().add(new THREE.Vector3(0, 8.2, 0));
  b.add('cone8', trs(tower.x, tower.y + 7.5, tower.z, ry, 0.55, 0.85, 0.55), 0xffcf5c, 0, 0.4, 0, { kind: 4, pivot, axis: fwd, param: 0.45 });
  lights.push(tower.clone().add(new THREE.Vector3(0, 7.6, 0)));
  // voyageurs-ombres sur le quai
  const n = 3 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) shadowFigure(shadows, at((r() - 0.5) * (L - 4), 4.6 + r() * 1.8, deck), ry + Math.PI / 2 * -side + (r() - 0.5) * 0.6, r, lights);
}
