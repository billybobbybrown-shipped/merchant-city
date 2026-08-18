import {
  BASE_PRICE,
  CPI_BASKET,
  DAY_LENGTH_SEC,
  capWeightedIndex,
  cpi,
  gdpFromLedger,
  indexDivisor,
  realizedRange,
  sourceByType,
  sourceYield,
  vwap,
} from "@mc/shared";
import { pool } from "./db.js";
import { LotStore } from "./lots.js";
import { StocksStore } from "./stocks.js";
import { CryptoStore } from "./crypto.js";

const WORLD_ID = 1;

// sector assignment for the stock indices, by company name keywords
function sectorOf(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("mining") || n.includes("hash")) return "mining";
  if (n.includes("spirits") || n.includes("tobacco")) return "vice";
  if (n.includes("textile") || n.includes("electronic") || n.includes("iron")) return "industrials";
  return "retail";
}

// The stats service: aggregates the game's REAL records into per-game-day
// snapshot rows. Nothing here is simulated — remove the underlying trades and
// the numbers vanish. The criminal economy (dirty currency, bribes, seizures)
// is computed nowhere in these public tables.
export class StatsService {
  constructor(
    private lots: LotStore,
    private stocks: StocksStore,
    private crypto: CryptoStore
  ) {}

  bucketNow(): number {
    return Math.floor(Date.now() / 1000 / DAY_LENGTH_SEC);
  }

  async runDay(): Promise<void> {
    const bucket = this.bucketNow();
    const windowSql = `now() - make_interval(secs => ${DAY_LENGTH_SEC})`;
    try {
      await this.snapshotAssets(bucket, windowSql);
      await this.snapshotCommodities(bucket, windowSql);
      await this.snapshotMacro(bucket, windowSql);
      await this.snapshotIndices(bucket);
    } catch (err) {
      console.error("[stats] snapshot failed", err);
    }
  }

  private async snapshotAssets(bucket: number, windowSql: string): Promise<void> {
    const traded = await pool.query(
      `select asset_type, item, array_agg(json_build_object('price', price, 'qty', qty)) as trades
         from trades where world_id = $1 and ts > ${windowSql}
        group by asset_type, item`,
      [WORLD_ID]
    );
    const books = await pool.query(
      `select asset_type, item, side,
              case when side = 'buy' then max(price) else min(price) end as best,
              sum(qty * price) as depth
         from orders where world_id = $1 group by asset_type, item, side`,
      [WORLD_ID]
    );
    const bookMap = new Map<string, { bid?: number; ask?: number; bidDepth: number; askDepth: number }>();
    for (const r of books.rows) {
      const k = `${r.asset_type}:${r.item}`;
      if (!bookMap.has(k)) bookMap.set(k, { bidDepth: 0, askDepth: 0 });
      const b = bookMap.get(k)!;
      if (r.side === "buy") {
        b.bid = Number(r.best);
        b.bidDepth = Number(r.depth);
      } else {
        b.ask = Number(r.best);
        b.askDepth = Number(r.depth);
      }
    }
    const stockList = await this.stocks.list();
    const capOf = new Map(stockList.map((s) => [`s:${s.company}`, s.marketCap]));

    for (const r of traded.rows) {
      const trades = (r.trades as Array<{ price: number; qty: number }>).map((t) => ({
        price: Number(t.price),
        qty: Number(t.qty),
      }));
      const range = realizedRange(trades);
      const book = bookMap.get(`${r.asset_type}:${r.item}`);
      await pool.query(
        `insert into stat_asset (world_id, bucket, asset_type, asset, last, vwap, vol, high, low,
            best_bid, best_ask, bid_depth, ask_depth, market_cap)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (world_id, bucket, asset_type, asset) do update set
            last = $5, vwap = $6, vol = $7, high = $8, low = $9,
            best_bid = $10, best_ask = $11, bid_depth = $12, ask_depth = $13, market_cap = $14`,
        [
          WORLD_ID,
          bucket,
          r.asset_type,
          r.item,
          trades.length ? trades[trades.length - 1].price : null,
          vwap(trades),
          trades.reduce((a, t) => a + t.qty, 0),
          range?.high ?? null,
          range?.low ?? null,
          book?.bid ?? null,
          book?.ask ?? null,
          book?.bidDepth ?? 0,
          book?.askDepth ?? 0,
          r.asset_type === "stock" ? capOf.get(r.item) ?? null : null,
        ]
      );
    }
  }

  private async snapshotCommodities(bucket: number, windowSql: string): Promise<void> {
    // crafted production is recorded by resolveCrafts the moment it happens
    // (the craft rows are deleted on resolution, so scanning them here missed
    // nearly everything). The snapshot only ADDS the daily yield of active
    // production sites and fills in consumption.
    const produced = new Map<string, number>();
    for (const st of this.lots.all()) {
      if (!st.source) continue;
      const def = sourceByType(st.source.type);
      if (!def) continue;
      if (st.source.doneAt > Date.now()) continue; // still setting up
      produced.set(def.item, (produced.get(def.item) ?? 0) + sourceYield(def, st.source.area));
    }
    // consumed: actual retail purchases (reason = "<item> @ lot N")
    const consumed = new Map<string, number>();
    const sales = await pool.query(
      `select split_part(reason, ' @ ', 1) as item, count(*) as n from ledger
        where category = 'retail_sale' and currency = 'clean' and reason like '% @ lot %'
          and ts > ${windowSql}
        group by 1`,
      []
    );
    for (const r of sales.rows) consumed.set(r.item, Number(r.n));

    const items = new Set([...produced.keys(), ...consumed.keys()]);
    for (const item of items) {
      await pool.query(
        `insert into stat_commodity (world_id, bucket, item, produced, consumed)
         values ($1,$2,$3,$4,$5)
         on conflict (world_id, bucket, item) do update
           set produced = stat_commodity.produced + $4, consumed = $5`,
        [WORLD_ID, bucket, item, produced.get(item) ?? 0, consumed.get(item) ?? 0]
      );
    }
  }

  private async snapshotMacro(bucket: number, windowSql: string): Promise<void> {
    const led = await pool.query(
      `select category, currency, sum(amount) as amount from ledger
        where ts > ${windowSql} and category is not null
        group by category, currency`
    );
    const gdp = gdpFromLedger(
      led.rows.map((r) => ({ category: r.category, amount: Number(r.amount), currency: r.currency }))
    );

    // CPI from actual transacted retail prices this game day
    const px = await pool.query(
      `select split_part(reason, ' @ ', 1) as item, avg(amount) as p from ledger
        where category = 'retail_sale' and currency = 'clean' and reason like '% @ lot %'
          and ts > ${windowSql}
        group by 1`
    );
    const observed: Record<string, number> = {};
    for (const r of px.rows) observed[r.item] = Number(r.p);
    const cpiNow = cpi(CPI_BASKET, observed, BASE_PRICE);

    const emp = await pool.query(
      `select count(*) filter (where employer_entity is not null) as employed, count(*) as pop,
              count(*) filter (where home_lot is not null) as housed,
              avg(wage) filter (where employer_entity is not null) as avg_wage
         from npcs where world_id = $1`,
      [WORLD_ID]
    );
    const openJobs = await pool.query(
      "select coalesce(sum(slots), 0) as open from hire_offers where world_id = $1",
      [WORLD_ID]
    );
    // what people actually paid to live here this game day — the housing
    // rents in the ledger, not the (mostly empty) commercial tenancy roll
    const rentPaid = await pool.query(
      `select avg(amount) as r from ledger
        where category = 'rent' and currency = 'clean' and ts > ${windowSql}`
    );
    const avgRent = rentPaid.rows[0]?.r !== null ? Number(rentPaid.rows[0].r) : null;
    const coin = await this.crypto.networkStats();
    const e = emp.rows[0];

    await pool.query(
      `insert into stat_macro (world_id, bucket, gdp, gdp_sectors, cpi, employed, labor_force,
          avg_wage, open_jobs, population, housing_occupancy, avg_rent,
          coin_supply, coin_emission, world_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (world_id, bucket) do update set
          gdp = $3, gdp_sectors = $4, cpi = $5, employed = $6, labor_force = $7,
          avg_wage = $8, open_jobs = $9, population = $10, housing_occupancy = $11,
          avg_rent = $12, coin_supply = $13, coin_emission = $14, world_hash = $15`,
      [
        WORLD_ID,
        bucket,
        gdp.total,
        JSON.stringify(gdp.bySector),
        cpiNow,
        Number(e.employed),
        Number(e.pop),
        e.avg_wage !== null ? Number(e.avg_wage) : null,
        Number(openJobs.rows[0].open),
        Number(e.pop),
        Number(e.pop) > 0 ? Number(e.housed) / Number(e.pop) : null,
        avgRent,
        coin.circulating,
        coin.dailyEmission,
        coin.worldHash,
      ]
    );
  }

  private async snapshotIndices(bucket: number): Promise<void> {
    const list = await this.stocks.list();
    const groups = new Map<string, Array<{ last: number | null; shares: number }>>();
    groups.set("composite", []);
    for (const s of list) {
      const m = { last: s.last, shares: s.shares };
      groups.get("composite")!.push(m);
      const sec = sectorOf(s.name);
      if (!groups.has(sec)) groups.set(sec, []);
      groups.get(sec)!.push(m);
    }
    for (const [name, members] of groups.entries()) {
      const metaKey = `divisor:${name}`;
      const meta = await pool.query("select value from stat_meta where world_id = $1 and key = $2", [WORLD_ID, metaKey]);
      let divisor: number;
      if (meta.rowCount) divisor = Number(meta.rows[0].value);
      else {
        divisor = indexDivisor(members);
        await pool.query("insert into stat_meta (world_id, key, value) values ($1,$2,$3)", [WORLD_ID, metaKey, divisor]);
      }
      const value = capWeightedIndex(members, divisor);
      await pool.query(
        `insert into stat_index (world_id, bucket, name, value) values ($1,$2,$3,$4)
         on conflict (world_id, bucket, name) do update set value = $4`,
        [WORLD_ID, bucket, name, value]
      );
    }
  }

  // ---- reads for the dashboard ----

  async macro(days: number) {
    const r = await pool.query(
      "select * from stat_macro where world_id = $1 order by bucket desc limit $2",
      [WORLD_ID, Math.min(200, days)]
    );
    return r.rows.reverse();
  }

  async indices(days: number) {
    const r = await pool.query(
      `select bucket, name, value from stat_index where world_id = $1
        and bucket > $2 order by bucket asc`,
      [WORLD_ID, this.bucketNow() - Math.min(200, days)]
    );
    return r.rows.map((row) => ({ bucket: Number(row.bucket), name: row.name, value: row.value !== null ? Number(row.value) : null }));
  }

  async commodities() {
    const r = await pool.query(
      `select distinct on (item) item, bucket, produced, consumed from stat_commodity
        where world_id = $1 order by item, bucket desc`,
      [WORLD_ID]
    );
    return r.rows.map((row) => ({
      item: row.item,
      produced: Number(row.produced),
      consumed: Number(row.consumed),
    }));
  }

  async assetHistory(assetType: string, asset: string, days: number) {
    const r = await pool.query(
      `select bucket, last, vwap, vol, high, low, best_bid, best_ask, market_cap
         from stat_asset where world_id = $1 and asset_type = $2 and asset = $3
        and bucket > $4 order by bucket asc`,
      [WORLD_ID, assetType, asset, this.bucketNow() - Math.min(500, days)]
    );
    return r.rows;
  }

  // day-over-day composite change — NPC speculators read the same published
  // number players see
  async momentum(): Promise<number> {
    const r = await pool.query(
      `select value from stat_index where world_id = $1 and name = 'composite'
        order by bucket desc limit 2`,
      [WORLD_ID]
    );
    if (r.rowCount! < 2 || r.rows[0].value === null || r.rows[1].value === null) return 0;
    const [cur, prev] = [Number(r.rows[0].value), Number(r.rows[1].value)];
    return prev > 0 ? (cur - prev) / prev : 0;
  }
}
