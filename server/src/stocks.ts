import { PoolClient } from "pg";
import {
  IPO_AUDIT_FEE,
  STOCK_FEE_RATE,
  circuitBand,
  declaredDps,
  DIVIDEND_PERIOD_DAYS,
  floatValid,
  ipoEligible,
  ipoPriceBand,
  majorityHolder,
} from "@mc/shared";
import { pool } from "./db.js";
import { EconomyError } from "./errors.js";
import { CITY_ENTITY, transfer } from "./accounts.js";
import { placeOrder, cancelOrder, AssetHooks } from "./orderbook.js";
import { CompaniesStore } from "./companies.js";

const WORLD_ID = 1;

export const stockKey = (companyEid: number) => `s:${companyEid}`;
export const companyOfKey = (key: string): number | null =>
  key.startsWith("s:") ? Number(key.slice(2)) : null;

// share-registry hooks for the shared order book
const SHARE_HOOKS: AssetHooks = {
  async escrowSell(c: PoolClient, eid: number, key: string, qty: number) {
    const take = await c.query(
      `update share_holdings set shares = shares - $3
        where holder_entity = $1 and company_entity = $2 and shares >= $3`,
      [eid, companyOfKey(key), qty]
    );
    if (!take.rowCount) throw new EconomyError("not enough shares");
  },
  async deliver(c: PoolClient, eid: number, key: string, qty: number) {
    await c.query(
      `insert into share_holdings (holder_entity, company_entity, shares) values ($1,$2,$3)
       on conflict (holder_entity, company_entity) do update set shares = share_holdings.shares + $3`,
      [eid, companyOfKey(key), qty]
    );
  },
  async refund(c: PoolClient, eid: number, key: string, qty: number) {
    await SHARE_HOOKS.deliver(c, eid, key, qty);
  },
};

// The stock market: listed companies trade on the same order-book engine as
// commodities. Shares live in a registry, cash legs are clean-only (the
// account layer blocks dirty/coin from 'trade'), and >50% of shares is control.
export class StocksStore {
  constructor(private companies: CompaniesStore) {}

  private async stockRow(companyEid: number) {
    const r = await pool.query("select * from stocks where company_entity = $1", [companyEid]);
    return r.rowCount ? r.rows[0] : null;
  }

  async list() {
    const r = await pool.query(
      `select s.company_entity, e.name, s.shares_outstanding, s.float_shares, s.dividend_ratio,
              s.prev_close, s.halted_until, s.ipo_price, s.dps, s.pay_day_counter,
              (select price from trades t where t.world_id = $1 and t.asset_type = 'stock'
                 and t.item = 's:' || s.company_entity order by ts desc limit 1) as last
         from stocks s join entities e on e.id = s.company_entity
        order by e.name`,
      [WORLD_ID]
    );
    return r.rows.map((row) => {
      const last =
        row.last !== null
          ? Number(row.last)
          : row.prev_close !== null
            ? Number(row.prev_close)
            : Number(row.ipo_price) || null;
      return {
        company: Number(row.company_entity),
        name: row.name,
        ipoPrice: Number(row.ipo_price),
        shares: Number(row.shares_outstanding),
        floatShares: Number(row.float_shares),
        dividendRatio: Number(row.dividend_ratio),
        dps: Number(row.dps),
        payInDays: DIVIDEND_PERIOD_DAYS - Number(row.pay_day_counter),
        // day one has no close yet — the IPO price is the reference, so the
        // daily change chip works from the first trade instead of showing "—"
        prevClose: row.prev_close !== null ? Number(row.prev_close) : Number(row.ipo_price) || null,
        last,
        marketCap: last !== null ? Math.round(last * Number(row.shares_outstanding)) : null,
        halted: row.halted_until !== null && new Date(row.halted_until).getTime() > Date.now(),
      };
    });
  }

  async detail(companyEid: number) {
    const key = stockKey(companyEid);
    const bids = await pool.query(
      `select price, sum(qty) as qty from orders
        where world_id = $1 and asset_type = 'stock' and item = $2 and side = 'buy'
        group by price order by price desc limit 8`,
      [WORLD_ID, key]
    );
    const asks = await pool.query(
      `select price, sum(qty) as qty from orders
        where world_id = $1 and asset_type = 'stock' and item = $2 and side = 'sell'
        group by price order by price asc limit 8`,
      [WORLD_ID, key]
    );
    const trades = await pool.query(
      `select price, qty, extract(epoch from ts) * 1000 as ts from trades
        where world_id = $1 and asset_type = 'stock' and item = $2 order by ts desc limit 20`,
      [WORLD_ID, key]
    );
    return {
      bids: bids.rows.map((r) => ({ price: Number(r.price), qty: Number(r.qty) })),
      asks: asks.rows.map((r) => ({ price: Number(r.price), qty: Number(r.qty) })),
      trades: trades.rows.map((r) => ({ price: Number(r.price), qty: Number(r.qty), ts: Number(r.ts) })),
    };
  }

  // candles bucketed by minutes (1 = intraday, 10 = one game day per candle)
  async history(companyEid: number, bucketMin: number) {
    const r = await pool.query(
      `select floor(extract(epoch from ts) / ($3 * 60)) as bucket,
              (array_agg(price order by ts asc))[1] as o,
              max(price) as h, min(price) as l,
              (array_agg(price order by ts desc))[1] as c,
              sum(qty) as v
         from trades where world_id = $1 and asset_type = 'stock' and item = $2
          and ts > now() - interval '48 hours'
        group by bucket order by bucket asc`,
      [WORLD_ID, stockKey(companyEid), bucketMin]
    );
    return r.rows.map((row) => ({
      t: Number(row.bucket) * bucketMin * 60_000,
      o: Number(row.o),
      h: Number(row.h),
      l: Number(row.l),
      c: Number(row.c),
      v: Number(row.v),
    }));
  }

  async holdingsOf(eid: number) {
    const r = await pool.query(
      `select h.company_entity, e.name, h.shares from share_holdings h
        join entities e on e.id = h.company_entity where h.holder_entity = $1 and h.shares > 0`,
      [eid]
    );
    return r.rows.map((row) => ({ company: Number(row.company_entity), name: row.name, shares: Number(row.shares) }));
  }

  // A holder's book: what they own, what it cost them, and what it is worth
  // now. Cost basis comes from their own trade history — average cost of the
  // shares they bought, with sales realising against that same average.
  async portfolio(eid: number) {
    const held = await this.holdingsOf(eid);
    const trades = await pool.query(
      `select item, qty, price, buyer_entity, seller_entity from trades
        where world_id = $1 and asset_type = 'stock' and (buyer_entity = $2 or seller_entity = $2)
        order by id`,
      [WORLD_ID, eid]
    );

    // walk the tape in order so an average cost survives partial sales
    const book = new Map<number, { qty: number; cost: number; realised: number }>();
    for (const t of trades.rows) {
      const company = companyOfKey(t.item);
      if (company === null) continue;
      const b = book.get(company) ?? { qty: 0, cost: 0, realised: 0 };
      const qty = Number(t.qty);
      const price = Number(t.price);
      if (Number(t.buyer_entity) === eid) {
        b.qty += qty;
        b.cost += qty * price;
      } else {
        const avg = b.qty > 0 ? b.cost / b.qty : price;
        const sold = Math.min(qty, b.qty);
        b.realised += sold * (price - avg);
        b.cost -= sold * avg;
        b.qty -= sold;
      }
      book.set(company, b);
    }

    const listings = await this.list();
    const priceOf = new Map(listings.map((l: any) => [l.company, Number(l.last ?? l.prevClose ?? 0)]));
    const rows = held.map((h) => {
      const b = book.get(h.company);
      const avg = b && b.qty > 0 ? b.cost / b.qty : 0;
      const price = priceOf.get(h.company) ?? 0;
      const value = h.shares * price;
      return {
        company: h.company,
        name: h.name,
        shares: h.shares,
        avgCost: Math.round(avg * 100) / 100,
        price,
        value: Math.round(value * 100) / 100,
        unrealised: Math.round((value - h.shares * avg) * 100) / 100,
        realised: Math.round((b?.realised ?? 0) * 100) / 100,
      };
    });

    // money already taken out of positions since closed
    let closedRealised = 0;
    for (const [company, b] of book)
      if (!held.some((h) => h.company === company)) closedRealised += b.realised;

    return {
      rows,
      value: Math.round(rows.reduce((a, r) => a + r.value, 0) * 100) / 100,
      cost: Math.round(rows.reduce((a, r) => a + r.shares * r.avgCost, 0) * 100) / 100,
      unrealised: Math.round(rows.reduce((a, r) => a + r.unrealised, 0) * 100) / 100,
      realised: Math.round((rows.reduce((a, r) => a + r.realised, 0) + closedRealised) * 100) / 100,
    };
  }

  async myStockOrders(eid: number) {
    const r = await pool.query(
      `select o.id, o.side, o.item, o.qty, o.price, e.name from orders o
        join entities e on e.id = substr(o.item, 3)::bigint
        where o.world_id = $1 and o.owner_entity = $2 and o.asset_type = 'stock'
        order by o.created_at desc`,
      [WORLD_ID, eid]
    );
    return r.rows.map((row) => ({
      id: Number(row.id),
      side: row.side,
      company: companyOfKey(row.item),
      name: row.name,
      qty: Number(row.qty),
      price: Number(row.price),
    }));
  }

  async trade(eid: number, companyEid: number, side: "buy" | "sell", qty: number, price: number, market = false) {
    const s = await this.stockRow(companyEid);
    if (!s) throw new EconomyError("not a listed company");
    if (!Number.isInteger(qty) || qty < 1 || qty > 1_000_000) throw new EconomyError("bad quantity");
    const band = circuitBand(s.prev_close !== null ? Number(s.prev_close) : null);
    if (market) {
      // market order: take whatever the book offers (resting orders were
      // band-checked when placed, so fills stay inside the day's band)
      price = side === "buy" ? 10_000_000 : 0.01;
    } else {
      price = Math.round(price * 100) / 100;
      if (!(price > 0) || price > 10_000_000) throw new EconomyError("bad price");
      if (band && (price < band.min || price > band.max))
        throw new EconomyError(`price outside today's band $${band.min}–$${band.max}`);
    }
    if (s.halted_until && new Date(s.halted_until).getTime() > Date.now())
      throw new EconomyError("trading halted for the day (circuit breaker)");

    const client = await pool.connect();
    let result;
    try {
      await client.query("begin");
      result = await placeOrder(client, {
        assetType: "stock",
        assetKey: stockKey(companyEid),
        label: `${await this.companyName(companyEid)} shares`,
        eid,
        side,
        qty,
        price,
        feeRate: STOCK_FEE_RATE,
        hooks: SHARE_HOOKS,
        market,
      });
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    // fills at the band edge trip the breaker for the rest of the day
    const tripPx = market ? result.avgPrice ?? 0 : price;
    if (band && result.filled > 0 && (tripPx <= band.min || tripPx >= band.max)) {
      await pool.query(
        "update stocks set halted_until = now() + interval '10 minutes' where company_entity = $1",
        [companyEid]
      );
      result.notes.push({ eid, msg: "Circuit breaker: trading halted for the day" });
    }
    if (result.filled > 0) await this.refreshControl(companyEid);
    return result;
  }

  async cancel(eid: number, orderId: number) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await cancelOrder(client, eid, orderId, SHARE_HOOKS);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  private async companyName(companyEid: number): Promise<string> {
    const r = await pool.query("select name from entities where id = $1", [companyEid]);
    return r.rowCount ? r.rows[0].name : `#${companyEid}`;
  }

  // control follows the share registry once listed: >50% holder takes the
  // company (hostile takeovers); with no majority the founder keeps operating
  async refreshControl(companyEid: number): Promise<void> {
    const s = await this.stockRow(companyEid);
    if (!s) return;
    const h = await pool.query(
      "select holder_entity, shares from share_holdings where company_entity = $1 and shares > 0",
      [companyEid]
    );
    const major = majorityHolder(
      h.rows.map((r) => ({ holder: Number(r.holder_entity), shares: Number(r.shares) })),
      Number(s.shares_outstanding)
    );
    const f = await pool.query("select founder_entity from companies where entity_id = $1", [companyEid]);
    const founder = f.rowCount ? Number(f.rows[0].founder_entity) : null;
    const controller = major ?? founder;
    if (controller !== null) this.companies.setControllers(companyEid, new Set([controller]));
  }

  // player IPO: real gates from real books, audit fee, float rests on the book
  async ipo(eid: number, companyEid: number, sharesOutstanding: number, floatPct: number, price: number) {
    if (!this.companies.controls(eid, companyEid)) throw new EconomyError("not your company");
    if (await this.stockRow(companyEid)) throw new EconomyError("already listed");
    if (!Number.isInteger(sharesOutstanding) || sharesOutstanding < 1000 || sharesOutstanding > 100_000_000)
      throw new EconomyError("shares outstanding must be 1,000–100,000,000");
    if (!floatValid(floatPct)) throw new EconomyError("float must be 25–75%");
    price = Math.round(price * 100) / 100;

    const c = await pool.query("select created_at from companies where entity_id = $1", [companyEid]);
    if (!c.rowCount) throw new EconomyError("not a registered company");
    const ageDays = (Date.now() - new Date(c.rows[0].created_at).getTime()) / 86_400_000;
    const fin = await pool.query(
      `select
         coalesce(sum(case when a_to.entity_id = $1 and l.category in ('retail_sale','trade','rent')
             and l.reason not like 'trade % s:%' then l.amount else 0 end), 0) as revenue,
         coalesce(sum(case when a_to.entity_id = $1 and l.category not in ('transfer','ipo','dividend')
             and l.reason not like 'trade % s:%' then l.amount else 0 end), 0)
           - coalesce(sum(case when a_from.entity_id = $1 and l.category not in ('transfer','ipo','dividend')
             and l.reason not like 'trade % s:%' then l.amount else 0 end), 0) as profit
         from ledger l
         left join accounts a_to on a_to.id = l.to_account
         left join accounts a_from on a_from.id = l.from_account
        where (a_to.entity_id = $1 or a_from.entity_id = $1) and l.ts > now() - interval '7 days'`,
      [companyEid]
    );
    const revenue7d = Number(fin.rows[0].revenue);
    const profit7d = Number(fin.rows[0].profit);
    const bld = await pool.query(
      "select count(*) as n from lots where owner_entity_id = $1",
      [companyEid]
    );
    const emp = await pool.query(
      `select count(n.entity_id) as n from job_listings jl join npcs n on n.listing_id = jl.id
        where jl.employer_entity = $1`,
      [companyEid]
    );
    const gate = ipoEligible({
      ageDays,
      revenue7d,
      profit7d,
      buildings: Number(bld.rows[0].n),
      employees: Number(emp.rows[0].n),
    });
    if (gate) throw new EconomyError(`IPO blocked: ${gate}`);
    const band = ipoPriceBand(profit7d, sharesOutstanding);
    if (price < band.min || price > band.max)
      throw new EconomyError(`IPO price must be in the valuation band $${band.min}–$${band.max}`);

    const floatShares = Math.round(sharesOutstanding * floatPct);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await transfer(client, companyEid, CITY_ENTITY, IPO_AUDIT_FEE, "fee", "IPO audit");
      await client.query(
        `insert into stocks (company_entity, shares_outstanding, float_shares, ipo_price)
         values ($1,$2,$3,$4)`,
        [companyEid, sharesOutstanding, floatShares, price]
      );
      // founder keeps the non-float; float belongs to the company and rests
      // as a sell order — proceeds land in company cash as it fills
      await SHARE_HOOKS.deliver(client, eid, stockKey(companyEid), sharesOutstanding - floatShares);
      await SHARE_HOOKS.deliver(client, companyEid, stockKey(companyEid), floatShares);
      await placeOrder(client, {
        assetType: "stock",
        assetKey: stockKey(companyEid),
        label: `${await this.companyName(companyEid)} shares`,
        eid: companyEid,
        side: "sell",
        qty: floatShares,
        price,
        feeRate: STOCK_FEE_RATE,
        hooks: SHARE_HOOKS,
      });
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    await this.refreshControl(companyEid);
    return { floatShares, band };
  }

  async setDividend(eid: number, companyEid: number, ratio: number) {
    if (!this.companies.controls(eid, companyEid)) throw new EconomyError("not your company");
    if (!(ratio >= 0 && ratio <= 1)) throw new EconomyError("ratio must be 0–1");
    const upd = await pool.query(
      "update stocks set dividend_ratio = $2 where company_entity = $1",
      [companyEid, Math.round(ratio * 1000) / 1000]
    );
    if (!upd.rowCount) throw new EconomyError("not a listed company");
  }

  // daily close: roll prev_close, lift halts, count the pay period down.
  // Every DIVIDEND_PERIOD_DAYS-th day is pay day: the declared per-share
  // rate targets the policy's annual yield on the share price (1-7% for
  // income names, like real markets), then every holder gets paid.
  async runDay(): Promise<void> {
    const stocks = await pool.query("select * from stocks", []);
    for (const s of stocks.rows) {
      const companyEid = Number(s.company_entity);
      try {
        const last = await pool.query(
          `select price from trades where world_id = $1 and asset_type = 'stock' and item = $2
            order by ts desc limit 1`,
          [WORLD_ID, stockKey(companyEid)]
        );
        const close = last.rowCount ? Number(last.rows[0].price) : (s.prev_close !== null ? Number(s.prev_close) : Number(s.ipo_price));
        const days = Number(s.pay_day_counter) + 1;
        await pool.query(
          "update stocks set prev_close = $2, halted_until = null, pay_day_counter = $3 where company_entity = $1",
          [companyEid, close, days]
        );
        if (days < DIVIDEND_PERIOD_DAYS) continue;

        // pay day: the declared rate targets the policy's annual yield on
        // the current share price, paid from company cash
        const cashRow = await pool.query(
          "select balance from accounts where entity_id = $1 and currency = 'clean'",
          [companyEid]
        );
        const cash = Number(cashRow.rows[0]?.balance ?? 0);
        const prof = await pool.query(
          `select
             coalesce(sum(case when a_to.entity_id = $1 then l.amount else 0 end), 0)
               - coalesce(sum(case when a_from.entity_id = $1 then l.amount else 0 end), 0) as profit
             from ledger l
             left join accounts a_to on a_to.id = l.to_account
             left join accounts a_from on a_from.id = l.from_account
            where (a_to.entity_id = $1 or a_from.entity_id = $1) and l.currency = 'clean'
              and l.category not in ('transfer','ipo','dividend','land','construction','furniture','demolition','production_setup')
              and l.reason not like 'trade % s:%'
              and l.ts > coalesce($2::timestamptz, now() - make_interval(mins => $3))`,
          [companyEid, s.last_pay, DIVIDEND_PERIOD_DAYS * 10]
        );
        const profit = Number(prof.rows[0].profit);

        // Dividend POLICY is a board decision, and NPC boards decide both
        // ways: a payer ground down to nothing by losses may suspend
        // entirely; a profitable growth name sitting on cash may initiate.
        // Player-founded companies keep their own hands on this lever.
        let ratio = Number(s.dividend_ratio);
        const npcRow = await pool.query("select npc_operated from companies where entity_id = $1", [companyEid]);
        if (npcRow.rows[0]?.npc_operated) {
          if (ratio > 0 && profit < 0 && Number(s.dps) < 0.0005 && Math.random() < 0.3) {
            ratio = 0;
            await pool.query("update stocks set dividend_ratio = 0 where company_entity = $1", [companyEid]);
            console.log(`[stocks] company ${companyEid} SUSPENDS its dividend after sustained losses`);
          } else if (ratio === 0 && profit > 0 && cash > 100_000 && Math.random() < 0.12) {
            ratio = Math.round((0.01 + Math.random() * 0.03) * 200) / 200;
            await pool.query("update stocks set dividend_ratio = $2 where company_entity = $1", [companyEid, ratio]);
            console.log(`[stocks] company ${companyEid} INITIATES a dividend at ${(ratio * 100).toFixed(1)}%/yr`);
          }
        }

        let dps = declaredDps(ratio, close, Number(s.dps), cash, Number(s.shares_outstanding));
        // the classic income-stock headline: a company that lost money all
        // period CUTS. The rate halves until operations earn again.
        if (profit < 0 && Number(s.dps) > 0) {
          dps = Math.floor(Number(s.dps) * 0.5 * 1_000_000) / 1_000_000;
          console.log(`[stocks] dividend cut: company ${companyEid} halves to ${dps}/sh after an unprofitable period`);
        }
        await pool.query(
          "update stocks set dps = $2, last_pay = now(), pay_day_counter = 0 where company_entity = $1",
          [companyEid, dps]
        );
        if (dps <= 0) continue;
        const holders = await pool.query(
          "select holder_entity, shares from share_holdings where company_entity = $1 and shares > 0 and holder_entity <> $1",
          [companyEid]
        );
        const client = await pool.connect();
        try {
          await client.query("begin");
          for (const h of holders.rows) {
            const amt = Math.round(dps * Number(h.shares) * 100) / 100;
            if (amt > 0)
              await transfer(client, companyEid, Number(h.holder_entity), amt, "dividend", `dividend ${stockKey(companyEid)}`);
          }
          await client.query("commit");
        } catch (err) {
          await client.query("rollback");
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        console.error("[stocks] day close failed for", companyEid, err);
      }
    }
  }
}
