// Pure NPC economic decision functions — the sim calls these, tests cover
// them directly.

// reference prices for judging shop markups and liquidation pricing
export const BASE_PRICE: Record<string, number> = {
  gold_ore: 95,
  gold_ingot: 320,
  nails: 1.2, silicon_ingot: 38, silicon: 16, wiring: 24, transistor: 22, capacitor: 26, circuit_board: 155,
  bread: 6, corn: 3, carrots: 3, shirt: 25, phone: 260,
  wood: 5, stone: 5, iron_ore: 8, wheat: 3, cotton: 4, crude_oil: 10,
  planks: 8, bricks: 8, iron: 18, flour: 5, fabric: 7, fuel: 14,
  tobacco: 4, cured_tobacco: 9, beer: 8, whiskey: 22,
  cigarettes: 10, cigars: 24,
  gun_barrel: 34, gun_action: 58, gun_stock: 22,
  hunting_rifle: 160, pistol: 110, shotgun: 130, ammo: 4,
  cpu_basic: 290, cpu_adv: 1150, gpu: 1750, asic: 5200,
  ram_ddr4: 240, ram_ddr5: 520, ram_ecc: 880, psu_unit: 130, cooling_fan: 55, cooling_liquid: 175,
};

export interface OfferView {
  price: number;
  item: string;
  appeal: number; // shop appeal from furniture
  dist: number; // world units from the shopper
}

// higher = better. Cheap vs reference dominates; appeal helps; distance hurts.
// Anything over 4x reference is never worth it.
export function scoreOffer(o: OfferView): number {
  const rel = o.price / (BASE_PRICE[o.item] ?? 10);
  if (rel > 4) return -Infinity;
  return 2.0 * Math.min(1, o.appeal / 6) - 1.6 * rel - o.dist / 90;
}

// reservation wages: a real job must beat the city's $40 unemployment floor
export function reservationWage(tier: string): number {
  return tier === "saver" ? 48 : 42;
}

export function wageAcceptable(tier: string, wage: number): boolean {
  return wage >= reservationWage(tier);
}

// bankruptcy: everything goes on the exchange under reference so it clears
export function planLiquidation(
  inventory: Record<string, number>,
  discount = 0.8
): Array<{ item: string; qty: number; price: number }> {
  const orders: Array<{ item: string; qty: number; price: number }> = [];
  for (const [item, qty] of Object.entries(inventory)) {
    if (qty <= 0) continue;
    const base = BASE_PRICE[item] ?? 10;
    orders.push({ item, qty, price: Math.max(0.5, Math.round(base * discount * 100) / 100) });
  }
  return orders;
}

// entrepreneur shelf pricing: cost plus a healthy retail margin
export function retailPrice(unitCost: number): number {
  return Math.round(unitCost * 1.5 * 100) / 100;
}
