import * as THREE from "three";
import { BuildingDef, DOCK_SIZE, LotDef, TILE_WORLD_SIZE as TS } from "@mc/shared";
import { cutGroundHole, restoreGroundHole } from "../render/ground.js";
import { makeBuilding } from "../assets/buildings.js";
import { makeSourceArea } from "../assets/sources.js";
import { makeDock } from "../assets/dock.js";
import { SourceType } from "@mc/shared";
import { Lots } from "./lots.js";

const FACING_ROT = [0, Math.PI, Math.PI / 2, -Math.PI / 2];

function scaffolding(fw: number, fd: number): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.5, roughness: 0.6 });
  const w = fw * 0.8;
  const d = fd * 0.75;
  const h = 3.4;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), steel);
      pole.position.set((sx * w) / 2, h / 2, (sz * d) / 2);
      pole.castShadow = true;
      g.add(pole);
    }
    // planks + crossbars
  for (const y of [1.1, 2.2, 3.2]) {
    const plankA = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.08, 0.5), wood);
    plankA.position.set(0, y, -d / 2);
    plankA.castShadow = true;
    const plankB = plankA.clone();
    plankB.position.z = d / 2;
    g.add(plankA, plankB);
  }
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.9, 0.25, d * 0.9),
    new THREE.MeshStandardMaterial({ color: 0xb5b9bd, roughness: 0.95 })
  );
  slab.position.y = 0.13;
  slab.receiveShadow = true;
  g.add(slab);
  // materials pile
  const pile = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.9), wood);
  pile.position.set(w * 0.28, 0.35, d * 0.2);
  pile.castShadow = true;
  g.add(pile);
  return g;
}

const FLOOR_H = 2.6;

// scaffolding that wraps the drawn design: poles at each section's corners,
// plank rings at every floor level, a translucent massing volume inside
function scaffoldingForShape(shape: Array<{ x: number; y: number; w: number; h: number; f?: number }>, W: number, H: number): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.5, roughness: 0.6 });
  const mass = new THREE.MeshStandardMaterial({
    color: 0xc9cdd2,
    transparent: true,
    opacity: 0.28,
    roughness: 0.9,
  });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xb5b9bd, roughness: 0.95 });
  const lx = (cx: number) => -W / 2 + cx;
  const lz = (cy: number) => -H / 2 + cy;
  for (const r of shape) {
    const hgt = (r.f ?? 1) * FLOOR_H + 0.3;
    const x0 = lx(r.x);
    const z0 = lz(r.y);
    // corner poles
    for (const cx of [x0 + 0.12, x0 + r.w - 0.12])
      for (const cz of [z0 + 0.12, z0 + r.h - 0.12]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, hgt, 6), steel);
        pole.position.set(cx, hgt / 2, cz);
        pole.castShadow = true;
        g.add(pole);
      }
    // mid poles on long edges
    for (const [cx, cz, vert] of [
      [x0 + r.w / 2, z0 + 0.12, false],
      [x0 + r.w / 2, z0 + r.h - 0.12, false],
      [x0 + 0.12, z0 + r.h / 2, true],
      [x0 + r.w - 0.12, z0 + r.h / 2, true],
    ] as const) {
      if ((vert ? r.h : r.w) < 5) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, hgt, 6), steel);
      pole.position.set(cx as number, hgt / 2, cz as number);
      pole.castShadow = true;
      g.add(pole);
    }
    // plank rings per floor level
    const floors = r.f ?? 1;
    for (let fl = 1; fl <= floors; fl++) {
      const y = fl * FLOOR_H - 0.4;
      const a = new THREE.Mesh(new THREE.BoxGeometry(r.w + 0.16, 0.07, 0.42), wood);
      a.position.set(x0 + r.w / 2, y, z0 + 0.12);
      const b = a.clone();
      b.position.z = z0 + r.h - 0.12;
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, r.h + 0.16), wood);
      c.position.set(x0 + 0.12, y, z0 + r.h / 2);
      const d = c.clone();
      d.position.x = x0 + r.w - 0.12;
      for (const m of [a, b, c, d]) {
        m.castShadow = true;
        g.add(m);
      }
    }
    // massing volume + slab
    const vol = new THREE.Mesh(new THREE.BoxGeometry(r.w - 0.3, hgt - 0.35, r.h - 0.3), mass);
    vol.position.set(x0 + r.w / 2, (hgt - 0.35) / 2, z0 + r.h / 2);
    g.add(vol);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(r.w - 0.15, 0.18, r.h - 0.15), slabMat);
    slab.position.set(x0 + r.w / 2, 0.09, z0 + r.h / 2);
    slab.receiveShadow = true;
    g.add(slab);
  }
  // materials pile by the biggest section
  const big = shape.reduce((m, r) => (r.w * r.h > m.w * m.h ? r : m), shape[0]);
  const pile = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 0.85), wood);
  pile.position.set(lx(big.x) + big.w / 2, 0.3, lz(big.y) + big.h - 0.7);
  pile.castShadow = true;
  g.add(pile);
  return g;
}

// Renders player-built buildings: scaffolding while under construction, the
// real building once done_at passes.
export interface DockInfo {
  lotId: number;
  x: number;
  y: number;
  fill: number;
}

export class Constructions {
  readonly group = new THREE.Group();
  private meshes = new Map<number, { obj: THREE.Object3D; key: string }>();

  private docks = new Map<number, DockInfo>();

  constructor(private lots: Lots) {}

  // which delivery pad, if any, sits under a point on the ground — so a click
  // on the pallets opens the bay instead of selecting the plot beneath it
  // the bay on a plot, if it has one — build mode needs to know the spot is taken
  dockFor(lotId: number): { x: number; y: number } | null {
    const d = this.docks.get(lotId);
    return d ? { x: d.x, y: d.y } : null;
  }

  dockAtWorld(wx: number, wz: number): number | null {
    for (const [lotId, d] of this.docks) {
      const lot = this.lots.defs.get(lotId);
      if (!lot) continue;
      const local = new THREE.Vector3(
        wx - (lot.x + lot.w / 2) * TS,
        0,
        wz - (lot.y + lot.h / 2) * TS
      ).applyAxisAngle(new THREE.Vector3(0, 1, 0), -(FACING_ROT[lot.facing] ?? 0));
      const sideways = lot.facing >= 2;
      const W = (sideways ? lot.h : lot.w) * TS;
      const H = (sideways ? lot.w : lot.h) * TS;
      const padX = d.x + DOCK_SIZE / 2 - W / 2;
      const padZ = d.y + DOCK_SIZE / 2 - H / 2;
      if (Math.abs(local.x - padX) <= DOCK_SIZE / 2 && Math.abs(local.z - padZ) <= DOCK_SIZE / 2)
        return lotId;
    }
    return null;
  }

  // delivery spaces come from the server; re-sync redraws the affected lots
  setDocks(list: DockInfo[]) {
    this.docks.clear();
    for (const d of list) this.docks.set(d.lotId, d);
    this.sync();
  }

  objectFor(lotId: number): THREE.Object3D | null {
    return this.meshes.get(lotId)?.obj ?? null;
  }

  sync() {
    for (const [id, st] of this.lots.state.entries()) {
      const cur = this.meshes.get(id);
      const dock = this.docks.get(id);
      // a working that is gone takes its hole in the ground with it
      if (!st.source) restoreGroundHole(`pit:${id}`);
      if (!st.building && !st.source && !dock) {
        if (cur) {
          this.group.remove(cur.obj);
          this.meshes.delete(id);
        }
        continue;
      }
      // buildings and fields can share a lot — render whichever exist
      const bDone = st.building ? Date.now() >= st.building.doneAt : true;
      const key = `${st.building?.doneAt ?? 0}:${bDone}:${st.name ?? ""}:${st.sign}:${
        st.source
          ? `${st.source.doneAt}:${st.source.area}:${Math.round(
              (st.source.reserve ? (st.source.extracted ?? 0) / st.source.reserve : 0) * 20
            )}`
          : "none"
      }:${dock ? `${dock.x},${dock.y},${Math.round(dock.fill * 12)}` : "nodock"}`;
      if (cur && cur.key === key) continue;
      if (cur) this.group.remove(cur.obj);
      const lot = this.lots.defs.get(id)!;
      const wrap = new THREE.Group();
      if (st.building)
        wrap.add(
          bDone
            ? this.buildMesh(lot, st.building, st.name, st.sign)
            : this.scaffoldMesh(lot, st.building.shape)
        );
      if (st.source) wrap.add(this.sourceMesh(lot, st.source));
      if (dock) wrap.add(this.dockMesh(lot, dock));
      this.group.add(wrap);
      this.meshes.set(id, { obj: wrap, key });
    }
  }

  private sourceMesh(
    lot: LotDef,
    src: {
      type: string;
      extracted?: number;
      reserve?: number;
      shape?: Array<{ x: number; y: number; w: number; h: number }>;
    }
  ) {
    const sideways = lot.facing >= 2;
    const W = (sideways ? lot.h : lot.w) * TS;
    const H = (sideways ? lot.w : lot.h) * TS;
    const rects = src.shape?.length ? src.shape : [{ x: 0, y: 0, w: W, h: H }];
    // one merged site over the union of the drawn sections
    // how far the deposit has been worked out, so the pit reads its own age
    const spent = src.reserve ? Math.min(1, (src.extracted ?? 0) / src.reserve) : 0;
    const area = makeSourceArea(src.type as SourceType, lot.id * 7919 + 11, rects, W, H, spent);
    // an excavation needs the ground over it taken away, or you would be
    // looking at the lid of a hole
    const mouth = (area.userData as { pitMouth?: { x: number; z: number; halfW: number; halfD: number } })
      .pitMouth;
    if (mouth) {
      const rot = FACING_ROT[lot.facing] ?? 0;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const cxw = (lot.x + lot.w / 2) * TS + mouth.x * cos + mouth.z * sin;
      const czw = (lot.y + lot.h / 2) * TS - mouth.x * sin + mouth.z * cos;
      cutGroundHole(`pit:${lot.id}`, cxw, czw, mouth.halfW, mouth.halfD, rot);
    }
    return this.place(area, lot);
  }

  // the pad sits at its own cell inside the lot's local frame
  private dockMesh(lot: LotDef, dock: DockInfo) {
    const sideways = lot.facing >= 2;
    const W = (sideways ? lot.h : lot.w) * TS;
    const H = (sideways ? lot.w : lot.h) * TS;
    const pad = makeDock(dock.fill, lot.id * 31 + 7);
    // centre the pad on its cell — half its own size, not a hardcoded 2x2
    pad.position.set(dock.x + DOCK_SIZE / 2 - W / 2, 0, dock.y + DOCK_SIZE / 2 - H / 2);
    const wrap = new THREE.Group();
    wrap.add(pad);
    return this.place(wrap, lot);
  }

  private place(obj: THREE.Object3D, lot: LotDef) {
    obj.position.set((lot.x + lot.w / 2) * TS, 0, (lot.y + lot.h / 2) * TS);
    obj.rotation.y = FACING_ROT[lot.facing] ?? 0;
    obj.traverse((o) => {
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    });
    obj.updateMatrix();
    return obj;
  }

  private scaffoldMesh(lot: LotDef, shape?: Array<{ x: number; y: number; w: number; h: number; f?: number }>) {
    const sideways = lot.facing >= 2;
    const fw = (sideways ? lot.h : lot.w) * TS;
    const fd = (sideways ? lot.w : lot.h) * TS;
    if (shape?.length) return this.place(scaffoldingForShape(shape, fw, fd), lot);
    return this.place(scaffolding(fw, fd), lot);
  }

  private buildMesh(
    lot: LotDef,
    b: { kind: string; floors: number; seed: number; name: string; shape?: BuildingDef["shape"] },
    lotName?: string | null,
    sign = true
  ) {
    const def: BuildingDef = {
      kind: b.kind as BuildingDef["kind"],
      floors: b.floors,
      style: b.seed % 4,
      seed: b.seed,
      // the sign carries what the owner calls the place, without the lot
      // number that lists use to keep names apart
      name: lotName?.trim() || b.name,
      sign,
      shape: b.shape,
    };
    const sideways = lot.facing >= 2;
    const fw = (sideways ? lot.h : lot.w) * TS;
    const fd = (sideways ? lot.w : lot.h) * TS;
    return this.place(makeBuilding(def, fw, fd), lot);
  }

  // call every few frames; swaps scaffolding to buildings when timers finish
  tick() {
    for (const [id, cur] of this.meshes.entries()) {
      const st = this.lots.state.get(id);
      if (!st?.building) continue;
      const bDone = Date.now() >= st.building.doneAt;
      if (cur.key.split(":")[1] !== String(bDone)) {
        this.sync();
        return;
      }
    }
  }
}
