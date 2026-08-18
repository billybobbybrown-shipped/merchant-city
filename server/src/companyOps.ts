import { BASE_PRICE, PermitCategory, retailPrice, coinByCode, recipeById } from "@mc/shared";
import { pool } from "./db.js";
import { EconomyError } from "./errors.js";
import { CITY_ENTITY, credit } from "./accounts.js";
import { LotStore } from "./lots.js";
import { GoodsStore } from "./goods.js";
import { InteriorStore } from "./interiors.js";
import { WorkforceStore } from "./workforce.js";
import { MarketStore } from "./market.js";
import { PermitsStore } from "./permits.js";
import { CompaniesStore } from "./companies.js";
import { StocksStore, stockKey } from "./stocks.js";
import type { CryptoStore } from "./crypto.js";

const WORLD_ID = 1;

interface Chain {
  machines: string[];
  inputs: Array<{ item: string; min: number; batch: number }>;
  ladder: Array<[string, number]>;
}

// one product a company makes and sells: its market name and its works
interface ProductLine {
  product: string;
  chain: Chain;
}

interface SeedDef {
  name: string;
  product: string | null; // null = ops arrive with a later phase (crypto)
  permit?: PermitCategory;
  tier: "small" | "mid" | "large";
  // payout policy: 0 = growth company, reinvests everything
  dividend: number;
  // The production arm: machines to own, raw inputs to buy on the exchange,
  // and the recipe ladder from raws to the product, in dependency order. A
  // company without one lives off the market alone.
  chain?: Chain;
  // the storefront this company wants: e.g. petroleum runs a gas station
  shopKind?: string;
  // the catalog a company MAY expand into — never forced: an established
  // company rolls the dice each ops day on launching one more line
  expansions?: ProductLine[];
}

// Share counts vary, but stay banded by company size, so a bigger company
// still generally carries a higher share price while no two listings look
// identical. Float (the tradable slice) varies per company too.
// which production site grows/digs which raw — the map a board consults
// when it decides to own the whole chain instead of buying on the exchange
const ITEM_SOURCE: Record<string, string> = {
  crude_oil: "oil_well",
  wheat: "farm_wheat",
  corn: "farm_corn",
  carrots: "farm_carrots",
  tobacco: "farm_tobacco",
  cotton: "cotton_field",
  stone: "quarry_stone",
  iron_ore: "quarry_iron",
  gold_ore: "quarry_gold",
};

// Vesper's whole electronics range runs through one works — every product is
// the same base chain carried a different distance. Gold-bearing parts add
// gold ore to the shopping list.
const V_MACHINES = ["rack_l", "smelter", "fabricator", "electronics_bench"];
const V_BASE_LADDER: Array<[string, number]> = [
  ["iron", 2], ["silicon_ingot", 2], ["wiring", 3], ["silicon", 2],
  ["transistor", 2], ["capacitor", 2], ["circuit_board", 2],
];
function vLine(product: string, tail: Array<[string, number]>, gold = false): ProductLine {
  const inputs = [
    { item: "stone", min: 10, batch: 24 },
    { item: "iron_ore", min: 8, batch: 20 },
  ];
  if (gold) inputs.push({ item: "gold_ore", min: 3, batch: 6 });
  return { product, chain: { machines: V_MACHINES, inputs, ladder: [...V_BASE_LADDER, ...tail] } };
}

const TIERS = {
  small: { capital: [1_500_000, 3_000_000], shares: [500_000, 750_000] },
  mid: { capital: [5_000_000, 12_000_000], shares: [1_000_000, 1_250_000] },
  large: { capital: [18_000_000, 34_000_000], shares: [1_500_000, 2_000_000] },
} as const;

const choose = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

const pick = (band: readonly [number, number]) =>
  band[0] + Math.floor(Math.random() * (band[1] - band[0]));

// The seeded public market: 10 NPC-run companies, listed from day one, with
// REAL operations (shops, staff, exchange sourcing) so earnings and P/E come
// from the same books as everyone else's. The two mining names idle until the
// crypto phase gives them their industry.
const SEEDS: SeedDef[] = [
  // dividend = TARGET ANNUAL YIELD on the share price (real-world numbers:
  // staples 3-5%, tobacco 6-7%, industrials ~1%);
  // established names pay real dividends; growth names pay nothing and are
  // valued on what they might become
  {
    name: "Atlas Provisions", product: "bread", tier: "large", dividend: 0.045,
    chain: { machines: ["rack_l", "oven"], inputs: [{ item: "wheat", min: 12, batch: 30 }], ladder: [["flour", 3], ["bread", 4]] },
    expansions: [{ product: "flour", chain: { machines: ["rack_l", "oven"], inputs: [{ item: "wheat", min: 8, batch: 20 }], ladder: [["flour", 4]] } }],
  },
  {
    name: "Consolidated Bakeries", product: "bread", tier: "mid", dividend: 0.025,
    chain: { machines: ["rack_l", "oven"], inputs: [{ item: "wheat", min: 10, batch: 24 }], ladder: [["flour", 3], ["bread", 3]] },
    expansions: [{ product: "flour", chain: { machines: ["rack_l", "oven"], inputs: [{ item: "wheat", min: 8, batch: 20 }], ladder: [["flour", 3]] } }],
  },
  {
    name: "Harbor Retail Group", product: "shirt", tier: "large", dividend: 0.035,
    chain: { machines: ["rack_l", "loom"], inputs: [{ item: "cotton", min: 12, batch: 30 }], ladder: [["fabric", 3], ["shirt", 3]] },
    expansions: [
      { product: "rug", chain: { machines: ["rack_l", "loom"], inputs: [{ item: "cotton", min: 8, batch: 20 }], ladder: [["fabric", 3], ["rug", 2]] } },
      { product: "fabric", chain: { machines: ["rack_l", "loom"], inputs: [{ item: "cotton", min: 8, batch: 20 }], ladder: [["fabric", 3]] } },
    ],
  },
  {
    name: "Meridian Textiles", product: "shirt", tier: "mid", dividend: 0.015,
    chain: { machines: ["rack_l", "loom"], inputs: [{ item: "cotton", min: 10, batch: 24 }], ladder: [["fabric", 3], ["shirt", 3]] },
    expansions: [
      { product: "rug", chain: { machines: ["rack_l", "loom"], inputs: [{ item: "cotton", min: 8, batch: 20 }], ladder: [["fabric", 2], ["rug", 2]] } },
      { product: "fabric", chain: { machines: ["rack_l", "loom"], inputs: [{ item: "cotton", min: 8, batch: 20 }], ladder: [["fabric", 3]] } },
    ],
  },
  {
    name: "Vesper Electronics", product: "phone", tier: "mid", dividend: 0,
    chain: {
      machines: ["rack_l", "smelter", "fabricator", "electronics_bench"],
      inputs: [{ item: "stone", min: 20, batch: 40 }, { item: "iron_ore", min: 16, batch: 30 }],
      ladder: [["iron", 3], ["silicon_ingot", 2], ["wiring", 4], ["silicon", 1], ["capacitor", 2], ["transistor", 1], ["circuit_board", 2], ["phone", 2]],
    },
    expansions: [
      vLine("ram_ddr4", [["ram_ddr4", 2]]),
      vLine("ram_ddr5", [["ram_ddr5", 1]]),
      vLine("ram_ecc", [["gold_ingot", 1], ["ram_ecc", 1]], true),
      vLine("cpu_basic", [["cpu_basic", 2]]),
      vLine("cpu_adv", [["cpu_basic", 2], ["gold_ingot", 1], ["cpu_adv", 1]], true),
      vLine("gpu", [["cpu_basic", 2], ["gold_ingot", 1], ["cpu_adv", 1], ["cooling_fan", 1], ["gpu", 1]], true),
      vLine("asic", [["cpu_basic", 2], ["gold_ingot", 2], ["cpu_adv", 1], ["cooling_fan", 1], ["gpu", 2], ["asic", 1]], true),
      vLine("psu_unit", [["psu_unit", 2]]),
      vLine("cooling_fan", [["cooling_fan", 2]]),
      vLine("cooling_liquid", [["cooling_fan", 2], ["cooling_liquid", 1]]),
    ],
  },
  {
    name: "Crestfield Spirits", product: "beer", permit: "liquor", tier: "small", dividend: 0.035,
    chain: { machines: ["rack_l", "brewery"], inputs: [{ item: "wheat", min: 10, batch: 24 }], ladder: [["beer", 3]] },
    expansions: [{ product: "whiskey", chain: { machines: ["rack_l", "brewery"], inputs: [{ item: "corn", min: 10, batch: 24 }], ladder: [["whiskey", 2]] } }],
  },
  {
    name: "Bluebird Tobacco Co", product: "cigarettes", permit: "tobacco", tier: "small", dividend: 0.065,
    chain: { machines: ["rack_l", "curing_barn"], inputs: [{ item: "tobacco", min: 10, batch: 24 }], ladder: [["cured_tobacco", 2], ["cigarettes", 3]] },
    expansions: [{ product: "cigars", chain: { machines: ["rack_l", "curing_barn"], inputs: [{ item: "tobacco", min: 8, batch: 20 }], ladder: [["cured_tobacco", 2], ["cigars", 2]] } }],
  },
  {
    name: "Ironline Provisions", product: "carrots", tier: "small", dividend: 0,
    // a pure retailer: no works, but goods still need somewhere to sit
    chain: { machines: ["rack_l"], inputs: [], ladder: [] },
    expansions: [
      { product: "corn", chain: { machines: ["rack_l"], inputs: [], ladder: [] } },
      { product: "bread", chain: { machines: ["rack_l"], inputs: [], ladder: [] } },
      { product: "flour", chain: { machines: ["rack_l"], inputs: [], ladder: [] } },
    ],
  },
  {
    name: "Crown Petroleum", product: "fuel", tier: "mid", dividend: 0.03,
    shopKind: "gas_station",
    chain: { machines: ["rack_l", "refinery"], inputs: [{ item: "crude_oil", min: 10, batch: 24 }], ladder: [["fuel", 3]] },
  },
  { name: "Nordvik Mining Systems", product: null, tier: "mid", dividend: 0.01 },
  { name: "HashWorks Mining", product: null, tier: "large", dividend: 0 },
];


export class CompanyOps {
  crypto?: CryptoStore; // wired at boot once the coin exists
  stats?: { momentum(): Promise<number> }; // published stats feed speculator behavior

  constructor(
    private lots: LotStore,
    private goods: GoodsStore,
    private interiors: InteriorStore,
    private workforce: WorkforceStore,
    private market: MarketStore,
    private permits: PermitsStore,
    private companies: CompaniesStore,
    private stocks: StocksStore
  ) {}

  // wired at boot — farm docks and haul routes run through logistics
  logistics?: import("./logistics.js").LogisticsStore;

  async seed(): Promise<void> {
    // idempotent per company: a name added to SEEDS later (Crown Petroleum)
    // gets founded into a world that already has the others
    const have = await pool.query("select registered_name from companies where npc_operated = true");
    const haveNames = new Set(have.rows.map((r) => r.registered_name as string));
    if (SEEDS.every((sd) => haveNames.has(sd.name))) return;
    const savers = await pool.query(
      "select entity_id from npcs where wealth_tier in ('saver','entrepreneur') order by random() limit 60"
    );
    if (savers.rowCount! < 20) {
      console.warn("[companyOps] not enough savers to seed the market yet");
      return;
    }
    const saverIds = savers.rows.map((r) => Number(r.entity_id));
    let saverIdx = 0;

    for (const seed of SEEDS) {
      if (haveNames.has(seed.name)) continue;
      const founder = saverIds[saverIdx++ % saverIds.length];
      const client = await pool.connect();
      try {
        await client.query("begin");
        const ent = await client.query(
          "insert into entities (kind, name, parent_entity_id) values ('company', $1, $2) returning id",
          [seed.name, founder]
        );
        const companyEid = Number(ent.rows[0].id);
        await client.query("insert into accounts (entity_id, currency, balance) values ($1, 'clean', 0)", [companyEid]);
        await client.query(
          "insert into companies (entity_id, founder_entity, registered_name, npc_operated) values ($1,$2,$3,true)",
          [companyEid, founder, seed.name]
        );
        // companies launch at different sizes; the valuation follows the
        // capital, and the share price follows the valuation — cap and price
        // always make sense together
        const profile = TIERS[seed.tier];
        const capital = pick(profile.capital);
        await credit(client, companyEid, capital, "transfer", "genesis capital");
        // list AT fair value — the mark engine values a young company at its
        // assets, so any listing premium is just a scripted crash back to
        // book. A whisker of variance keeps IPO prices from looking minted.
        const multiple = 0.98 + Math.random() * 0.1;
        const valuation = capital * multiple;
        const shares = choose(profile.shares);
        const ipoPrice = Math.max(0.25, Math.round((valuation / shares) * 100) / 100);
        // insiders keep 40-65%; the rest is float, part held by citizens
        const founderShares = Math.round(shares * (0.4 + Math.random() * 0.25));
        const spread = Math.round((shares - founderShares) * (0.3 + Math.random() * 0.35));
        await client.query(
          `insert into stocks (company_entity, shares_outstanding, float_shares, ipo_price, dividend_ratio)
           values ($1,$2,$3,$4,$5)`,
          [companyEid, shares, shares - founderShares, ipoPrice, seed.dividend]
        );
        // founder majority + a real citizen shareholder base
        await client.query(
          "insert into share_holdings (holder_entity, company_entity, shares) values ($1,$2,$3)",
          [founder, companyEid, founderShares]
        );
        const holders = 10;
        for (let i = 0; i < holders; i++) {
          const h = saverIds[saverIdx++ % saverIds.length];
          await client.query(
            `insert into share_holdings (holder_entity, company_entity, shares) values ($1,$2,$3)
             on conflict (holder_entity, company_entity) do update set shares = share_holdings.shares + $3`,
            [h, companyEid, Math.floor(spread / holders)]
          );
        }
        // the rest of the float belongs to the company — rest it on the book
        const companyFloat = shares - founderShares - Math.floor(spread / holders) * holders;
        await client.query(
          "insert into share_holdings (holder_entity, company_entity, shares) values ($1,$2,$3)",
          [companyEid, companyEid, companyFloat]
        );
        await client.query(
          `insert into orders (world_id, owner_entity, asset_type, side, item, qty, price)
           values ($1,$2,'stock','sell',$3,$4,$5)`,
          [WORLD_ID, companyEid, stockKey(companyEid), companyFloat, ipoPrice]
        );
        await client.query(
          "update share_holdings set shares = shares - $3 where holder_entity = $1 and company_entity = $2",
          [companyEid, companyEid, companyFloat]
        );
        await client.query("commit");
        if (seed.permit) {
          await this.permits.issue((t) => t === companyEid, companyEid, seed.permit).catch((e) =>
            console.warn("[companyOps] permit for", seed.name, e.message)
          );
        }
        await this.stocks.refreshControl(companyEid);
        console.log(`[companyOps] listed ${seed.name} (entity ${companyEid})`);
      } catch (err) {
        await client.query("rollback");
        console.error("[companyOps] seeding", seed.name, err);
      } finally {
        client.release();
      }
    }
    await this.companies.load();
  }

  // The city has NO seat on the commodity exchange: no depot, no supply of
  // last resort. Companies and players find every price between themselves.
  // This sweep retires any city goods orders still resting from older worlds
  // (through cancel, so escrow unwinds cleanly) — it is a no-op once clean.
  async retireCityDepot(): Promise<void> {
    const rows = await pool.query(
      "select id from orders where world_id = $1 and owner_entity = $2 and asset_type = 'item'",
      [WORLD_ID, CITY_ENTITY]
    );
    for (const row of rows.rows) await this.market.cancel(CITY_ENTITY, Number(row.id)).catch(() => {});
  }

  // one operating pass per game day: run every NPC company like a well-funded
  // entrepreneur — real lots, real staff, real exchange demand, real prices
  async runDay(): Promise<void> {
    await this.retireCityDepot().catch((e) => console.error("[companyOps] depot retire", e));
    const rows = await pool.query(
      `select c.entity_id, c.registered_name from companies c where c.npc_operated = true`
    );
    for (const row of rows.rows) {
      const companyEid = Number(row.entity_id);
      const seed = SEEDS.find((s) => s.name === row.registered_name);
      try {
        if (seed?.product) await this.operate(companyEid, seed);
        else if (row.registered_name === "Nordvik Mining Systems") await this.operateManufacturer(companyEid);
        else if (row.registered_name === "HashWorks Mining") await this.operateMiner(companyEid);
      } catch (err) {
        if (!(err instanceof EconomyError)) console.error("[companyOps]", row.registered_name, err);
      }
    }
  }

  // Nordvik: buys iron, crafts mining components at a real electronics bench,
  // sells them on the exchange — the supply side of the mining industry
  private async operateManufacturer(companyEid: number): Promise<void> {
    const bizLot = await this.ensureBizLot(companyEid, 0.4);
    if (bizLot === null) return;
    // benches multiply when the workshop keeps running at capacity — the
    // component supply grows with the mining industry it feeds
    const benchFurn = await this.interiors.items(bizLot);
    let benches = Math.max(1, benchFurn.filter((f) => f.item === "electronics_bench").length);
    const queuedNow = Number(
      (await pool.query("select count(*) as n from crafts where lot_id = $1", [bizLot])).rows[0].n
    );
    if (queuedNow >= benches * 8 && benches < 4)
      benches = await this.ensureFurnitureCount(companyEid, bizLot, "electronics_bench", benches + 1);
    await this.ensureFurnitureCount(companyEid, bizLot, "electronics_bench", benches);
    await this.ensureFurniture(companyEid, bizLot, "fabricator");
    await this.ensureFurniture(companyEid, bizLot, "smelter");
    if (benches > 1)
      await this.workforce.ensureStaffed(companyEid, bizLot, "crafter", 48, benches - 1).catch(() => {});
    await this.goods.resolveCrafts(bizLot);

    const balance = await this.balanceOf(companyEid);
    let store = await this.goods.inventory("lot", String(bizLot));
    // genesis materials, once: without them the mining industry deadlocks
    // (no components to buy -> no miners -> no coin market)
    if ((store.iron ?? 0) === 0) {
      const crafted = await pool.query(
        "select count(*) as n from crafts where world_id = $1 and lot_id = $2",
        [WORLD_ID, bizLot]
      );
      if (Number(crafted.rows[0].n) === 0) {
        await pool.query(
          `insert into inventories (world_id, holder_type, holder_id, item, qty)
           values ($1,'lot',$2,'iron',60), ($1,'lot',$2,'stone',40)
           on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + excluded.qty`,
          [WORLD_ID, String(bizLot)]
        );
        store = await this.goods.inventory("lot", String(bizLot));
        console.log("[companyOps] Nordvik received genesis materials");
      }
    }
    for (const raw of ["iron", "stone", "gold_ore"] as const)
      if ((store[raw] ?? 0) < 12 * benches && balance > 400 && !(await this.hasOpenBuy(companyEid, raw)))
        await this.market
          .place(companyEid, "buy", raw, 24 * benches, await this.bidPrice(raw, (store[raw] ?? 0) === 0, null))
          .catch(() => {});
    // haul exchange fills from the pocket into the workshop
    const pocket = await this.goods.inventory("entity", String(companyEid));
    for (const raw of ["iron", "stone"])
      if ((pocket[raw] ?? 0) > 0)
        await this.goods.transfer(companyEid, bizLot, raw, pocket[raw]!, true).catch(() => {});
    // keep the product ladder running, but don't pile work on a bench that's
    // already busy — a queued craft is capital sitting idle
    const queued = await pool.query("select count(*) as n from crafts where lot_id = $1", [bizLot]);
    // a second bench is Nordvik CHOOSING to broaden the catalog: memory
    // modules join the component list once the works has grown into them
    const catalog: Array<readonly [string, number]> = [];
    if (benches >= 2) catalog.push(["ram_ddr4", 2], ["ram_ddr5", 1]);
    if (benches >= 3) catalog.push(["gpu", 1]);
    if (Number(queued.rows[0].n) < 8 * benches)
      // in dependency order: raw -> fabricated parts -> finished components. A
      // step with nothing to work on just throws and the ladder moves on.
      for (const [recipe, batch] of ([
        ["silicon_ingot", 2],
        ["wiring", 4],
        ["silicon", 1],
        ["capacitor", 2],
        ["transistor", 2],
        ["circuit_board", 2],
        ["cpu_basic", 2],
        ["psu_unit", 2],
        ["cooling_fan", 2],
        ["cpu_adv", 1],
      ] as const).concat(catalog as never))
        await this.goods.craft(companyEid, bizLot, recipe, batch * benches).catch(() => {});
    // list finished components: workshop -> pocket -> exchange ask
    const finished = await this.goods.inventory("lot", String(bizLot));
    for (const comp of ["cpu_basic", "cpu_adv", "psu_unit", "cooling_fan", "cooling_liquid", "ram_ddr4", "ram_ddr5", "gpu"]) {
      const n = finished[comp] ?? 0;
      if (n <= 0) continue;
      await this.goods.transfer(companyEid, bizLot, comp, n, false).catch(() => {});
      const ask = Math.round((await this.market.refPrice(comp)) * 100) / 100;
      await this.market.place(companyEid, "sell", comp, n, ask).catch(() => {});
    }
  }

  // HashWorks: buys components on the exchange, runs racks, sells mined coin
  private async operateMiner(companyEid: number): Promise<void> {
    if (!this.crypto) return;
    const bizLot = await this.ensureBizLot(companyEid, 0.4);
    if (bizLot === null) return;
    const rackFurn = await this.interiors.items(bizLot);
    let rackIds = rackFurn.filter((f) => f.item === "mining_rack_m").map((f) => f.id);
    if (!rackIds.length) {
      const id = await this.ensureFurniture(companyEid, bizLot, "mining_rack_m");
      if (id === null) return;
      rackIds = [id];
    }

    const balance = await this.balanceOf(companyEid);
    let allFull = true;
    for (const rackId of rackIds) {
      const rack = await this.crypto.components(rackId);
      const have = (kind: (i: string) => boolean) => rack.components.filter((c) => kind(c.item) && c.wear < 1).length;
      const wants: Array<[string, number]> = [
        ["psu_unit", 2 - have((i) => i === "psu_unit")],
        ["cooling_fan", 2 - have((i) => i.startsWith("cooling"))],
        ["cpu_basic", 8 - have((i) => ["cpu_basic", "cpu_adv", "gpu", "asic"].includes(i))],
      ];
      for (const [item, need] of wants) {
        if (need <= 0) continue;
        allFull = false;
        // install whatever's already on hand, then bid for the rest
        const pocket = await this.goods.inventory("entity", String(companyEid));
        const store = await this.goods.inventory("lot", String(bizLot));
        let onHand = (pocket[item] ?? 0) + (store[item] ?? 0);
        for (let i = 0; i < Math.min(need, onHand); i++)
          await this.crypto.install(companyEid, rackId, item).catch(() => {});
        if (onHand < need && balance > 200 && !(await this.hasOpenBuy(companyEid, item))) {
          // a rig with an empty slot is a hungry buyer — join the market rate
          const limit = await this.bidPrice(item, true, null);
          await this.market.place(companyEid, "buy", item, need - onHand, limit).catch(() => {});
        }
      }
      // scrap dead components so slots free up
      for (const c of rack.components) if (c.wear >= 1) await this.crypto.remove(companyEid, rackId, c.slot).catch(() => {});
    }
    // every rig fully built and running, cash on hand — the farm expands.
    // Next ops day the new rack starts bidding for its own components.
    if (allFull && rackIds.length < 4 && balance > 5_000)
      await this.ensureFurnitureCount(companyEid, bizLot, "mining_rack_m", rackIds.length + 1);
    // Treasury policy: a miner runs a business, not a faucet. It sells enough
    // to cover operations, adds a steady slice of production on top, and takes
    // extra profit when the price runs hot — but it never dumps the stack.
    const coins = Math.floor(await this.crypto.balance(companyEid));
    if (coins >= 5) {
      const stats = await this.crypto.networkStats();
      const px = stats.lastPrice ?? (await this.coinFairRef("duc"));
      const avg = await this.avgCoinPrice(60);
      const cash = await this.balanceOf(companyEid);
      const CASH_TARGET = 4_000; // runway for components, wages, rent

      // A miner sells when it has a REASON to — never on a schedule. Some
      // days it sells nothing at all.
      let sell = 0;

      // Reason one: the bills. Raise exactly what the shortfall needs.
      if (cash < CASH_TARGET) sell = Math.ceil((CASH_TARGET - cash) / px);

      // Reason two: it likes the price. How keen it is depends on how far
      // above its own recent average the market is trading — and it doesn't
      // act every time it's tempted.
      if (avg !== null && px > avg) {
        const keen = px / avg - 1;
        if (Math.random() < 0.2 + keen * 5)
          sell += Math.floor(coins * Math.random() * Math.min(0.3, keen * 2.5));
      } else if (Math.random() < 0.1) {
        // Reason three: occasionally it just wants cash on hand for expansion
        sell += 1 + Math.floor(Math.random() * 20);
      }

      sell = Math.max(0, Math.min(coins, sell));
      if (sell >= 1)
        await this.crypto
          .trade(companyEid, "sell", sell, Math.max(0.001, Math.round(px * 0.99 * 10000) / 10000))
          .catch(() => {});
    }
  }

  // this entity's share of the world's hashpower, in hash units
  private async myHash(eid: number): Promise<number> {
    if (!this.crypto) return 0;
    const all = await this.crypto.worldHashpower();
    return all.get(eid) ?? 0;
  }

  // pre-trade reference: what the float is worth against citizen money —
  // the SAME anchor the market maker marks from, so the first coin trades
  // start at fair value instead of a made-up $2
  private async coinFairRef(code: string): Promise<number> {
    const r = await pool.query(
      `select (select coalesce(sum(a.balance), 0) from accounts a
                 join npcs n on n.entity_id = a.entity_id where a.currency = 'clean') as cash,
              (select coalesce(sum(balance), 0) from accounts where currency = $1) as supply`,
      [code]
    );
    const supply = Number(r.rows[0].supply);
    const share = coinByCode(code)?.monetaryShare ?? 0.2;
    return supply > 0 ? Math.max(0.01, (Number(r.rows[0].cash) * share) / supply) : 1;
  }

  private async avgCoinPrice(minutes: number): Promise<number | null> {
    const r = await pool.query(
      `select sum(price * qty) / nullif(sum(qty), 0) as v from trades
        where world_id = $1 and asset_type = 'coin' and ts > now() - make_interval(mins => $2)`,
      [WORLD_ID, minutes]
    );
    return r.rows[0]?.v != null ? Number(r.rows[0].v) : null;
  }

  // One line's books over a review window: what its product earned at the
  // till, minus what its inputs cost on the exchange, minus its share of the
  // shop payroll. Real ledger rows only.
  private async linePnl(
    companyEid: number,
    bizLot: number,
    line: ProductLine,
    nLines: number,
    sinceSec: number
  ): Promise<number> {
    const rev = await pool.query(
      `select coalesce(sum(amount), 0) as v from ledger
        where category = 'retail_sale' and reason = $1 and ts > now() - make_interval(secs => $2)`,
      [`${line.product} @ lot ${bizLot}`, sinceSec]
    );
    let inputCost = 0;
    for (const inp of line.chain.inputs) {
      const r = await pool.query(
        `select coalesce(sum(l.amount), 0) as v from ledger l
           join accounts a on a.id = l.from_account
          where a.entity_id = $1 and l.category = 'trade'
            and l.reason like $2 and l.ts > now() - make_interval(secs => $3)`,
        [companyEid, `trade % ${inp.item} @ %`, sinceSec]
      );
      inputCost += Number(r.rows[0].v);
    }
    const wages = await pool.query(
      `select coalesce(sum(l.amount), 0) as v from ledger l
         join accounts a on a.id = l.from_account
        where a.entity_id = $1 and l.category = 'wage' and l.reason like $2
          and l.ts > now() - make_interval(secs => $3)`,
      [companyEid, `% lot ${bizLot}%`, sinceSec]
    );
    return Number(rev.rows[0].v) - inputCost - Number(wages.rows[0].v) / Math.max(1, nLines);
  }

  // What a line looks like ON PAPER at today's market prices: a day's output
  // at the going rate minus a day's inputs at the going rate. This is the
  // number a board reads before entering (or re-entering) a market.
  private async lineGross(line: ProductLine): Promise<number> {
    const outRef = await this.market.refPrice(line.product);
    if (!line.chain.ladder.length) return 20; // pure retail: thin but real
    const [finalRecipe, finalBatch] = line.chain.ladder[line.chain.ladder.length - 1];
    const rec = recipeById(finalRecipe);
    const perDayOut = (rec?.outQty ?? 1) * finalBatch;
    let inCost = 0;
    for (const inp of line.chain.inputs) inCost += inp.batch * (await this.market.refPrice(inp.item));
    return perDayOut * outRef - inCost;
  }

  // VERTICAL INTEGRATION, chosen not scripted: a company whose input bids
  // keep starving can decide to own that link of the chain — buy a vacant
  // lot, set up the farm or quarry, put a delivery pad on it, run a haul
  // route to the shop, and hire the field crew. In a world where players
  // (or rival companies) fill the bids cheaply, boards mostly never bother.
  private async ensureSourceFor(companyEid: number, seed: SeedDef, item: string, bizLot: number): Promise<void> {
    const srcType = ITEM_SOURCE[item];
    if (!srcType || !this.logistics) return;
    const wage = await this.workforce.marketWage();

    // already integrated? keep it staffed and routed — and if the fields
    // don't yet work the whole plot, plough the rest (expansion pays only
    // for the newly covered ground)
    for (const st of this.lots.all()) {
      if (st.ownerType === "city" || st.ownerId !== String(companyEid)) continue;
      if (st.source?.type !== srcType) continue;
      const lotDef = this.lots.lotDef(st.id);
      if (lotDef) {
        const mainH = Math.max(2, lotDef.h - 1);
        const wantArea = lotDef.w * mainH + (lotDef.w > 3 ? lotDef.w - 3 : 0);
        if ((st.source.area ?? 0) < wantArea)
          await this.lots
            .setupSource(companyEid, st.id, srcType, [
              { x: 0, y: 0, w: lotDef.w, h: mainH },
              ...(lotDef.w > 3 ? [{ x: 3, y: mainH, w: lotDef.w - 3, h: 1 }] : []),
            ])
            .catch(() => {});
      }
      const role = st.source.type.startsWith("quarry") || st.source.type === "oil_well" ? "miner" : "farmer";
      await this.workforce.ensureStaffed(companyEid, st.id, role, wage + 2, 2).catch(() => {});
      await this.workforce.ensureStaffed(companyEid, null, "hauler", wage + 6).catch(() => {});
      return;
    }

    const balance = await this.balanceOf(companyEid);
    if (balance < 15_000 || Math.random() > 0.15) return; // the choice, not a script

    for (const st of this.lots.all()) {
      if (st.ownerType !== "city" || !st.forSale) continue;
      const lot = this.lots.lotDef(st.id);
      if (!lot) continue;
      const area = lot.w * lot.h;
      if (area < 24 || area > 140 || st.price > balance * 0.15) continue;
      try {
        await this.lots.buy(companyEid, st.id);
        // the field works ALL the land except a three-cell pocket in the
        // bottom-left where the loading pad sits
        await this.lots.setupSource(companyEid, st.id, srcType, [
          { x: 0, y: 0, w: lot.w, h: Math.max(2, lot.h - 1) },
          ...(lot.w > 3 ? [{ x: 3, y: Math.max(2, lot.h - 1), w: lot.w - 3, h: 1 }] : []),
        ]);
        await this.logistics.build(companyEid, st.id, 1, lot.h - 1).catch(() => {});
        const biz = this.lots.lotDef(bizLot);
        const dockCell = biz
          ? [
              { x: 0, y: biz.h - 1 },
              { x: biz.w - 1, y: 0 },
              { x: biz.w - 1, y: biz.h - 1 },
              { x: 0, y: 0 },
            ][biz.facing] ?? { x: 0, y: 0 }
          : { x: 0, y: 0 };
        await this.logistics.build(companyEid, bizLot, dockCell.x, dockCell.y).catch(() => {});
        await this.logistics.addLine(companyEid, st.id, "out", item, 40, bizLot).catch(() => {});
        const role = srcType.startsWith("quarry") || srcType === "oil_well" ? "miner" : "farmer";
        await this.workforce.ensureStaffed(companyEid, st.id, role, wage + 2, 2).catch(() => {});
        await this.workforce.ensureStaffed(companyEid, null, "hauler", wage + 6).catch(() => {});
        const { registry } = await import("./registry.js");
        registry.broadcast("lot", this.lots.all().find((l) => l.id === st.id));
        console.log(`[companyOps] ${seed.name} integrates upstream: ${srcType} on lot ${st.id}`);
        return;
      } catch {
        /* lot didn't suit — try the next one */
      }
    }
  }

  // How a company prices a bid: join the going rate, pay a touch over when
  // the racks are empty, and CLIMB a few percent per re-quote while nobody
  // sells — an open auction against player supply. The climb stops at 3x the
  // going rate: past that the line just waits for sellers. No fixed
  // multipliers over any catalog number.
  private async bidPrice(item: string, starving: boolean, existing: number | null): Promise<number> {
    const ref = await this.market.refPrice(item);
    let px = ref * (starving ? 1.1 : 1.02);
    if (starving && existing !== null) px = Math.max(px, existing * 1.06);
    px = Math.min(px, ref * 3);
    return Math.round(px * 100) / 100;
  }

  // shared: make sure the company owns a usable commercial lot
  private async ensureBizLot(companyEid: number, spendPct: number): Promise<number | null> {
    for (const st of this.lots.all())
      if (st.ownerType !== "city" && st.ownerId === String(companyEid)) return st.id;
    const balance = await this.balanceOf(companyEid);
    for (const st of this.lots.all()) {
      if (st.ownerType !== "city" || !st.forSale) continue;
      if (st.price > balance * spendPct || st.price < 200) continue;
      const b = this.lots.buildingDef(st.id);
      if (!b || b.kind === "house" || b.kind === "apartment") continue;
      const { lot } = await this.lots.buy(companyEid, st.id);
      const { registry } = await import("./registry.js");
      registry.broadcast("lot", lot);
      return st.id;
    }
    return null;
  }

  // shared: place a furniture item if the building doesn't have one; returns its id
  private async ensureFurniture(companyEid: number, lotId: number, item: string): Promise<number | null> {
    const furn = await this.interiors.items(lotId);
    const existing = furn.find((f) => f.item === item);
    if (existing) return existing.id;
    for (let y = 1; y < 8; y++)
      for (let x = 1; x < 8; x++) {
        try {
          const r = await this.interiors.place(companyEid, lotId, item, x, y, 0);
          return r.placed.id;
        } catch {
          /* try next cell */
        }
      }
    return null;
  }

  // place item until the building holds `count` of them; returns how many stand
  private async ensureFurnitureCount(
    companyEid: number,
    lotId: number,
    item: string,
    count: number
  ): Promise<number> {
    const furn = await this.interiors.items(lotId);
    let have = furn.filter((f) => f.item === item).length;
    outer: while (have < count) {
      for (let y = 1; y < 9; y++)
        for (let x = 1; x < 9; x++) {
          try {
            await this.interiors.place(companyEid, lotId, item, x, y, 0);
            have++;
            continue outer;
          } catch {
            /* occupied — next cell */
          }
        }
      break; // floor is full — the building caps the company's scale
    }
    return have;
  }

  // citizen coin speculation: savers work small bids under the last price so
  // miners' asks meet real demand
  // Speculators, not allocators: some chase the recent move, some fade it.
  // Chasers extend a trend, contrarians pull it back, so the price wanders
  // in both directions instead of grinding one way.
  async runCoinSpeculators(): Promise<void> {
    if (!this.crypto) return;
    const stats = await this.crypto.networkStats();
    const ref = stats.lastPrice ?? (await this.coinFairRef("duc"));
    // recent move: latest price vs the last hour's average
    const avg = await this.avgCoinPrice(60);
    const mom = avg !== null && avg > 0 ? Math.max(-0.25, Math.min(0.25, (ref - avg) / avg)) : 0;

    const savers = await pool.query(
      `select n.entity_id, a.balance from npcs n
         join accounts a on a.entity_id = n.entity_id and a.currency = 'clean'
        where n.wealth_tier in ('saver','entrepreneur') and a.balance > 300
        order by random() limit 10`
    );
    for (const r of savers.rows) {
      const eid = Number(r.entity_id);
      const cash = Number(r.balance);
      const coins = Math.floor(await this.crypto.balance(eid));
      // 55% chase the move, 45% fade it — near enough to even that neither
      // side runs away with the market
      const tilt = (Math.random() < 0.55 ? mom : -mom) * 1.5;
      const buyBias = Math.max(0.3, Math.min(0.7, 0.5 + tilt));
      const wantsBuy = Math.random() < buyBias;
      const px = Math.max(0.001, Math.round(ref * (1 + (Math.random() - 0.5) * 0.09) * 10000) / 10000);

      if (wantsBuy) {
        const qty = Math.max(1, Math.min(Math.floor((cash * 0.15) / px), 2 + Math.floor(Math.random() * 10)));
        if (cash > px * qty) await this.crypto.trade(eid, "buy", qty, px).catch(() => {});
      } else if (coins >= 2) {
        const qty = Math.max(1, Math.min(Math.floor(coins * (0.15 + Math.random() * 0.25)), 12));
        await this.crypto.trade(eid, "sell", qty, px).catch(() => {});
      }
    }
  }

  private async operate(companyEid: number, seed: SeedDef): Promise<void> {
    const product = seed.product!;
    const balance = await this.balanceOf(companyEid);

    // own a storefront
    let bizLot: number | null = null;
    for (const st of this.lots.all()) {
      if (st.ownerType !== "city" && st.ownerId === String(companyEid)) {
        bizLot = st.id;
        break;
      }
    }
    if (bizLot === null) {
      // two passes: first hunt for the storefront this business WANTS
      // (petroleum wants a gas station), then settle for any commercial lot
      const buyPass = async (wantKind: string | null): Promise<number | null> => {
        for (const st of this.lots.all()) {
          if (st.ownerType !== "city" || !st.forSale) continue;
          if (st.price > balance * 0.4 || st.price < 200) continue;
          const b = this.lots.buildingDef(st.id);
          if (!b || b.kind === "house" || b.kind === "apartment") continue;
          if (wantKind && b.kind !== wantKind) continue;
          const { lot } = await this.lots.buy(companyEid, st.id);
          const { registry } = await import("./registry.js");
          registry.broadcast("lot", lot);
          return st.id;
        }
        return null;
      };
      // priority for a business with a storefront KIND: an existing building
      // of that kind, else BUILD one on vacant ground, else any commercial
      if (seed.shopKind) bizLot = await buyPass(seed.shopKind);
      if (bizLot === null && seed.shopKind) {
        const { templateById, templateFits } = await import("@mc/shared");
        const t = templateById(seed.shopKind);
        if (t) {
          for (const st of this.lots.all()) {
            if (st.ownerType !== "city" || !st.forSale) continue;
            if (st.price > balance * 0.3) continue;
            const lot = this.lots.lotDef(st.id);
            if (!lot || !templateFits(t, lot)) continue;
            if (this.lots.buildingDef(st.id) !== null || st.source) continue; // vacant only
            try {
              await this.lots.buy(companyEid, st.id);
              await this.lots.buildTemplate(companyEid, st.id, t.id);
              const { registry } = await import("./registry.js");
              registry.broadcast("lot", this.lots.all().find((l) => l.id === st.id));
              console.log(`[companyOps] ${seed.name} breaks ground on a ${t.label.toLowerCase()} (lot ${st.id})`);
              bizLot = st.id;
              break;
            } catch {
              /* lot didn't work out — try the next */
            }
          }
        }
      }
      if (bizLot === null) bizLot = await buyPass(null);
      if (bizLot === null) return;
    }

    // the right storefront on its own ground: if the lot is clear and this
    // business wants a specific building (Crown -> gas station), build it
    if (seed.shopKind) {
      const cur = this.lots.buildingDef(bizLot);
      const bizState = this.lots.all().find((l) => l.id === bizLot);
      if (cur && cur.kind !== seed.shopKind && !bizState?.building) {
        // wrong storefront inherited with the land: knock it down
        await this.lots.demolish(companyEid, bizLot).catch(() => {});
      }
      if (!this.lots.buildingDef(bizLot)) {
        await this.lots.buildTemplate(companyEid, bizLot, seed.shopKind).then(() => {
          console.log(`[companyOps] ${seed.name} builds its ${seed.shopKind} on lot ${bizLot}`);
        }).catch(() => {});
      }
    }

    // shelf, cashier
    const furn = await this.interiors.items(bizLot);
    if (!furn.some((f) => f.item === "shelf")) {
      placed: for (let y = 1; y < 7; y++)
        for (let x = 1; x < 7; x++) {
          try {
            await this.interiors.place(companyEid, bizLot, "shelf", x, y, 0);
            break placed;
          } catch {
            /* try next cell */
          }
        }
    }
    // staff at the going labor rate — the market sets pay, not a script.
    // The manager matters doubly now: docks AND pricing run through them.
    const wage = await this.workforce.marketWage();
    await this.workforce.ensureStaffed(companyEid, bizLot, "cashier", wage + 4).catch(() => {});
    await this.workforce.ensureStaffed(companyEid, bizLot, "manager", wage + 8).catch(() => {});

    // The product lines. Every company runs its founding line; the rest of
    // its catalog is a CHOICE — an established company rolls the dice each
    // ops day on launching one more (whiskey beside the beer, cigars beside
    // the cigarettes, memory beside the phones). Chosen lines persist.
    const lines: ProductLine[] = [{ product, chain: seed.chain ?? { machines: [], inputs: [], ladder: [] } }];
    if (seed.expansions?.length) {
      const row = await pool.query("select extra_lines from companies where entity_id = $1", [companyEid]);
      const chosen = new Set<string>((row.rows[0]?.extra_lines ?? []) as string[]);
      const candidates = seed.expansions.filter((x) => !chosen.has(x.product));
      if (candidates.length && balance > 8_000 && Math.random() < 0.08) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        // a board reads the market before entering it: no launch into a
        // product whose numbers don't work at today's prices
        if ((await this.lineGross(pick)) > 60) {
          await pool.query(
            "update companies set extra_lines = array_append(extra_lines, $2) where entity_id = $1",
            [companyEid, pick.product]
          );
          chosen.add(pick.product);
          console.log(`[companyOps] ${seed.name} launches a ${pick.product} line`);
        }
      }
      for (const x of seed.expansions) if (chosen.has(x.product)) lines.push(x);
    }

    // ---- the management layer: every line answers to its own P&L ----
    await pool.query(
      `insert into company_lines (world_id, company_entity, product)
       select $1, $2, unnest($3::text[]) on conflict do nothing`,
      [WORLD_ID, companyEid, lines.map((l) => l.product)]
    );
    const lstate = await pool.query(
      `select product, status, loss_reviews, extract(epoch from (now() - last_review)) as age
         from company_lines where world_id = $1 and company_entity = $2`,
      [WORLD_ID, companyEid]
    );
    const stateBy = new Map<string, { status: string; loss_reviews: number; age: number }>(
      lstate.rows.map((r) => [r.product as string, { status: r.status, loss_reviews: Number(r.loss_reviews), age: Number(r.age) }])
    );
    const active: ProductLine[] = [];
    for (const line of lines) {
      const st = stateBy.get(line.product);
      if (st?.status === "closed") {
        // a closed line can come back when the market turns — the same
        // numbers that justify entering justify re-entering
        if (Math.random() < 0.04 && (await this.lineGross(line)) > 60) {
          await pool.query(
            "update company_lines set status = 'active', loss_reviews = 0, last_review = now() where world_id = $1 and company_entity = $2 and product = $3",
            [WORLD_ID, companyEid, line.product]
          );
          console.log(`[companyOps] ${seed.name} reopens its ${line.product} line`);
          active.push(line);
        }
        continue;
      }
      active.push(line);
    }

    // reviews on a 7-game-day cadence: persist, or exit after three straight
    // losing periods (never the last line standing — a company doesn't
    // dissolve itself, it limps until the market turns)
    for (const line of [...active]) {
      const st = stateBy.get(line.product);
      if (!st || st.age < 4200) continue;
      const pnl = await this.linePnl(companyEid, bizLot, line, active.length, Math.min(st.age, 8400));
      const losses = pnl < 0 ? st.loss_reviews + 1 : 0;
      if (losses >= 3 && active.length > 1) {
        await pool.query(
          "update company_lines set status = 'closed', loss_reviews = $4, last_review = now() where world_id = $1 and company_entity = $2 and product = $3",
          [WORLD_ID, companyEid, line.product, losses]
        );
        // clearance: mark the remaining stock down and pull the working bids
        await pool.query(
          "update shelf_listings set price = greatest(0.05, round(price * 0.75, 2)) where world_id = $1 and lot_id = $2 and item = $3",
          [WORLD_ID, bizLot, line.product]
        );
        const toPull = [line.product, ...line.chain.inputs.map((i) => i.item)];
        const bids = await pool.query(
          `select id from orders where world_id = $1 and owner_entity = $2 and side = 'buy'
             and asset_type = 'item' and item = any($3::text[])`,
          [WORLD_ID, companyEid, toPull]
        );
        for (const row of bids.rows) await this.market.cancel(companyEid, Number(row.id)).catch(() => {});
        console.log(`[companyOps] ${seed.name} exits ${line.product} (3 losing reviews) — clearance sale on`);
        active.splice(active.indexOf(line), 1);
      } else {
        await pool.query(
          "update company_lines set loss_reviews = $4, last_review = now() where world_id = $1 and company_entity = $2 and product = $3",
          [WORLD_ID, companyEid, line.product, losses]
        );
      }
    }

    // a shelf per line, so the second product has somewhere to sell from
    await this.ensureFurnitureCount(companyEid, bizLot, "shelf", Math.min(active.length, 6));

    for (const line of active) {
      let scale = 1;
      if (line.chain.machines.length)
        scale = await this.produce(companyEid, bizLot, seed, line).catch((e): number => {
          console.error("[companyOps] produce", seed.name, line.product, e?.message ?? e);
          return 1;
        });
      await this.retailLine(companyEid, bizLot, seed, line, scale, balance).catch(() => {});
    }
  }

  // source stock on the exchange, haul it in, shelve it, price it — the
  // retail half of one product line
  private async retailLine(
    companyEid: number,
    bizLot: number,
    seed: SeedDef,
    line: ProductLine,
    scale: number,
    balance: number
  ): Promise<void> {
    const product = line.product;
    const shelf = await this.goods.inventory("shelf", String(bizLot));
    const store = await this.goods.inventory("lot", String(bizLot));
    // a grocer that can't source its produce anywhere can grow its own —
    // same integration choice the processors get for their inputs
    if (!line.chain.ladder.length && ITEM_SOURCE[product] && (shelf[product] ?? 0) + (store[product] ?? 0) === 0)
      await this.ensureSourceFor(companyEid, seed, product, bizLot).catch(() => {});
    const pocket = await this.goods.inventory("entity", String(companyEid));
    const base = BASE_PRICE[product] ?? 10;
    if ((pocket[product] ?? 0) > 0)
      await this.goods.transfer(companyEid, bizLot, product, pocket[product]!, true).catch(() => {});
    // ONE working bid for the finished product, not a new one every day —
    // the stack of duplicates was eating the company's whole order allowance,
    // which silently starved the production arm's input bids
    const openBids = await pool.query(
      `select id from orders where world_id = $1 and owner_entity = $2 and item = $3
         and side = 'buy' and asset_type = 'item' order by created_at desc`,
      [WORLD_ID, companyEid, product]
    );
    for (const row of openBids.rows.slice(1))
      await this.market.cancel(companyEid, Number(row.id)).catch(() => {});
    const onHand = (shelf[product] ?? 0) + (store[product] ?? 0);
    if (onHand < 12 * scale && balance > 300 && !openBids.rowCount) {
      // wholesale only makes sense below what the shelf actually charges —
      // the bid rides the market rate, capped at 80% of the standing price
      const ref = await this.market.refPrice(product);
      const listedPx = await pool.query(
        "select price from shelf_listings where world_id = $1 and lot_id = $2 and item = $3 limit 1",
        [WORLD_ID, bizLot, product]
      );
      const shelfPx = listedPx.rowCount ? Number(listedPx.rows[0].price) : retailPrice(Math.max(ref * 1.15, 0.1));
      const limit = Math.round(Math.min(ref * 1.02, shelfPx * 0.8) * 100) / 100;
      if (limit > 0.01)
        await this.market.place(companyEid, "buy", product, 10 * scale, limit).catch(() => {});
    }
    if (product === "fuel") return; // fuel retails at the pumps, not on shelves
    const inStore = (await this.goods.inventory("lot", String(bizLot)))[product] ?? 0;
    // a NEW listing opens at a margin over the market rate; after that the
    // shelf price belongs to the manager's sell-through repricing, so the
    // restock explicitly keeps whatever price stands
    const openingPx = retailPrice(Math.max((await this.market.refPrice(product)) * 1.15, 0.1));
    await this.goods
      .autoRetail(companyEid, bizLot, product, openingPx, Math.min(inStore, 10 * scale), true)
      .catch(() => {});
  }

  // the Nordvik pattern for everyone: own the machines, buy the raws, work
  // the ladder, and let the day's craft timers do the rest. Returns the line's
  // SCALE — how many of the final station the works runs — so retail keeps
  // pace with production. A company that keeps selling out while its benches
  // are saturated earns another bench, another rack, another pair of hands.
  private async produce(companyEid: number, bizLot: number, seed: SeedDef, line: ProductLine): Promise<number> {
    const chain = line.chain;
    const primary = chain.machines[chain.machines.length - 1];
    const furn = await this.interiors.items(bizLot);
    let scale = Math.max(1, furn.filter((f) => f.item === primary).length);

    const store = await this.goods.inventory("lot", String(bizLot));
    const shelf = await this.goods.inventory("shelf", String(bizLot));
    const balance = await this.balanceOf(companyEid);
    // the queue this line answers for is its own recipes, so a busy beer
    // bench doesn't stop the whiskey line from working
    const ladderIds = chain.ladder.map(([r]) => r);
    const queued = Number(
      (
        await pool.query("select count(*) as n from crafts where lot_id = $1 and recipe = any($2::text[])", [
          bizLot,
          ladderIds.length ? ladderIds : [""],
        ])
      ).rows[0].n
    );

    // demand outrunning capacity: the product is gone everywhere AND the
    // benches are already full. That's the signal to expand — not a timer,
    // not a balance check alone
    const product = line.product;
    const soldOut = (store[product] ?? 0) + (shelf[product] ?? 0) === 0;
    if (soldOut && queued >= scale * 3 && scale < 4 && balance > 2000 && primary !== "rack_l")
      scale = await this.ensureFurnitureCount(companyEid, bizLot, primary, scale + 1);

    // the floor matches the scale: every craft station multiplied, storage
    // racks growing more slowly (they hold goods, they don't make them)
    for (const m of chain.machines)
      await this.ensureFurnitureCount(
        companyEid, bizLot, m,
        m === "rack_l" ? Math.min(1 + (scale >> 1), 3) : scale
      );
    // and so does the staff: a crafter per extra bench keeps the machines
    // visibly worked, a stocker keeps the shelves fed from the racks
    if (primary !== "rack_l") {
      const wage = await this.workforce.marketWage();
      await this.workforce.ensureStaffed(companyEid, bizLot, "stocker", wage).catch(() => {});
      if (scale > 1)
        await this.workforce.ensureStaffed(companyEid, bizLot, "crafter", wage + 2, scale - 1).catch(() => {});
    }
    // a lapsed licence stops a permitted line dead — renew from company funds
    if (seed.permit && !(await this.permits.has(companyEid, seed.permit)))
      await this.permits.issue(() => true, companyEid, seed.permit).catch(() => {});

    for (const inp of chain.inputs) {
      // surplus from the company's own fields feeds the open market — the
      // world's raw supply comes from whoever grows it, city not involved
      const have = store[inp.item] ?? 0;
      if (have > inp.min * scale * 4 && !(await this.hasOpenSell(companyEid, inp.item))) {
        const excess = Math.floor(have - inp.min * scale * 2);
        const ask = Math.round((await this.market.refPrice(inp.item)) * 0.98 * 100) / 100;
        await this.goods.transfer(companyEid, bizLot, inp.item, excess, false).catch(() => {});
        await this.market.place(companyEid, "sell", inp.item, excess, Math.max(0.01, ask)).catch(() => {});
      }
      if ((store[inp.item] ?? 0) >= inp.min * scale) continue;
      if ((store[inp.item] ?? 0) === 0)
        await this.ensureSourceFor(companyEid, seed, inp.item, bizLot).catch(() => {});
      const open = await pool.query(
        `select id, price, created_at < now() - interval '20 minutes' as old
           from orders where world_id = $1 and owner_entity = $2 and item = $3
           and side = 'buy' and asset_type = 'item' order by created_at desc`,
        [WORLD_ID, companyEid, inp.item]
      );
      const existing = open.rowCount ? Number(open.rows[0].price) : null;
      const limit = await this.bidPrice(inp.item, (store[inp.item] ?? 0) === 0, existing);
      // a bid that has sat unfilled or drifted from the going rate is pulled
      // (through cancel, so the escrowed cash comes home) and re-quoted
      let live = 0;
      for (const row of open.rows) {
        const px = Number(row.price);
        if (row.old || Math.abs(px - limit) / limit > 0.08)
          await this.market.cancel(companyEid, Number(row.id)).catch(() => {});
        else live++;
      }
      if (balance < 500 || live > 0) continue;
      await this.market.place(companyEid, "buy", inp.item, inp.batch * scale, limit).catch((e) => console.error("[produce] bid", seed.name, inp.item, e?.message ?? e));
    }
    // exchange fills land in the pocket; the works run from the property
    const pocket = await this.goods.inventory("entity", String(companyEid));
    for (const inp of chain.inputs)
      if ((pocket[inp.item] ?? 0) > 0)
        await this.goods.transfer(companyEid, bizLot, inp.item, pocket[inp.item]!, true).catch(() => {});

    // more benches carry a deeper queue and bigger batches — this is where
    // the extra furniture actually turns into extra output
    if (queued < scale * 3)
      for (const [recipe, batch] of chain.ladder)
        await this.goods.craft(companyEid, bizLot, recipe, batch * scale).catch((e) => { if (!String(e?.message).startsWith("needs")) console.error("[produce] craft", seed.name, recipe, e?.message ?? e); });
    return scale;
  }

  // light NPC speculation so listed prices discover instead of freezing:
  // a handful of citizen holders work small orders around the last price
  async runSpeculators(): Promise<void> {
    const stocks = await this.stocks.list();
    for (const s of stocks) {
      const ref = s.last; // list() falls back to IPO price pre-trading
      if (ref === null || !(ref > 0)) continue;
      const holders = await pool.query(
        `select holder_entity, shares from share_holdings
          where company_entity = $1 and shares > 0 and holder_entity <> $1
          order by random() limit 4`,
        [s.company]
      );
      for (const h of holders.rows) {
        const eid = Number(h.holder_entity);
        const founderRow = await pool.query(
          "select founder_entity from companies where entity_id = $1",
          [s.company]
        );
        if (founderRow.rowCount && Number(founderRow.rows[0].founder_entity) === eid) continue;
        // speculators read the same published composite players see:
        // momentum tilts their limit prices
        const tilt = this.stats ? Math.max(-0.03, Math.min(0.03, (await this.stats.momentum()) * 0.5)) : 0;
        const drift = 1 + tilt + (Math.random() - 0.48) * 0.08;
        const px = Math.max(0.05, Math.round(ref * drift * 100) / 100);
        const side = Math.random() < 0.5 ? "buy" : "sell";
        const qty = 50 + Math.floor(Math.random() * 200);
        if (side === "sell" && Number(h.shares) < qty) continue;
        await this.stocks.trade(eid, s.company, side, qty, px).catch(() => {});
      }
    }
  }

  // already offering this item? one working ask at a time
  private async hasOpenSell(eid: number, item: string): Promise<boolean> {
    const r = await pool.query(
      `select 1 from orders where world_id = $1 and owner_entity = $2 and item = $3
         and side = 'sell' and asset_type = 'item' limit 1`,
      [WORLD_ID, eid, item]
    );
    return !!r.rowCount;
  }

  // already bidding for this item? don't stack another order on top
  private async hasOpenBuy(eid: number, item: string): Promise<boolean> {
    const r = await pool.query(
      `select 1 from orders where world_id = $1 and owner_entity = $2 and item = $3
         and side = 'buy' and asset_type = 'item' limit 1`,
      [WORLD_ID, eid, item]
    );
    return r.rowCount! > 0;
  }

  private async balanceOf(eid: number): Promise<number> {
    const r = await pool.query(
      "select balance from accounts where entity_id = $1 and currency = 'clean'",
      [eid]
    );
    return r.rowCount ? Number(r.rows[0].balance) : 0;
  }
}
