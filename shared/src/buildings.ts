import { LotDef } from "./citygen.js";
import { CITY_SIZE } from "./constants.js";
import { chance, hashSeed, mulberry32, pick, rint } from "./rng.js";

export type BuildingKind =
  | "custom"
  | "shop"
  | "office"
  | "tower"
  | "skyscraper"
  | "apartment"
  | "house"
  | "warehouse"
  | "factory";

export interface BuildingDef {
  kind: BuildingKind;
  floors: number;
  style: number; // 0..3 architectural style within the zone family
  seed: number;
  name: string;
  sign?: boolean; // false hides the sign; city buildings leave it unset (shown)
  shape?: import("./custom.js").PlanRect[]; // player-drawn outline (custom kind)
}

const ADJ = ["Golden", "Iron", "Blue", "Old Town", "Silver", "Copper", "North", "Harbor", "Union", "Central", "Royal", "Cedar"];
const SHOP = ["Fork", "Mercantile", "Goods", "Supply Co", "Market", "Trading Post", "Emporium", "Outfitters", "Deli", "Cafe", "Books", "Hardware"];
const CORP = ["Holdings", "Group", "Industries", "Capital", "Logistics", "Works", "& Sons", "Consolidated", "Partners", "Manufacturing"];

// Deterministic: the same city seed + lot always yields the same building (or
// vacancy). Zones do NOT drive assignment — any building type can appear on any
// lot anywhere; only skyscrapers/towers carry a soft pull toward downtown.
export function buildingForLot(citySeed: number, lot: LotDef): BuildingDef | null {
  const rng = mulberry32(hashSeed(citySeed, lot.id, 0xb11d));
  const area = lot.w * lot.h;
  if (chance(rng, area >= 40 ? 0.06 : 0.12)) return null;

  const seed = hashSeed(citySeed, lot.id, 0xfa5e);
  const style = rint(rng, 0, 3);
  const corpName = `${pick(rng, ADJ)} ${pick(rng, CORP)}`;
  const shopName = `${pick(rng, ADJ)} ${pick(rng, SHOP)}`;

  // centrality 1 → downtown, 0 → fringe; only tall buildings care
  const dist = Math.hypot(lot.x + lot.w / 2 - CITY_SIZE / 2, lot.y + lot.h / 2 - CITY_SIZE / 2);
  const centr = Math.max(0, 1 - dist / (CITY_SIZE * 0.42));

  if (area >= 30 && chance(rng, 0.6 * centr * centr))
    return {
      kind: "skyscraper",
      floors: rint(rng, 15, 24),
      style: chance(rng, 0.65) ? 2 : style,
      seed,
      name: corpName,
    };
  if (area >= 22 && chance(rng, 0.35 * centr))
    return { kind: "tower", floors: rint(rng, 7, 14), style, seed, name: corpName };

  // flat mix — every kind everywhere, no zone chunks
  const weights: Array<[BuildingKind, number]> = [
    ["house", 0.3],
    ["shop", 0.18],
    ["apartment", 0.16],
    ["office", 0.14],
    ["warehouse", 0.12],
    ["factory", area >= 24 ? 0.08 : 0],
  ];
  let total = 0;
  for (const [, wgt] of weights) total += wgt;
  let roll = rng() * total;
  let kind: BuildingKind = "house";
  for (const [k, wgt] of weights)
    if ((roll -= wgt) < 0) {
      kind = k;
      break;
    }
  switch (kind) {
    case "house":
      return { kind, floors: rint(rng, 1, 3), style, seed, name: shopName };
    case "shop":
      return { kind, floors: rint(rng, 1, 4), style, seed, name: shopName };
    case "apartment":
      return { kind, floors: rint(rng, 3, 6), style, seed, name: shopName };
    case "office":
      return { kind, floors: rint(rng, 3, 8), style, seed, name: corpName };
    case "warehouse":
      return { kind, floors: 1, style, seed, name: corpName };
    default:
      return { kind: "factory", floors: 2, style, seed, name: corpName };
  }
}
