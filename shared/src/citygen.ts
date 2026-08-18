import { CITY_SIZE, Tile, TILE_WORLD_SIZE, Zone, ZONE_BASE_VALUE } from "./constants.js";
import { chance, hashSeed, mulberry32, pick, rint, RNG } from "./rng.js";

// Lot facing: which way the front door points. 0=S(+y) 1=N(-y) 2=E(+x) 3=W(-x)
export const FACE_S = 0;
export const FACE_N = 1;
export const FACE_E = 2;
export const FACE_W = 3;

export interface LotDef {
  id: number;
  x: number; // tile coords, top-left
  y: number;
  w: number;
  h: number;
  zone: Zone;
  value: number;
  facing: number;
  // open land: a courtyard or park parcel — buyable and workable like any
  // lot, but it fronts no street, grows no city building, and keeps grass
  yard?: boolean;
}

export interface BlockDef {
  x: number;
  y: number;
  w: number;
  h: number;
  zone: Zone;
}

// A vertical segment occupies columns x..x+w-1 for rows y0..y1 inclusive;
// horizontal segments are the transpose. Arterials are 4 tiles wide (two lanes
// each direction), side streets 2 tiles (one lane each direction).
export interface RoadSegV {
  x: number;
  y0: number;
  y1: number;
  w: number;
}
export interface RoadSegH {
  y: number;
  x0: number;
  x1: number;
  w: number;
}

export interface DistrictDef {
  id: number;
  name: string;
  blocks: number[]; // indices into CityMap.blocks
}

export interface CityMap {
  seed: number;
  width: number;
  height: number;
  tiles: Uint8Array; // index = y * width + x
  lots: LotDef[];
  blocks: BlockDef[];
  districts: DistrictDef[];
  segsV: RoadSegV[];
  segsH: RoadSegH[];
}

// Full-span arterial roads, spaced far apart — long stretches, few crossings.
function arterials(rng: RNG, size: number): number[] {
  const lines: number[] = [2];
  let pos = 2;
  while (true) {
    pos += 28 + rint(rng, 0, 16);
    if (pos >= size - 18) break;
    lines.push(pos);
  }
  // the same 2-tile margin the first arterial gets: room for the outer
  // sidewalk band, and crossings keep road beyond the junction on all four
  // sides — which is what qualifies them for intersection boxes
  lines.push(size - 6);
  return lines;
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function generateCity(seed: number, size = CITY_SIZE): CityMap {
  const rng = mulberry32(hashSeed(seed, 0xc17e));
  const tiles = new Uint8Array(size * size).fill(Tile.Grass);
  const at = (x: number, y: number) => tiles[y * size + x];
  const set = (x: number, y: number, t: Tile) => {
    tiles[y * size + x] = t;
  };

  const AW = 4; // arterial width in tiles
  const ax = arterials(rng, size);
  const ay = arterials(rng, size);
  const segsV: RoadSegV[] = ax.map((x) => ({ x, y0: 0, y1: size - 1, w: AW }));
  const segsH: RoadSegH[] = ay.map((y) => ({ y, x0: 0, x1: size - 1, w: AW }));

  // Superblocks between arterials, then a sparse set of secondary streets.
  // Secondaries span only their region → T-junctions, not a uniform grid.
  const queue: Region[] = [];
  const regions: Region[] = [];
  for (let i = 0; i < ax.length - 1; i++)
    for (let j = 0; j < ay.length - 1; j++)
      queue.push({ x: ax[i] + AW, y: ay[j] + AW, w: ax[i + 1] - ax[i] - AW, h: ay[j + 1] - ay[j] - AW });

  // per-region rng — a region always splits the same way no matter what the
  // rest of the map does, so future edits stay local
  while (queue.length) {
    const r = queue.pop()!;
    const rr = mulberry32(hashSeed(seed, r.x, r.y, r.w, r.h, 0x5ec));
    const canV = r.w >= 24;
    const canH = r.h >= 24;
    const wantV = canV && rr() < (r.w >= 34 ? 0.9 : 0.55);
    const wantH = canH && rr() < (r.h >= 34 ? 0.9 : 0.55);
    // secondary streets snap to a map-wide 8-tile grid so streets on opposite
    // sides of an arterial either line up into one crossing or stay well apart
    const snap = (v: number, lo: number, hi: number) => {
      let s = Math.round(v / 8) * 8;
      if (s < lo) s += 8;
      if (s > hi) s -= 8;
      return s < lo || s > hi ? lo + Math.floor((hi - lo) / 2) : s;
    };
    if (wantV && (!wantH || rr() < 0.5)) {
      const rx = snap(r.x + 9 + rint(rr, 0, r.w - 20), r.x + 9, r.x + r.w - 11);
      segsV.push({ x: rx, y0: Math.max(0, r.y - 2), y1: Math.min(size - 1, r.y + r.h + 1), w: 2 });
      queue.push({ x: r.x, y: r.y, w: rx - r.x, h: r.h });
      queue.push({ x: rx + 2, y: r.y, w: r.x + r.w - rx - 2, h: r.h });
    } else if (wantH) {
      const ry = snap(r.y + 9 + rint(rr, 0, r.h - 20), r.y + 9, r.y + r.h - 11);
      segsH.push({ y: ry, x0: Math.max(0, r.x - 2), x1: Math.min(size - 1, r.x + r.w + 1), w: 2 });
      queue.push({ x: r.x, y: r.y, w: r.w, h: ry - r.y });
      queue.push({ x: r.x, y: ry + 2, w: r.w, h: r.y + r.h - ry - 2 });
    } else {
      regions.push(r);
    }
  }

  // paint roads
  for (const s of segsV)
    for (let y = s.y0; y <= s.y1; y++)
      for (let dx = 0; dx < s.w; dx++) set(s.x + dx, y, Tile.Road);
  for (const s of segsH)
    for (let x = s.x0; x <= s.x1; x++)
      for (let dy = 0; dy < s.w; dy++) set(x, s.y + dy, Tile.Road);

  // sidewalks ring everything that touches a road
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (at(x, y) !== Tile.Grass) continue;
      const near =
        (x > 0 && at(x - 1, y) === Tile.Road) ||
        (x < size - 1 && at(x + 1, y) === Tile.Road) ||
        (y > 0 && at(x, y - 1) === Tile.Road) ||
        (y < size - 1 && at(x, y + 1) === Tile.Road);
      if (near) set(x, y, Tile.Sidewalk);
    }

  // zoning by distance from the center; industry pushed to the east edge
  const center = size / 2;
  interface ZonedBlock extends Region {
    zone: Zone;
    dist: number;
  }
  // Probabilistic zoning: every zone can appear anywhere, weighted by distance
  // from the center — downtown skews commercial, the fringe skews residential,
  // industry is scattered with a pull toward the edges.
  const zoned: ZonedBlock[] = regions
    .filter((r) => r.w >= 6 && r.h >= 6)
    .map((r) => {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const dist = Math.hypot(cx - center, cy - center);
      const t = Math.min(1, dist / (size * 0.52));
      const wCom = 0.85 * Math.pow(1 - t, 1.2) + 0.05;
      const wMix = 0.28 * (1 - t) + 0.12;
      const wRes = 0.66 * t + 0.05;
      const wInd = 0.17 * t + 0.05;
      const zr = mulberry32(hashSeed(seed, r.x, r.y, 0x20e));
      let roll = zr() * (wCom + wMix + wRes + wInd);
      let zone: Zone;
      if ((roll -= wCom) < 0) zone = "commercial";
      else if ((roll -= wMix) < 0) zone = "mixed";
      else if ((roll -= wRes) < 0) zone = "residential";
      else zone = "industrial";
      return { ...r, zone, dist };
    });

  // a few parks near (not in) the core
  const parkCandidates = zoned.filter((b) => b.zone !== "industrial").sort((a, b) => a.dist - b.dist);
  for (const p of parkCandidates.slice(1, 4)) p.zone = "park";

  // ---- perimeter lot subdivision ----------------------------------------
  // Lots line each street edge of a block (buildings may touch); big blocks
  // keep a green courtyard in the middle. Every lot records its street facing.
  const lots: LotDef[] = [];
  let lotId = 1;
  const widthFor: Record<Zone, number> = { commercial: 5, mixed: 5, residential: 5, industrial: 10, park: 0 };
  const depthFor: Record<Zone, number> = { commercial: 7, mixed: 6, residential: 6, industrial: 9, park: 0 };

  const addLot = (x0: number, y0: number, w: number, h: number, zone: Zone, facing: number, yard = false) => {
    if (w < 3 || h < 3) return;
    const proximity =
      1 + 1.5 * Math.max(0, 1 - Math.hypot(x0 + w / 2 - center, y0 + h / 2 - center) / (size * 0.7));
    const value = Math.round(w * h * ZONE_BASE_VALUE[zone] * proximity);
    lots.push({ id: lotId++, x: x0, y: y0, w, h, zone, value, facing, ...(yard ? { yard: true } : {}) });
    const paint = !yard;
    if (paint)
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) if (at(x, y) === Tile.Grass) set(x, y, Tile.Lot);
  };

  // carve one strip into lots of jittered widths along its street axis;
  // occasionally a double-wide parcel for bigger buildings
  const stripLots = (
    r: RNG,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    horizontal: boolean,
    facing: number,
    zone: Zone
  ) => {
    const len = horizontal ? sw : sh;
    if (len < 3) return;
    const target = widthFor[zone];
    let pos = 0;
    while (pos < len) {
      let w = Math.min(len - pos, Math.max(3, target + rint(r, -1, 3)));
      if (chance(r, 0.14)) w = Math.min(len - pos, w * 2); // double-wide parcel
      if (len - pos - w < 3) w = len - pos;
      // every parcel is real land — no randomly skipped gaps that read as
      // buyable grass but aren't (the draw stays so layouts don't reshuffle)
      chance(r, 0.04);
      if (horizontal) addLot(sx + pos, sy, w, sh, zone, facing);
      else addLot(sx, sy + pos, sw, w, zone, facing);
      pos += w;
    }
  };

  for (const b of zoned) {
    if (b.zone === "park") {
      // a park is one big green parcel: buyable like everything else, but its
      // ground stays grass — it's a park until somebody develops it
      addLot(b.x + 1, b.y + 1, b.w - 2, b.h - 2, "park", FACE_S, true);
      continue;
    }
    // per-block rng: a block always subdivides the same way, independent of the map
    const br = mulberry32(hashSeed(seed, b.x, b.y, 0xb10c));
    // interior after the sidewalk ring
    const bx = b.x + 1;
    const by = b.y + 1;
    const bw = b.w - 2;
    const bh = b.h - 2;
    if (bw < 3 || bh < 3) continue;

    // small blocks sometimes become one landmark lot (skyscraper site, big
    // warehouse, or a large estate in residential areas)
    const landmarkP =
      b.zone === "commercial" ? 0.4 : b.zone === "industrial" ? 0.3 : b.zone === "residential" ? 0.1 : 0;
    if (bw <= 18 && bh <= 18 && bw * bh >= 49 && chance(br, landmarkP)) {
      addLot(bx, by, bw, bh, b.zone, pick(br, [FACE_S, FACE_N, FACE_E, FACE_W]));
      continue;
    }

    const d = Math.max(3, Math.min(depthFor[b.zone] + rint(br, -1, 1), Math.floor(Math.min(bw, bh) / 2)));

    if (bh < 2 * d) {
      // shallow block: one or two back-to-back rows
      if (bh >= 7) {
        const top = Math.floor(bh / 2);
        stripLots(br, bx, by, bw, top, true, FACE_N, b.zone);
        stripLots(br, bx, by + top, bw, bh - top, true, FACE_S, b.zone);
      } else {
        stripLots(br, bx, by, bw, bh, true, FACE_S, b.zone);
      }
      continue;
    }

    // perimeter: north + south rows full width, east + west fill the middle
    // band. Remainders never survive as orphan grass: a band too thin for
    // its own row is swallowed by the south row, a sliver of a courtyard
    // widens the east strip, and a real courtyard becomes parcels itself.
    let bandH = bh - 2 * d;
    let dSouth = d;
    if (bandH > 0 && bandH < 3) {
      dSouth = d + bandH;
      bandH = 0;
    }
    stripLots(br, bx, by, bw, d, true, FACE_N, b.zone);
    stripLots(br, bx, by + bh - dSouth, bw, dSouth, true, FACE_S, b.zone);
    const bandY = by + d;
    if (bandH >= 3 && bw >= 2 * d + 3) {
      let dEast = d;
      const courtW = bw - 2 * d;
      if (courtW > 0 && courtW < 3) dEast = d + courtW;
      stripLots(br, bx, bandY, d, bandH, false, FACE_W, b.zone);
      stripLots(br, bx + bw - dEast, bandY, dEast, bandH, false, FACE_E, b.zone);
      const cw = bw - d - dEast;
      if (cw >= 3) addLot(bx + d, bandY, cw, bandH, b.zone, FACE_S, true);
    } else if (bandH >= 3) {
      stripLots(br, bx, bandY, bw, bandH, false, FACE_W, b.zone);
    }
  }

  const blocks: BlockDef[] = zoned.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, zone: b.zone }));
  const districts = makeDistricts(seed, size, blocks);
  return { seed, width: size, height: size, tiles, lots, blocks, districts, segsV, segsH };
}

export function tileAtWorld(map: CityMap, wx: number, wy: number): Tile {
  const x = Math.floor(wx / TILE_WORLD_SIZE);
  const y = Math.floor(wy / TILE_WORLD_SIZE);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return Tile.Water;
  return map.tiles[y * map.width + x] as Tile;
}

// Works in both Node (Buffer) and the browser (atob/btoa).
const NodeBuffer = (globalThis as any).Buffer;

export function tilesToBase64(t: Uint8Array): string {
  if (NodeBuffer) return NodeBuffer.from(t).toString("base64");
  let s = "";
  for (let i = 0; i < t.length; i += 8192) s += String.fromCharCode(...t.subarray(i, i + 8192));
  return btoa(s);
}

export function tilesFromBase64(b64: string): Uint8Array {
  if (NodeBuffer) return new Uint8Array(NodeBuffer.from(b64, "base64"));
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Wire format for the /map endpoint.
// Districts: blocks grouped into a 4×4 super-grid by centroid, empty cells
// dropped — 12-16 named neighborhoods, deterministic from the seed.
const DISTRICT_FIRST = [
  "Old", "New", "East", "West", "North", "South", "Iron", "Copper", "Harbor", "King's",
  "Crown", "Mill", "Union", "Grand", "Low", "High",
];
const DISTRICT_SECOND = [
  "Harbor", "Side", "Gate", "Row", "Market", "Yards", "Heights", "Hollow", "Point",
  "Cross", "End", "Fields", "Wharf", "Quarter", "Green", "Bank",
];

function makeDistricts(seed: number, size: number, blocks: BlockDef[]): DistrictDef[] {
  const G = 4; // super-grid
  const cellOf = (b: BlockDef) => {
    const cx = Math.min(G - 1, Math.floor(((b.x + b.w / 2) / size) * G));
    const cy = Math.min(G - 1, Math.floor(((b.y + b.h / 2) / size) * G));
    return cy * G + cx;
  };
  const byCell = new Map<number, number[]>();
  blocks.forEach((b, i) => {
    const c = cellOf(b);
    if (!byCell.has(c)) byCell.set(c, []);
    byCell.get(c)!.push(i);
  });
  // deterministic unique names
  const rng = mulberry32(hashSeed(seed, 0xd157));
  const used = new Set<string>();
  const nextName = () => {
    for (let tries = 0; tries < 64; tries++) {
      const a = DISTRICT_FIRST[Math.floor(rng() * DISTRICT_FIRST.length)];
      const b = DISTRICT_SECOND[Math.floor(rng() * DISTRICT_SECOND.length)];
      const n = `${a} ${b}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `District ${used.size + 1}`;
  };
  const out: DistrictDef[] = [];
  for (const cell of [...byCell.keys()].sort((a, b) => a - b)) {
    const ids = byCell.get(cell)!;
    if (!ids.length) continue;
    out.push({ id: out.length + 1, name: nextName(), blocks: ids });
  }
  return out;
}

export interface CityMapWire {
  seed: number;
  width: number;
  height: number;
  tilesB64: string;
  lots: LotDef[];
  blocks: BlockDef[];
  districts: DistrictDef[];
  segsV: RoadSegV[];
  segsH: RoadSegH[];
}

export const mapToWire = (m: CityMap): CityMapWire => ({
  seed: m.seed,
  width: m.width,
  height: m.height,
  tilesB64: tilesToBase64(m.tiles),
  lots: m.lots,
  blocks: m.blocks,
  districts: m.districts,
  segsV: m.segsV,
  segsH: m.segsH,
});

export const mapFromWire = (w: CityMapWire): CityMap => ({
  seed: w.seed,
  width: w.width,
  height: w.height,
  tiles: tilesFromBase64(w.tilesB64),
  lots: w.lots,
  districts: w.districts,
  blocks: w.blocks,
  segsV: w.segsV,
  segsH: w.segsH,
});
