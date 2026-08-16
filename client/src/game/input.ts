import * as THREE from "three";
import { CITY_SIZE, TILE_WORLD_SIZE } from "@mc/shared";
import { Engine } from "../render/engine.js";

const WORLD_MAX = CITY_SIZE * TILE_WORLD_SIZE;
const EDGE = 14; // px margin for edge pan
const MIN_DIST = 16;
const MAX_DIST = 110;

export class Controls {
  private keys = new Set<string>();
  private mouse = { x: -1, y: -1, inWindow: false };
  private downAt: { x: number; y: number } | null = null;
  private ray = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(
    private engine: Engine,
    private onMoveIntent: (x: number, z: number) => void
  ) {
    const dom = engine.renderer.domElement;
    window.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());

    window.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inWindow = true;
    });
    document.addEventListener("mouseleave", () => (this.mouse.inWindow = false));

    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      engine.targetDist = THREE.MathUtils.clamp(
        engine.targetDist * (e.deltaY > 0 ? 1.12 : 1 / 1.12),
        MIN_DIST,
        MAX_DIST
      );
    }, { passive: false });

    // right-drag orbits the camera
    let orbitFrom: number | null = null;
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
    dom.addEventListener("pointerdown", (e) => {
      if (e.button === 0) this.downAt = { x: e.clientX, y: e.clientY };
      if (e.button === 2) orbitFrom = e.clientX;
    });
    window.addEventListener("pointermove", (e) => {
      if (orbitFrom === null) return;
      engine.targetYaw += (e.clientX - orbitFrom) * 0.006;
      orbitFrom = e.clientX;
    });
    window.addEventListener("pointerup", (e) => {
      if (e.button === 2) orbitFrom = null;
    });
    dom.addEventListener("pointerup", (e) => {
      if (e.button !== 0 || !this.downAt) return;
      const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
      this.downAt = null;
      if (moved > 6) return; // was a drag, not a click
      const ndc = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      this.ray.setFromCamera(ndc, engine.camera);
      const hit = new THREE.Vector3();
      if (this.ray.ray.intersectPlane(this.groundPlane, hit)) {
        const x = THREE.MathUtils.clamp(hit.x, 0, WORLD_MAX);
        const z = THREE.MathUtils.clamp(hit.z, 0, WORLD_MAX);
        this.onMoveIntent(x, z);
      }
    });
  }

  update(dt: number) {
    const speed = this.engine.dist * 0.9 * dt;

    // Q/E rotate the camera
    if (this.keys.has("q")) this.engine.targetYaw += dt * 2.2;
    if (this.keys.has("e")) this.engine.targetYaw -= dt * 2.2;

    let px = 0;
    let pz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) pz -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) pz += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) px -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) px += 1;
    if (this.mouse.inWindow && document.hasFocus()) {
      if (this.mouse.x < EDGE) px -= 1;
      if (this.mouse.x > window.innerWidth - EDGE) px += 1;
      if (this.mouse.y < EDGE) pz -= 1;
      if (this.mouse.y > window.innerHeight - EDGE) pz += 1;
    }
    if (px || pz) {
      const len = Math.hypot(px, pz);
      // pan in screen space: rotate the input vector by the camera yaw
      const sin = Math.sin(this.engine.yaw);
      const cos = Math.cos(this.engine.yaw);
      const wx = (px * cos + pz * sin) / len;
      const wz = (-px * sin + pz * cos) / len;
      this.engine.target.x = THREE.MathUtils.clamp(this.engine.target.x + wx * speed, 0, WORLD_MAX);
      this.engine.target.z = THREE.MathUtils.clamp(this.engine.target.z + wz * speed, 0, WORLD_MAX);
    }
  }
}
