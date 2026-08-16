import { LotDef } from "./citygen.js";
import { BuildingDef } from "./buildings.js";
import { buildingLayout } from "./footprint.js";
import { TILE_WORLD_SIZE } from "./constants.js";

// Interior grid: 1×1 world-unit cells inside the lot, one-cell wall inset.
// Both client (ghost preview) and server (authoritative) run the same checks.

export interface FurnitureItem {
  id: string;
  label: string;
  w: number; // cells at rot 0
  h: number;
  cost: number;
  machine?: boolean; // clicking it opens its craft panel
  rack?: boolean; // mining rack — clicking opens the component slots
  dock?: boolean; // delivery space — clicking opens the loading bay
  walkable: boolean; // rugs etc — don't block movement
  capacity?: number; // storage units (racks/shelves), used from Phase 2
  appeal?: number; // shop appeal, used from Phase 3
}

export const FURNITURE: FurnitureItem[] = [
  { id: "shelf", label: "Shop Shelf", w: 2, h: 1, cost: 150, walkable: false, capacity: 40, appeal: 1 },
  { id: "counter", label: "Counter + Register", w: 2, h: 1, cost: 250, walkable: false },
  { id: "rack_s", label: "Storage Rack S", w: 1, h: 1, cost: 100, walkable: false, capacity: 100 },
  { id: "rack_m", label: "Storage Rack M", w: 2, h: 1, cost: 220, walkable: false, capacity: 400 },
  { id: "rack_l", label: "Storage Rack L", w: 3, h: 1, cost: 400, walkable: false, capacity: 1200 },
  { id: "sawmill", label: "Sawmill", w: 1, h: 2, cost: 450, walkable: false, machine: true },
  { id: "smelter", label: "Smelter", w: 2, h: 2, cost: 500, walkable: false, machine: true },
  { id: "loom", label: "Loom", w: 2, h: 1, cost: 300, walkable: false, machine: true },
  { id: "refinery", label: "Oil Refinery", w: 2, h: 2, cost: 550, walkable: false, machine: true },
  { id: "oven", label: "Bakery", w: 2, h: 2, cost: 350, walkable: false, machine: true },
  { id: "carpentry_bench", label: "Carpentry Bench", w: 1, h: 2, cost: 300, walkable: false, machine: true },
  { id: "metal_shop", label: "Metal Shop", w: 1, h: 2, cost: 520, walkable: false, machine: true },
  { id: "assembly_line", label: "Assembly Line", w: 2, h: 2, cost: 950, walkable: false, machine: true },
  { id: "fabricator", label: "Fabricator", w: 1, h: 1, cost: 620, walkable: false, machine: true },
  { id: "electronics_bench", label: "Electronics Bench", w: 2, h: 1, cost: 430, walkable: false, machine: true },
  { id: "brewery", label: "Brewery", w: 2, h: 2, cost: 500, walkable: false, machine: true },
  { id: "curing_barn", label: "Curing Barn", w: 3, h: 2, cost: 450, walkable: false, machine: true },
  { id: "gun_mill", label: "Gun Mill", w: 2, h: 1, cost: 620, walkable: false, machine: true },
  { id: "mining_rack_s", label: "Mining Rack (S)", w: 1, h: 1, cost: 320, walkable: false, rack: true },
  { id: "mining_rack_m", label: "Server Rack", w: 2, h: 1, cost: 780, walkable: false, rack: true },
  { id: "mining_rack_l", label: "Industrial Rack", w: 3, h: 2, cost: 1600, walkable: false, rack: true },
  { id: "delivery_space", label: "Delivery Space", w: 1, h: 1, cost: 150, walkable: false, dock: true },
  { id: "desk", label: "Desk", w: 2, h: 1, cost: 120, walkable: false, appeal: 1 },
  { id: "chair", label: "Chair", w: 1, h: 1, cost: 40, walkable: false, appeal: 1 },
  { id: "plant", label: "Potted Plant", w: 1, h: 1, cost: 60, walkable: false, appeal: 2 },
  { id: "rug", label: "Rug", w: 2, h: 2, cost: 80, walkable: true, appeal: 2 },
];

export const furnitureById = (id: string) => FURNITURE.find((f) => f.id === id);

export interface PlacedItem {
  id: number; // db id
  item: string;
  x: number;
  y: number;
  rot: number; // 0..3, quarter turns
  floor: number; // 0 = ground
}

// How many storeys you can walk through. A player-drawn building is as tall as
// its tallest drawn section; everything else carries its own floor count.
export function buildingFloors(def: BuildingDef): number {
  if (def.kind === "custom" && def.shape?.length)
    return Math.max(1, ...def.shape.map((r) => r.f ?? 1));
  return Math.max(1, def.floors);
}

// The interior grid lives in the BUILDING's local frame (+y rows toward the
// street-facing front), shaped by the actual structural footprint — for
// L-shaped buildings that means the union of the main room and the wing room.
export interface CellRect {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export interface InteriorSpec {
  w: number; // bounding box, cells across the front
  h: number; // bounding box, cells front-to-back (row h-1 touches the front wall)
  centerZ: number; // bounding box center offset from lot center (local, + = street)
  rects: CellRect[]; // valid floor regions; rects[0] is the main room
}

export function cellInside(spec: InteriorSpec, cx: number, cy: number): boolean {
  return spec.rects.some(
    (r) => cx >= r.x0 && cx < r.x0 + r.w && cy >= r.y0 && cy < r.y0 + r.h
  );
}

// The walkable plan of one storey. Upper floors only cover the parts of the
// building that actually reach that height: a drawn section two storeys tall
// has a second floor, a single-storey one does not, and the same goes for a
// wing that stops below the main block.
export function interiorSpec(lot: LotDef, def: BuildingDef, floor = 0): InteriorSpec {
  // player-designed buildings: the interior IS the drawn outline
  if (def.kind === "custom" && def.shape?.length) {
    const sideways = lot.facing >= 2;
    const W = (sideways ? lot.h : lot.w) * TILE_WORLD_SIZE;
    const H = (sideways ? lot.w : lot.h) * TILE_WORLD_SIZE;
    return {
      w: W,
      h: H,
      centerZ: 0,
      rects: def.shape
        .filter((r) => (r.f ?? 1) > floor)
        .map((r) => ({ x0: r.x, y0: r.y, w: r.w, h: r.h })),
    };
  }
  const sideways = lot.facing >= 2;
  const fw = (sideways ? lot.h : lot.w) * TILE_WORLD_SIZE;
  const fd = (sideways ? lot.w : lot.h) * TILE_WORLD_SIZE;
  const L = buildingLayout(def, fw, fd);

  // use the full footprint (cells never exceed the structural dims)
  const mainW = Math.max(3, Math.floor(L.w));
  const mainH = Math.max(3, Math.floor(L.d));
  let wingW = 0;
  let wingH = 0;
  if (L.wing) {
    wingW = Math.floor(L.wing.w);
    wingH = Math.floor(L.wing.d);
  }
  const hasWing = wingW >= 1 && wingH >= 1 && floor < (L.wing?.floors ?? 0);
  const wingBand = wingW >= 1 && wingH >= 1 ? wingH : 0;
  const H = mainH + wingBand;
  const rects: CellRect[] = [{ x0: 0, y0: wingBand, w: mainW, h: mainH }];
  if (hasWing && L.wing)
    rects.push({ x0: L.wing.side === 1 ? mainW - wingW : 0, y0: 0, w: wingW, h: wingH });

  // physical front edge of the floor sits just inside the front wall
  const frontZ = L.centerZ + L.d / 2 - 0.2;
  return { w: mainW, h: H, centerZ: frontZ - H / 2, rects };
}

// rooms touching (shared edge or overlap, corner contact doesn't count)
function roomsTouch(a: CellRect, b: CellRect): boolean {
  const xOverlap = a.x0 < b.x0 + b.w && b.x0 < a.x0 + a.w;
  const yOverlap = a.y0 < b.y0 + b.h && b.y0 < a.y0 + a.h;
  if (xOverlap && yOverlap) return true;
  const xTouch = a.x0 <= b.x0 + b.w && b.x0 <= a.x0 + a.w;
  const yTouch = a.y0 <= b.y0 + b.h && b.y0 <= a.y0 + a.h;
  return (xOverlap && yTouch) || (yOverlap && xTouch);
}

// one door per connected building cluster, centered on that cluster's
// street-most room
export function doorCells(spec: InteriorSpec): Array<{ x: number; y: number }> {
  const rects = spec.rects;
  const groups: number[] = rects.map((_, i) => i);
  const find = (i: number): number => (groups[i] === i ? i : (groups[i] = find(groups[i])));
  rects.forEach((a, i) =>
    rects.forEach((b, j) => {
      if (i < j && roomsTouch(a, b)) groups[find(i)] = find(j);
    })
  );
  const byCluster = new Map<number, CellRect>();
  rects.forEach((r, i) => {
    const g = find(i);
    const cur = byCluster.get(g);
    if (!cur || r.y0 + r.h > cur.y0 + cur.h) byCluster.set(g, r);
  });
  return [...byCluster.values()].map((front) => ({
    x: front.x0 + Math.floor(front.w / 2),
    y: front.y0 + front.h - 1,
  }));
}

// legacy single-door helper (first cluster) — prefer doorCells
export function doorCell(spec: InteriorSpec): { x: number; y: number } {
  return doorCells(spec)[0];
}

export function footprint(item: FurnitureItem, rot: number): { w: number; h: number } {
  return rot % 2 === 0 ? { w: item.w, h: item.h } : { w: item.h, h: item.w };
}

export function cellsOf(p: PlacedItem): Array<[number, number]> {
  const def = furnitureById(p.item)!;
  const fp = footprint(def, p.rot);
  const out: Array<[number, number]> = [];
  for (let dy = 0; dy < fp.h; dy++) for (let dx = 0; dx < fp.w; dx++) out.push([p.x + dx, p.y + dy]);
  return out;
}

// Full layout validation for placing `next` among `existing`.
// Returns null when valid, else a human-readable reason.
// where you arrive when you climb to an upper storey
export function landingCells(lot: LotDef, def: BuildingDef, floor: number): Array<{ x: number; y: number }> {
  const spec = interiorSpec(lot, def, floor);
  if (!spec.rects.length) return [];
  const above = doorCells(interiorSpec(lot, def, 0)).filter((c) => cellInside(spec, c.x, c.y));
  if (above.length) return above;
  // the stair comes up wherever this storey actually reaches: front-most cell
  // of its largest room
  const room = spec.rects.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  return [{ x: room.x0 + Math.floor(room.w / 2), y: room.y0 + room.h - 1 }];
}

export function validatePlacement(
  lot: LotDef,
  building: BuildingDef,
  existing: PlacedItem[],
  next: Omit<PlacedItem, "id">
): string | null {
  const def = furnitureById(next.item);
  if (!def) return "unknown item";
  if (next.rot < 0 || next.rot > 3) return "bad rotation";
  if (next.floor < 0 || next.floor >= buildingFloors(building)) return "no such floor";
  const spec = interiorSpec(lot, building, next.floor);
  const { w, h } = spec;
  const fp = footprint(def, next.rot);
  // every footprint cell must land on actual floor (main room or wing room)
  for (let dy = 0; dy < fp.h; dy++)
    for (let dx = 0; dx < fp.w; dx++)
      if (!cellInside(spec, next.x + dx, next.y + dy)) return "out of bounds";

  // The ground floor is entered through its door; upper floors are entered
  // from the stair landing, which sits above the door where that cell still
  // exists on this storey, and otherwise at the storey's front-most cell.
  const doors = next.floor === 0 ? doorCells(spec) : landingCells(lot, building, next.floor);
  const all = [...existing.filter((p) => (p.floor ?? 0) === next.floor), { ...next, id: -1 }];

  // occupancy (walkable items overlap freely with each other but not solids)
  const solid = new Set<number>();
  const anyCell = new Set<number>();
  for (const p of all) {
    const pdef = furnitureById(p.item)!;
    for (const [cx, cy] of cellsOf(p)) {
      const k = cy * w + cx;
      if (anyCell.has(k) && (!pdef.walkable || solid.has(k))) {
        // allow rug-under-solid stacking only when exactly one of the two is walkable
      }
      if (!pdef.walkable) {
        if (solid.has(k)) return "overlaps another item";
        solid.add(k);
      }
      anyCell.add(k);
    }
  }
  for (const door of doors) if (solid.has(door.y * w + door.x)) return "blocks a door";

  // flood fill from every door across free cells (each building floods from
  // its own door)
  const reach = new Set<number>();
  const queue: number[] = [];
  for (const door of doors) {
    const k = door.y * w + door.x;
    if (!reach.has(k)) {
      reach.add(k);
      queue.push(k);
    }
  }
  while (queue.length) {
    const k = queue.pop()!;
    const cx = k % w;
    const cy = (k - cx) / w;
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!cellInside(spec, nx, ny)) continue; // walls of the L-shape
      const nk = ny * w + nx;
      if (reach.has(nk) || solid.has(nk)) continue;
      reach.add(nk);
      queue.push(nk);
    }
  }
  // every solid item must be usable: at least one footprint-adjacent cell
  // reachable from the door
  for (const p of all) {
    const pdef = furnitureById(p.item)!;
    if (pdef.walkable) continue;
    let ok = false;
    for (const [cx, cy] of cellsOf(p)) {
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (reach.has(ny * w + nx)) {
          ok = true;
          break;
        }
      }
      if (ok) break;
    }
    if (!ok) return "an item would be unreachable from a door";
  }
  return null;
}

// Where a fixture stands in the world, so the server can walk a worker to it
// and the client draws that worker in the same spot the fixture is drawn.
export function fixtureWorld(
  lot: LotDef,
  def: BuildingDef,
  cellX: number,
  cellY: number,
  floor = 0
): { x: number; z: number } {
  const spec = interiorSpec(lot, def, floor);
  const lx = -spec.w / 2 + cellX + 0.5;
  const lz = spec.centerZ - spec.h / 2 + cellY + 0.5;
  // the interior is drawn rotated to the lot's facing, around the lot centre
  const rot = [0, Math.PI, Math.PI / 2, -Math.PI / 2][lot.facing] ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const cx = (lot.x + lot.w / 2) * TILE_WORLD_SIZE;
  const cz = (lot.y + lot.h / 2) * TILE_WORLD_SIZE;
  return { x: cx + lx * cos + lz * sin, z: cz - lx * sin + lz * cos };
}

// Cells drawn on a lot — fields, quarries, delivery pads — live in the lot's
// own rotated frame, exactly like interior cells, so the server has to place a
// worker through the same transform the client draws the site with.
export function siteCellWorld(lot: LotDef, cellX: number, cellY: number): { x: number; z: number } {
  const sideways = lot.facing >= 2;
  const W = (sideways ? lot.h : lot.w) * TILE_WORLD_SIZE;
  const H = (sideways ? lot.w : lot.h) * TILE_WORLD_SIZE;
  const lx = -W / 2 + cellX;
  const lz = -H / 2 + cellY;
  const rot = [0, Math.PI, Math.PI / 2, -Math.PI / 2][lot.facing] ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const cx = (lot.x + lot.w / 2) * TILE_WORLD_SIZE;
  const cz = (lot.y + lot.h / 2) * TILE_WORLD_SIZE;
  return { x: cx + lx * cos + lz * sin, z: cz - lx * sin + lz * cos };
}

// A spot to stand at while using a fixture: never on top of it. Prefers the
// side given, then the other three, and falls back to the fixture itself.
export function standingSpot(
  spec: InteriorSpec,
  cellX: number,
  cellY: number,
  w: number,
  h: number,
  prefer: "front" | "back" = "front",
  taken?: (x: number, y: number) => boolean
): { x: number; y: number } {
  const spots: Array<{ x: number; y: number }> = [];
  const front = { x: cellX + Math.floor(w / 2), y: cellY + h };
  const back = { x: cellX + Math.floor(w / 2), y: cellY - 1 };
  const order = prefer === "front" ? [front, back] : [back, front];
  spots.push(...order);
  // then along the fixture's length, either side, so a second worker at the
  // same counter stands next to the first rather than in them
  for (let i = 0; i < Math.max(w, h); i++) {
    spots.push({ x: cellX + i, y: prefer === "front" ? cellY + h : cellY - 1 });
    spots.push({ x: cellX + i, y: prefer === "front" ? cellY - 1 : cellY + h });
  }
  spots.push({ x: cellX - 1, y: cellY + Math.floor(h / 2) });
  spots.push({ x: cellX + w, y: cellY + Math.floor(h / 2) });

  const free = spots.filter((c) => cellInside(spec, c.x, c.y) && !taken?.(c.x, c.y));
  if (free.length) return free[0];
  for (const c of spots) if (cellInside(spec, c.x, c.y)) return c;
  return { x: cellX, y: cellY };
}

// Which interior cell a world position falls in — the inverse of fixtureWorld.
export function worldToCell(
  lot: LotDef,
  def: BuildingDef,
  wx: number,
  wz: number,
  floor = 0
): { x: number; y: number } {
  const spec = interiorSpec(lot, def, floor);
  const rot = [0, Math.PI, Math.PI / 2, -Math.PI / 2][lot.facing] ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const cx = (lot.x + lot.w / 2) * TILE_WORLD_SIZE;
  const cz = (lot.y + lot.h / 2) * TILE_WORLD_SIZE;
  const dx = wx - cx;
  const dz = wz - cz;
  // inverse of [cos, sin; -sin, cos]
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return {
    x: Math.floor(lx + spec.w / 2),
    y: Math.floor(lz - spec.centerZ + spec.h / 2),
  };
}

// A route between two interior cells that goes around the furniture rather
// than through it. Breadth-first over the floor plan; the destination is
// always reachable even if it is occupied (you stand at it, not in it).
export function interiorRoute(
  spec: InteriorSpec,
  blocked: Set<number>,
  from: { x: number; y: number },
  to: { x: number; y: number }
): Array<{ x: number; y: number }> {
  const key = (x: number, y: number) => y * spec.w + x;
  if (from.x === to.x && from.y === to.y) return [];
  const prev = new Map<number, number>();
  const seen = new Set<number>([key(from.x, from.y)]);
  const queue: Array<{ x: number; y: number }> = [from];
  while (queue.length) {
    const c = queue.shift()!;
    if (c.x === to.x && c.y === to.y) {
      const out: Array<{ x: number; y: number }> = [];
      let k = key(c.x, c.y);
      while (k !== key(from.x, from.y)) {
        out.unshift({ x: k % spec.w, y: Math.floor(k / spec.w) });
        const p = prev.get(k);
        if (p === undefined) break;
        k = p;
      }
      return out;
    }
    for (const [nx, ny] of [
      [c.x + 1, c.y],
      [c.x - 1, c.y],
      [c.x, c.y + 1],
      [c.x, c.y - 1],
    ] as const) {
      const k = key(nx, ny);
      if (seen.has(k) || !cellInside(spec, nx, ny)) continue;
      // you may finish on a blocked cell but never route through one
      if (blocked.has(k) && !(nx === to.x && ny === to.y)) continue;
      seen.add(k);
      prev.set(k, key(c.x, c.y));
      queue.push({ x: nx, y: ny });
    }
  }
  return [to];
}
