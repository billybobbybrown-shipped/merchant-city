import * as THREE from "three";
import {
  BuildingDef,
  cellInside,
  doorCells,
  FURNITURE,
  furnitureById,
  InteriorSpec,
  buildingFloors,
  interiorSpec,
  landingCells,
  LotDef,
  PlacedItem,
  validatePlacement,
  TILE_WORLD_SIZE as TS,
} from "@mc/shared";
import { Engine } from "../render/engine.js";
import { makeFurniture } from "../assets/furniture.js";
import { SERVER_URL, fmtMoney } from "../config.js";
import { ic } from "../ui/icons.js";

const FACING_ROT = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
// matches the storey height the exterior is built from
const FLOOR_H = 2.6;
// the slab's top surface sits this far above the storey base — everything that
// stands ON the floor (you included) stands here, not at the base
const FLOOR_TOP = 0.12;

interface Net {
  place(lotId: number, item: string, x: number, y: number, rot: number, floor: number): void;
  remove(lotId: number, furnId: number): void;
  openStorage(lotId: number, label: string, furnId: number | null): void;
  openCraft(lotId: number, station: string): void;
  openShop(lotId: number, furnId: number): void;
  openRack(lotId: number, furnId: number): void;
  openDock(lotId: number): void;
  canEdit(lotId: number): boolean;
  walk(x: number, z: number): void;
  elevate(y: number): void;
  closeFixtures(): void;
  stock(lotId: number): Promise<Record<string, number>>;
}

// Interior edit mode. The grid lives in the BUILDING's local frame — sized to
// the actual structural footprint (shared buildingLayout), rotated with the
// building — so interiors always match exteriors.
export class InteriorMode {
  lotId: number | null = null;
  private lot: LotDef | null = null;
  private spec: InteriorSpec | null = null;
  private items: PlacedItem[] = [];
  private root: THREE.Group | null = null;
  private itemMeshes = new Map<number, THREE.Object3D>();
  private ghost: THREE.Group | null = null;
  private ghostPad: THREE.Mesh | null = null;
  private selected: string | null = null;
  private rot = 0;
  private hoverCell: { x: number; y: number } | null = null;
  private hoverItem: number | null = null;
  private bar: HTMLElement | null = null;
  private mode: "interact" | "edit" = "interact";
  private hoverPad: THREE.Mesh | null = null;
  private savedCam: { target: THREE.Vector3; dist: number } | null = null;
  private hiddenBuilding: THREE.Object3D | null = null;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.12);

  constructor(
    private engine: Engine,
    private ui: HTMLElement,
    private net: Net,
    private myCash: () => number,
    private buildingObj: (lotId: number) => THREE.Object3D | null
  ) {
    window.addEventListener("keydown", (e) => {
      if (!this.lotId) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        if (this.mode === "edit") this.selected ? this.select(null) : this.setMode("interact");
        else this.exit();
      }
      // stairs, on the keyboard: works whether you're arranging or trading
      if (k === "pageup" || k === "]") this.setFloor(this.floor + 1);
      if (k === "pagedown" || k === "[") this.setFloor(this.floor - 1);
      if (this.mode !== "edit") return;
      if (k === "r" && this.selected) {
        this.rot = (this.rot + 1) % 4;
        this.refreshGhost();
      }
      if ((k === "x" || k === "delete") && this.hoverItem !== null)
        this.net.remove(this.lotId, this.hoverItem);
    });
    const dom = engine.renderer.domElement;
    dom.addEventListener("pointermove", (e) => this.onMove(e));
    dom.addEventListener("pointerup", (e) => {
      if (!this.lotId || e.button !== 0) return;
      if (this.mode === "edit") {
        if (this.selected && this.hoverCell)
          this.net.place(this.lotId, this.selected, this.hoverCell.x, this.hoverCell.y, this.rot, this.floor);
        return;
      }
      // interact mode: click furniture to use it
      if (this.hoverItem !== null) {
        const it = this.items.find((i) => i.id === this.hoverItem);
        const def = it ? furnitureById(it.item) : null;
        if (!it || !def) return;
        if (def?.dock) this.net.openDock(this.lotId);
        else if (def?.rack) this.net.openRack(this.lotId, it.id);
        else if (def?.machine) this.net.openCraft(this.lotId, it.item);
        else if (it.item === "shelf") this.net.openShop(this.lotId, it.id);
        else if (def.capacity) this.net.openStorage(this.lotId, def.label, it.id);
        return;
      }
      // empty floor: walk there. The server only tracks a position on the
      // ground plan, so the storey you're on is a local matter.
      if (this.hoverCell && this.root) {
        const l = this.cellLocal(this.hoverCell.x, this.hoverCell.y);
        const w = this.root.localToWorld(new THREE.Vector3(l.x, 0, l.z));
        this.net.walk(w.x, w.z);
      }
    });
  }

  // world-space rect of the open interior, for lifting whoever's inside onto
  // the storey surface with you (null when no interior is open)
  get openRect(): { x0: number; z0: number; x1: number; z1: number; y: number } | null {
    if (!this.lot || !this.active) return null;
    return {
      x0: this.lot.x * TS,
      z0: this.lot.y * TS,
      x1: (this.lot.x + this.lot.w) * TS,
      z1: (this.lot.y + this.lot.h) * TS,
      y: FLOOR_TOP + this.floor * FLOOR_H,
    };
  }

  get active() {
    return this.lotId !== null;
  }

  // cell → building-local position (x across the front, z front-to-back)
  private cellLocal(cx: number, cy: number): { x: number; z: number } {
    const s = this.spec!;
    return { x: -s.w / 2 + cx + 0.5, z: s.centerZ - s.h / 2 + cy + 0.5 };
  }

  async enter(lot: LotDef, building: BuildingDef) {
    if (this.active) this.exit();
    this.lot = lot;
    this.lotId = lot.id;
    this.buildingDef = building;
    this.floors = buildingFloors(building);
    this.floor = 0;
    this.plane.constant = -0.12;
    this.items = await fetch(`${SERVER_URL}/interior/${lot.id}`).then((r) => r.json());
    void this.refreshDock();

    const s0 = interiorSpec(lot, building, 0);
    this.savedCam = { target: this.engine.target.clone(), dist: this.engine.targetDist };
    this.engine.target.set((lot.x + lot.w / 2) * TS, 0, (lot.y + lot.h / 2) * TS);
    this.engine.targetDist = Math.max(s0.w, s0.h) * 1.9 + 8;

    this.hiddenBuilding = this.buildingObj(lot.id);
    if (this.hiddenBuilding) this.hiddenBuilding.visible = false;

    this.buildScene();
    this.net.elevate(FLOOR_TOP);
    this.mode = "interact";
    this.buildBar();
  }

  // Walk to another storey. Each floor is its own plan and its own furniture,
  // so the scene is rebuilt from the floor's spec.
  setFloor(n: number) {
    if (!this.lot || !this.buildingDef) return;
    const next = Math.max(0, Math.min(this.floors - 1, n));
    if (next === this.floor) return;
    this.floor = next;
    this.hoverItem = null;
    this.plane.constant = -(0.12 + this.floor * FLOOR_H);
    this.buildScene();
    // the camera and your character both climb with you
    this.engine.target.y = this.floor * FLOOR_H;
    this.net.elevate(FLOOR_TOP + this.floor * FLOOR_H);
    this.refreshGhost();
    this.buildBar();
  }

  private buildScene() {
    const lot = this.lot!;
    const building = this.buildingDef!;
    this.spec = interiorSpec(lot, building, this.floor);
    const s = this.spec;
    if (this.root) this.engine.scene.remove(this.root);
    this.itemMeshes.clear();

    // root group sits at the lot center, rotated like the building itself, and
    // lifted to the storey you're standing on so upstairs is genuinely upstairs
    this.root = new THREE.Group();
    this.root.position.set(
      (lot.x + lot.w / 2) * TS,
      this.floor * FLOOR_H,
      (lot.y + lot.h / 2) * TS
    );
    this.root.rotation.y = FACING_ROT[lot.facing] ?? 0;
    this.root.updateMatrixWorld(true);

    // floor with grid, one plane per room (main + wing) so L-shapes read right
    const gridFloor = (r: { x0: number; y0: number; w: number; h: number }) => {
      const c = document.createElement("canvas");
      c.width = r.w * 24;
      c.height = r.h * 24;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#8d8273";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      for (let x = 0; x <= r.w; x++) {
        ctx.beginPath();
        ctx.moveTo(x * 24 + 0.5, 0);
        ctx.lineTo(x * 24 + 0.5, c.height);
        ctx.stroke();
      }
      for (let y = 0; y <= r.h; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * 24 + 0.5);
        ctx.lineTo(c.width, y * 24 + 0.5);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(r.w, r.h),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(
        -s.w / 2 + r.x0 + r.w / 2,
        0.12,
        s.centerZ - s.h / 2 + r.y0 + r.h / 2
      );
      this.root!.add(floor);
    };
    for (const r of s.rects) gridFloor(r);

    // walls trace the union outline (merged runs per edge direction)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.9 });
    const wallH = 0.5;
    const T = 0.3;
    const inside = (x: number, y: number) => cellInside(s, x, y);
    const addWall = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
      m.position.set(x, 0.12 + wallH / 2, z);
      this.root!.add(m);
    };
    const lx = (cx: number) => -s.w / 2 + cx; // left edge of cell column
    const lz = (cy: number) => s.centerZ - s.h / 2 + cy; // top edge of cell row
    // exact-length wall runs; corners are closed by posts below (extending
    // runs would poke stubs into the room at the L's inner corner)
    for (let y = 0; y <= s.h; y++)
      for (const dir of [-1, 1] as const) {
        let run = -1;
        for (let x = 0; x <= s.w; x++) {
          const edge =
            x < s.w &&
            (dir === -1 ? inside(x, y) && !inside(x, y - 1) : inside(x, y - 1) && !inside(x, y));
          if (edge && run < 0) run = x;
          if (!edge && run >= 0) {
            addWall(x - run, T, lx(run) + (x - run) / 2, lz(y) + (dir === -1 ? -T / 2 : T / 2));
            run = -1;
          }
        }
      }
    for (let x = 0; x <= s.w; x++)
      for (const dir of [-1, 1] as const) {
        let run = -1;
        for (let y = 0; y <= s.h; y++) {
          const edge =
            y < s.h &&
            (dir === -1 ? inside(x, y) && !inside(x - 1, y) : inside(x - 1, y) && !inside(x, y));
          if (edge && run < 0) run = y;
          if (!edge && run >= 0) {
            addWall(T, y - run, lx(x) + (dir === -1 ? -T / 2 : T / 2), lz(run) + (y - run) / 2);
            run = -1;
          }
        }
      }
    // corner posts: convex corners (1 inside cell) sit diagonally opposite the
    // room; re-entrant corners (3 inside cells) sit in the outside notch
    for (let vy = 0; vy <= s.h; vy++)
      for (let vx = 0; vx <= s.w; vx++) {
        const a = inside(vx - 1, vy - 1);
        const b = inside(vx, vy - 1);
        const c = inside(vx - 1, vy);
        const d = inside(vx, vy);
        const cnt = +a + +b + +c + +d;
        if (cnt === 1) {
          const px = a || c ? 1 : -1;
          const pz = a || b ? 1 : -1;
          addWall(T, T, lx(vx) + (px * T) / 2, lz(vy) + (pz * T) / 2);
        } else if (cnt === 3) {
          const px = !a || !c ? -1 : 1;
          const pz = !a || !b ? -1 : 1;
          addWall(T, T, lx(vx) + (px * T) / 2, lz(vy) + (pz * T) / 2);
        }
      }
    for (const door of this.floor === 0
      ? doorCells(s)
      : landingCells(lot, building, this.floor)) {
      const dl = this.cellLocal(door.x, door.y);
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: 0x9fd8a2, transparent: true, opacity: 0.55 })
      );
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(dl.x, 0.14, dl.z);
      this.root.add(mark);
    }

    for (const it of this.items) if ((it.floor ?? 0) === this.floor) this.addItemMesh(it);
    this.engine.scene.add(this.root);
    this.root.updateMatrixWorld(true);
  }

  exit() {
    if (!this.active) return;
    this.net.elevate(0);
    this.net.closeFixtures();
    if (this.root) this.engine.scene.remove(this.root);
    if (this.hiddenBuilding) this.hiddenBuilding.visible = true;
    if (this.savedCam) {
      this.engine.target.copy(this.savedCam.target);
      this.engine.targetDist = this.savedCam.dist;
    }
    this.bar?.remove();
    this.bar = null;
    this.root = null;
    this.itemMeshes.clear();
    this.ghost = null;
    this.ghostPad = null;
    this.selected = null;
    this.hoverItem = null;
    this.lotId = null;
    this.lot = null;
    this.spec = null;
    this.dockFill = 0;
    this.shelfStock.clear();
  }

  applyPlaced(lotId: number, placed: PlacedItem) {
    if (lotId !== this.lotId) return;
    this.items.push(placed);
    if ((placed.floor ?? 0) === this.floor) this.addItemMesh(placed);
    this.refreshGhost();
    void this.refreshStock();
  }

  applyRemoved(lotId: number, furnId: number) {
    if (lotId !== this.lotId) return;
    this.items = this.items.filter((i) => i.id !== furnId);
    const m = this.itemMeshes.get(furnId);
    if (m && this.root) this.root.remove(m);
    this.itemMeshes.delete(furnId);
    if (this.hoverItem === furnId) this.hoverItem = null;
    this.refreshGhost();
    void this.refreshStock();
  }

  private addItemMesh(it: PlacedItem) {
    if (!this.root) return;
    const def = furnitureById(it.item);
    if (!def) return;
    const g = makeFurniture(
      it.item,
      this.dockFill,
      it.item === "shelf" ? this.shelfStock.get(it.id) ?? {} : {}
    );
    const fp = it.rot % 2 === 0 ? { w: def.w, h: def.h } : { w: def.h, h: def.w };
    const base = this.cellLocal(it.x, it.y);
    g.position.set(base.x - 0.5 + fp.w / 2, 0.12, base.z - 0.5 + fp.h / 2);
    g.rotation.y = (-it.rot * Math.PI) / 2;
    this.root.add(g);
    this.itemMeshes.set(it.id, g);
  }

  select(item: string | null) {
    this.selected = item;
    this.rot = 0;
    this.bar?.querySelectorAll(".fb-item").forEach((b) => {
      b.classList.toggle("active", (b as HTMLElement).dataset.item === item);
    });
    this.refreshGhost();
  }

  private refreshGhost() {
    if (!this.root || !this.spec) return;
    if (this.ghost) {
      this.root.remove(this.ghost);
      this.ghost = null;
    }
    if (this.ghostPad) {
      this.root.remove(this.ghostPad);
      this.ghostPad = null;
    }
    if (!this.selected || !this.hoverCell || !this.lot) return;
    const def = furnitureById(this.selected)!;
    const fp = this.rot % 2 === 0 ? { w: def.w, h: def.h } : { w: def.h, h: def.w };
    const valid =
      validatePlacement(this.lot, this.buildingDef!, this.items, {
        item: this.selected,
        x: this.hoverCell.x,
        y: this.hoverCell.y,
        rot: this.rot,
        floor: this.floor,
      }) === null;

    const base = this.cellLocal(this.hoverCell.x, this.hoverCell.y);
    this.ghost = makeFurniture(this.selected);
    this.ghost.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m) {
        const clone = m.clone();
        clone.transparent = true;
        clone.opacity = 0.55;
        (o as THREE.Mesh).material = clone;
      }
    });
    this.ghost.position.set(base.x - 0.5 + fp.w / 2, 0.12, base.z - 0.5 + fp.h / 2);
    this.ghost.rotation.y = (-this.rot * Math.PI) / 2;
    this.root.add(this.ghost);

    this.ghostPad = new THREE.Mesh(
      new THREE.PlaneGeometry(fp.w, fp.h),
      new THREE.MeshBasicMaterial({
        color: valid ? 0x5fae6b : 0xc0564a,
        transparent: true,
        opacity: 0.4,
      })
    );
    this.ghostPad.rotation.x = -Math.PI / 2;
    this.ghostPad.position.set(base.x - 0.5 + fp.w / 2, 0.13, base.z - 0.5 + fp.h / 2);
    this.root.add(this.ghostPad);
  }

  private buildingDef: BuildingDef | null = null;

  private onMove(e: PointerEvent) {
    if (!this.active || !this.lot || !this.spec || !this.root) return;
    const ndc = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    this.ray.setFromCamera(ndc, this.engine.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return;
    const local = this.root.worldToLocal(hit.clone());
    const s = this.spec;
    const cx = Math.floor(local.x + s.w / 2);
    const cy = Math.floor(local.z - s.centerZ + s.h / 2);
    if (cx < 0 || cy < 0 || cx >= s.w || cy >= s.h) {
      this.hoverCell = null;
      this.hoverItem = null;
      this.refreshGhost();
      return;
    }
    this.hoverCell = { x: cx, y: cy };
    this.hoverItem = null;
    for (const it of this.items) {
      if ((it.floor ?? 0) !== this.floor) continue;
      const def = furnitureById(it.item)!;
      const fp = it.rot % 2 === 0 ? { w: def.w, h: def.h } : { w: def.h, h: def.w };
      if (cx >= it.x && cx < it.x + fp.w && cy >= it.y && cy < it.y + fp.h) {
        this.hoverItem = it.id;
        break;
      }
    }
    this.refreshGhost();
  }

  setMode(mode: "interact" | "edit") {
    this.mode = mode;
    if (mode === "interact") this.select(null);
    this.buildBar();
    if (mode === "edit") void this.refreshStock();
  }

  // how full this building's delivery bay is, so the pallets indoors show the
  // same load the bay panel reports
  private dockFill = 0;
  // each shelf's own stock, keyed by the shelf, so a gondola shows what it
  // actually sells rather than a share of the whole shop
  private shelfStock = new Map<number, Record<string, number>>();

  async refreshShelves() {
    if (this.lotId === null) return;
    const lotId = this.lotId;
    const d = await fetch(`${SERVER_URL}/shop/${lotId}`)
      .then((r) => r.json())
      .catch(() => null);
    if (this.lotId !== lotId || !d?.shelves) return;
    const next = new Map<number, Record<string, number>>();
    for (const sh of d.shelves as Array<{ furnId: number; item: string | null; qty: number }>)
      next.set(sh.furnId, sh.item && sh.qty > 0 ? { [sh.item]: sh.qty } : {});
    const changed = [...next].filter(
      ([id, v]) => JSON.stringify(this.shelfStock.get(id) ?? {}) !== JSON.stringify(v)
    );
    if (!changed.length) return;
    this.shelfStock = next;
    for (const [furnId] of changed) {
      const it = this.items.find((i) => i.id === furnId);
      if (!it || (it.floor ?? 0) !== this.floor) continue;
      const old = this.itemMeshes.get(it.id);
      if (old && this.root) this.root.remove(old);
      this.itemMeshes.delete(it.id);
      this.addItemMesh(it);
    }
  }
  private floor = 0;
  private floors = 1;

  get currentFloor() {
    return this.floor;
  }
  get floorCount() {
    return this.floors;
  }

  async refreshDock() {
    if (this.lotId === null) return;
    const lotId = this.lotId;
    const view = await fetch(`${SERVER_URL}/dock/${lotId}`)
      .then((r) => r.json())
      .catch(() => null);
    if (this.lotId !== lotId) return;
    const used = view ? Object.values(view.stock as Record<string, number>).reduce((a, b) => a + b, 0) : 0;
    const next = view?.capacity ? Math.min(1, used / view.capacity) : 0;
    if (Math.abs(next - this.dockFill) < 0.01) return;
    this.dockFill = next;
    // redraw only the bays — everything else on the floor is unchanged
    for (const it of this.items) {
      if (!furnitureById(it.item)?.dock || (it.floor ?? 0) !== this.floor) continue;
      const old = this.itemMeshes.get(it.id);
      if (old && this.root) this.root.remove(old);
      this.itemMeshes.delete(it.id);
      this.addItemMesh(it);
    }
  }

  // fixtures are items now — the bar shows how many you have on hand
  private stock: Record<string, number> = {};

  async refreshStock() {
    if (this.mode !== "edit" || this.lotId === null) return;
    this.stock = await this.net.stock(this.lotId);
    this.bar?.querySelectorAll<HTMLElement>(".fb-item").forEach((b) => {
      const id = b.dataset.item!;
      const n = this.stock[id] ?? 0;
      const el = b.querySelector(".fb-cost");
      if (!el) return;
      el.textContent = n > 0 ? `x${n}` : fmtMoney(furnitureById(id)!.cost);
      el.classList.toggle("fb-owned", n > 0);
    });
  }

  // a lift you can actually press: only shown when there is somewhere to go
  private floorControl(): string {
    if (this.floors <= 1) return "";
    return `<span class="fb-floors">
        <button class="fb-fl fb-down" ${this.floor === 0 ? "disabled" : ""} title="Down a floor">▼</button>
        <span class="fb-fl-label">${this.floor === 0 ? "Ground floor" : `Floor ${this.floor + 1}`} <i>of ${this.floors}</i></span>
        <button class="fb-fl fb-up" ${this.floor >= this.floors - 1 ? "disabled" : ""} title="Up a floor">▲</button>
      </span>`;
  }

  private wireFloorControl() {
    this.bar?.querySelector(".fb-up")?.addEventListener("click", () => this.setFloor(this.floor + 1));
    this.bar?.querySelector(".fb-down")?.addEventListener("click", () => this.setFloor(this.floor - 1));
  }

  private buildBar() {
    this.bar?.remove();
    this.bar = document.createElement("div");
    this.bar.className = "panel furn-bar";
    if (this.mode === "interact") {
      this.bar.innerHTML = `
        <div class="fb-head">
          <span>${this.lotId !== null && this.net.canEdit(this.lotId) ? "INTERIOR — click a machine to produce · click racks & shelves for storage · Esc leave" : "VISITING — browse the shelves · Esc leave"}</span>
          <span class="fb-actions">
            ${this.floorControl()}
            ${this.lotId !== null && this.net.canEdit(this.lotId) ? `<button class="btn-secondary fb-edit">${ic("edit", 14)} Edit layout</button>` : ""}
            <button class="lp-close fb-exit">✕</button>
          </span>
        </div>`;
      this.ui.appendChild(this.bar);
      this.bar.querySelector(".fb-exit")?.addEventListener("click", () => this.exit());
      this.bar.querySelector(".fb-edit")?.addEventListener("click", () => this.setMode("edit"));
      this.wireFloorControl();
      return;
    }
    const buttons = FURNITURE.map((f) => {
      const n = this.stock[f.id] ?? 0;
      const tip =
        n > 0 ? `${f.label} — you have ${n}` : `${f.label} — none on hand, city sells for ${fmtMoney(f.cost)}`;
      return `<button class="fb-item" data-item="${f.id}" title="${tip}">
          ${ic(f.id, 14)}<span>${f.label}</span>
          <span class="fb-cost ${n > 0 ? "fb-owned" : ""}">${n > 0 ? `x${n}` : fmtMoney(f.cost)}</span>
        </button>`;
    }).join("");
    this.bar.innerHTML = `
      <div class="fb-head">
        <span>EDIT LAYOUT — placing uses items from storage or pocket (or buys from the city) · R rotate · X remove · Esc done</span>
        <span class="fb-actions">
          ${this.floorControl()}
          <button class="btn-secondary fb-done">Done</button>
          <button class="lp-close fb-exit">✕</button>
        </span>
      </div>
      <div class="fb-items">${buttons}</div>`;
    this.ui.appendChild(this.bar);
    this.bar.querySelector(".fb-exit")?.addEventListener("click", () => this.exit());
    this.bar.querySelector(".fb-done")?.addEventListener("click", () => this.setMode("interact"));
    this.wireFloorControl();
    this.bar.querySelectorAll(".fb-item").forEach((b) =>
      b.addEventListener("click", () => {
        const id = (b as HTMLElement).dataset.item!;
        this.select(this.selected === id ? null : id);
      })
    );
  }
}
