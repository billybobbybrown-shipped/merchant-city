import * as THREE from "three";
import { BuildingKind, mulberry32, hashSeed, RNG, chance, pick, rrange } from "@mc/shared";

export function mkCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext("2d")! };
}

export function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function speckle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: RNG,
  count: number,
  colors: string[],
  maxSize = 3,
  alpha = 0.14
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = pick(rng, colors);
    const s = 1 + rng() * maxSize;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- facades

interface StylePalette {
  base: string[];
  trim: string;
  glassDay: string;
  drawPattern?: (ctx: CanvasRenderingContext2D, w: number, h: number, rng: RNG) => void;
}

const STYLES: StylePalette[] = [
  {
    // 0 — brick
    base: ["#8a5844", "#95604a", "#7c4f3e", "#a06a52"],
    trim: "#4a3428",
    glassDay: "#202e3c",
    drawPattern: (ctx, w, h, rng) => {
      ctx.strokeStyle = "rgba(40,24,18,0.35)";
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 6) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        const off = (y / 6) % 2 === 0 ? 0 : 8;
        for (let x = off; x < w; x += 16) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 6);
          ctx.stroke();
        }
      }
      speckle(ctx, w, h, rng, 300, ["#000000", "#ffffff", "#c98860"], 2, 0.06);
    },
  },
  {
    // 1 — concrete panel
    base: ["#9aa0a4", "#8f959b", "#a5a9ad", "#878e94"],
    trim: "#5b6167",
    glassDay: "#1c2a36",
    drawPattern: (ctx, w, h, rng) => {
      ctx.strokeStyle = "rgba(30,34,38,0.3)";
      ctx.lineWidth = 1.5;
      for (let y = 0; y < h; y += 32) {
        ctx.strokeRect(-1, y, w + 2, 32);
      }
      speckle(ctx, w, h, rng, 500, ["#000000", "#ffffff"], 2, 0.05);
    },
  },
  {
    // 2 — graphite panel (clean modern stone, sits well next to brick/stucco)
    base: ["#697077", "#5f666d", "#727980", "#59626b"],
    trim: "#2e3438",
    glassDay: "#18242e",
    drawPattern: (ctx, w, h, rng) => {
      // darker spandrel band at every floor line
      ctx.fillStyle = "rgba(0,0,0,0.17)";
      for (let y = 0; y < h; y += 36) ctx.fillRect(0, y, w, 7);
      // fine vertical panel seams
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      speckle(ctx, w, h, rng, 350, ["#000000", "#ffffff"], 2, 0.05);
    },
  },
  {
    // 3 — painted stucco / plaster
    base: ["#c8b797", "#cfc0a4", "#b9a684", "#d6c9ae"],
    trim: "#6e5f49",
    glassDay: "#232f3a",
    drawPattern: (ctx, w, h, rng) => {
      speckle(ctx, w, h, rng, 700, ["#000000", "#ffffff", "#a08f70"], 2, 0.05);
    },
  },
];

export interface FacadeMaps {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  glassy: boolean;
}

const facadeCache = new Map<string, FacadeMaps>();

// Window bays inside `blank` (columns c0..c1-1, rows 0..rows-1 counted from the
// ground) are skipped — used where an attached wing covers part of a wall.
export interface BlankRegion {
  c0: number;
  c1: number;
  rows: number;
}

export function facadeTexture(
  kind: BuildingKind,
  style: number,
  floors: number,
  cols: number,
  seed: number,
  door = false,
  blank?: BlankRegion
): FacadeMaps {
  const variant = seed % 16;
  const key = `${kind}:${style}:${floors}:${cols}:${variant}:${door ? 1 : 0}:${
    blank ? `${blank.c0}-${blank.c1}-${blank.rows}` : ""
  }`;
  const hit = facadeCache.get(key);
  if (hit) return hit;

  const rng = mulberry32(hashSeed(style, floors, cols, variant, 0xfacade));
  const pal = STYLES[style % STYLES.length];
  const industrial = kind === "warehouse" || kind === "factory";
  const floorPx = 36;
  const colPx = 30;
  const w = Math.max(96, cols * colPx);
  const h = Math.max(72, floors * floorPx + 16);

  const { canvas, ctx } = mkCanvas(w, h);
  const { canvas: eCanvas, ctx: ectx } = mkCanvas(w, h);
  ectx.fillStyle = "#000";
  ectx.fillRect(0, 0, w, h);

  // base color keyed to the variant (not the rng stream) so every face of one
  // building — front, sides, tower sections — lands on the same color
  ctx.fillStyle = industrial ? "#7d8285" : pal.base[variant % pal.base.length];
  ctx.fillRect(0, 0, w, h);
  pal.drawPattern?.(ctx, w, h, rng);
  if (industrial) {
    // corrugated metal ribs
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    for (let x = 0; x < w; x += 5) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }

  // door geometry decided up front so ground-floor windows can avoid it
  const doorW = 22;
  const doorX = Math.floor(w / 2 - doorW / 2);

  // windows (skip most of the wall for industrial: one high strip)
  const litChance = 0.38;
  const winW = colPx - 12;
  const winH = floorPx - 16;
  const rows = industrial ? 1 : floors;
  for (let r = 0; r < rows; r++) {
    const yTop = industrial ? 10 : h - (r + 1) * floorPx + 8;
    for (let c = 0; c < cols; c++) {
      const x = c * colPx + 6;
      // ground floor: leave the door bay clear
      if (door && !industrial && r === 0 && x + winW > doorX - 5 && x < doorX + doorW + 5)
        continue;
      // covered by an attached wing — no window there
      if (blank && r < blank.rows && c >= blank.c0 && c < blank.c1) continue;
      // frame
      ctx.fillStyle = pal.trim;
      ctx.fillRect(x - 1.5, yTop - 1.5, winW + 3, winH + 3);
      // glass with subtle vertical gradient
      const g = ctx.createLinearGradient(0, yTop, 0, yTop + winH);
      g.addColorStop(0, pal.glassDay);
      g.addColorStop(1, "#101820");
      ctx.fillStyle = g;
      ctx.fillRect(x, yTop, winW, winH);
      if (chance(rng, litChance)) {
        ectx.fillStyle = pick(rng, ["#ffd28a", "#ffe3ae", "#ffc46e"]);
        ectx.fillRect(x, yTop, winW, winH);
      }
    }
  }

  // street-level entrance — only on faces that actually front the street.
  // Drawn as a real paneled door; deliberately no emissive so it stays dark at night.
  const paneledDoor = (dx: number, dw: number, dh: number) => {
    // step shadow at the threshold
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(dx - 5, h - 3, dw + 10, 3);
    // frame + lintel
    ctx.fillStyle = pal.trim;
    ctx.fillRect(dx - 3.5, h - dh - 5, dw + 7, dh + 5);
    // door slab
    const slab = pick(rng, ["#4a3626", "#22333f", "#3b2f40", "#5a2323", "#2f3b2c"]);
    ctx.fillStyle = slab;
    ctx.fillRect(dx, h - dh, dw, dh);
    // inset panels
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(dx + 3, h - dh + 3, dw - 6, dh * 0.38);
    ctx.strokeRect(dx + 3, h - dh * 0.52, dw - 6, dh * 0.42);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(dx + 4, h - dh + 4, dw - 8, dh * 0.38 - 2);
    // handle
    ctx.fillStyle = "#c9b26a";
    ctx.fillRect(dx + dw - 5, h - dh * 0.52, 2.5, 5);
  };

  if (door && !industrial) {
    paneledDoor(doorX, doorW, 29);
  } else if (door && industrial) {
    // big roller door
    ctx.fillStyle = "#5f6569";
    ctx.fillRect(w * 0.15, h - 44, w * 0.35, 44);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    for (let y = h - 44; y < h; y += 6) {
      ctx.beginPath();
      ctx.moveTo(w * 0.15, y);
      ctx.lineTo(w * 0.5, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(w * 0.15, h - 44, w * 0.35, 43);
    // personnel door beside the roller
    paneledDoor(Math.min(w * 0.62, w - 24), 16, 26);
  }

  const maps: FacadeMaps = {
    map: toTexture(canvas),
    emissiveMap: toTexture(eCanvas),
    glassy: false, // the glass curtain-wall style was retired
  };
  facadeCache.set(key, maps);
  return maps;
}

// ---------------------------------------------------------------- roofs

const roofCache = new Map<string, THREE.CanvasTexture>();
// bordered = framed rooftop face for standalone boxes; borderless variant is
// used for continuous roof decks spanning joined building sections
export function roofTexture(seed: number, bordered = true): THREE.CanvasTexture {
  const v = seed % 8;
  const key = `${v}:${bordered ? 1 : 0}`;
  const hit = roofCache.get(key);
  if (hit) return hit;
  const rng = mulberry32(hashSeed(v, 0x800f));
  const { canvas, ctx } = mkCanvas(128, 128);
  ctx.fillStyle = pick(rng, ["#565b5e", "#4e5254", "#5e6266"]);
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, rng, 900, ["#000000", "#ffffff", "#787d80"], 2, 0.08);
  if (bordered) {
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.strokeRect(4, 4, 120, 120);
  }
  const t = toTexture(canvas);
  roofCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------- signage

export function signTexture(name: string, seed: number): THREE.CanvasTexture {
  const rng = mulberry32(hashSeed(seed, 0x5164));
  const { canvas, ctx } = mkCanvas(256, 64);
  const bg = pick(rng, ["#1b2733", "#2b1e1a", "#1e2b22", "#2a2030"]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, 250, 58);
  ctx.fillStyle = pick(rng, ["#ffd98c", "#ffe9c2", "#c9e8ff", "#ffd0d0"]);
  ctx.font = `bold ${name.length > 14 ? 22 : 28}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.toUpperCase(), 128, 34, 240);
  return toTexture(canvas);
}

export function awningColor(rng: RNG): string {
  return pick(rng, ["#8c2f2f", "#2f5d8c", "#2f7a4a", "#8a6b2f", "#5b3a7a"]);
}

export const rand = { rrange };
