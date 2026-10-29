// La grande chute de Bouillotte : elle vacille au bord du vide, bascule au ralenti, tombe… et son parachute
// s'ouvre enfin : c'est un torchon à carreaux ! Soupape de soulagement, voyageurs au parapluie qui
// l'accompagnent, le canard de la baignoire qui atterrit sur le torchon, puis un « plouf » moelleux dans
// la mer de nuages. La trajectoire reste au-dessus du vide de la brèche, loin des îles et des piles de pont.
import * as THREE from 'three';
import type { CamPose } from './director';
import type { Fx } from './fx';
import type { Audio } from './audio';
import { Passenger, type Locomotive } from './train';
import type { TrackPath } from './track';

const Y = new THREE.Vector3(0, 1, 0);

let towelMat: THREE.MeshStandardMaterial | null = null;
/** torchon à carreaux rouges et blancs, dessiné par le code */
function towel(): THREE.MeshStandardMaterial {
  if (towelMat) return towelMat;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fffaf2';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(232, 64, 84, 0.55)';
  for (let i = 0; i < 8; i++) {
    g.fillRect(i * 16, 0, 8, 128);
    g.fillRect(0, i * 16, 128, 8);
  }
  g.fillStyle = 'rgba(214, 40, 66, 0.9)';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) g.fillRect(i * 16, j * 16, 8, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1.5);
  towelMat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 });
  return towelMat;
}

/** voile du parachute, cordes reliées aux quatre coins du toit */
function makeChute(): THREE.Group {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(4.6, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.3), towel());
  canopy.scale.set(1, 0.62, 1);
  canopy.userData.own = true;
  g.add(canopy);
  // ourlet festonné
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.12, 5, 24), new THREE.MeshStandardMaterial({ color: 0xd62842, roughness: 0.7 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.58;
  rim.userData.own = true;
  g.add(rim);
  // petite boucle sur le dessus
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd62842 }));
  knob.position.y = 2.95;
  knob.userData.own = true;
  g.add(knob);
  return g;
}

export function makeUmbrella(color: number): THREE.Group {
  const g = new THREE.Group();
  const umb = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.7, 8, 1, true), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
  umb.position.y = 2.6;
  umb.userData.own = true;
  g.add(umb);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8), new THREE.MeshStandardMaterial({ color: 0x3b2352 }));
  stick.position.set(0.3, 1.7, 0);
  stick.userData.own = true;
  g.add(stick);
  return g;
}

function makeDuck(): THREE.Group {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffd93b, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), yellow);
  body.scale.set(1, 0.75, 1.3);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8), yellow);
  head.position.set(0, 0.55, -0.45);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 6), new THREE.MeshStandardMaterial({ color: 0xff8a2a }));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.5, -0.85);
  for (const m of [body, head, beak]) {
    m.userData.own = true;
    g.add(m);
  }
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshStandardMaterial({ color: 0x1d1630 }));
    eye.position.set(s * 0.17, 0.66, -0.72);
    eye.userData.own = true;
    g.add(eye);
  }
  return g;
}

export interface FallSetup {
  scene: THREE.Scene;
  path: TrackPath;
  /** début de la brèche (bord du vide) */
  edge: number;
  gapLen: number;
  /** côté vers lequel elle dérive (et où se tient la caméra) */
  side: number;
  seaY: number;
  loco: Locomotive;
  /** voyageurs perdus en route, qui reviennent l'accompagner */
  friends: number;
  fx: Fx;
  audio: Audio;
}

type Phase = 'teeter' | 'plunge' | 'chute' | 'landed';

export class FallScene {
  phase: Phase = 'teeter';
  /** temps du récit (ralenti compris) */
  t = 0;
  /** facteur de ralenti appliqué au monde */
  timeScale = 1;
  /** l'écran de fin peut s'afficher */
  done = false;
  private phaseT = 0;
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private q0 = new THREE.Quaternion();
  private pitch = 0;
  private pitchV = 0;
  private E: { pos: THREE.Vector3; fwd: THREE.Vector3; right: THREE.Vector3 };
  private chute?: THREE.Group;
  private ropes?: THREE.LineSegments;
  private friends: Array<{ g: THREE.Group; p: Passenger; off: THREE.Vector3; ph: number }> = [];
  private duck?: { g: THREE.Group; umb: THREE.Group; t: number; state: 'fall' | 'ride' | 'float' };
  private descent = 9;
  private cam: CamPose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50, roll: 0 };
  private camInit = false;
  private orbit = 0;
  private landedY = 0;
  private events = new Set<string>();

  constructor(private o: FallSetup) {
    const f = o.path.frame(o.edge);
    this.E = { pos: f.pos.clone(), fwd: f.fwd.clone().setY(0).normalize(), right: f.right.clone().setY(0).normalize() };
    this.q0.copy(o.loco.root.quaternion);
    this.pos.copy(o.loco.root.position);
    o.loco.setMood('scared', 0, 30);
    o.audio.teeter();
  }

  private once(key: string): boolean {
    if (this.events.has(key)) return false;
    this.events.add(key);
    return true;
  }

  /** passer la séquence : on file directement à l'écran de fin */
  skip(): void {
    this.done = true;
  }

  update(rawDt: number, now: number): void {
    const o = this.o;
    const loco = o.loco.root;
    // ralenti au moment où elle bascule dans le vide
    this.timeScale = this.phase === 'plunge' && this.phaseT < 1.1 ? 0.32 : 1;
    const dt = rawDt * this.timeScale;
    this.t += dt;
    this.phaseT += dt;
    const { pos: E, fwd, right } = this.E;
    const side = o.side;
    switch (this.phase) {
      case 'teeter': {
        // elle avance encore d'un mètre, le nez au-dessus du vide, et se balance d'avant en arrière
        const k = Math.min(1, this.phaseT / 1.8);
        const over = 1.1 * k;
        const center = E.clone().addScaledVector(fwd, -(3.1 - over));
        const rock = -(0.05 + 0.12 * k) * (0.55 + 0.45 * Math.sin(this.phaseT * 8));
        const rot = new THREE.Quaternion().setFromAxisAngle(right, rock);
        this.pos.copy(E).add(center.sub(E).applyQuaternion(rot));
        loco.position.copy(this.pos);
        loco.quaternion.copy(rot).multiply(this.q0);
        this.pitch = rock;
        if (this.phaseT > 1.8) {
          this.phase = 'plunge';
          this.phaseT = 0;
          // elle part vers l'avant et sur le côté : loin du bord, des piles de pont et des haltes
          this.vel.copy(fwd).multiplyScalar(6.5).addScaledVector(right, side * 2.6).addScaledVector(Y, 1.2);
          this.pitchV = -1.6;
          o.audio.gameOver();
          for (const p of [o.loco.driver]) p.setMood('panic', now, 10);
        }
        break;
      }
      case 'plunge': {
        this.vel.y -= 16 * dt;
        this.vel.x *= Math.exp(-dt * 0.3);
        this.vel.z *= Math.exp(-dt * 0.3);
        this.pos.addScaledVector(this.vel, dt);
        // le nez plonge
        this.pitch += this.pitchV * dt;
        this.pitch = Math.max(this.pitch, -1.15);
        this.applyRot(loco, this.pitch, Math.sin(this.t * 3) * 0.12);
        const drop = E.y - this.pos.y;
        if (drop > 11 || this.phaseT > 2.6) this.openChute(now);
        break;
      }
      case 'chute': {
        const k = this.phaseT;
        // le parachute freine d'un coup (petit rebond), puis la descente devient tranquille
        this.vel.y += (-this.descent - this.vel.y) * Math.min(1, dt * (k < 0.4 ? 9 : 2));
        this.vel.x *= Math.exp(-dt * 1.2);
        this.vel.z *= Math.exp(-dt * 1.2);
        // dérive douce vers le large
        this.pos.addScaledVector(right, side * dt * 0.8);
        this.pos.addScaledVector(this.vel, dt);
        // le nez revient à l'horizontale avec un ressort de dessin animé
        this.pitchV += (-this.pitch * 30 - this.pitchV * 3.2) * dt;
        this.pitch += this.pitchV * dt;
        const swing = Math.sin(this.t * 1.8) * 0.12 * Math.min(1, k);
        this.applyRot(loco, this.pitch, swing);
        this.updateChute(k, swing);
        if (k > 0.45 && this.once('relief')) {
          o.audio.relief();
          o.loco.setMood('happy', now, 30);
          o.loco.driver.setMood('cheer', now, 3);
          const top = o.loco.chimneyTop.getWorldPosition(new THREE.Vector3());
          for (let i = 0; i < 26; i++) o.fx.steam(top, new THREE.Vector3(0, 2, 0), 1, false, new THREE.Color(0xffffff));
        }
        if (k > 1 && this.once('friends')) this.spawnFriends(now);
        if (k > 1.8 && this.once('duck')) this.spawnDuck();
        if (this.pos.y <= o.seaY + 0.4) this.land(now);
        break;
      }
      case 'landed': {
        // elle flotte sur la mer de nuages comme un canard dans son bain
        this.pos.y = this.landedY + Math.sin(this.t * 1.6) * 0.25;
        this.applyRot(loco, Math.sin(this.t * 1.1) * 0.04, Math.sin(this.t * 1.6 + 1) * 0.06);
        if (this.chute) {
          // le torchon se dégonfle et se pose sur le côté
          const k = Math.min(1, this.phaseT / 1.6);
          this.chute.scale.set(1, 1 - k * 0.8, 1);
          this.chute.position.copy(this.pos).addScaledVector(Y, 6.8 - k * 5.5).addScaledVector(right, side * k * 4);
          this.chute.rotation.z = -side * k * 1.1;
          if (this.ropes) this.ropes.visible = k < 0.4;
        }
        if (this.phaseT > 1.2 && this.once('toot')) {
          o.audio.whistle(undefined, 0.15, 1.2, 0.09);
          window.setTimeout(() => o.audio.whistle(undefined, 0.3, 1.45, 0.09), 220);
          o.fx.stars(o.loco.chimneyTop.getWorldPosition(new THREE.Vector3()), 10);
        }
        if (this.phaseT > 1.9) this.done = true;
        break;
      }
    }
    loco.position.copy(this.pos);
    o.loco.update(now, dt, 0, now * 1.5, false);
    o.loco.driver.update(now, dt, now * 2);
    this.updateFriends(dt, now);
    this.updateDuck(dt);
  }

  private applyRot(loco: THREE.Object3D, pitch: number, roll: number): void {
    const { fwd, right } = this.E;
    const q = new THREE.Quaternion().setFromAxisAngle(right, pitch);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(fwd, roll));
    loco.quaternion.copy(q).multiply(this.q0);
  }

  private openChute(now: number): void {
    const o = this.o;
    this.phase = 'chute';
    this.phaseT = 0;
    this.chute = makeChute();
    o.scene.add(this.chute);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(8 * 3), 3));
    this.ropes = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.ropes.frustumCulled = false;
    o.scene.add(this.ropes);
    o.audio.pop();
    o.fx.confetti(this.pos.clone().addScaledVector(Y, 7), 26, 4);
    // descente calculée pour toucher la mer de nuages en ~6 s
    this.descent = THREE.MathUtils.clamp((this.pos.y - o.seaY) / 6, 7, 16);
    void now;
  }

  private updateChute(k: number, swing: number): void {
    if (!this.chute || !this.ropes) return;
    // la voile se déplie avec un rebond élastique
    const e = k < 0.55 ? 1 - Math.pow(1 - k / 0.55, 3) * Math.cos(k * 14) : 1;
    const s = Math.max(0.08, e);
    const { fwd, right } = this.E;
    const dip = this.duck?.state === 'ride' && this.duck.t < 0.4 ? Math.sin((this.duck.t / 0.4) * Math.PI) * 0.25 : 0;
    this.chute.scale.set(s, s * (1 - dip), s);
    this.chute.position.copy(this.pos).addScaledVector(Y, 3.2 + 4 * s).addScaledVector(right, -Math.sin(swing) * 4);
    this.chute.rotation.set(0, Math.atan2(fwd.x, fwd.z), -swing * 0.6);
    const pos = this.ropes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const roof = [[-0.85, -2.2], [0.85, -2.2], [-0.85, 2.4], [0.85, 2.4]];
    const loco = this.o.loco.root;
    roof.forEach(([x, z], i) => {
      const a = loco.localToWorld(new THREE.Vector3(x, 2.9, z));
      const ang = Math.atan2(z, x);
      const b = this.chute!.localToWorld(new THREE.Vector3(Math.cos(ang) * 4.4, 0.6, Math.sin(ang) * 4.4));
      pos.setXYZ(i * 2, a.x, a.y, a.z);
      pos.setXYZ(i * 2 + 1, b.x, b.y, b.z);
    });
    pos.needsUpdate = true;
  }

  private spawnFriends(now: number): void {
    const n = Math.min(3, this.o.friends);
    const looks = [
      { body: 0xffb05c, shape: 'round' as const, hat: 'top' as const },
      { body: 0x6fd3ff, shape: 'fish' as const, hat: 'none' as const },
      { body: 0xc98bff, shape: 'tall' as const, hat: 'cap' as const },
    ];
    for (let i = 0; i < n; i++) {
      const g = makeUmbrella([0xff5d73, 0x6fd3ff, 0xffcf5c][i % 3]);
      const p = new Passenger(looks[i]);
      p.root.scale.setScalar(1.3);
      g.add(p.root);
      p.setMood('wave', now, 999);
      const side = i % 2 ? -1 : 1;
      const off = new THREE.Vector3(0, 0, 0).addScaledVector(this.E.right, side * (6 + i * 2.5)).addScaledVector(this.E.fwd, -3 + i * 3).addScaledVector(Y, 9 + i * 2);
      g.position.copy(this.pos).add(off).addScaledVector(Y, 14);
      this.o.scene.add(g);
      this.friends.push({ g, p, off, ph: i * 2 });
    }
  }

  private updateFriends(dt: number, now: number): void {
    for (const f of this.friends) {
      // ils arrivent d'en haut et se rangent autour d'elle
      const want = this.pos.clone().add(f.off).addScaledVector(Y, Math.sin(now * 1.3 + f.ph) * 0.6);
      if (this.phase === 'landed') want.y = Math.max(this.landedY + 1 + Math.sin(now + f.ph) * 0.3, want.y - this.phaseT * 3);
      f.g.position.lerp(want, Math.min(1, dt * 1.6));
      f.g.rotation.z = Math.sin(now * 2 + f.ph) * 0.15;
      const toLoco = this.pos.clone().sub(f.g.position);
      f.g.rotation.y = Math.atan2(toLoco.x, toLoco.z);
      f.p.update(now, dt, now);
    }
  }

  private spawnDuck(): void {
    const g = makeDuck();
    const umb = makeUmbrella(0x9be36b);
    umb.scale.setScalar(0.55);
    umb.position.y = 0.2;
    g.add(umb);
    g.position.copy(this.pos).addScaledVector(Y, 26);
    this.o.scene.add(g);
    this.duck = { g, umb, t: 0, state: 'fall' };
  }

  private updateDuck(dt: number): void {
    const d = this.duck;
    if (!d || !this.chute) return;
    d.t += dt;
    const top = this.chute.position.clone().addScaledVector(Y, 2.9 * this.chute.scale.y + 0.3);
    if (d.state === 'fall') {
      // il descend sous son petit parapluie et se pose pile sur le torchon
      d.g.position.lerp(top, Math.min(1, dt * 2.2));
      d.g.rotation.z = Math.sin(d.t * 3) * 0.2;
      if (d.g.position.distanceTo(top) < 0.6) {
        d.state = 'ride';
        d.t = 0;
        d.umb.visible = false;
        this.o.audio.squeak();
      }
    } else if (d.state === 'ride') {
      d.g.position.copy(top);
      d.g.rotation.set(0, Math.atan2(this.E.fwd.x, this.E.fwd.z) + Math.PI, this.chute.rotation.z);
      if (this.phase === 'landed') {
        d.state = 'float';
        d.t = 0;
      }
    } else {
      // il glisse du torchon et flotte à côté d'elle
      const want = this.pos.clone().addScaledVector(this.E.right, -this.o.side * 4).addScaledVector(this.E.fwd, -1);
      want.y = this.landedY + 0.4 + Math.sin(d.t * 2.2) * 0.2;
      d.g.position.lerp(want, Math.min(1, dt * 2.5));
      d.g.rotation.set(0, d.t * 0.4, Math.sin(d.t * 2) * 0.1);
      if (d.t > 0.8 && this.once('squeak2')) this.o.audio.squeak();
    }
  }

  private land(now: number): void {
    const o = this.o;
    this.phase = 'landed';
    this.phaseT = 0;
    this.landedY = o.seaY - 0.6;
    o.audio.splash();
    o.fx.cloudRing(this.pos.clone().setY(o.seaY + 0.5), 22);
    o.loco.setMood('proud', now, 30);
    o.loco.kick(0.3);
  }

  /** plan de la chute : profil au bord, regard plongeant, puis la caméra descend avec elle */
  camera(rawDt: number): CamPose {
    const { pos: E, fwd, right } = this.E;
    const side = this.o.side;
    const P = this.pos;
    const want = new THREE.Vector3();
    const look = new THREE.Vector3();
    let fov = 50;
    if (this.phase === 'teeter') {
      want.copy(E).addScaledVector(right, side * 10.5).addScaledVector(fwd, 4).addScaledVector(Y, 1.6);
      look.copy(E).addScaledVector(fwd, -1.5).addScaledVector(Y, 1.4);
    } else if (this.phase === 'plunge') {
      // la caméra reste au bord et suit la chute du regard
      want.copy(E).addScaledVector(right, side * 11).addScaledVector(fwd, 5).addScaledVector(Y, 3 + this.phaseT * 1.5);
      look.copy(P).addScaledVector(Y, 1);
      fov = 50 - Math.min(8, this.phaseT * 6);
    } else {
      // descente : la caméra tourne lentement autour d'elle, un peu au-dessous pour voir le torchon
      this.orbit += rawDt * 0.12;
      const near = this.phase === 'landed' || P.y - this.o.seaY < 16;
      const a = this.orbit * side;
      const dir = right.clone().multiplyScalar(side * Math.cos(a)).addScaledVector(fwd, -Math.sin(a));
      want.copy(P).addScaledVector(dir, near ? 13 : 15).addScaledVector(Y, near ? 7 : 2);
      look.copy(P).addScaledVector(Y, near ? 1.5 : 3.6);
      fov = near ? 54 : 56;
    }
    const c = this.cam;
    if (!this.camInit) {
      c.pos.copy(want);
      c.look.copy(look);
      this.camInit = true;
    }
    const k = 1 - Math.exp(-rawDt * (this.phase === 'chute' ? 3 : 5));
    c.pos.lerp(want, k);
    c.look.lerp(look, 1 - Math.exp(-rawDt * 7));
    c.fov += (fov - c.fov) * Math.min(1, rawDt * 3);
    c.roll = 0;
    return c;
  }

  dispose(): void {
    for (const obj of [this.chute, this.ropes, this.duck?.g, ...this.friends.map((f) => f.g)]) {
      if (!obj) continue;
      obj.removeFromParent();
      obj.traverse((m) => {
        if ((m as THREE.Mesh).geometry && m.userData.own) (m as THREE.Mesh).geometry.dispose();
      });
    }
    this.ropes?.geometry.dispose();
  }
}
