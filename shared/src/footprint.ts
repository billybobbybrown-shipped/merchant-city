import { BuildingDef } from "./buildings.js";
import { chance, hashSeed, mulberry32, rint, rrange } from "./rng.js";

// Deterministic structural layout of a building on its lot. The client mesh,
// the interior grid and the server-side placement validation ALL derive from
// this, so interiors always match exteriors exactly.

export interface WingLayout {
  w: number; // wing width (world units, along the front axis)
  d: number; // wing depth
  floors: number;
  side: number; // +1 right, -1 left (viewed from the street)
}

export interface BuildingLayout {
  w: number; // main block width
  d: number; // main block depth
  centerZ: number; // main block center offset from lot center, + toward street
  variant?: number; // skyscraper massing
  wing?: WingLayout;
}

const WING_RANGES: Record<string, { p: number; dm: [number, number]; dr: [number, number] }> = {
  shop: { p: 0.4, dm: [0.5, 0.65], dr: [0.75, 0.92] },
  office: { p: 0.45, dm: [0.5, 0.68], dr: [0.72, 0.9] },
  apartment: { p: 0.4, dm: [0.55, 0.7], dr: [0.72, 0.88] },
};

// fw/fd: lot footprint in world units, already rotated to face the street.
export function buildingLayout(def: BuildingDef, fw: number, fd: number): BuildingLayout {
  const rng = mulberry32(hashSeed(def.seed, 0xf007));
  switch (def.kind) {
    case "custom": {
      // bounding box of the player-drawn outline (fallback path — custom
      // buildings are normally handled shape-first by their consumers)
      const shape = def.shape ?? [];
      if (!shape.length) return { w: fw * 0.8, d: fd * 0.8, centerZ: 0 };
      const x0 = Math.min(...shape.map((r) => r.x));
      const x1 = Math.max(...shape.map((r) => r.x + r.w));
      const y0 = Math.min(...shape.map((r) => r.y));
      const y1 = Math.max(...shape.map((r) => r.y + r.h));
      // centerZ: outline cells are lot-anchored, front row y=fd-1 at +fd/2
      const cz = (y0 + y1) / 2 - fd / 2;
      return { w: x1 - x0, d: y1 - y0, centerZ: cz };
    }
    case "house":
      return {
        w: Math.min(fw * rrange(rng, 0.55, 0.8), 14),
        d: Math.min(fd * rrange(rng, 0.5, 0.75), 12),
        centerZ: 0,
      };
    case "shop":
    case "office":
    case "apartment": {
      const cfg = WING_RANGES[def.kind];
      const w = fw - 0.02;
      const dFull = fd * rrange(rng, cfg.dr[0], cfg.dr[1]);
      if (fd >= 9 && def.floors >= 2 && chance(rng, cfg.p)) {
        const sameHeight = chance(rng, 0.45);
        const w2 = w * rrange(rng, 0.35, 0.6);
        const floors2 = sameHeight
          ? def.floors
          : Math.max(1, Math.min(def.floors - 1, Math.round(def.floors * rrange(rng, 0.5, 0.9))));
        const side = chance(rng, 0.5) ? 1 : -1;
        const dMain = dFull * rrange(rng, cfg.dm[0], cfg.dm[1]);
        const wingD = dFull - dMain - 0.02;
        if (wingD >= 1.5)
          return {
            w,
            d: dMain,
            centerZ: (dFull - dMain) / 2,
            wing: { w: w2, d: wingD, floors: floors2, side },
          };
      }
      return { w, d: dFull, centerZ: 0 };
    }
    case "warehouse":
      return { w: fw * rrange(rng, 0.86, 0.95), d: fd * rrange(rng, 0.82, 0.92), centerZ: 0 };
    case "factory":
      return { w: fw * rrange(rng, 0.82, 0.92), d: fd * rrange(rng, 0.78, 0.9), centerZ: 0 };
    case "tower":
      return { w: fw * rrange(rng, 0.88, 0.98), d: fd * rrange(rng, 0.8, 0.92), centerZ: 0 };
    case "skyscraper": {
      const w = fw * rrange(rng, 0.8, 0.92);
      const d = fd * rrange(rng, 0.78, 0.9);
      const variant = rint(rng, 0, 1); // 0 stepped, 1 monolith
      return variant === 0
        ? { w, d, centerZ: 0, variant }
        : { w: w * 0.9, d: d * 0.9, centerZ: 0, variant };
    }
  }
}
