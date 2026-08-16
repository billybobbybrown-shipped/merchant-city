// Phase 2 goods economy: 6 raw materials, intermediates, finished products.
// Items are stackable units held by a player pocket or a lot's storage.

export type ItemKind = "raw" | "intermediate" | "finished";

export interface ItemDef {
  id: string;
  label: string;
  icon: string;
  kind: ItemKind;
}

export const ITEMS: ItemDef[] = [
  { id: "wood", label: "Wood", icon: "🪵", kind: "raw" },
  { id: "stone", label: "Stone", icon: "🪨", kind: "raw" },
  { id: "iron_ore", label: "Iron Ore", icon: "⛏️", kind: "raw" },
  { id: "gold_ore", label: "Gold Ore", icon: "", kind: "raw" },
  { id: "wheat", label: "Wheat", icon: "", kind: "raw" },
  { id: "corn", label: "Corn", icon: "", kind: "raw" },
  { id: "carrots", label: "Carrots", icon: "", kind: "raw" },
  { id: "cotton", label: "Cotton", icon: "☁️", kind: "raw" },
  { id: "crude_oil", label: "Crude Oil", icon: "🛢️", kind: "raw" },
  { id: "planks", label: "Planks", icon: "🪚", kind: "intermediate" },
  { id: "bricks", label: "Bricks", icon: "🧱", kind: "intermediate" },
  { id: "iron", label: "Iron Ingot", icon: "🔩", kind: "intermediate" },
  { id: "gold_ingot", label: "Gold Ingot", icon: "", kind: "intermediate" },
  { id: "nails", label: "Nails", icon: "", kind: "intermediate" },
  { id: "silicon_ingot", label: "Silicon Ingot", icon: "", kind: "intermediate" },
  { id: "silicon", label: "Silicon Wafer", icon: "", kind: "intermediate" },
  { id: "wiring", label: "Wiring", icon: "", kind: "intermediate" },
  { id: "transistor", label: "Transistor", icon: "", kind: "intermediate" },
  { id: "capacitor", label: "Capacitor", icon: "", kind: "intermediate" },
  { id: "circuit_board", label: "Circuit Board", icon: "", kind: "intermediate" },
  { id: "flour", label: "Flour", icon: "🫓", kind: "intermediate" },
  { id: "fabric", label: "Fabric", icon: "🧵", kind: "intermediate" },
  { id: "fuel", label: "Fuel", icon: "⛽", kind: "intermediate" },
  { id: "tobacco", label: "Tobacco Leaf", icon: "", kind: "raw" },
  // electronics chain — mining components are inventory items
  { id: "cpu_basic", label: "Basic CPU", icon: "", kind: "intermediate" },
  { id: "cpu_adv", label: "Advanced CPU", icon: "", kind: "intermediate" },
  { id: "gpu", label: "GPU", icon: "", kind: "intermediate" },
  { id: "asic", label: "ASIC Miner", icon: "", kind: "intermediate" },
  { id: "psu_unit", label: "PSU", icon: "", kind: "intermediate" },
  { id: "ram_ddr4", label: "DDR4 Module", icon: "", kind: "intermediate" },
  { id: "ram_ddr5", label: "DDR5 Module", icon: "", kind: "intermediate" },
  { id: "ram_ecc", label: "ECC Memory", icon: "", kind: "intermediate" },
  { id: "cooling_fan", label: "Cooling Fan", icon: "", kind: "intermediate" },
  { id: "cooling_liquid", label: "Liquid Cooling", icon: "", kind: "intermediate" },
  { id: "cured_tobacco", label: "Cured Tobacco", icon: "", kind: "intermediate" },
  { id: "gun_barrel", label: "Gun Barrel", icon: "", kind: "intermediate" },
  { id: "gun_action", label: "Firing Action", icon: "", kind: "intermediate" },
  { id: "gun_stock", label: "Gun Stock", icon: "", kind: "intermediate" },
  // finished goods are SPECIFIC products — the same fixtures you place in
  // buildings, plus consumer goods. No abstract categories.
  { id: "chair", label: "Chair", icon: "", kind: "finished" },
  { id: "desk", label: "Desk", icon: "", kind: "finished" },
  { id: "shelf", label: "Shop Shelf", icon: "", kind: "finished" },
  { id: "counter", label: "Counter", icon: "", kind: "finished" },
  { id: "rack_s", label: "Rack (S)", icon: "", kind: "finished" },
  { id: "rack_m", label: "Rack (M)", icon: "", kind: "finished" },
  { id: "rack_l", label: "Rack (L)", icon: "", kind: "finished" },
  { id: "plant", label: "Potted Plant", icon: "", kind: "finished" },
  { id: "rug", label: "Rug", icon: "", kind: "finished" },
  { id: "bread", label: "Bread", icon: "", kind: "finished" },
  { id: "shirt", label: "Shirt", icon: "", kind: "finished" },
  { id: "phone", label: "Phone", icon: "", kind: "finished" },
  // permitted goods — producing or retailing these needs the category permit
  { id: "beer", label: "Beer", icon: "", kind: "finished" },
  { id: "whiskey", label: "Whiskey", icon: "", kind: "finished" },
  { id: "cigarettes", label: "Cigarettes", icon: "", kind: "finished" },
  { id: "cigars", label: "Cigars", icon: "", kind: "finished" },
  { id: "hunting_rifle", label: "Hunting Rifle", icon: "", kind: "finished" },
  { id: "pistol", label: "Pistol", icon: "", kind: "finished" },
  { id: "shotgun", label: "Shotgun", icon: "", kind: "finished" },
  { id: "ammo", label: "Ammo", icon: "", kind: "finished" },
  // production machines — themselves items you craft, haul and place
  { id: "sawmill", label: "Sawmill", icon: "", kind: "finished" },
  { id: "smelter", label: "Smelter", icon: "", kind: "finished" },
  { id: "loom", label: "Loom", icon: "", kind: "finished" },
  { id: "refinery", label: "Oil Refinery", icon: "", kind: "finished" },
  { id: "oven", label: "Bakery", icon: "", kind: "finished" },
  { id: "carpentry_bench", label: "Carpentry Bench", icon: "", kind: "finished" },
  { id: "metal_shop", label: "Metal Shop", icon: "", kind: "finished" },
  { id: "assembly_line", label: "Assembly Line", icon: "", kind: "finished" },
  { id: "fabricator", label: "Fabricator", icon: "", kind: "finished" },
  { id: "electronics_bench", label: "Electronics Bench", icon: "", kind: "finished" },
  { id: "brewery", label: "Brewery", icon: "", kind: "finished" },
  { id: "curing_barn", label: "Curing Barn", icon: "", kind: "finished" },
  { id: "gun_mill", label: "Gun Mill", icon: "", kind: "finished" },
  { id: "delivery_space", label: "Delivery Space", icon: "", kind: "finished" },
  { id: "mining_rack_s", label: "Mining Rack (S)", icon: "", kind: "finished" },
  { id: "mining_rack_m", label: "Server Rack", icon: "", kind: "finished" },
  { id: "mining_rack_l", label: "Industrial Rack", icon: "", kind: "finished" },
];

// -------- permits --------
// One permit covers BOTH producing and selling its category. Growing raw
// tobacco is legal; processing and retail are what's licensed.

// Exchange sectors: what industry a good belongs to. The kind (raw /
// intermediate / finished) says how far along a chain something is; the sector
// says which chain — that's what a trader actually browses by. Anything not
// listed is equipment: fixtures, machines and racks you place in a building.
export type Sector =
  | "farm" | "timber" | "metals" | "energy" | "textiles" | "tech" | "arms" | "vice" | "equipment";

export const SECTORS: Array<{ id: Sector; label: string }> = [
  { id: "farm", label: "Farm & Food" },
  { id: "timber", label: "Timber" },
  { id: "metals", label: "Metals & Stone" },
  { id: "energy", label: "Energy" },
  { id: "textiles", label: "Textiles" },
  { id: "tech", label: "Electronics" },
  { id: "arms", label: "Firearms" },
  { id: "vice", label: "Liquor & Tobacco" },
  { id: "equipment", label: "Equipment" },
];

const ITEM_SECTOR: Record<string, Sector> = {
  wheat: "farm", corn: "farm", carrots: "farm", flour: "farm", bread: "farm",
  wood: "timber", planks: "timber",
  stone: "metals", bricks: "metals", iron_ore: "metals", iron: "metals",
  gold_ore: "metals", gold_ingot: "metals", nails: "metals",
  crude_oil: "energy", fuel: "energy",
  cotton: "textiles", fabric: "textiles", shirt: "textiles",
  silicon_ingot: "tech", silicon: "tech", wiring: "tech", transistor: "tech",
  capacitor: "tech", circuit_board: "tech", cpu_basic: "tech", cpu_adv: "tech",
  gpu: "tech", asic: "tech", psu_unit: "tech", ram_ddr4: "tech", ram_ddr5: "tech",
  ram_ecc: "tech", cooling_fan: "tech", cooling_liquid: "tech", phone: "tech",
  gun_barrel: "arms", gun_action: "arms", gun_stock: "arms",
  pistol: "arms", shotgun: "arms", hunting_rifle: "arms", ammo: "arms",
  tobacco: "vice", cured_tobacco: "vice", cigarettes: "vice", cigars: "vice",
  beer: "vice", whiskey: "vice",
};

export const sectorOf = (item: string): Sector => ITEM_SECTOR[item] ?? "equipment";

export type PermitCategory = "liquor" | "tobacco" | "firearms";
export const PERMIT_CATEGORIES: PermitCategory[] = ["liquor", "tobacco", "firearms"];

const PERMIT_ITEMS: Record<string, PermitCategory> = {
  beer: "liquor", whiskey: "liquor",
  cured_tobacco: "tobacco", cigarettes: "tobacco", cigars: "tobacco",
  gun_barrel: "firearms", gun_action: "firearms",
  hunting_rifle: "firearms", pistol: "firearms", shotgun: "firearms", ammo: "firearms",
};

export const permitFor = (item: string): PermitCategory | undefined => PERMIT_ITEMS[item];

// stations whose presence sizes an operation's permit fee
export const PERMIT_STATIONS: Record<PermitCategory, string[]> = {
  liquor: ["brewery"],
  tobacco: ["curing_barn"],
  firearms: ["gun_mill"],
};

export const PERMIT_BASE_FEE: Record<PermitCategory, number> = {
  liquor: 800,
  tobacco: 600,
  firearms: 1200,
};
export const PERMIT_FEE_PER_STATION = 250;
export const PERMIT_DAYS = 30; // game days per issue/renewal

export function permitFee(category: PermitCategory, stationCount: number): number {
  return PERMIT_BASE_FEE[category] + PERMIT_FEE_PER_STATION * Math.max(0, stationCount);
}

export const itemById = (id: string) => ITEMS.find((i) => i.id === id);

export interface Recipe {
  id: string;
  out: string;
  outQty: number;
  inputs: Record<string, number>;
  minutes: number; // labor per batch
  station: string; // the machine (furniture id) that must be in the building
  permit?: PermitCategory; // the lot's operator must hold this permit
}

export const RECIPES: Recipe[] = [
  // materials — each at its dedicated machine
  { id: "planks", out: "planks", outQty: 2, inputs: { wood: 2 }, minutes: 1, station: "sawmill" },
  { id: "bricks", out: "bricks", outQty: 2, inputs: { stone: 2 }, minutes: 1, station: "smelter" },
  { id: "iron", out: "iron", outQty: 1, inputs: { iron_ore: 2 }, minutes: 2, station: "smelter" },
  { id: "gold_ingot", out: "gold_ingot", outQty: 1, inputs: { gold_ore: 3 }, minutes: 5, station: "smelter" },
  { id: "nails", out: "nails", outQty: 24, inputs: { iron: 1 }, minutes: 2, station: "metal_shop" },
  // stone cooks down to a single pure ingot...
  { id: "silicon_ingot", out: "silicon_ingot", outQty: 1, inputs: { stone: 5 }, minutes: 4, station: "smelter" },
  { id: "flour", out: "flour", outQty: 2, inputs: { wheat: 2 }, minutes: 1, station: "oven" },
  { id: "fabric", out: "fabric", outQty: 2, inputs: { cotton: 2 }, minutes: 1, station: "loom" },
  { id: "fuel", out: "fuel", outQty: 2, inputs: { crude_oil: 2 }, minutes: 2, station: "refinery" },
  // furnishings — carpentry
  { id: "chair", out: "chair", outQty: 1, inputs: { planks: 2, fabric: 1, nails: 6 }, minutes: 3, station: "carpentry_bench" },
  { id: "desk", out: "desk", outQty: 1, inputs: { planks: 3, nails: 10 }, minutes: 3, station: "carpentry_bench" },
  { id: "shelf", out: "shelf", outQty: 1, inputs: { planks: 3, nails: 10 }, minutes: 3, station: "carpentry_bench" },
  { id: "counter", out: "counter", outQty: 1, inputs: { planks: 3, nails: 12, fabric: 1 }, minutes: 4, station: "carpentry_bench" },
  { id: "rack_s", out: "rack_s", outQty: 1, inputs: { planks: 1, iron: 1, nails: 8 }, minutes: 2, station: "carpentry_bench" },
  { id: "rack_m", out: "rack_m", outQty: 1, inputs: { planks: 2, iron: 2, nails: 14 }, minutes: 3, station: "carpentry_bench" },
  { id: "rack_l", out: "rack_l", outQty: 1, inputs: { planks: 3, iron: 3, nails: 20 }, minutes: 4, station: "carpentry_bench" },
  { id: "plant", out: "plant", outQty: 1, inputs: { stone: 1, wood: 1 }, minutes: 1, station: "carpentry_bench" },
  { id: "rug", out: "rug", outQty: 1, inputs: { fabric: 2 }, minutes: 2, station: "loom" },
  // consumer goods
  { id: "bread", out: "bread", outQty: 2, inputs: { flour: 2 }, minutes: 2, station: "oven" },
  { id: "shirt", out: "shirt", outQty: 1, inputs: { fabric: 2 }, minutes: 2, station: "loom" },
  { id: "phone", out: "phone", outQty: 1, inputs: { circuit_board: 1, wiring: 1, capacitor: 1 }, minutes: 4, station: "electronics_bench" },
  // permitted goods — station AND the operator's category permit required
  { id: "beer", out: "beer", outQty: 2, inputs: { wheat: 2 }, minutes: 2, station: "brewery", permit: "liquor" },
  { id: "whiskey", out: "whiskey", outQty: 1, inputs: { corn: 3 }, minutes: 4, station: "brewery", permit: "liquor" },
  { id: "cured_tobacco", out: "cured_tobacco", outQty: 1, inputs: { tobacco: 2 }, minutes: 2, station: "curing_barn", permit: "tobacco" },
  { id: "cigarettes", out: "cigarettes", outQty: 2, inputs: { cured_tobacco: 1 }, minutes: 2, station: "curing_barn", permit: "tobacco" },
  { id: "cigars", out: "cigars", outQty: 1, inputs: { cured_tobacco: 2 }, minutes: 3, station: "curing_barn", permit: "tobacco" },
  { id: "gun_barrel", out: "gun_barrel", outQty: 1, inputs: { iron: 1 }, minutes: 3, station: "metal_shop", permit: "firearms" },
  { id: "gun_action", out: "gun_action", outQty: 1, inputs: { iron: 2 }, minutes: 4, station: "metal_shop", permit: "firearms" },
  { id: "gun_stock", out: "gun_stock", outQty: 1, inputs: { planks: 2 }, minutes: 2, station: "sawmill" },
  { id: "pistol", out: "pistol", outQty: 1, inputs: { gun_barrel: 1, gun_action: 1 }, minutes: 4, station: "gun_mill", permit: "firearms" },
  { id: "shotgun", out: "shotgun", outQty: 1, inputs: { gun_barrel: 2, gun_stock: 1 }, minutes: 5, station: "gun_mill", permit: "firearms" },
  { id: "hunting_rifle", out: "hunting_rifle", outQty: 1, inputs: { gun_barrel: 1, gun_action: 1, gun_stock: 1 }, minutes: 6, station: "gun_mill", permit: "firearms" },
  { id: "ammo", out: "ammo", outQty: 6, inputs: { iron: 1 }, minutes: 2, station: "gun_mill", permit: "firearms" },
  // mining components — the electronics chain deepens: each tier consumes
  // the one below plus more parts
  { id: "wiring", out: "wiring", outQty: 2, inputs: { iron: 2 }, minutes: 2, station: "fabricator" },
  // ...and the ingot is sliced into wafers, several to a boule
  { id: "silicon", out: "silicon", outQty: 4, inputs: { silicon_ingot: 1 }, minutes: 3, station: "fabricator" },
  { id: "transistor", out: "transistor", outQty: 4, inputs: { silicon: 1, wiring: 1 }, minutes: 3, station: "fabricator" },
  { id: "capacitor", out: "capacitor", outQty: 2, inputs: { wiring: 1, iron: 1 }, minutes: 2, station: "fabricator" },
  { id: "circuit_board", out: "circuit_board", outQty: 1, inputs: { silicon: 1, wiring: 2, capacitor: 2 }, minutes: 4, station: "fabricator" },
  { id: "cpu_basic", out: "cpu_basic", outQty: 1, inputs: { circuit_board: 1, transistor: 4 }, minutes: 4, station: "electronics_bench" },
  { id: "cpu_adv", out: "cpu_adv", outQty: 1, inputs: { cpu_basic: 2, transistor: 8, gold_ingot: 1 }, minutes: 6, station: "electronics_bench" },
  { id: "gpu", out: "gpu", outQty: 1, inputs: { cpu_adv: 1, circuit_board: 2, cooling_fan: 1 }, minutes: 7, station: "electronics_bench" },
  { id: "asic", out: "asic", outQty: 1, inputs: { gpu: 2, circuit_board: 2, gold_ingot: 2 }, minutes: 10, station: "electronics_bench" },
  { id: "ram_ddr4", out: "ram_ddr4", outQty: 1, inputs: { circuit_board: 1, silicon: 1, wiring: 1 }, minutes: 3, station: "electronics_bench" },
  { id: "ram_ddr5", out: "ram_ddr5", outQty: 1, inputs: { circuit_board: 1, silicon: 2, transistor: 4 }, minutes: 5, station: "electronics_bench" },
  { id: "ram_ecc", out: "ram_ecc", outQty: 1, inputs: { circuit_board: 1, silicon: 3, transistor: 8, gold_ingot: 1 }, minutes: 7, station: "electronics_bench" },
  { id: "psu_unit", out: "psu_unit", outQty: 1, inputs: { wiring: 3, iron: 2 }, minutes: 3, station: "electronics_bench" },
  { id: "cooling_fan", out: "cooling_fan", outQty: 1, inputs: { iron: 1, wiring: 1 }, minutes: 2, station: "electronics_bench" },
  { id: "cooling_liquid", out: "cooling_liquid", outQty: 1, inputs: { cooling_fan: 1, wiring: 2, capacitor: 1 }, minutes: 4, station: "electronics_bench" },
  // machines — built at the carpentry bench
  { id: "assembly_line", out: "assembly_line", outQty: 1, inputs: { iron: 14, nails: 40, planks: 6 }, minutes: 10, station: "metal_shop" },
  { id: "metal_shop", out: "metal_shop", outQty: 1, inputs: { iron: 8, nails: 24 }, minutes: 5, station: "metal_shop" },
  { id: "sawmill", out: "sawmill", outQty: 1, inputs: { planks: 4, iron: 2, nails: 16 }, minutes: 5, station: "metal_shop" },
  { id: "smelter", out: "smelter", outQty: 1, inputs: { bricks: 4, iron: 4 }, minutes: 6, station: "metal_shop" },
  { id: "loom", out: "loom", outQty: 1, inputs: { planks: 4, iron: 1, nails: 16 }, minutes: 4, station: "carpentry_bench" },
  { id: "refinery", out: "refinery", outQty: 1, inputs: { iron: 6, bricks: 3 }, minutes: 6, station: "assembly_line" },
  { id: "oven", out: "oven", outQty: 1, inputs: { bricks: 5, iron: 2 }, minutes: 4, station: "metal_shop" },
  { id: "carpentry_bench", out: "carpentry_bench", outQty: 1, inputs: { planks: 4, iron: 1 }, minutes: 3, station: "carpentry_bench" },
  { id: "fabricator", out: "fabricator", outQty: 1, inputs: { iron: 6, circuit_board: 2, wiring: 6 }, minutes: 8, station: "assembly_line" },
  { id: "electronics_bench", out: "electronics_bench", outQty: 1, inputs: { iron: 4, planks: 2, circuit_board: 2 }, minutes: 5, station: "assembly_line" },
  { id: "brewery", out: "brewery", outQty: 1, inputs: { bricks: 4, iron: 3 }, minutes: 5, station: "assembly_line" },
  { id: "curing_barn", out: "curing_barn", outQty: 1, inputs: { planks: 5, iron: 1 }, minutes: 4, station: "carpentry_bench" },
  { id: "gun_mill", out: "gun_mill", outQty: 1, inputs: { iron: 7, nails: 12, wiring: 2 }, minutes: 6, station: "assembly_line" },
  { id: "delivery_space", out: "delivery_space", outQty: 1, inputs: { planks: 6, iron: 1 }, minutes: 3, station: "carpentry_bench" },
  { id: "mining_rack_s", out: "mining_rack_s", outQty: 1, inputs: { iron: 5, circuit_board: 1, wiring: 2 }, minutes: 4, station: "metal_shop" },
  { id: "mining_rack_m", out: "mining_rack_m", outQty: 1, inputs: { iron: 8, circuit_board: 2, wiring: 4, psu_unit: 1 }, minutes: 7, station: "metal_shop" },
  { id: "mining_rack_l", out: "mining_rack_l", outQty: 1, inputs: { iron: 12, circuit_board: 5, wiring: 6, psu_unit: 2 }, minutes: 12, station: "assembly_line" },
];

export const recipeById = (id: string) => RECIPES.find((r) => r.id === id);

// -------- resource production sites --------
// Set up on an owned vacant lot instead of a building: costs cash + setup
// time, then yields its item into the lot's site storage every game day.

export type SourceType =
  | "logging" | "quarry_stone" | "quarry_iron" | "quarry_gold"
  | "farm_wheat" | "farm_corn" | "farm_carrots" | "farm_tobacco"
  | "cotton_field" | "oil_well";

export interface SourceDef {
  type: SourceType;
  label: string;
  item: string;
  yieldPerCell: number; // per drawn cell per game day
  costPerCell: number; // cash per drawn cell to set up
  minutes: number; // setup time
}

export const SOURCE_TYPES: SourceDef[] = [
  { type: "logging", label: "Tree Farm", item: "wood", yieldPerCell: 0.5, costPerCell: 55, minutes: 4 },
  { type: "quarry_stone", label: "Stone Quarry", item: "stone", yieldPerCell: 0.42, costPerCell: 65, minutes: 5 },
  { type: "quarry_iron", label: "Iron Quarry", item: "iron_ore", yieldPerCell: 0.3, costPerCell: 105, minutes: 6 },
  { type: "quarry_gold", label: "Gold Quarry", item: "gold_ore", yieldPerCell: 0.08, costPerCell: 260, minutes: 8 },
  { type: "farm_wheat", label: "Wheat Farm", item: "wheat", yieldPerCell: 1.0, costPerCell: 45, minutes: 4 },
  { type: "farm_corn", label: "Corn Farm", item: "corn", yieldPerCell: 0.85, costPerCell: 45, minutes: 4 },
  { type: "farm_carrots", label: "Carrot Farm", item: "carrots", yieldPerCell: 0.85, costPerCell: 45, minutes: 4 },
  { type: "farm_tobacco", label: "Tobacco Farm", item: "tobacco", yieldPerCell: 0.75, costPerCell: 60, minutes: 4 },
  { type: "cotton_field", label: "Cotton Farm", item: "cotton", yieldPerCell: 0.75, costPerCell: 55, minutes: 4 },
  { type: "oil_well", label: "Oil Well", item: "crude_oil", yieldPerCell: 0.25, costPerCell: 170, minutes: 8 },
];

export function sourceYield(def: SourceDef, area: number): number {
  return Math.max(1, Math.round(area * def.yieldPerCell));
}

export function sourceSetupCost(def: SourceDef, area: number): number {
  return Math.round(area * def.costPerCell);
}

export const sourceByType = (t: string) => SOURCE_TYPES.find((s) => s.type === t);

// everything you grow: one Farm option in the designer, with the crop chosen
// underneath it
export const FARM_TYPES: string[] = [
  "farm_wheat",
  "farm_corn",
  "farm_carrots",
  "cotton_field",
  "farm_tobacco",
  "logging",
];

// the worker role that runs a site: farms hire farmers, everything else
// (mines, quarries, wells, logging) hires miners
export function sourceWorkerRole(sourceType: string): "farmer" | "miner" {
  return FARM_TYPES.includes(sourceType) ? "farmer" : "miner";
}

// Sites working a finite deposit: dig long enough and the ground gives out.
// Fields and tree farms regrow, so they are not on this list.
export const DEPLETING_TYPES: string[] = [
  "quarry_stone",
  "quarry_iron",
  "quarry_gold",
  "oil_well",
];

// Everything you dig out of a pit — one Quarry option in the designer, with the
// resource chosen underneath it, the same way farms choose a crop.
export const QUARRY_TYPES: string[] = ["quarry_stone", "quarry_iron", "quarry_gold"];

// How much a site holds in total, in units of what it produces. Scales with
// the area drawn, so a bigger claim is a longer-lived one.
export function sourceReserve(def: SourceDef, area: number): number {
  return Math.round(sourceYield(def, area) * 90);
}

// -------- carrying & storage --------

// The bag is slot-based: a fixed number of slots, each holding one stack of a
// single item. Bulky finished goods stack lower than materials.
export const POCKET_SLOTS = 20;

export function stackLimit(item: string): number {
  return itemById(item)?.kind === "finished" ? 10 : 50;
}

export function slotsUsed(inv: Record<string, number>): number {
  return Object.entries(inv).reduce(
    (a, [id, q]) => a + (q > 0 ? Math.ceil(q / stackLimit(id)) : 0),
    0
  );
}

// would the bag still fit if `qty` of `item` were added?
export function fitsPocket(inv: Record<string, number>, item: string, qty: number): boolean {
  const next = { ...inv, [item]: (inv[item] ?? 0) + qty };
  return slotsUsed(next) <= POCKET_SLOTS;
}


// -------- logistics --------
// A delivery space is the loading bay of a property: goods leave and arrive
// here. Haulers carry between the bays of different properties; managers walk
// goods between a bay and the storage racks inside the building.
export const DOCK_BUILD_COST = 150; // cash to lay a delivery space
export const DOCK_SIZE = 1; // the bay is a single pallet on the plot
export const DOCK_CAPACITY = 500; // units the delivery space itself can hold
export const HAULER_CAPACITY = 10; // units one hauler moves between bays each minute
export const MANAGER_CAPACITY = 20;  // units one manager moves bay <-> racks each minute
