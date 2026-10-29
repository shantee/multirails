// Particules : vapeur, suie, étincelles, confettis, étoiles. Quads instanciés tournés vers la caméra.
import * as THREE from 'three';

export type Shape = 0 | 1 | 2 | 3; // 0 nuage doux, 1 étincelle, 2 confetti, 3 étoile

interface P {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  size0: number;
  size1: number;
  age: number;
  life: number;
  drag: number;
  grav: number;
  rot: number;
  spin: number;
  shape: Shape;
  alpha: number;
}

class Pool {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private parts: P[] = [];
  private aPos: Float32Array;
  private aData: Float32Array;
  private aCol: Float32Array;
  private cursor = 0;

  constructor(readonly max: number, additive: boolean) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new Float32Array(max * 3);
    this.aData = new Float32Array(max * 4);
    this.aCol = new Float32Array(max * 3);
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aData', new THREE.InstancedBufferAttribute(this.aData, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(this.aCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uFog: { value: new THREE.Color() } },
      vertexShader: /* glsl */ `
        attribute vec3 aPos; attribute vec4 aData; attribute vec3 aCol;
        varying vec2 vUv; varying vec3 vCol; varying float vAlpha; varying float vShape; varying float vDepth;
        void main(){
          vec4 mv = modelViewMatrix * vec4(aPos, 1.);
          float c = cos(aData.z), s = sin(aData.z);
          vec2 q = mat2(c, -s, s, c) * position.xy;
          mv.xy += q * aData.x;
          vUv = uv; vCol = aCol; vAlpha = aData.y; vShape = aData.w; vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vCol; varying float vAlpha; varying float vShape; varying float vDepth;
        void main(){
          vec2 p = vUv - .5;
          float r = length(p);
          float a;
          if (vShape < .5) a = smoothstep(.5, .1, r) * (.75 + .25 * smoothstep(.5, .2, r));
          else if (vShape < 1.5) a = smoothstep(.5, 0., r) * smoothstep(.5, .0, r) * 1.6;
          else if (vShape < 2.5) a = step(abs(p.x), .3) * step(abs(p.y), .45);
          else {
            float ang = atan(p.y, p.x);
            float st = .22 + .2 * pow(abs(cos(ang * 2.5)), 6.);
            a = smoothstep(st, st - .08, r);
          }
          a *= vAlpha * smoothstep(2., 9., vDepth);
          if (a < .005) discard;
          gl_FragColor = vec4(vCol, a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
    for (let i = 0; i < max; i++) {
      this.parts.push({
        alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color(), size0: 1, size1: 1, age: 0, life: 1,
        drag: 0, grav: 0, rot: 0, spin: 0, shape: 0, alpha: 1,
      });
    }
  }

  spawn(o: Partial<Omit<P, 'pos' | 'vel' | 'color'>> & { pos: THREE.Vector3; vel?: THREE.Vector3; color: THREE.Color | number }): void {
    const p = this.parts[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    p.alive = true;
    p.pos.copy(o.pos);
    p.vel.copy(o.vel ?? new THREE.Vector3());
    typeof o.color === 'number' ? p.color.setHex(o.color) : p.color.copy(o.color);
    p.size0 = o.size0 ?? 1;
    p.size1 = o.size1 ?? p.size0;
    p.age = 0;
    p.life = o.life ?? 1;
    p.drag = o.drag ?? 0;
    p.grav = o.grav ?? 0;
    p.rot = o.rot ?? Math.random() * 6.28;
    p.spin = o.spin ?? 0;
    p.shape = o.shape ?? 0;
    p.alpha = o.alpha ?? 1;
  }

  update(dt: number): void {
    let n = 0;
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y -= p.grav * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot += p.spin * dt;
      const k = p.age / p.life;
      this.aPos[n * 3] = p.pos.x;
      this.aPos[n * 3 + 1] = p.pos.y;
      this.aPos[n * 3 + 2] = p.pos.z;
      this.aData[n * 4] = p.size0 + (p.size1 - p.size0) * k;
      this.aData[n * 4 + 1] = p.alpha * Math.min(1, k * 8) * (1 - k * k);
      this.aData[n * 4 + 2] = p.rot;
      this.aData[n * 4 + 3] = p.shape;
      this.aCol[n * 3] = p.color.r;
      this.aCol[n * 3 + 1] = p.color.g;
      this.aCol[n * 3 + 2] = p.color.b;
      n++;
    }
    const g = this.mesh.geometry;
    g.instanceCount = n;
    for (const name of ['aPos', 'aData', 'aCol']) (g.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  clear(): void {
    for (const p of this.parts) p.alive = false;
  }
}

const RAINBOW = [0xff5d73, 0xffa94d, 0xffe06b, 0x7be495, 0x6fd3ff, 0xb48cff];
const CONFETTI = [0xff5d73, 0xffcf5c, 0x6fd3ff, 0x9be36b, 0xc98bff, 0xffffff];

export class Fx {
  readonly soft = new Pool(900, false);
  readonly glow = new Pool(500, true);
  readonly group = new THREE.Group();
  private v = new THREE.Vector3();
  private c = new THREE.Color();
  density = 1;

  constructor() {
    this.group.add(this.soft.mesh, this.glow.mesh);
  }

  private rnd(s: number): number {
    return (Math.random() - 0.5) * s;
  }

  /** bouffée de vapeur de la cheminée ; arc-en-ciel quand la bouilloire bout */
  steam(at: THREE.Vector3, trainVel: THREE.Vector3, power: number, rainbow: boolean, tint: THREE.Color): void {
    const col = rainbow ? this.c.setHex(RAINBOW[Math.floor(Math.random() * RAINBOW.length)]) : this.c.copy(tint);
    this.soft.spawn({
      pos: at,
      vel: this.v.set(this.rnd(0.8), 2.2 + power, this.rnd(0.8)).addScaledVector(trainVel, 0.55),
      color: col, size0: 0.5, size1: 1.5 + power * 0.5, life: 1 + Math.random() * 0.4, drag: 1.4, grav: -0.3, spin: this.rnd(1), alpha: rainbow ? 0.75 : 0.4,
    });
  }

  /** jet de l'évent de la baleine */
  spout(at: THREE.Vector3): void {
    for (let i = 0; i < 3; i++) {
      this.soft.spawn({
        pos: at, vel: this.v.set(this.rnd(3), 14 + Math.random() * 6, this.rnd(3)), color: 0xf4f8ff,
        size0: 3, size1: 9, life: 1.8, drag: 1.2, grav: 4, alpha: 0.7,
      });
    }
  }

  soot(at: THREE.Vector3): void {
    for (let i = 0; i < 14 * this.density; i++) {
      this.soft.spawn({
        pos: at, vel: this.v.set(this.rnd(5), 4 + Math.random() * 5, this.rnd(5)), color: 0x3a3045,
        size0: 1, size1: 3.5, life: 1.4, drag: 1.6, grav: -1, alpha: 0.85,
      });
    }
  }

  /** gerbe d'étincelles dorées au front de construction */
  sparks(at: THREE.Vector3, n: number, rainbow = false): void {
    for (let i = 0; i < n * this.density; i++) {
      const col = rainbow ? RAINBOW[i % RAINBOW.length] : i % 3 ? 0xffd27a : 0xffffff;
      this.glow.spawn({
        pos: at, vel: this.v.set(this.rnd(12), 3 + Math.random() * 8, this.rnd(12)), color: col,
        size0: 0.35 + Math.random() * 0.3, size1: 0.05, life: 0.5 + Math.random() * 0.5, drag: 1.5, grav: 12, shape: 1,
      });
    }
  }

  stars(at: THREE.Vector3, n: number): void {
    for (let i = 0; i < n * this.density; i++) {
      this.glow.spawn({
        pos: at, vel: this.v.set(this.rnd(9), 2 + Math.random() * 7, this.rnd(9)), color: RAINBOW[i % RAINBOW.length],
        size0: 0.9, size1: 0.2, life: 1 + Math.random() * 0.6, drag: 1.4, grav: 2, shape: 3, spin: this.rnd(6),
      });
    }
  }

  confetti(at: THREE.Vector3, n: number, spread = 8): void {
    for (let i = 0; i < n * this.density; i++) {
      this.soft.spawn({
        pos: this.v.copy(at).add(new THREE.Vector3(this.rnd(spread), Math.random() * 2, this.rnd(spread))),
        vel: new THREE.Vector3(this.rnd(8), 5 + Math.random() * 8, this.rnd(8)), color: CONFETTI[i % CONFETTI.length],
        size0: 0.32, size1: 0.28, life: 2 + Math.random(), drag: 1.8, grav: 5, shape: 2, spin: this.rnd(14),
      });
    }
  }

  dust(at: THREE.Vector3, n: number, color = 0xd8c8b8): void {
    for (let i = 0; i < n * this.density; i++) {
      this.soft.spawn({
        pos: at, vel: this.v.set(this.rnd(6), Math.random() * 3, this.rnd(6)), color,
        size0: 1, size1: 3, life: 1.2, drag: 2, grav: -0.5, alpha: 0.6,
      });
    }
  }

  /** petites bulles de sommeil qui montent en zigzag */
  zzz(at: THREE.Vector3): void {
    this.soft.spawn({
      pos: at, vel: this.v.set(0.6, 1.1, 0), color: 0xd8c8ff, size0: 0.25, size1: 0.7, life: 2.2, drag: 0.4, grav: 0, alpha: 0.8,
    });
  }

  /** fumée d'une cheminée du décor */
  smoke(at: THREE.Vector3, color = 0xf4f0ff): void {
    this.soft.spawn({
      pos: at, vel: this.v.set(this.rnd(0.6) + 0.8, 1.6 + Math.random(), this.rnd(0.6)), color,
      size0: 0.6, size1: 2.6, life: 2.4, drag: 0.6, grav: -0.2, alpha: 0.35,
    });
  }

  /** spores lumineuses qui s'échappent des champignons géants */
  spore(at: THREE.Vector3): void {
    this.glow.spawn({
      pos: this.v.copy(at).add(new THREE.Vector3(this.rnd(6), 0, this.rnd(6))), vel: new THREE.Vector3(this.rnd(1), -0.4 - Math.random() * 0.6, this.rnd(1)),
      color: RAINBOW[Math.floor(Math.random() * RAINBOW.length)], size0: 0.35, size1: 0.15, life: 3, drag: 0.3, grav: 0, shape: 0,
    });
  }

  /** gerbe d'eau du sillage, projetée sur le côté */
  splash(at: THREE.Vector3, out: THREE.Vector3, speed: number): void {
    this.soft.spawn({
      pos: at, vel: this.v.copy(out).multiplyScalar(1.5 + Math.random() * 2).add(new THREE.Vector3(0, 1.2 + Math.random() * 1.5 + speed * 0.04, 0)),
      color: 0xdcecff, size0: 0.25, size1: 1.1, life: 0.6 + Math.random() * 0.3, drag: 1.5, grav: 6, alpha: 0.5,
    });
  }

  /** gros anneau de nuage quand on atterrit dans la mer de nuages */
  cloudRing(at: THREE.Vector3, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.soft.spawn({
        pos: at, vel: this.v.set(Math.cos(a) * 9, 1 + Math.random() * 2, Math.sin(a) * 9), color: 0xffffff,
        size0: 2, size1: 6, life: 1.8, drag: 1.8, grav: -0.4, alpha: 0.8,
      });
    }
  }

  update(dt: number): void {
    this.soft.update(dt);
    this.glow.update(dt);
  }

  clear(): void {
    this.soft.clear();
    this.glow.clear();
  }
}

/** débris d'un pont qui s'effondre : vraies petites pièces 3D qui tombent en tournoyant */
export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private items: Array<{ pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; life: number; scale: THREE.Vector3 }> = [];
  private dummy = new THREE.Object3D();
  private cursor = 0;

  constructor(readonly max = 160) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) {
      this.items.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, scale: new THREE.Vector3() });
      this.mesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.mesh.count = max;
    this.hideAll();
  }

  private hideAll(): void {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  burst(at: THREE.Vector3, along: THREE.Vector3, n: number, colors: number[]): void {
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const it = this.items[this.cursor];
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      it.pos.copy(at).addScaledVector(along, (Math.random() - 0.3) * 18).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2));
      it.vel.set((Math.random() - 0.5) * 6, 3 + Math.random() * 6, (Math.random() - 0.5) * 6);
      it.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      it.life = 2.5;
      const big = Math.random() < 0.4;
      it.scale.set(big ? 2.2 : 0.3, big ? 0.15 : 0.15, big ? 0.4 : 1.2);
      this.mesh.setColorAt(idx, c.setHex(colors[i % colors.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (it.life <= 0) continue;
      it.life -= dt;
      it.vel.y -= 14 * dt;
      it.pos.addScaledVector(it.vel, dt);
      it.rot.x += it.spin.x * dt;
      it.rot.y += it.spin.y * dt;
      it.rot.z += it.spin.z * dt;
      this.dummy.position.copy(it.pos);
      this.dummy.rotation.copy(it.rot);
      this.dummy.scale.copy(it.scale).multiplyScalar(it.life > 0 ? Math.min(1, it.life) : 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
