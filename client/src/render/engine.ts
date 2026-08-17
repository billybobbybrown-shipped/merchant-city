import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";

// Objects that must not contribute to the ambient-occlusion pre-pass: flat
// billboards whose quad would shade a rectangle of AO around them.
const noAO = new Set<THREE.Object3D>();
export function excludeFromAO(obj: THREE.Object3D): void {
  noAO.add(obj);
}
export function includeInAO(obj: THREE.Object3D): void {
  noAO.delete(obj);
}
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { applyNight } from "./lights.js";

const PITCH = THREE.MathUtils.degToRad(58);

const SKY_DAY = new THREE.Color(0x86b3d9);
const SKY_DUSK = new THREE.Color(0xd98a5a);
const SKY_NIGHT = new THREE.Color(0x111c30);
const SUN_DAY = new THREE.Color(0xfff2dd);
const SUN_LOW = new THREE.Color(0xff9a4d);

export class Engine {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly moon: THREE.DirectionalLight;

  // camera rig
  readonly target = new THREE.Vector3(128, 0, 128);
  dist = 46;
  targetDist = 46;
  yaw = 0;
  targetYaw = 0;

  dayTime = 0.35; // 0..1, 0 = midnight; server-synced once connected
  usePost = true;
  private frameCbs: Array<(dt: number) => void> = [];
  private clock = new THREE.Clock();
  private skyTmp = new THREE.Color();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 800);

    // environment for reflective materials (glass towers, water)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.scene.fog = new THREE.Fog(SKY_DAY.getHex(), 180, 520);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 400;
    const S = 95;
    this.sun.shadow.camera.left = -S;
    this.sun.shadow.camera.right = S;
    this.sun.shadow.camera.top = S;
    this.sun.shadow.camera.bottom = -S;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight(0x8899cc, 0);
    this.scene.add(this.moon, this.moon.target);

    this.hemi = new THREE.HemisphereLight(0xbdd5ea, 0x51473a, 0.7);
    this.scene.add(this.hemi);

    const w = window.innerWidth;
    const h = window.innerHeight;
    // dev flags: ?post=off | ?ssao=off | ?bloom=off | ?smaa=off
    const q = new URLSearchParams(location.search);
    this.usePost = q.get("post") !== "off";
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.get("ssao") !== "off") {
      const gtao = new GTAOPass(this.scene, this.camera, w, h);
      gtao.output = GTAOPass.OUTPUT.Default;
      // The occlusion pass re-renders the scene with an override material, so
      // a transparent billboard writes depth as a solid quad and shades a box
      // of AO around itself. Hide those for the pass only.
      const inner = gtao.render.bind(gtao);
      gtao.render = ((...args: Parameters<typeof inner>) => {
        const hidden: THREE.Object3D[] = [];
        for (const o of noAO) {
          if (!o.visible) continue;
          o.visible = false;
          hidden.push(o);
        }
        inner(...args);
        for (const o of hidden) o.visible = true;
      }) as typeof gtao.render;
      this.composer.addPass(gtao);
    }
    if (q.get("bloom") !== "off")
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.55, 0.82));
    this.composer.addPass(new OutputPass());
    if (q.get("smaa") !== "off") this.composer.addPass(new SMAAPass(w, h));

    window.addEventListener("resize", () => {
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      this.camera.aspect = nw / nh;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(nw, nh);
      this.composer.setSize(nw, nh);
    });
  }

  onFrame(cb: (dt: number) => void) {
    this.frameCbs.push(cb);
  }

  // runs after the camera has moved for this frame — anything that projects
  // world points to the screen (DOM labels) must use THIS camera, not last
  // frame's, or it visibly swims during pans
  private afterCameraCbs: Array<() => void> = [];
  onAfterCamera(cb: () => void) {
    this.afterCameraCbs.push(cb);
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.dist += (this.targetDist - this.dist) * Math.min(1, dt * 8);
      this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 10);
      for (const cb of this.frameCbs) cb(dt);
      this.updateCamera();
      // fresh matrices before anyone projects with this camera
      this.camera.updateMatrixWorld(true);
      this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
      for (const cb of this.afterCameraCbs) cb();
      this.updateDayNight();
      if (this.usePost) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    });
  }

  private updateCamera() {
    const c = this.camera;
    const ground = this.dist * Math.cos(PITCH);
    c.position.set(
      this.target.x + Math.sin(this.yaw) * ground,
      this.target.y + this.dist * Math.sin(PITCH),
      this.target.z + Math.cos(this.yaw) * ground
    );
    c.lookAt(this.target);
  }

  private updateDayNight() {
    const t = this.dayTime;
    const theta = (t - 0.25) * Math.PI * 2; // t=0.5 → noon
    const elev = Math.sin(theta);
    const day = THREE.MathUtils.smoothstep(elev, -0.06, 0.25);
    const dusk = 1 - Math.abs(elev); // strongest at horizon

    // sun follows an arc around the camera target so shadows stay crisp everywhere
    const R = 220;
    this.sun.position.set(
      this.target.x + Math.cos(theta) * R,
      Math.max(elev, 0.03) * R,
      this.target.z + R * 0.35
    );
    this.sun.target.position.copy(this.target);
    this.sun.intensity = 2.8 * day;
    this.sun.color.copy(SUN_DAY).lerp(SUN_LOW, THREE.MathUtils.clamp(dusk * 1.4 - 0.25, 0, 1));

    this.moon.position.set(this.target.x - 80, 120, this.target.z - 60);
    this.moon.target.position.copy(this.target);
    this.moon.intensity = 0.5 * (1 - day);

    // the env map otherwise floods the scene with constant light and kills the night
    this.scene.environmentIntensity = 0.08 + 0.55 * day;
    this.hemi.intensity = 0.3 + 0.5 * day;
    this.hemi.color.set(0xbdd5ea).lerp(new THREE.Color(0x2a3550), 1 - day);

    // sky + fog grading: night → dusk band → day
    this.skyTmp.copy(SKY_NIGHT).lerp(SKY_DAY, day);
    if (dusk > 0.72 && day > 0.05 && day < 0.95)
      this.skyTmp.lerp(SKY_DUSK, THREE.MathUtils.clamp((dusk - 0.72) * 2.2, 0, 0.55));
    this.scene.background = this.skyTmp.clone();
    (this.scene.fog as THREE.Fog).color.copy(this.skyTmp);

    applyNight(1 - day);
  }
}
