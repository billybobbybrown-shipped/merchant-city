// Component-based coin mining: racks are furniture with typed slots; empty
// racks mine nothing. All gating math is pure and tested here.

export interface RackSpec {
  proc: number; // processor slots
  psu: number;
  cool: number;
  ram: number;
}

export const RACK_SPECS: Record<string, RackSpec> = {
  mining_rack_s: { proc: 4, psu: 1, cool: 1, ram: 1 },
  mining_rack_m: { proc: 8, psu: 2, cool: 2, ram: 2 },
  mining_rack_l: { proc: 16, psu: 4, cool: 4, ram: 4 },
};

// hash units per processor tier — ASICs are endgame
export const PROCESSOR_HASH: Record<string, number> = {
  cpu_basic: 1,
  cpu_adv: 4,
  gpu: 12,
  asic: 40,
};

export const PSU_CAPACITY = 4; // processors powered per PSU
export const COOLING_CAPACITY: Record<string, number> = {
  cooling_fan: 2,
  cooling_liquid: 6,
};

// memory: a processor with no RAM behind it still runs, but at a crawl
export const RAM_CAPACITY: Record<string, number> = {
  ram_ddr4: 3,
  ram_ddr5: 6,
  ram_ecc: 10,
};
export const NO_RAM_PENALTY = 0.4; // hash multiplier for a processor with no memory

// ---- supply schedule (bitcoin-style) ----
// Hard cap. Mining works toward it: the daily reward halves each time a
// supply milestone is mined out (1/2 of max, then 3/4, 7/8, ...). Emission is
// driven by what's actually been mined, not by the clock — no miners, no new
// supply. At the cap, emission is zero forever.
export const COIN_MAX_SUPPLY = 500_000;
export const INITIAL_DAILY_EMISSION = 40; // era 0 reward per game day
// the chain predates the city: this much was mined "before" and circulates
// from day one (counted toward the cap) — so the coin trades immediately
// while fresh mining continues toward the max
export const COIN_GENESIS_CIRCULATION = 50_000;

// how many halvings have happened given total mined so far
export function halvingEra(mined: number): number {
  let era = 0;
  let slice = COIN_MAX_SUPPLY / 2;
  let cum = slice;
  while (mined >= cum && era < 40) {
    era++;
    slice /= 2;
    cum += slice;
  }
  return era;
}

// the supply level that triggers the next halving
export function nextHalvingSupply(mined: number): number | null {
  let slice = COIN_MAX_SUPPLY / 2;
  let cum = slice;
  for (let era = 0; era < 40; era++) {
    if (mined < cum) return cum;
    slice /= 2;
    cum += slice;
  }
  return null;
}

// today's total reward, capped so the last era can't overshoot the max
export function dailyEmission(mined: number): number {
  if (mined >= COIN_MAX_SUPPLY) return 0;
  const reward = INITIAL_DAILY_EMISSION / Math.pow(2, halvingEra(mined));
  return Math.min(Math.round(reward * 10_000) / 10_000, COIN_MAX_SUPPLY - mined);
}
export const WEAR_PER_DAY = 0.02; // cooled processor wear per game day
export const WEAR_UNCOOLED_PER_DAY = 0.06; // heat-throttled wear
export const UNCOOLED_THROTTLE = 0.5; // throttled processors hash at half rate

export interface InstalledComponent {
  slot: number;
  item: string;
  wear: number; // 0..1, dead at >= 1
}

export interface RackOutput {
  hash: number;
  procCount: number;
  powered: number; // processors actually running
  cooledCapacity: number;
  memoryCapacity: number; // processors the installed RAM can keep fed
  perProcessor: Array<{
    slot: number;
    item: string;
    active: boolean;
    throttled: boolean;
    starved: boolean; // running without memory behind it
  }>;
}

// Which processors run, which are throttled, and the rack's total hashpower.
// Power is allocated slot-order; cooling covers slot-order too. Dead
// components (wear >= 1) neither draw power nor hash.
export function rackOutput(spec: RackSpec, components: InstalledComponent[]): RackOutput {
  const procs = components
    .filter((c) => PROCESSOR_HASH[c.item] !== undefined && c.wear < 1)
    .sort((a, b) => a.slot - b.slot)
    .slice(0, spec.proc);
  const psus = components.filter((c) => c.item === "psu_unit" && c.wear < 1).length;
  const powerCap = Math.min(psus, spec.psu) * PSU_CAPACITY;
  const cooledCapacity = components
    .filter((c) => COOLING_CAPACITY[c.item] !== undefined && c.wear < 1)
    .slice(0, spec.cool)
    .reduce((a, c) => a + COOLING_CAPACITY[c.item], 0);
  const memoryCapacity = components
    .filter((c) => RAM_CAPACITY[c.item] !== undefined && c.wear < 1)
    .slice(0, spec.ram ?? 0)
    .reduce((a, c) => a + RAM_CAPACITY[c.item], 0);

  let hash = 0;
  const perProcessor = procs.map((p, i) => {
    const active = i < powerCap;
    const throttled = active && i >= cooledCapacity;
    const starved = active && i >= memoryCapacity;
    if (active)
      hash +=
        PROCESSOR_HASH[p.item] * (throttled ? UNCOOLED_THROTTLE : 1) * (starved ? NO_RAM_PENALTY : 1);
    return { slot: p.slot, item: p.item, active, throttled, starved };
  });
  return {
    hash: Math.round(hash * 100) / 100,
    procCount: procs.length,
    powered: Math.min(procs.length, powerCap),
    cooledCapacity,
    memoryCapacity,
    perProcessor,
  };
}

// daily wear for a processor given its running state
export function dailyWear(active: boolean, throttled: boolean): number {
  if (!active) return 0;
  return throttled ? WEAR_UNCOOLED_PER_DAY : WEAR_PER_DAY;
}

// pro-rata share of the day's emission
export function emissionShare(myHash: number, worldHash: number, emission: number): number {
  if (worldHash <= 0 || myHash <= 0) return 0;
  return (emission * myHash) / worldHash;
}

// A coin is a coin: nobody holds a fraction of one. Split the day's emission
// into whole coins by largest remainder, so the pool is fully paid out and the
// miners who contributed most hash get the odd coins left over.
export function allocateEmission(
  hashes: Array<[number, number]>,
  worldHash: number,
  emission: number
): Array<[number, number]> {
  const pool = Math.floor(emission);
  if (pool <= 0 || worldHash <= 0) return [];
  const exact = hashes.map(([eid, h]) => {
    const raw = emissionShare(h, worldHash, pool);
    return { eid, whole: Math.floor(raw), rem: raw - Math.floor(raw) };
  });
  let left = pool - exact.reduce((a, x) => a + x.whole, 0);
  for (const x of [...exact].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    x.whole += 1;
    left -= 1;
  }
  return exact.filter((x) => x.whole > 0).map((x) => [x.eid, x.whole] as [number, number]);
}

// ---- the coins ---------------------------------------------------------
// Each coin has its own supply schedule. Ducat is the original: scarce and
// slow. Obol is scarcer still and pays out in smaller pieces. Tiderium is
// abundant and cheap, which makes it the one people actually spend.
export interface CoinDef {
  code: string;
  name: string;
  symbol: string;
  maxSupply: number;
  genesis: number;
  baseReward: number; // coins a day at the start of the schedule
  // slice of citizen money this coin's float represents — the anchor its
  // fair value (and so its launch price) is computed from. Three different
  // weights + three different supplies = three genuinely different prices.
  monetaryShare: number;
}

export const COINS: CoinDef[] = [
  { code: "duc", name: "Ducat", symbol: "◈", maxSupply: 2_000_000, genesis: 200_000, baseReward: 160, monetaryShare: 0.45 },
  { code: "obl", name: "Obol", symbol: "◎", maxSupply: 5_000_000, genesis: 500_000, baseReward: 500, monetaryShare: 0.2 },
  { code: "tid", name: "Tiderium", symbol: "⬡", maxSupply: 10_000_000, genesis: 1_200_000, baseReward: 1_100, monetaryShare: 0.1 },
];

export const coinByCode = (code: string) => COINS.find((c) => c.code === code);

// Halvings at the same milestones for every coin, scaled to its own cap: the
// reward halves each time another half of what remains has been dug out.
export function coinEmission(def: CoinDef, mined: number): number {
  if (mined >= def.maxSupply) return 0;
  let reward = def.baseReward;
  let slice = def.maxSupply / 2;
  let passed = 0;
  while (mined >= passed + slice && reward > 0.0001) {
    passed += slice;
    slice /= 2;
    reward /= 2;
  }
  return Math.min(Math.floor(reward), def.maxSupply - mined);
}
