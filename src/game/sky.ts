// Ciel, mer de nuages, nuages en volume et ambiances (de l'aube à la nuit des aurores).
import * as THREE from 'three';

export interface Ambience {
  name: string;
  emoji: string;
  top: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  /** élévation du soleil (radians) et azimut relatif */
  elev: number;
  azim: number;
  cloudLit: THREE.Color;
  cloudShade: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  sunPower: number;
  night: number;
  /** brume : le brouillard se rapproche */
  mist: number;
}

const C = (hex: number) => new THREE.Color(hex);

export const AMBIENCES: Ambience[] = [
  {
    name: "L'Aube rose", emoji: '🌸', top: C(0x7d8fe0), horizon: C(0xffc7c2), sun: C(0xffd6a8), elev: 0.16, azim: 0.6,
    cloudLit: C(0xfff0ea), cloudShade: C(0xc79ad6), hemiSky: C(0xd9c9ff), hemiGround: C(0xf5a89a), sunPower: 2.2, night: 0, mist: 0,
  },
  {
    name: 'Le Grand Ciel', emoji: '☀️', top: C(0x3d8fe8), horizon: C(0xc4ecff), sun: C(0xfff4dc), elev: 0.75, azim: -0.4,
    cloudLit: C(0xffffff), cloudShade: C(0x9fbfe6), hemiSky: C(0xcfe9ff), hemiGround: C(0x9fd6a0), sunPower: 2.6, night: 0, mist: 0,
  },
  {
    name: "L'Heure dorée", emoji: '🍯', top: C(0x5a86d6), horizon: C(0xffd89a), sun: C(0xffc070), elev: 0.28, azim: 0.9,
    cloudLit: C(0xfff1cf), cloudShade: C(0xd59a8a), hemiSky: C(0xffe1b0), hemiGround: C(0xd7a37a), sunPower: 2.5, night: 0, mist: 0,
  },
  {
    name: 'Le Couchant framboise', emoji: '🍓', top: C(0x3c3a8c), horizon: C(0xff7a7a), sun: C(0xff8f5a), elev: 0.07, azim: -0.2,
    cloudLit: C(0xffb6a0), cloudShade: C(0x7b4f9e), hemiSky: C(0xff9fb0), hemiGround: C(0x6e4a8c), sunPower: 2.0, night: 0.25, mist: 0,
  },
  {
    name: 'La Nuit des aurores', emoji: '✨', top: C(0x0b1240), horizon: C(0x3a3f8f), sun: C(0xbfd4ff), elev: 0.55, azim: 0.3,
    cloudLit: C(0x9aa9e6), cloudShade: C(0x2a2766), hemiSky: C(0x6f7fd6), hemiGround: C(0x2b2f6e), sunPower: 0.9, night: 1, mist: 0,
  },
];

export function cloneAmbience(a: Ambience): Ambience {
  return {
    ...a, top: a.top.clone(), horizon: a.horizon.clone(), sun: a.sun.clone(), cloudLit: a.cloudLit.clone(),
    cloudShade: a.cloudShade.clone(), hemiSky: a.hemiSky.clone(), hemiGround: a.hemiGround.clone(),
  };
}

const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for(int i=0;i<5;i++){ v += a*vnoise(p); p = m*p; a *= .5; } return v; }
`;

/** dôme du ciel : dégradé, soleil, cirrus peints, étoiles et aurores la nuit */
function makeSky(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uBelow: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uSun, uSunDir, uBelow; uniform float uNight, uTime;
      varying vec3 vDir;
      ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0., 1.), .55));
        col = mix(col, uBelow, smoothstep(0.02, -0.12, h));
        float sd = max(dot(d, uSunDir), 0.);
        // halo large et chaud autour du soleil, disque net
        col += uSun * (pow(sd, 8.) * .35 + pow(sd, 64.) * .6) * (1. - uNight * .6);
        float disc = smoothstep(.9994 - uNight * .0004, .99975 - uNight*.0003, sd);
        col = mix(col, uSun * (2.4 - uNight * 1.2), disc);
        // cirrus : longues traînées peintes
        vec2 cp = d.xz / max(h + .12, .05);
        float ci = fbm(cp * vec2(.9, 2.6) + vec2(uTime * .006, 0.));
        ci = smoothstep(.55, .85, ci) * smoothstep(.0, .25, h) * (1. - smoothstep(.55, .95, h));
        col = mix(col, mix(uHorizon, vec3(1.), .55) + uSun * .25, ci * .45 * (1. - uNight * .5));
        // étoiles et aurores
        if (uNight > .01) {
          vec2 sp = vec2(atan(d.z, d.x) * 120., h * 240.);
          vec2 cell = floor(sp);
          float r = hash12(cell);
          float star = step(.985, r) * smoothstep(.5, 0., length(fract(sp) - .5)) * (.6 + .4*sin(uTime * 3. + r * 60.));
          col += vec3(star) * uNight * smoothstep(.05, .3, h);
          float a = atan(d.z, d.x);
          float band = fbm(vec2(a * 3. + uTime * .03, h * 2.)) ;
          float curtain = smoothstep(.15, .35, h) * (1. - smoothstep(.45, .8, h));
          float ripple = .5 + .5 * sin(a * 18. + band * 9. + uTime * .4);
          vec3 aur = mix(vec3(.2, 1., .7), vec3(.9, .4, 1.), smoothstep(.25, .6, h));
          col += aur * curtain * ripple * smoothstep(.45, .75, band) * uNight * .55;
        }
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/** mer de nuages moutonnante, éclairée par le soleil, qui se fond dans l'horizon */
function makeCloudSea(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uLit: { value: new THREE.Color() },
      uShade: { value: new THREE.Color() },
      uFog: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLit, uShade, uFog, uSunDir, uCam; uniform float uTime;
      varying vec3 vWorld;
      ${NOISE}
      float field(vec2 p){
        float b = fbm(p * .008 + vec2(uTime * .004, uTime * .002));
        float puff = fbm(p * .03 - vec2(uTime * .01, 0.));
        return b * .7 + puff * .45;
      }
      void main(){
        vec2 p = vWorld.xz;
        float h = field(p);
        vec2 sun2 = normalize(uSunDir.xz + 1e-4) * 6.;
        float hs = field(p + sun2);
        // éclairage : plus haut que le voisin côté soleil = éclairé
        float lit = clamp(.55 + (h - hs) * 7. + uSunDir.y * .3, 0., 1.);
        lit = smoothstep(.0, 1., lit);
        vec3 col = mix(uShade, uLit, lit);
        // creux plus sombres et colorés
        col = mix(col * .82, col, smoothstep(.35, .75, h));
        float dist = length(vWorld.xz - uCam.xz);
        float f = 1. - exp(-pow(dist / 1500., 1.6));
        col = mix(col, uFog, clamp(f, 0., 1.));
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(8000, 8000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** nuages en volume : quads instanciés, répétés autour de la caméra entièrement sur le GPU */
function makeCloudPuffs(count: number): THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const offs = new Float32Array(count * 4);
  const r = Math.random;
  for (let i = 0; i < count; i++) {
    const tall = r() < 0.18;
    offs[i * 4] = r() * 2400;
    offs[i * 4 + 1] = tall ? -30 + r() * 60 : -48 + r() * 22;
    offs[i * 4 + 2] = r() * 2400;
    offs[i * 4 + 3] = tall ? 110 + r() * 140 : 40 + r() * 70;
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 4));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uLit: { value: new THREE.Color() },
      uShade: { value: new THREE.Color() },
      uFog: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uBase: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aOff;
      uniform vec3 uCam; uniform float uTime, uBase;
      varying vec2 vUv; varying float vSeed; varying float vDist; varying vec3 vView;
      void main(){
        float box = 2400.;
        vec3 c = vec3(aOff.x + uTime * 1.5, aOff.y + uBase, aOff.z);
        c.xz = uCam.xz + mod(c.xz - uCam.xz + box * .5, box) - box * .5;
        float size = aOff.w;
        // posé sur sa base : le bas du nuage affleure
        c.y += size * .32;
        vec4 mv = viewMatrix * vec4(c, 1.);
        mv.xy += position.xy * vec2(size * 1.5, size);
        vUv = uv; vSeed = fract(aOff.x * .137 + aOff.z * .071);
        vDist = length(c.xz - uCam.xz);
        vView = normalize(c - uCam);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLit, uShade, uFog, uSun, uSunDir;
      varying vec2 vUv; varying float vSeed; varying float vDist; varying vec3 vView;
      ${NOISE}
      void main(){
        vec2 p = vUv - vec2(.5, .38);
        p.x *= 1.5;
        float n = fbm(vUv * 4. + vSeed * 40.);
        // silhouette de cumulus : trois boules + bords mousseux
        float d = min(min(length(p - vec2(-.28, -.02)) - .2, length(p - vec2(.27, -.04)) - .19), length(p - vec2(0., .08)) - .28);
        d = min(d, length(p * vec2(.6, 1.6) - vec2(0., -.14)) - .3);
        float a = smoothstep(.04, -.06, d + (n - .5) * .16);
        a *= smoothstep(-.12, .02, p.y + .3);
        if (a < .01) discard;
        float up = clamp(p.y * 1.6 + .55 + (n - .5) * .6, 0., 1.);
        vec3 col = mix(uShade, uLit, up);
        float back = pow(max(dot(vView, uSunDir), 0.), 6.);
        col += uSun * back * .35 * (1. - up * .5);
        float fogF = 1. - exp(-pow(vDist / 1300., 1.7));
        col = mix(col, uFog, clamp(fogF, 0., 1.));
        float fade = (1. - smoothstep(900., 1200., vDist)) * smoothstep(70., 170., vDist);
        gl_FragColor = vec4(col, a * fade * .96);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

export class Sky {
  readonly group = new THREE.Group();
  readonly dome = makeSky();
  readonly sea = makeCloudSea();
  puffs: ReturnType<typeof makeCloudPuffs>;
  readonly sunLight = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.2);
  readonly fog = new THREE.Fog(0xffffff, 160, 1500);
  readonly amb: Ambience = cloneAmbience(AMBIENCES[0]);
  readonly sunDir = new THREE.Vector3();
  /** hauteur de la mer de nuages (elle s'éloigne à mesure que la voie monte) */
  seaY = -62;

  constructor(scene: THREE.Scene, puffCount: number) {
    this.puffs = makeCloudPuffs(puffCount);
    this.group.add(this.dome, this.sea, this.puffs);
    scene.add(this.group, this.sunLight, this.sunLight.target, this.hemi);
    scene.fog = this.fog;
  }

  setPuffCount(n: number): void {
    this.puffs.geometry.instanceCount = Math.min(n, (this.puffs.geometry.getAttribute('aOff') as THREE.InstancedBufferAttribute).count);
  }

  update(target: Ambience, altitude: number, cam: THREE.Vector3, heading: number, time: number): void {
    const a = this.amb;
    for (const k of ['top', 'horizon', 'sun', 'cloudLit', 'cloudShade', 'hemiSky', 'hemiGround'] as const) a[k].copy(target[k]);
    a.name = target.name;
    a.emoji = target.emoji;
    a.elev = target.elev;
    a.azim = target.azim;
    a.sunPower = target.sunPower;
    a.night = target.night;
    a.mist = target.mist;
    // la brume rapproche le brouillard
    this.fog.near = 160 - 110 * a.mist;
    this.fog.far = 1500 - 900 * a.mist;
    // plus on monte, plus la mer de nuages paraît loin dessous
    this.seaY = -62 + altitude * 0.55;
    // le soleil reste à peu près devant le train, légèrement de côté
    const az = heading + a.azim;
    this.sunDir.set(Math.sin(az) * Math.cos(a.elev), Math.sin(a.elev), -Math.cos(az) * Math.cos(a.elev)).normalize();
    const below = a.cloudShade.clone().lerp(a.horizon, 0.5);
    const d = this.dome.material.uniforms;
    d.uTop.value.copy(a.top);
    d.uHorizon.value.copy(a.horizon);
    d.uSun.value.copy(a.sun);
    d.uSunDir.value.copy(this.sunDir);
    d.uNight.value = a.night;
    d.uTime.value = time;
    d.uBelow.value.copy(below);
    this.dome.position.copy(cam);

    const s = this.sea.material.uniforms;
    s.uLit.value.copy(a.cloudLit);
    s.uShade.value.copy(a.cloudShade);
    s.uFog.value.copy(a.horizon);
    s.uSunDir.value.copy(this.sunDir);
    s.uTime.value = time;
    s.uCam.value.copy(cam);
    this.sea.position.set(cam.x, this.seaY, cam.z);

    const p = this.puffs.material.uniforms;
    p.uCam.value.copy(cam);
    p.uLit.value.copy(a.cloudLit);
    p.uShade.value.copy(a.cloudShade);
    p.uFog.value.copy(a.horizon);
    p.uSun.value.copy(a.sun);
    p.uSunDir.value.copy(this.sunDir);
    p.uTime.value = time;
    p.uBase.value = this.seaY + 62;

    this.fog.color.copy(a.horizon);
    this.sunLight.color.copy(a.sun);
    this.sunLight.intensity = a.sunPower;
    this.sunLight.position.copy(cam).addScaledVector(this.sunDir, 200);
    this.sunLight.target.position.copy(cam);
    this.hemi.color.copy(a.hemiSky);
    this.hemi.groundColor.copy(a.hemiGround);
    this.hemi.intensity = 1.25 - a.night * 0.35;
  }
}
