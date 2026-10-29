// La baleine-nuage : une géante pastel qui nage dans le ciel, un petit jardin sur le dos.
import * as THREE from 'three';

function m(color: number, rough = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
}

export class SkyWhale {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private tail = new THREE.Group();
  private finL: THREE.Mesh;
  private finR: THREE.Mesh;
  /** temps restant de la traversée en cours (0 = absente) */
  private t = 0;
  private dur = 1;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private nextAt = 25;
  spout = false;

  constructor(scene: THREE.Scene) {
    const sphere = new THREE.SphereGeometry(1, 28, 18);
    const skin = m(0x8fb0ff, 0.5);
    const belly = m(0xfff1f6, 0.6);
    this.root.add(this.body);
    this.part(sphere, skin, [0, 0, 0], [9, 7, 22]);
    this.part(sphere, belly, [0, -2.2, -1], [8, 5, 19]);
    // taches claires sur le dos
    for (let i = 0; i < 7; i++) this.part(sphere, m(0xc9d6ff), [(i % 2 ? 1 : -1) * (2 + (i % 3)), 5.6 - (i % 3) * 0.6, -10 + i * 3], [1.3, 0.6, 1.6]);
    // yeux doux
    for (const side of [-1, 1]) {
      this.part(sphere, m(0xffffff, 0.3), [side * 7.6, 0.2, -14], [1.5, 1.5, 1.5]);
      this.part(sphere, m(0x2a1f3d, 0.2), [side * 8.6, 0.3, -14.4], [0.75, 0.85, 0.75]);
      this.part(sphere, m(0xff9fc0, 0.6), [side * 7.3, -1.6, -16], [1.4, 0.6, 1.2]);
    }
    // nageoires
    this.finL = this.part(sphere, skin, [-9, -2.5, -4], [6, 0.8, 3]);
    this.finR = this.part(sphere, skin, [9, -2.5, -4], [6, 0.8, 3]);
    // queue
    this.tail.position.set(0, 0.5, 18);
    this.body.add(this.tail);
    const t1 = new THREE.Mesh(sphere, skin);
    t1.scale.set(3.6, 3, 9);
    t1.position.z = 4;
    this.tail.add(t1);
    for (const side of [-1, 1]) {
      const fl = new THREE.Mesh(sphere, skin);
      fl.scale.set(7, 0.9, 3.2);
      fl.position.set(side * 5, 0.5, 11);
      fl.rotation.y = side * 0.5;
      this.tail.add(fl);
    }
    // jardin sur le dos : herbe, arbre, maisonnette
    this.part(new THREE.CylinderGeometry(1, 1.2, 1, 10), m(0x9ad66b, 0.8), [0, 6.6, -2], [4.5, 0.8, 6]);
    const trunk = this.part(new THREE.CylinderGeometry(0.4, 0.5, 1, 6), m(0x8a5a44), [1.5, 8.5, 0], [1, 3.4, 1]);
    void trunk;
    this.part(new THREE.IcosahedronGeometry(1, 0), m(0xffb3d1, 0.7), [1.5, 11, 0], [2.6, 2.4, 2.6]);
    this.part(new THREE.BoxGeometry(1, 1, 1), m(0xfff3e0), [-1.6, 8, -4], [2.4, 2, 2.4]);
    const roof = this.part(new THREE.ConeGeometry(1, 1, 4), m(0xff7a6b), [-1.6, 9.8, -4], [2.1, 1.6, 2.1]);
    roof.rotation.y = Math.PI / 4;
    this.root.visible = false;
    this.root.scale.setScalar(1.6);
    scene.add(this.root);
  }

  private part(geo: THREE.BufferGeometry, mat: THREE.Material, p: number[], s: number[]): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p[0], p[1], p[2]);
    mesh.scale.set(s[0], s[1], s[2]);
    this.body.add(mesh);
    return mesh;
  }

  /** traversée du ciel devant le train ; `close` : passage tout près (ébullition) */
  launch(center: THREE.Vector3, fwd: THREE.Vector3, right: THREE.Vector3, close: boolean, speed = 12): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    const ahead = close ? 150 : 260 + Math.random() * 160;
    const height = close ? 24 : 40 + Math.random() * 50;
    const span = close ? 240 : 520;
    const dur = close ? 14 : 30;
    const c = center.clone().addScaledVector(fwd, ahead).add(new THREE.Vector3(0, height, 0));
    this.from.copy(c).addScaledVector(right, side * span * 0.5).addScaledVector(fwd, -40);
    // elle avance avec le train pour rester dans le champ
    this.to.copy(c).addScaledVector(right, -side * span * 0.5).addScaledVector(fwd, 40 + speed * dur * 0.9);
    this.dur = dur;
    this.t = this.dur;
    this.root.visible = true;
  }

  get active(): boolean {
    return this.t > 0;
  }

  update(dt: number, now: number, center: THREE.Vector3, fwd: THREE.Vector3, right: THREE.Vector3, enabled: boolean): void {
    if (this.t <= 0) {
      this.root.visible = false;
      if (enabled && now > this.nextAt) {
        this.launch(center, fwd, right, false);
        this.nextAt = now + 70 + Math.random() * 50;
      }
      return;
    }
    this.t -= dt;
    const k = 1 - this.t / this.dur;
    this.root.position.lerpVectors(this.from, this.to, k);
    this.root.position.y += Math.sin(now * 0.5) * 3;
    const dir = this.to.clone().sub(this.from).normalize();
    this.root.lookAt(this.root.position.clone().sub(dir));
    this.body.rotation.x = Math.sin(now * 0.8) * 0.06;
    this.tail.rotation.x = Math.sin(now * 1.6) * 0.3;
    this.finL.rotation.z = Math.sin(now * 1.6) * 0.3;
    this.finR.rotation.z = -Math.sin(now * 1.6) * 0.3;
    this.spout = Math.sin(now * 0.7) > 0.93;
  }

  /** position de l'évent pour les jets de vapeur */
  blowhole(out: THREE.Vector3): THREE.Vector3 {
    return this.body.localToWorld(out.set(0, 7.5, -10));
  }
}
