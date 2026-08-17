import * as THREE from "three";

// Worker status labels ("NOTHING TO STOCK") as real DOM chips projected over
// the world, not canvas sprites — DOM text is crisp at every zoom and styles
// with the same tokens as the rest of the UI. One chip per stalled worker,
// repositioned each frame, hidden when far, offscreen or behind the camera.

const VISIBLE_RANGE = 60; // world units from the camera target
const FADE_FROM = 38;

export class WorkerLabels {
  private root: HTMLElement;
  private labels = new Map<string, { el: HTMLElement; text: string }>();
  private v = new THREE.Vector3();

  constructor(ui: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "worker-labels";
    ui.appendChild(this.root);
  }

  set(id: string, text: string): void {
    const cur = this.labels.get(id);
    if (!text) {
      if (cur) {
        cur.el.remove();
        this.labels.delete(id);
      }
      return;
    }
    if (cur) {
      if (cur.text !== text) {
        cur.text = text;
        cur.el.textContent = text;
      }
      return;
    }
    const el = document.createElement("div");
    el.className = "worker-label";
    el.textContent = text;
    this.root.appendChild(el);
    this.labels.set(id, { el, text });
  }

  remove(id: string): void {
    this.set(id, "");
  }

  update(
    camera: THREE.Camera,
    target: THREE.Vector3,
    positionOf: (id: string) => THREE.Vector2 | null,
    elevationOf: (id: string) => number,
    hiddenAt: (x: number, z: number) => boolean
  ): void {
    for (const [id, l] of this.labels) {
      const p = positionOf(id);
      if (!p) {
        l.el.style.display = "none";
        continue;
      }
      const dist = Math.hypot(p.x - target.x, p.y - target.z);
      if (dist > VISIBLE_RANGE || hiddenAt(p.x, p.y)) {
        l.el.style.display = "none";
        continue;
      }
      // just over the worker's head
      this.v.set(p.x, 2.05 + elevationOf(id), p.y).project(camera);
      if (this.v.z > 1 || this.v.x < -1.05 || this.v.x > 1.05 || this.v.y < -1.05 || this.v.y > 1.05) {
        l.el.style.display = "none";
        continue;
      }
      const sx = ((this.v.x + 1) / 2) * window.innerWidth;
      const sy = ((1 - this.v.y) / 2) * window.innerHeight;
      // shrink with the camera pulling back, so the chip stays in proportion
      // to the world instead of looming over a zoomed-out city
      const camDist = Math.hypot(
        (camera as THREE.PerspectiveCamera).position.x - p.x,
        (camera as THREE.PerspectiveCamera).position.y - 2,
        (camera as THREE.PerspectiveCamera).position.z - p.y
      );
      const scale = Math.min(1, Math.max(0.5, 26 / camDist));
      l.el.style.display = "";
      l.el.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) scale(${scale.toFixed(3)})`;
      l.el.style.transformOrigin = "50% 100%";
      l.el.style.opacity =
        dist < FADE_FROM ? "1" : String(1 - (dist - FADE_FROM) / (VISIBLE_RANGE - FADE_FROM));
    }
  }
}
