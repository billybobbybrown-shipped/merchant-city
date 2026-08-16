import { LotDef } from "./citygen.js";
import { TILE_WORLD_SIZE } from "./constants.js";

// Player-designed buildings: an outline of 1-3 connected rectangular sections
// drawn on the lot, plus a floor count. Cells are 1 world unit, in the lot's
// street-facing frame: x runs across the front, y runs back→front (y = depth-1
// touches the street).

export interface PlanRect {
  x: number;
  y: number;
  w: number;
  h: number;
  f?: number; // floors for this section (defaults to the plan's floors)
}

export interface CustomPlan {
  rects: PlanRect[];
  floors: number;
}

export const MAX_SECTIONS = 6;
export const MAX_FLOORS = 12;
export const MIN_SECTION = 3; // cells per side

export function lotCellSize(lot: LotDef): { w: number; h: number } {
  const sideways = lot.facing >= 2;
  return {
    w: (sideways ? lot.h : lot.w) * TILE_WORLD_SIZE,
    h: (sideways ? lot.w : lot.h) * TILE_WORLD_SIZE,
  };
}

function rectsTouch(a: PlanRect, b: PlanRect): boolean {
  // overlap or share an edge segment (not just a corner)
  const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w;
  const yOverlap = a.y < b.y + b.h && b.y < a.y + a.h;
  if (xOverlap && yOverlap) return true; // overlapping
  const xTouch = a.x <= b.x + b.w && b.x <= a.x + a.w;
  const yTouch = a.y <= b.y + b.h && b.y <= a.y + a.h;
  return (xOverlap && yTouch) || (yOverlap && xTouch);
}

export function validatePlan(lot: LotDef, plan: CustomPlan, minSection = MIN_SECTION): string | null {
  const { w: W, h: H } = lotCellSize(lot);
  if (!Array.isArray(plan.rects) || plan.rects.length < 1) return "draw at least one section";
  if (plan.rects.length > MAX_SECTIONS) return `at most ${MAX_SECTIONS} sections`;
  if (!Number.isInteger(plan.floors) || plan.floors < 1 || plan.floors > MAX_FLOORS)
    return `floors must be 1-${MAX_FLOORS}`;
  for (const r of plan.rects) {
    if (![r.x, r.y, r.w, r.h].every(Number.isInteger)) return "bad section";
    if (r.f !== undefined && (!Number.isInteger(r.f) || r.f < 1 || r.f > MAX_FLOORS))
      return `floors must be 1-${MAX_FLOORS}`;
    if (r.w < minSection || r.h < minSection)
      return minSection > 1 ? `sections are at least ${minSection}×${minSection} m` : "bad section";
    if (r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H) return "outside the lot";
  }
  // disconnected groups are allowed — each connected cluster is its own
  // building on the lot
  return null;
}

// group sections into connected clusters (touching = shared edge, not corner)
export function clusterRects(rects: PlanRect[]): PlanRect[][] {
  const groups: number[] = rects.map((_, i) => i);
  const find = (i: number): number => (groups[i] === i ? i : (groups[i] = find(groups[i])));
  rects.forEach((a, i) =>
    rects.forEach((b, j) => {
      if (i < j && rectsTouch(a, b)) groups[find(i)] = find(j);
    })
  );
  const out = new Map<number, PlanRect[]>();
  rects.forEach((r, i) => {
    const g = find(i);
    if (!out.has(g)) out.set(g, []);
    out.get(g)!.push(r);
  });
  return [...out.values()];
}

// total floor cells (union area, overlaps counted once)
export function planArea(plan: CustomPlan): number {
  const cells = new Set<number>();
  for (const r of plan.rects)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) cells.add(y * 4096 + x);
  return cells.size;
}

// built volume in floor-cells: per cell, the tallest covering section counts
export function planVolume(plan: CustomPlan): number {
  const cells = new Map<number, number>();
  for (const r of plan.rects) {
    const f = r.f ?? plan.floors;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        const k = y * 4096 + x;
        cells.set(k, Math.max(cells.get(k) ?? 0, f));
      }
  }
  let v = 0;
  for (const f of cells.values()) v += f;
  return v;
}

// do two sets of sections cover any common cell?
export function shapesOverlap(a: PlanRect[], b: PlanRect[]): boolean {
  return a.some((r) =>
    b.some((o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h)
  );
}

export interface BuildCost {
  cash: number; // buildings cost materials + time; land itself cost the cash
  minutes: number;
  materials: { wood: number; stone: number; iron: number };
}

export function buildCost(plan: CustomPlan): BuildCost {
  const area = planArea(plan);
  const volume = planVolume(plan);
  const maxFloors = plan.rects.reduce((m, r) => Math.max(m, r.f ?? plan.floors), 1);
  return {
    cash: 0,
    minutes: Math.min(10, Math.max(1, Math.round(volume / 50))),
    materials: {
      wood: Math.ceil(volume * 0.5),
      stone: Math.ceil(area * 0.6 + maxFloors * 4),
      iron: Math.ceil(volume * 0.15),
    },
  };
}
