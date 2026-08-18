import * as THREE from "three";
import {
  buildCost,
  CustomPlan,
  itemById,
  lotCellSize,
  LotDef,
  MAX_FLOORS,
  MAX_SECTIONS,
  MIN_SECTION,
  PlanRect,
  planArea,
  SOURCE_TYPES,
  FARM_TYPES,
  QUARRY_TYPES,
  DEPLETING_TYPES,
  DOCK_BUILD_COST,
  DOCK_SIZE,
  sourceByType,
  sourceSetupCost,
  sourceYield,
  shapesOverlap,
  validatePlan,
  TILE_WORLD_SIZE as TS,
  BUILD_TEMPLATES,
  templateFits,
} from "@mc/shared";
import { Engine } from "../render/engine.js";
import { fmtMoney } from "../config.js";
import { ic } from "../ui/icons.js";

const FACING_ROT = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
const FLOOR_H = 2.6;

interface Net {
  build(lotId: number, rects: PlanRect[], floors: number): void;
  buildTemplate(lotId: number, template: string): void;
  setupSource(lotId: number, type: string, rects: PlanRect[]): void;
  buildDock(lotId: number, x: number, y: number): void;
  demolishArea(lotId: number, rect: { x: number; y: number; w: number; h: number }): void;
}

// what's already on the lot — both can coexist (building + field)
export interface Existing {
  building?: { shape: PlanRect[] };
  source?: { type: string; shape: PlanRect[] };
  dock?: { x: number; y: number };
}

// Freeform construction: drag rectangles on your lot (up to 3 connected
// sections), pick floors, confirm. Costs preview live; material requirements
// are shown ready for the Phase 2 goods economy.
export class BuildMode {
  lotId: number | null = null;
  private lot: LotDef | null = null;
  private cells = { w: 0, h: 0 };
  private rects: PlanRect[] = [];
  private floors = 1;
  private kind = "building"; // "building" | "farm" | non-farm SourceType
  private crop = "farm_wheat";
  private dig = "quarry_stone"; // which farm when kind === "farm"
  private existing: Existing | null = null;
  private dragStart: { x: number; y: number } | null = null;
  private preview: PlanRect | null = null;
  private root: THREE.Group | null = null;
  private ghostGroup: THREE.Group | null = null;
  private previewMesh: THREE.Mesh | null = null;
  private bar: HTMLElement | null = null;
  private savedCam: { target: THREE.Vector3; dist: number } | null = null;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1);

  constructor(
    private engine: Engine,
    private ui: HTMLElement,
    private net: Net,
    private myCash: () => number
  ) {
    const dom = engine.renderer.domElement;
    window.addEventListener("keydown", (e) => {
      if (this.active && e.key === "Escape") this.exit();
    });
    dom.addEventListener("pointerdown", (e) => {
      if (!this.active || e.button !== 0) return;
      const c = this.cellAt(e);
      if (!c) return;
      if (this.kind === "dock") {
        // the bay is a single pallet — one click sets where it goes, so long as
        // the spot is free
        const pad = { x: c.x, y: c.y, w: DOCK_SIZE, h: DOCK_SIZE };
        if (shapesOverlap([pad], this.occupied())) return;
        this.rects = [pad];
        this.renderGhosts();
        this.updateBar();
        return;
      }
      this.dragStart = c;
      this.preview = { x: c.x, y: c.y, w: 1, h: 1 };
      this.renderPreview();
    });
    dom.addEventListener("pointermove", (e) => {
      if (!this.active) return;
      if (this.kind === "dock" && !this.rects.length) {
        const c = this.cellAt(e, true);
        if (c) {
          this.preview = { x: c.x, y: c.y, w: DOCK_SIZE, h: DOCK_SIZE };
          this.renderPreview();
        }
        return;
      }
      if (!this.dragStart) return;
      const c = this.cellAt(e, true);
      if (!c) return;
      this.preview = {
        x: Math.min(this.dragStart.x, c.x),
        y: Math.min(this.dragStart.y, c.y),
        w: Math.abs(c.x - this.dragStart.x) + 1,
        h: Math.abs(c.y - this.dragStart.y) + 1,
      };
      this.renderPreview();
    });
    dom.addEventListener("pointerup", (e) => {
      if (!this.active || e.button !== 0) return;
      if (this.kind === "demolish") {
        if (this.lotId && this.preview) this.net.demolishArea(this.lotId, { ...this.preview });
        this.dragStart = null;
        this.preview = null;
        this.renderPreview();
        return;
      }
      // buildings need 3x3 sections; production sites go down to a single tile
      const minS = this.srcType() === null ? MIN_SECTION : 1;
      if (this.dragStart && this.preview && this.preview.w >= minS && this.preview.h >= minS) {
        if (this.combinedRects().length < MAX_SECTIONS && !shapesOverlap([this.preview], this.occupied())) {
          this.rects.push(this.srcType() === null ? { ...this.preview, f: this.floors } : this.preview);
          this.renderGhosts();
          this.updateBar();
        }
      }
      this.dragStart = null;
      this.preview = null;
      this.renderPreview();
    });
  }

  get active() {
    return this.lotId !== null;
  }

  private cellAt(e: PointerEvent, clamp = false): { x: number; y: number } | null {
    if (!this.root || !this.lot) return null;
    const ndc = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    this.ray.setFromCamera(ndc, this.engine.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return null;
    const local = this.root.worldToLocal(hit.clone());
    let x = Math.floor(local.x + this.cells.w / 2);
    let y = Math.floor(local.z + this.cells.h / 2);
    if (clamp) {
      x = Math.max(0, Math.min(this.cells.w - 1, x));
      y = Math.max(0, Math.min(this.cells.h - 1, y));
    } else if (x < 0 || y < 0 || x >= this.cells.w || y >= this.cells.h) return null;
    return { x, y };
  }

  private cellLocal(cx: number, cy: number) {
    return { x: -this.cells.w / 2 + cx, z: -this.cells.h / 2 + cy };
  }

  enter(lot: LotDef, existing: Existing | null = null) {
    if (this.active) this.exit();
    this.lot = lot;
    this.lotId = lot.id;
    this.cells = lotCellSize(lot);
    this.rects = [];
    this.existing = existing;
    this.floors = 1;
    this.kind = "building";
    const exSrc = existing?.source?.type;
    this.crop = exSrc && FARM_TYPES.includes(exSrc) ? exSrc : "farm_wheat";
    this.dig = exSrc && QUARRY_TYPES.includes(exSrc) ? exSrc : "quarry_stone";

    this.savedCam = { target: this.engine.target.clone(), dist: this.engine.targetDist };
    this.engine.target.set((lot.x + lot.w / 2) * TS, 0, (lot.y + lot.h / 2) * TS);
    this.engine.targetDist = Math.max(this.cells.w, this.cells.h) * 1.9 + 10;

    this.root = new THREE.Group();
    this.root.position.set((lot.x + lot.w / 2) * TS, 0, (lot.y + lot.h / 2) * TS);
    this.root.rotation.y = FACING_ROT[lot.facing] ?? 0;
    this.root.updateMatrixWorld(true);

    // drawing grid over the whole lot
    const c = document.createElement("canvas");
    c.width = this.cells.w * 20;
    c.height = this.cells.h * 20;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(20, 26, 34, 0.55)";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(232, 216, 174, 0.28)";
    for (let x = 0; x <= this.cells.w; x++) {
      ctx.beginPath();
      ctx.moveTo(x * 20 + 0.5, 0);
      ctx.lineTo(x * 20 + 0.5, c.height);
      ctx.stroke();
    }
    for (let y = 0; y <= this.cells.h; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * 20 + 0.5);
      ctx.lineTo(c.width, y * 20 + 0.5);
      ctx.stroke();
    }
    // street edge marker (front)
    ctx.fillStyle = "rgba(159, 216, 162, 0.5)";
    ctx.fillRect(0, c.height - 5, c.width, 5);
    const tex = new THREE.CanvasTexture(c);
    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(this.cells.w, this.cells.h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.1;
    this.root.add(grid);

    this.ghostGroup = new THREE.Group();
    this.root.add(this.ghostGroup);
    this.engine.scene.add(this.root);
    this.root.updateMatrixWorld(true);
    this.buildBar();
    this.updateBar();
  }

  exit() {
    if (!this.active) return;
    this.existing = null;
    if (this.root) this.engine.scene.remove(this.root);
    if (this.savedCam) {
      this.engine.target.copy(this.savedCam.target);
      this.engine.targetDist = this.savedCam.dist;
    }
    this.bar?.remove();
    this.bar = null;
    this.root = null;
    this.ghostGroup = null;
    this.previewMesh = null;
    this.lotId = null;
    this.lot = null;
    this.dragStart = null;
    this.preview = null;
  }

  // construction/setup started (broadcast came back) → leave the designer
  onLotUpdate(lotId: number, developed: boolean) {
    if (this.active && lotId === this.lotId && developed) this.exit();
  }

  private plan(): CustomPlan {
    return { rects: this.rects, floors: this.floors };
  }

  // the actual source type behind the picker ("farm" expands to the chosen crop)
  private srcType(): string | null {
    if (this.kind === "building" || this.kind === "dock") return null;
    if (this.kind === "farm") return this.crop;
    if (this.kind === "quarry") return this.dig;
    return this.kind;
  }

  // full shape of the thing being drawn: existing same-kind sections + new ones
  private combinedRects(): PlanRect[] {
    const src = this.srcType();
    const prior = src === null ? this.existing?.building?.shape : this.existing?.source?.shape;
    return prior ? [...prior, ...this.rects] : this.rects;
  }

  // the OTHER kind's ground — new sections must stay off it
  private blockedShape(): PlanRect[] {
    return (this.srcType() === null ? this.existing?.source?.shape : this.existing?.building?.shape) ?? [];
  }

  private renderGhosts() {
    if (!this.ghostGroup) return;
    this.ghostGroup.clear();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc9cdd2,
      transparent: true,
      opacity: 0.42,
      roughness: 0.8,
    });
    const edge = new THREE.MeshBasicMaterial({ color: 0xe8d8ae, transparent: true, opacity: 0.7 });
    const isSrc = this.srcType() !== null;
    // what's already on the lot: fixed, darker, not undoable
    const fixed = (rects: PlanRect[], color: number, hOf: (r: PlanRect) => number) => {
      const exMat = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        roughness: 0.9,
      });
      for (const r of rects) {
        const p = this.cellLocal(r.x, r.y);
        const h = hOf(r);
        const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, h, r.h), exMat);
        m.position.set(p.x + r.w / 2, h / 2 + 0.1, p.z + r.h / 2);
        this.ghostGroup!.add(m);
      }
    };
    if (this.existing?.building) fixed(this.existing.building.shape, 0x8a9099, (r) => (r.f ?? 1) * FLOOR_H);
    if (this.existing?.source) {
      const sd = sourceByType(this.existing.source.type);
      const dug = DEPLETING_TYPES.includes(this.existing.source.type);
      // workings sit proud enough to see the claim; fields read as low crop rows
      fixed(this.existing.source.shape, dug ? 0x7d8288 : 0x6f8f4a, () => (dug ? 0.9 : 0.45));
      void sd;
    }
    if (this.existing?.dock)
      fixed([{ x: this.existing.dock.x, y: this.existing.dock.y, w: DOCK_SIZE, h: DOCK_SIZE }], 0xb08d5e, () => 0.5);
    for (const r of this.rects) {
      const p = this.cellLocal(r.x, r.y);
      const h = isSrc ? 0.25 : (r.f ?? this.floors) * FLOOR_H;
      const boxm = new THREE.Mesh(
        new THREE.BoxGeometry(r.w, h, r.h),
        isSrc
          ? new THREE.MeshStandardMaterial({ color: 0x7a9a5a, transparent: true, opacity: 0.5, roughness: 0.9 })
          : mat
      );
      boxm.position.set(p.x + r.w / 2, h / 2 + 0.1, p.z + r.h / 2);
      this.ghostGroup.add(boxm);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.06, r.h), edge);
      rim.position.set(p.x + r.w / 2, h + 0.12, p.z + r.h / 2);
      this.ghostGroup.add(rim);
    }
  }

  // every cell already spoken for on this plot
  private occupied(): PlanRect[] {
    const out: PlanRect[] = [];
    if (this.existing?.building?.shape) out.push(...this.existing.building.shape);
    if (this.existing?.source?.shape) out.push(...this.existing.source.shape);
    if (this.existing?.dock)
      out.push({ x: this.existing.dock.x, y: this.existing.dock.y, w: DOCK_SIZE, h: DOCK_SIZE });
    return out;
  }

  private renderPreview() {
    if (!this.root) return;
    if (this.previewMesh) {
      this.root.remove(this.previewMesh);
      this.previewMesh = null;
    }
    if (!this.preview || !this.lot) return;
    // a delivery pad is its own fixed size — judge it on whether it fits the
    // plot, not on the rules for building sections
    const isDock = this.kind === "dock";
    const wrecking = this.kind === "demolish";
    const minS = wrecking ? 1 : isDock ? DOCK_SIZE : this.srcType() === null ? MIN_SECTION : 1;
    const candidate = isDock
      ? { rects: [this.preview], floors: 1 }
      : { rects: [...this.combinedRects(), this.preview], floors: this.floors };
    // nothing may sit on top of what is already there — the same rule the
    // server enforces, shown live as you drag
    const ok = wrecking
      ? true
      : this.preview.w >= minS &&
        this.preview.h >= minS &&
        !shapesOverlap([this.preview], this.occupied()) &&
        (isDock || this.combinedRects().length < MAX_SECTIONS) &&
        validatePlan(this.lot, candidate, minS) === null;
    const p = this.cellLocal(this.preview.x, this.preview.y);
    this.previewMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.preview.w, this.preview.h),
      new THREE.MeshBasicMaterial({
        color: wrecking ? 0xe2685c : ok ? 0x5fae6b : 0xc0564a,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    this.previewMesh.rotation.x = -Math.PI / 2;
    this.previewMesh.position.set(p.x + this.preview.w / 2, 0.14, p.z + this.preview.h / 2);
    this.root.add(this.previewMesh);
  }

  private buildBar() {
    this.bar = document.createElement("div");
    this.bar.className = "panel bm-bar";
    const FARM_CROPS = FARM_TYPES;
    const kinds = [
      `<button class="bm-kind active" data-kind="building">${ic("design", 16)}<span>Building</span></button>`,
      ...SOURCE_TYPES.filter(
        (sd) => !FARM_CROPS.includes(sd.type) && !QUARRY_TYPES.includes(sd.type)
      ).map(
        (sd) => `<button class="bm-kind" data-kind="${sd.type}" title="${sd.label}">${ic(sd.item, 16)}<span>${sd.label}</span></button>`
      ),
      `<button class="bm-kind" data-kind="farm">${ic("wheat", 16)}<span>Farm</span></button>`,
      `<button class="bm-kind" data-kind="quarry">${ic("stone", 16)}<span>Quarry</span></button>`,
      `<button class="bm-kind" data-kind="dock">${ic("box", 16)}<span>Delivery space</span></button>`,
    ].join("");
    const digs = QUARRY_TYPES.map((t) => {
      const sd = sourceByType(t)!;
      const label = itemById(sd.item)?.label ?? sd.item;
      return `<button class="bm-dig ${t === this.dig ? "active" : ""}" data-dig="${t}" title="${sd.label}">${ic(sd.item, 15)}<span>${label}</span></button>`;
    }).join("");
    const crops = FARM_CROPS.map((t) => {
      const sd = sourceByType(t)!;
      const label = itemById(sd.item)?.label ?? sd.item;
      return `<button class="bm-crop ${t === this.crop ? "active" : ""}" data-crop="${t}" title="${sd.label}">${ic(sd.item, 15)}<span>${label}</span></button>`;
    }).join("");
    const header =
      "BUILD — pick what to make, drag its layout · same type joins/expands what's there, apart = separate · Esc cancel";
    this.bar.innerHTML = `
      <div class="fb-head">
        <span>${header}</span>
        <button class="lp-close bm-exit">✕</button>
      </div>
      <div class="bm-kinds">${kinds}</div>
      <div class="bm-crops bm-temps"><span class="bm-label">Type</span>
        <button class="bm-crop bm-temp active" data-id="custom" title="Draw your own outline">${ic("design", 15)}<span>Custom</span></button>
        ${BUILD_TEMPLATES.map((t) => {
          const fits = this.lot ? templateFits(t, this.lot) : false;
          return `<button class="bm-crop bm-temp" data-id="${t.id}" ${fits ? "" : "disabled"}
            title="${
              fits
                ? `$${t.cost.toLocaleString()} · ${t.floors} floor${t.floors > 1 ? "s" : ""} · ${t.buildMinutes} min · needs ${t.minW * 2}×${t.minD * 2} m`
                : `Too small — needs a ${t.minW * 2}×${t.minD * 2} m lot (this one is ${(this.lot?.w ?? 0) * 2}×${(this.lot?.h ?? 0) * 2} m)`
            }">
            ${ic(`kind_${t.kind}`, 15)}<span>${t.label}</span></button>`;
        }).join("")}
      </div>
      <div class="bm-crops" style="display:none"><span class="bm-label">Crop</span>${crops}</div>
      <div class="bm-digs" style="display:none"><span class="bm-label">Resource</span>${digs}</div>
      <div class="bm-row">
        <div class="bm-floors">
          <span class="bm-label">Floors</span>
          <button class="bm-fbtn bm-minus">−</button>
          <span class="bm-fval">1</span>
          <button class="bm-fbtn bm-plus">+</button>
        </div>
        <div class="bm-cost"></div>
        <div class="bm-actions">
          <button class="btn-secondary bm-wreck">Demolish</button>
          <button class="btn-primary bm-confirm" disabled>Build</button>
        </div>
      </div>
      <div class="bm-materials"></div>`;
    this.ui.appendChild(this.bar);
    // a lot only hosts one production type: other source chips are locked
    const exSrc = this.existing?.source?.type;
    if (exSrc) {
      const isFarm = FARM_TYPES.includes(exSrc);
      this.bar.querySelectorAll<HTMLButtonElement>(".bm-kind").forEach((b) => {
        const k = b.dataset.kind!;
        // a delivery space isn't a production type — it can sit alongside
        // whatever the plot already grows or digs
        if (k === "building" || k === "dock") return;
        const matches =
          k === exSrc ||
          (k === "farm" && isFarm) ||
          (k === "quarry" && QUARRY_TYPES.includes(exSrc));
        if (!matches) {
          b.disabled = true;
          b.classList.add("bm-kind-locked");
          b.title = "This lot already has a different production type";
        }
      });
      this.bar.querySelectorAll<HTMLButtonElement>(".bm-dig").forEach((b) => {
        if (b.dataset.dig !== exSrc) {
          b.disabled = true;
          b.classList.add("bm-kind-locked");
        }
      });
      this.bar.querySelectorAll<HTMLButtonElement>(".bm-crop[data-crop]").forEach((b) => {
        if (b.dataset.crop !== exSrc) {
          b.disabled = true;
          b.classList.add("bm-kind-locked");
        }
      });
    }
    this.bar.querySelectorAll<HTMLButtonElement>(".bm-temp").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.id!;
        this.bar?.querySelectorAll(".bm-temp").forEach((x) => x.classList.toggle("active", x === b));
        if (id === "custom" || !this.lot) return;
        this.net.buildTemplate(this.lot.id, id);
        this.exit();
      })
    );
    this.bar.querySelector(".bm-exit")?.addEventListener("click", () => this.exit());
    this.bar.querySelector(".bm-wreck")?.addEventListener("click", () => {
      const on = this.kind !== "demolish";
      this.kind = on ? "demolish" : "building";
      if (on) {
        this.rects = [];
        this.preview = null;
        this.renderPreview();
        this.renderGhosts();
      }
      this.bar?.querySelector(".bm-wreck")?.classList.toggle("active", on);
      const confirmEl = this.bar?.querySelector<HTMLElement>(".bm-confirm");
      if (confirmEl) confirmEl.style.display = on ? "none" : "";
      this.bar?.querySelectorAll(".bm-kind").forEach((x) => x.classList.toggle("active", false));
      this.updateBar();
    });
    this.bar.querySelectorAll<HTMLElement>(".bm-kind").forEach((b) =>
      b.addEventListener("click", () => {
        this.kind = b.dataset.kind!;
        this.bar?.querySelectorAll(".bm-kind").forEach((x) => x.classList.toggle("active", x === b));
        this.bar?.querySelector(".bm-wreck")?.classList.remove("active");
        const confirmEl = this.bar?.querySelector<HTMLElement>(".bm-confirm");
        if (confirmEl) confirmEl.style.display = "";
        const floorsEl = this.bar?.querySelector<HTMLElement>(".bm-floors");
        if (floorsEl) floorsEl.style.display = this.kind === "building" ? "" : "none";
        const cropsEl = this.bar?.querySelector<HTMLElement>(".bm-crops:not(.bm-temps)");
        if (cropsEl) cropsEl.style.display = this.kind === "farm" ? "" : "none";
        const tempsEl = this.bar?.querySelector<HTMLElement>(".bm-temps");
        if (tempsEl) tempsEl.style.display = this.kind === "building" ? "" : "none";
        const digsEl = this.bar?.querySelector<HTMLElement>(".bm-digs");
        if (digsEl) digsEl.style.display = this.kind === "quarry" ? "" : "none";
        if (this.kind === "demolish") {
          this.rects = [];
          this.preview = null;
          this.renderPreview();
        }
        this.renderGhosts();
        this.updateBar();
      })
    );
    this.bar.querySelectorAll<HTMLElement>(".bm-dig").forEach((b) =>
      b.addEventListener("click", () => {
        this.dig = b.dataset.dig!;
        this.bar?.querySelectorAll(".bm-dig").forEach((x) => x.classList.toggle("active", x === b));
        this.updateBar();
      })
    );
    this.bar.querySelectorAll<HTMLElement>(".bm-crop").forEach((b) =>
      b.addEventListener("click", () => {
        this.crop = b.dataset.crop!;
        this.bar?.querySelectorAll(".bm-crop").forEach((x) => x.classList.toggle("active", x === b));
        this.updateBar();
      })
    );
    this.bar.querySelector(".bm-minus")?.addEventListener("click", () => {
      this.floors = Math.max(1, this.floors - 1);
      this.renderGhosts();
      this.updateBar();
    });
    this.bar.querySelector(".bm-plus")?.addEventListener("click", () => {
      this.floors = Math.min(MAX_FLOORS, this.floors + 1);
      this.renderGhosts();
      this.updateBar();
    });
    this.bar.querySelector(".bm-confirm")?.addEventListener("click", () => {
      if (!this.lotId) return;
      if (this.kind === "dock") {
        const pad = this.rects[0];
        if (!pad) return;
        this.net.buildDock(this.lotId, pad.x, pad.y);
        this.exit();
        return;
      }
      const src = this.srcType();
      if (!src) this.net.build(this.lotId, this.rects, this.floors);
      else this.net.setupSource(this.lotId, src, this.rects);
    });
  }

  private updateBar() {
    if (!this.bar || !this.lot) return;
    this.bar.querySelector(".bm-fval")!.textContent = String(this.floors);
    const costEl = this.bar.querySelector(".bm-cost")!;
    const matEl = this.bar.querySelector(".bm-materials")!;
    const confirm = this.bar.querySelector<HTMLButtonElement>(".bm-confirm")!;
    const srcType = this.srcType();
    const srcDef = srcType ? sourceByType(srcType) : undefined;

    if (this.kind === "demolish") {
      costEl.textContent = "Drag over what you want gone — a single tile or the whole plot";
      matEl.textContent = "Buildings and workings cost $250 to clear; a delivery space is free";
      confirm.disabled = true;
      return;
    }
    // a delivery space is a fixed fitting, not an area you draw
    if (this.kind === "dock") {
      const afford = this.myCash() >= DOCK_BUILD_COST;
      if (!this.rects.length) {
        costEl.textContent = "Click where the pallet goes";
        matEl.textContent = "";
        confirm.disabled = true;
        confirm.textContent = "Build";
        return;
      }
      costEl.innerHTML = afford
        ? `<b>${fmtMoney(DOCK_BUILD_COST)}</b> · where goods arrive and leave this plot`
        : `<span class="bm-bad">You need ${fmtMoney(DOCK_BUILD_COST)}</span>`;
      matEl.textContent = "Haulers carry between delivery spaces; managers move goods to the racks";
      confirm.disabled = !afford;
      confirm.textContent = "Build";
      return;
    }

    if (!this.rects.length) {
      costEl.textContent = srcDef ? `Draw the ${srcDef.label.toLowerCase()} area` : "Draw your building outline";
      matEl.textContent = "";
      confirm.disabled = true;
      return;
    }
    let invalid = validatePlan(
      this.lot,
      { rects: this.combinedRects(), floors: srcDef ? 1 : this.floors },
      srcDef ? 1 : MIN_SECTION
    );
    if (!invalid && shapesOverlap(this.rects, this.blockedShape()))
      invalid = srcDef ? "overlaps the building — draw beside it" : "overlaps your field — draw beside it";
    if (srcDef) {
      const combinedArea = planArea({ rects: this.combinedRects(), floors: 1 });
      const area = this.existing?.source
        ? combinedArea - planArea({ rects: this.existing.source.shape, floors: 1 })
        : combinedArea;
      const totalYield = sourceYield(srcDef, combinedArea);
      const cost = sourceSetupCost(srcDef, Math.max(0, area));
      const afford = this.myCash() >= cost;
      const bad = invalid ?? (area <= 0 ? "the new sections add no new ground" : null);
      costEl.innerHTML = bad
        ? `<span class="bm-bad">${bad}</span>`
        : `<b>${fmtMoney(cost)}</b> · starts producing right away`;
      matEl.innerHTML = bad
        ? ""
        : `Total yield ${ic(srcDef.item, 14)} <b>${totalYield} ${itemById(srcDef.item)?.label ?? srcDef.item}/day</b> — bigger area, bigger yield`;
      confirm.disabled = !!bad || !afford;
      confirm.textContent = "Build";
      return;
    }
    const cost = buildCost(this.plan());
    costEl.innerHTML = invalid
      ? `<span class="bm-bad">${invalid}</span>`
      : `${cost.minutes} min build time · ${this.rects.length}/${MAX_SECTIONS} sections`;
    matEl.innerHTML = invalid
      ? ""
      : `Materials: ${ic("wood", 14)} ${cost.materials.wood} wood · ${ic("stone", 14)} ${cost.materials.stone} stone · ${ic("iron", 14)} ${cost.materials.iron} iron ingots — from your bag`;
    confirm.disabled = !!invalid;
    confirm.textContent = "Build";
  }
}
