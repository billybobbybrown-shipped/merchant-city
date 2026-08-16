import * as THREE from "three";
import { CityMap, Tile, TILE_WORLD_SIZE, mulberry32, hashSeed, pick } from "@mc/shared";
import { toTexture } from "./textures.js";

const CHUNK = 16; // tiles per chunk side
const PX = 32; // pixels per tile in the baked ground texture

// Bakes the whole ground (roads with lane lines + crosswalks, sidewalk pavers,
// grass, water, lot surfaces) into one canvas texture per 16x16-tile chunk.
// Every chunk's canvas is kept so excavations can be cut out of it later.
interface Chunk {
  cx: number;
  cy: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.Texture;
}
const chunkCanvases: Chunk[] = [];
// excavations currently cut out of the ground, by key, so they can be re-cut
// after a repaint or filled back in when the working is cleared
interface Hole {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  rot: number;
}
const cutHoles = new Map<string, Hole>();
// set when the city is built: repaints one chunk's tiles from scratch
let repaintChunk: (ch: Chunk) => void = () => {};

// Clear the ground over an excavation. `quad` is the pit mouth in world space,
// given as its centre, half-extents and rotation, matching how the site itself
// is placed.
export function cutGroundHole(
  key: string,
  cxWorld: number,
  czWorld: number,
  halfW: number,
  halfD: number,
  rot: number
): void {
  if (cutHoles.has(key)) return;
  cutHoles.set(key, { x: cxWorld, z: czWorld, halfW, halfD, rot });
  applyHole({ x: cxWorld, z: czWorld, halfW, halfD, rot });
}

// Fill an excavation back in: the affected chunks are repainted from scratch
// and any other holes re-cut, so clearing one working does not erase another.
export function restoreGroundHole(key: string): void {
  const hole = cutHoles.get(key);
  if (!hole) return;
  cutHoles.delete(key);
  const size = CHUNK * TILE_WORLD_SIZE;
  const reach = Math.hypot(hole.halfW, hole.halfD);
  for (const ch of chunkCanvases) {
    const originX = ch.cx * size;
    const originZ = ch.cy * size;
    if (
      hole.x + reach < originX ||
      hole.x - reach > originX + size ||
      hole.z + reach < originZ ||
      hole.z - reach > originZ + size
    )
      continue;
    repaintChunk(ch);
    ch.tex.needsUpdate = true;
  }
  for (const other of cutHoles.values()) applyHole(other);
}

function applyHole({ x: cxWorld, z: czWorld, halfW, halfD, rot }: Hole): void {
  const size = CHUNK * TILE_WORLD_SIZE;
  const px = PX / TILE_WORLD_SIZE; // canvas pixels per world unit
  for (const ch of chunkCanvases) {
    const originX = ch.cx * size;
    const originZ = ch.cy * size;
    // skip chunks the pit cannot touch
    const reach = Math.hypot(halfW, halfD);
    if (
      cxWorld + reach < originX ||
      cxWorld - reach > originX + size ||
      czWorld + reach < originZ ||
      czWorld - reach > originZ + size
    )
      continue;
    const g = ch.ctx;
    g.save();
    g.translate((cxWorld - originX) * px, (czWorld - originZ) * px);
    g.rotate(-rot);
    g.clearRect(-halfW * px, -halfD * px, halfW * 2 * px, halfD * 2 * px);
    g.restore();
    ch.tex.needsUpdate = true;
  }
}

export function buildGround(map: CityMap): THREE.Group {
  const group = new THREE.Group();
  group.name = "ground";
  chunkCanvases.length = 0;
  cutHoles.clear();
  const chunks = Math.ceil(map.width / CHUNK);
  // per-tile road coverage: which column/row of its segment a tile is (c/r),
  // how wide the segment is, and whether the tile sits in the segment's end zone
  interface Cov {
    c: number; // column (vert) or row (horz) within the segment, 0..w-1
    w: number; // segment width in tiles (2 = side street, 4 = arterial)
    end: boolean;
  }
  const W = map.width;
  const vert = new Map<number, Cov>();
  for (const s of map.segsV)
    for (let y = s.y0; y <= s.y1; y++) {
      const end = y <= s.y0 + 1 || y >= s.y1 - 1;
      for (let dx = 0; dx < s.w; dx++) vert.set(y * W + s.x + dx, { c: dx, w: s.w, end });
    }
  const horz = new Map<number, Cov>();
  for (const s of map.segsH)
    for (let x = s.x0; x <= s.x1; x++) {
      const end = x <= s.x0 + 1 || x >= s.x1 - 1;
      for (let dy = 0; dy < s.w; dy++) horz.set((s.y + dy) * W + x, { c: dy, w: s.w, end });
    }

  // Crosswalk boxes are decided per segment PAIR, all-or-nothing, with stripe
  // edges derived from box geometry (bit 1 top, 2 bottom, 4 left, 8 right) so
  // boxes always render complete. Two kinds of junction qualify:
  //   - through crossings where both roads continue ≥3 tiles on all sides
  //   - side streets terminating into a cross road (T / aligned 4-way)
  const zebra = new Map<number, number>();
  const addBox = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const role =
          (y === y0 ? 1 : 0) | (y === y1 ? 2 : 0) | (x === x0 ? 4 : 0) | (x === x1 ? 8 : 0);
        const k = y * W + x;
        zebra.set(k, (zebra.get(k) ?? 0) | role);
      }
  };
  // a junction is marked ONLY if it is a true 4-way: the tile grid must
  // continue as road beyond the box on ALL four sides (Ts and corners: no box)
  const roadAt = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < W && map.tiles[y * W + x] === Tile.Road;
  for (const sv of map.segsV)
    for (const sh of map.segsH) {
      const x1 = sv.x + sv.w - 1;
      const y1 = sh.y + sh.w - 1;
      const overlaps = sv.x <= sh.x1 && x1 >= sh.x0 && sh.y <= sv.y1 && y1 >= sv.y0;
      if (!overlaps) continue;
      const midX = (sv.x + x1) >> 1;
      const midY = (sh.y + y1) >> 1;
      if (
        roadAt(midX, sh.y - 1) && roadAt(midX, y1 + 1) &&
        roadAt(sv.x - 1, midY) && roadAt(x1 + 1, midY)
      )
        addBox(sv.x, x1, sh.y, y1);
    }
  const tile = (x: number, y: number): Tile =>
    x < 0 || y < 0 || x >= map.width || y >= map.height
      ? Tile.Grass
      : (map.tiles[y * map.width + x] as Tile);

  // Painting a chunk is deterministic (its rng is seeded from the chunk), so it
  // can be redone from scratch — which is how the ground grows back when an
  // excavation is cleared.
  repaintChunk = (ch: Chunk) => {
    const cx = ch.cx;
    const cy = ch.cy;
    const ctx = ch.ctx;
    ctx.clearRect(0, 0, ch.canvas.width, ch.canvas.height);
    const rng = mulberry32(hashSeed(map.seed, cx, cy, 0x6b0d));

      for (let ty = 0; ty < CHUNK; ty++)
        for (let tx = 0; tx < CHUNK; tx++) {
          const gx = cx * CHUNK + tx;
          const gy = cy * CHUNK + ty;
          if (gx >= map.width || gy >= map.height) continue;
          const t = tile(gx, gy);
          const px = tx * PX;
          const py = ty * PX;

          switch (t) {
            case Tile.Road: {
              ctx.fillStyle = pick(rng, ["#2e3134", "#303336", "#2c2f32"]);
              ctx.fillRect(px, py, PX, PX);
              const k = gy * W + gx;
              const v = vert.get(k);
              const hz = horz.get(k);

              // lane markings for a vertical road tile at column v.c:
              // 2-wide → yellow dash at the center boundary; 4-wide → double
              // solid yellow at the center + white dashes between same-way lanes
              const paintV = (cov: { c: number; w: number }) => {
                if (cov.w === 2) {
                  if (cov.c === 0) {
                    ctx.fillStyle = "rgba(235,200,80,0.8)";
                    for (let i = 2; i < PX; i += 12) ctx.fillRect(px + PX - 1.5, py + i, 3, 7);
                  }
                } else {
                  ctx.fillStyle = "rgba(235,200,80,0.9)";
                  if (cov.c === 1) ctx.fillRect(px + PX - 2.6, py, 1.8, PX);
                  if (cov.c === 2) ctx.fillRect(px + 0.8, py, 1.8, PX);
                  if (cov.c === 0 || cov.c === 2) {
                    ctx.fillStyle = "rgba(225,225,225,0.5)";
                    for (let i = 2; i < PX; i += 12) ctx.fillRect(px + PX - 1.2, py + i, 2.4, 7);
                  }
                }
              };
              const paintH = (cov: { c: number; w: number }) => {
                if (cov.w === 2) {
                  if (cov.c === 0) {
                    ctx.fillStyle = "rgba(235,200,80,0.8)";
                    for (let i = 2; i < PX; i += 12) ctx.fillRect(px + i, py + PX - 1.5, 7, 3);
                  }
                } else {
                  ctx.fillStyle = "rgba(235,200,80,0.9)";
                  if (cov.c === 1) ctx.fillRect(px, py + PX - 2.6, PX, 1.8);
                  if (cov.c === 2) ctx.fillRect(px, py + 0.8, PX, 1.8);
                  if (cov.c === 0 || cov.c === 2) {
                    ctx.fillStyle = "rgba(225,225,225,0.5)";
                    for (let i = 2; i < PX; i += 12) ctx.fillRect(px + i, py + PX - 1.2, 7, 2.4);
                  }
                }
              };

              const zb = zebra.get(k);
              if (zb !== undefined) {
                // junction box: stripes on the edges this tile owns
                ctx.fillStyle = "rgba(230,230,230,0.65)";
                if (zb & 1)
                  for (let i = 4; i < PX - 4; i += 8) ctx.fillRect(px + i, py + 2, 5, 6);
                if (zb & 2)
                  for (let i = 4; i < PX - 4; i += 8) ctx.fillRect(px + i, py + PX - 8, 5, 6);
                if (zb & 4)
                  for (let i = 4; i < PX - 4; i += 8) ctx.fillRect(px + 2, py + i, 6, 5);
                if (zb & 8)
                  for (let i = 4; i < PX - 4; i += 8) ctx.fillRect(px + PX - 8, py + i, 6, 5);
              } else if (v && hz) {
                // T mouth: the through road's lines run unbroken across it;
                // the terminating road adds nothing. True crossings (both
                // continuing) stay plain junction pavement.
                if (!v.end && hz.end) paintV(v);
                else if (!hz.end && v.end) paintH(hz);
              } else if (v && !v.end) {
                paintV(v);
              } else if (hz && !hz.end) {
                paintH(hz);
              }
              break;
            }
            case Tile.Sidewalk: {
              ctx.fillStyle = pick(rng, ["#8f8d88", "#94928d", "#8a8883"]);
              ctx.fillRect(px, py, PX, PX);
              ctx.strokeStyle = "rgba(0,0,0,0.18)";
              ctx.lineWidth = 1;
              ctx.strokeRect(px + 0.5, py + 0.5, PX - 1, PX - 1);
              ctx.beginPath();
              ctx.moveTo(px + PX / 2, py);
              ctx.lineTo(px + PX / 2, py + PX);
              ctx.stroke();
              // curb edge facing the road
              ctx.fillStyle = "rgba(0,0,0,0.22)";
              if (tile(gx - 1, gy) === Tile.Road) ctx.fillRect(px, py, 3, PX);
              if (tile(gx + 1, gy) === Tile.Road) ctx.fillRect(px + PX - 3, py, 3, PX);
              if (tile(gx, gy - 1) === Tile.Road) ctx.fillRect(px, py, PX, 3);
              if (tile(gx, gy + 1) === Tile.Road) ctx.fillRect(px, py + PX - 3, PX, 3);
              break;
            }
            case Tile.Water: {
              const g = ctx.createLinearGradient(px, py, px + PX, py + PX);
              g.addColorStop(0, "#1d4a63");
              g.addColorStop(1, "#173d53");
              ctx.fillStyle = g;
              ctx.fillRect(px, py, PX, PX);
              ctx.fillStyle = "rgba(255,255,255,0.06)";
              ctx.fillRect(px + rng() * PX * 0.6, py + rng() * PX * 0.8, 8, 1.5);
              break;
            }
            case Tile.Lot: {
              ctx.fillStyle = pick(rng, ["#6f6b60", "#736f64", "#6a665c"]);
              ctx.fillRect(px, py, PX, PX);
              break;
            }
            default: {
              // Grass: a flat base, soft drifts of tone over it, then short
              // leaning blades. Everything is clipped to the tile so nothing
              // bleeds onto the road beside it.
              ctx.fillStyle = pick(rng, ["#4c7a3d", "#517f41", "#477239", "#557f45"]);
              ctx.fillRect(px, py, PX, PX);
              ctx.save();
              ctx.beginPath();
              ctx.rect(px, py, PX, PX);
              ctx.clip();
              // patches drift across tile edges, so the ground stops reading
              // as a grid of flat squares
              for (let i = 0; i < 3; i++) {
                const cx = px + (rng() * 1.6 - 0.3) * PX;
                const cy = py + (rng() * 1.6 - 0.3) * PX;
                const r = PX * (0.45 + rng() * 0.5);
                const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                g.addColorStop(0, rng() < 0.5 ? "rgba(163,199,118,0.13)" : "rgba(28,58,26,0.13)");
                g.addColorStop(1, "rgba(0,0,0,0)");
                ctx.fillStyle = g;
                ctx.fillRect(px, py, PX, PX);
              }
              // blades: thin strokes with a slight lean, never axis-aligned
              ctx.lineWidth = 1;
              ctx.lineCap = "round";
              for (let i = 0; i < 16; i++) {
                const bx = px + rng() * PX;
                const by = py + rng() * PX;
                const len = 2.2 + rng() * 2.6;
                const lean = (rng() - 0.5) * 1.1;
                ctx.strokeStyle =
                  rng() < 0.55 ? "rgba(168,205,124,0.22)" : "rgba(36,70,31,0.24)";
                ctx.beginPath();
                ctx.moveTo(bx, by);
                ctx.lineTo(bx + lean * len, by - len);
                ctx.stroke();
              }
              ctx.restore();
              break;
            }
          }
        }

  };

  for (let cy = 0; cy < chunks; cy++)
    for (let cx = 0; cx < chunks; cx++) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = CHUNK * PX;
      const ctx = canvas.getContext("2d")!;
      const tex = toTexture(canvas);
      tex.magFilter = THREE.LinearFilter;
      const size = CHUNK * TILE_WORLD_SIZE;
      const geo = new THREE.PlaneGeometry(size, size);
      // alphaTest lets an excavation punch a real hole through the ground: the
      // pixels over a pit are cleared, and what shows through is the working
      // itself, dug in below grade.
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.95,
        metalness: 0,
        alphaTest: 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(cx * size + size / 2, 0, cy * size + size / 2);
      mesh.receiveShadow = true;
      group.add(mesh);
      const ch: Chunk = { cx, cy, canvas, ctx, tex };
      chunkCanvases.push(ch);
      repaintChunk(ch);
      tex.needsUpdate = true;
    }

  // Reflective sheen plane over the lake tiles' bounding area is added by city.ts.
  return group;
}
