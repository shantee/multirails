// Post-traitement en une seule passe : rayons de soleil, flou de vitesse, vignette, étalonnage chaud.
import * as THREE from 'three';

export class Post {
  readonly target: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly mat: THREE.ShaderMaterial;
  enabled = true;
  rays = true;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.mat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.target.texture },
        uSun: { value: new THREE.Vector2(0.5, 0.7) },
        uSunVis: { value: 0 },
        uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
        uBlur: { value: 0 },
        uFlash: { value: new THREE.Vector4(0, 0, 0, 0) },
        uRays: { value: 1 },
        uAspect: { value: 1 },
        uExposure: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene; uniform vec2 uSun; uniform float uSunVis, uBlur, uRays, uAspect, uExposure;
        uniform vec3 uSunCol; uniform vec4 uFlash;
        varying vec2 vUv;
        vec3 aces(vec3 x){ x *= .6; return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
        float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
        void main(){
          vec2 uv = vUv;
          vec3 col = texture2D(tScene, uv).rgb;
          // flou radial de vitesse, seulement sur les bords
          if (uBlur > .001) {
            vec2 dir = uv - vec2(.5, .55);
            float edge = smoothstep(.15, .7, length(dir * vec2(uAspect, 1.)));
            vec3 acc = col;
            for (int i = 1; i < 8; i++) acc += texture2D(tScene, uv - dir * float(i) * .012 * uBlur * edge).rgb;
            col = acc / 8.;
          }
          // rayons de lumière : on remonte vers le soleil en accumulant le ciel brillant
          if (uRays > .5 && uSunVis > .01) {
            vec2 d = (uSun - uv) / 24.;
            vec2 p = uv;
            float w = 1.;
            vec3 rays = vec3(0.);
            for (int i = 0; i < 24; i++) {
              p += d;
              vec3 s = texture2D(tScene, p).rgb;
              rays += max(s - .9, 0.) * w;
              w *= .93;
            }
            float fall = 1. - smoothstep(0., .9, length((uv - uSun) * vec2(uAspect, 1.)));
            col += rays * uSunCol * .07 * uSunVis * fall;
          }
          col *= uExposure;
          col = aces(col);
          // étalonnage : ombres légèrement violettes, hautes lumières crème
          float l = lum(col);
          col = mix(col, col * vec3(.94, .92, 1.06), (1. - l) * .25);
          col = mix(col, col * vec3(1.04, 1.01, .95), l * .25);
          col = mix(vec3(l), col, 1.08);
          col = mix(col, uFlash.rgb, uFlash.a);
          vec2 v = (vUv - .5) * vec2(uAspect, 1.);
          col *= 1. - smoothstep(.5, 1.25, length(v)) * .35;
          col = pow(clamp(col, 0., 1.), vec3(1. / 2.2));
          gl_FragColor = vec4(col, 1.);
        }`,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(w: number, h: number): void {
    this.target.setSize(w, h);
    this.mat.uniforms.uAspect.value = w / h;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.6 * this.mat.uniforms.uExposure.value;
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.mat.uniforms.uRays.value = this.rays ? 1 : 0;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.cam);
  }
}
