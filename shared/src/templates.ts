import { BuildingKind } from "./buildings.js";
import { LotDef } from "./citygen.js";

// Construction catalog. Costs are cash-only in Phase 1; material inputs arrive
// with the goods economy in Phase 2.
export interface BuildTemplate {
  id: string;
  label: string;
  kind: BuildingKind;
  floors: number;
  minW: number; // tiles, along either lot axis
  minD: number;
  cost: number;
  buildMinutes: number;
}

export const BUILD_TEMPLATES: BuildTemplate[] = [
  { id: "house", label: "House", kind: "house", floors: 2, minW: 3, minD: 3, cost: 4000, buildMinutes: 2 },
  { id: "shop_s", label: "Small Shop", kind: "shop", floors: 1, minW: 3, minD: 3, cost: 6000, buildMinutes: 3 },
  { id: "shop_l", label: "Large Shop", kind: "shop", floors: 2, minW: 5, minD: 4, cost: 10000, buildMinutes: 4 },
  { id: "warehouse", label: "Warehouse", kind: "warehouse", floors: 1, minW: 4, minD: 4, cost: 8000, buildMinutes: 3 },
  { id: "workshop", label: "Workshop", kind: "factory", floors: 2, minW: 4, minD: 4, cost: 12000, buildMinutes: 4 },
  { id: "office", label: "Office", kind: "office", floors: 4, minW: 4, minD: 4, cost: 14000, buildMinutes: 5 },
  { id: "apartment", label: "Apartment", kind: "apartment", floors: 4, minW: 4, minD: 4, cost: 12000, buildMinutes: 4 },
  { id: "tower", label: "Tower", kind: "tower", floors: 10, minW: 5, minD: 5, cost: 60000, buildMinutes: 8 },
  { id: "skyscraper", label: "Skyscraper", kind: "skyscraper", floors: 18, minW: 6, minD: 6, cost: 150000, buildMinutes: 12 },
  // sized to the BUILDING: the store + three-pump canopy fit with a tile of
  // margin either side, and the plot depth covers store + forecourt
  { id: "gas_station", label: "Gas Station", kind: "gas_station", floors: 1, minW: 7, minD: 6, cost: 9000, buildMinutes: 4 },
];

export const templateById = (id: string) => BUILD_TEMPLATES.find((t) => t.id === id);

export function templateFits(t: BuildTemplate, lot: LotDef): boolean {
  const a = Math.max(lot.w, lot.h);
  const b = Math.min(lot.w, lot.h);
  return (
    (lot.w >= t.minW && lot.h >= t.minD) ||
    (lot.h >= t.minW && lot.w >= t.minD) ||
    (a >= t.minW && b >= t.minD)
  );
}

// Wire shape for lot ownership/market state (server → client).
export interface LotState {
  id: number;
  name: string | null; // owner-given name; null → referred to by lot number
  sign: boolean; // is the building's sign displayed
  ownerType: "city" | "player";
  ownerId: string | null;
  ownerName: string | null;
  forSale: boolean;
  price: number; // city lots: assessed value; player listings: ask price
  forRent: boolean;
  rent: number; // per game day
  tenantId: string | null;
  tenantName: string | null;
  cleared: boolean; // pre-existing city building demolished → buildable
  pumpPrice: number | null; // gas stations: owner's price per unit of fuel
  building: {
    template: string;
    kind: BuildingKind;
    floors: number;
    seed: number;
    name: string;
    doneAt: number; // epoch ms; in the future → under construction
    shape?: import("./custom.js").PlanRect[]; // custom outline
  } | null;
  source: {
    type: string; // SourceType
    doneAt: number; // epoch ms; in the future → setting up
    area: number; // drawn cells; yield scales with it
    extracted: number; // taken out of the ground so far (deposits only)
    reserve: number; // what the deposit held to begin with; 0 = never runs out
    shape?: import("./custom.js").PlanRect[];
  } | null;
}

// How a property is written anywhere it is referred to: the owner's name for
// it, always carrying the lot number so two "Back Field"s stay distinct.
export function lotName(id: number, name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `${trimmed} (Lot ${id})` : `Lot ${id}`;
}
