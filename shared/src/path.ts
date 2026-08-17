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

// Connected components of the walkable grid, labelled once per map. Component
// 1 is the mainland — the street network nearly every tile belongs to; the
// rest are enclosed courtyards.
const compCache = new WeakMap<CityMap, { labels: Int32Array; main: number }>();
function componentsOf(map: CityMap): { labels: Int32Array; main: number } {
  const hit = compCache.get(map);
  if (hit) return hit;
  const W = map.width;
  const H = map.height;
  const labels = new Int32Array(W * H);
  const sizes: number[] = [0];
  let next = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (labels[k] || !tileWalkable(map.tiles[k] as Tile)) continue;
      next++;
      sizes[next] = 0;
      const q = [k];
      labels[k] = next;
      while (q.length) {
        const c = q.pop()!;
        sizes[next]++;
        const cx = c % W;
        const cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          const nk = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (labels[nk] || !tileWalkable(map.tiles[nk] as Tile)) continue;
          labels[nk] = next;
          q.push(nk);
        }
      }
    }
  let main = 1;
  for (let i = 2; i <= next; i++) if (sizes[i] > sizes[main]) main = i;
  const out = { labels, main };
  compCache.set(map, out);
  return out;
}

// a point on a minor component moves to the nearest mainland tile
function toMainland(
  map: CityMap,
  p: { x: number; y: number } | null
): { x: number; y: number } | null {
  if (!p) return null;
  const { labels, main } = componentsOf(map);
  const W = map.width;
  if (labels[p.y * W + p.x] === main) return p;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < W; x++) {
      if (labels[y * W + x] !== main) continue;
      const d = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  return best;
}

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
  // Homes and shops sit deep in lot tiles; some resolve into walkable POCKETS —
  // courtyards sealed off by buildings — rather than the street network. A
  // pocket endpoint gets snapped to the mainland instead, so no walk is ever
  // impossible: a stranded walker steps out through the block once and is free.
  const s0 = toMainland(map, nearestWalkable(map, sx, sy, 10));
  const g0 = toMainland(map, nearestWalkable(map, gx, gy, 10));
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
