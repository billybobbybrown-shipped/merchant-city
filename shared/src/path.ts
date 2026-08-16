import { Tile } from "./constants.js";
import { CityMap } from "./citygen.js";

// A* over the tile grid. NPCs walk sidewalks and roads (and park grass —
// people cut across parks; they don't cut through buildings or water).
export function tileWalkable(t: Tile): boolean {
  return t === Tile.Sidewalk || t === Tile.Road || t === Tile.Grass;
}

// nearest walkable tile within a ring search (homes and shops sit on lot
// tiles — walkers snap to the sidewalk outside)
export function nearestWalkable(
  map: CityMap,
  x: number,
  y: number,
  maxR = 6
): { x: number; y: number } | null {
  const W = map.width;
  const H = map.height;
  const ok = (tx: number, ty: number) =>
    tx >= 0 && ty >= 0 && tx < W && ty < H && tileWalkable(map.tiles[ty * W + tx] as Tile);
  if (ok(x, y)) return { x, y };
  for (let r = 1; r <= maxR; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
  return null;
}

// 4-directional A* with an expansion cap. Returns tile waypoints (excluding
// the start), or null when unreachable within the budget. Start/goal snap to
// the nearest walkable tile.
export function findPath(
  map: CityMap,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  maxExpand = 12000
): Array<{ x: number; y: number }> | null {
  const W = map.width;
  const H = map.height;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const walk = (x: number, y: number) => inb(x, y) && tileWalkable(map.tiles[y * W + x] as Tile);
  const s0 = nearestWalkable(map, sx, sy);
  const g0 = nearestWalkable(map, gx, gy);
  if (!s0 || !g0) return null;
  sx = s0.x;
  sy = s0.y;
  gx = g0.x;
  gy = g0.y;
  if (sx === gx && sy === gy) return [];

  const key = (x: number, y: number) => y * W + x;
  const came = new Map<number, number>();
  const gScore = new Map<number, number>();
  const h = (x: number, y: number) => Math.abs(x - gx) + Math.abs(y - gy);
  // binary heap of [f, key]
  const heap: Array<[number, number]> = [[h(sx, sy), key(sx, sy)]];
  gScore.set(key(sx, sy), 0);
  const pop = (): [number, number] | undefined => {
    if (!heap.length) return undefined;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  };
  const push = (f: number, k: number) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };

  let expanded = 0;
  const goal = key(gx, gy);
  while (heap.length) {
    const [, k] = pop()!;
    if (k === goal) {
      const path: Array<{ x: number; y: number }> = [];
      let cur = k;
      while (cur !== key(sx, sy)) {
        path.push({ x: cur % W, y: Math.floor(cur / W) });
        cur = came.get(cur)!;
      }
      return path.reverse();
    }
    if (++expanded > maxExpand) return null;
    const cx = k % W;
    const cy = Math.floor(k / W);
    const g = gScore.get(k)!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walk(nx, ny)) continue;
      // prefer sidewalks: roads cost a touch more, grass more still
      const t = map.tiles[ny * W + nx] as Tile;
      const stepCost = t === Tile.Sidewalk ? 1 : t === Tile.Road ? 1.4 : 2.2;
      const nk = key(nx, ny);
      const ng = g + stepCost;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        came.set(nk, k);
        push(ng + h(nx, ny), nk);
      }
    }
  }
  return null;
}
