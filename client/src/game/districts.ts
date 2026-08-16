import * as THREE from "three";
import { CityMap, TILE_WORLD_SIZE as TS } from "@mc/shared";

// District view (toggled from the HUD): each district's blocks highlight in
// its own color, with a boundary outline and a name label that reads through
// buildings. Hidden entirely by default — the normal city stays untinted.

export interface DistrictEntry {
  id: number;
  name: string;
  colorCss: string;
  cx: number; // world-space centroid
  cz: number;
}

function districtHue(i: number): number {
  return (i * 0.61803) % 1; // golden-ratio hop keeps neighbors distinct
}

function districtLabel(name: string): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.font = "600 44px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "6px";
  ctx.strokeStyle = "rgba(10,12,16,0.85)";
  ctx.lineWidth = 8;
  ctx.strokeText(name.toUpperCase(), 256, 48);
  ctx.fillStyle = "rgba(240,236,224,0.97)";
  ctx.fillText(name.toUpperCase(), 256, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 4.9),
    // district view is a map mode: names read through buildings
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })
  );
  m.renderOrder = 999;
  return m;
}

export class DistrictOverlay {
  readonly group = new THREE.Group();
  readonly entries: DistrictEntry[] = [];
  private labels: THREE.Mesh[] = [];
  private on = false;

  constructor(map: CityMap) {
    map.districts.forEach((d, di) => {
      const hue = districtHue(di);
      const color = new THREE.Color().setHSL(hue, 0.62, 0.55);
      const fillMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      });
      const lineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color().setHSL(hue, 0.7, 0.65),
        transparent: true,
        opacity: 0.9,
      });
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      let cx = 0, cy = 0, area = 0;
      for (const bi of d.blocks) {
        const b = map.blocks[bi];
        if (!b) continue;
        // highlight the district's actual ground, block by block
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(b.w * TS, b.h * TS), fillMat);
        fill.rotation.x = -Math.PI / 2;
        fill.position.set((b.x + b.w / 2) * TS, 0.11, (b.y + b.h / 2) * TS);
        fill.renderOrder = 4;
        this.group.add(fill);
        x0 = Math.min(x0, b.x);
        y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.w);
        y1 = Math.max(y1, b.y + b.h);
        const a = b.w * b.h;
        cx += (b.x + b.w / 2) * a;
        cy += (b.y + b.h / 2) * a;
        area += a;
      }
      if (!area) return;
      const pts = [
        new THREE.Vector3(x0 * TS, 0.13, y0 * TS),
        new THREE.Vector3(x1 * TS, 0.13, y0 * TS),
        new THREE.Vector3(x1 * TS, 0.13, y1 * TS),
        new THREE.Vector3(x0 * TS, 0.13, y1 * TS),
        new THREE.Vector3(x0 * TS, 0.13, y0 * TS),
      ];
      const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      outline.renderOrder = 5;
      this.group.add(outline);

      const label = districtLabel(d.name);
      const wx = (cx / area) * TS;
      const wz = (cy / area) * TS;
      label.position.set(wx, 10, wz);
      this.group.add(label);
      this.labels.push(label);

      const c = new THREE.Color().setHSL(hue, 0.62, 0.55);
      this.entries.push({
        id: d.id,
        name: d.name,
        colorCss: `#${c.getHexString()}`,
        cx: wx,
        cz: wz,
      });
    });
    this.group.visible = false;
  }

  get active() {
    return this.on;
  }

  toggle(): boolean {
    this.on = !this.on;
    this.group.visible = this.on;
    return this.on;
  }

  // billboard the labels toward the camera while the view is active
  update(camera: THREE.Camera) {
    if (!this.on) return;
    for (const l of this.labels) l.quaternion.copy(camera.quaternion);
  }
}
