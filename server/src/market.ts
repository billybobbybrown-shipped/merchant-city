import { PoolClient } from "pg";
import { itemById, POCKET_SLOTS, fitsPocket, stackLimit, permitFor } from "@mc/shared";
import { pool } from "./db.js";
import { EconomyError } from "./errors.js";
import { placeOrder, cancelOrder } from "./orderbook.js";
import type { PermitsStore } from "./permits.js";

const WORLD_ID = 1;
const FEE_RATE = 0.01; // 1% of notional, paid by the seller — a money sink
const MAX_OPEN_ORDERS = 20;

export interface BookLevel {
  price: number;
  qty: number;
}

export interface OrderRow {
  id: number;
  side: "buy" | "sell";
  item: string;
  qty: number;
  price: number;
}

// The commodity exchange: an order-book market over player pockets.
// Sells escrow items at placement; buys pay at fill time (price-time priority,
// fills at the resting order's price). Every placement matches inside ONE
// Postgres transaction — money and goods move atomically or not at all.
export class MarketStore {
  permits?: PermitsStore; // wired at boot

  // ---- reads ----

  async summary(): Promise<
    Array<{ item: string; last: number | null; bid: number | null; ask: number | null; dayVol: number }>
  > {
    const last = await pool.query(
      `select distinct on (item) item, price from trades where world_id = $1 and asset_type = 'item' order by item, ts desc`,
      [WORLD_ID]
    );
    const best = await pool.query(
      `select item, side, case when side = 'buy' then max(price) else min(price) end as px
         from orders where world_id = $1 and asset_type = 'item' group by item, side`,
      [WORLD_ID]
    );
    const vol = await pool.query(
      `select item, coalesce(sum(qty), 0) as v from trades
        where world_id = $1 and asset_type = 'item' and ts > now() - interval '10 minutes' group by item`,
      [WORLD_ID]
    );
    const out = new Map<string, { item: string; last: number | null; bid: number | null; ask: number | null; dayVol: number }>();
    const get = (item: string) => {
      if (!out.has(item)) out.set(item, { item, last: null, bid: null, ask: null, dayVol: 0 });
      return out.get(item)!;
    };
    for (const r of last.rows) get(r.item).last = Number(r.price);
    for (const r of best.rows) {
      if (r.side === "buy") get(r.item).bid = Number(r.px);
      else get(r.item).ask = Number(r.px);
    }
    for (const r of vol.rows) get(r.item).dayVol = Number(r.v);
    return [...out.values()];
  }

  async book(item: string): Promise<{ bids: BookLevel[]; asks: BookLevel[]; trades: Array<{ price: number; qty: number; ts: number }> }> {
    const bids = await pool.query(
      `select price, sum(qty) as qty from orders
        where world_id = $1 and item = $2 and side = 'buy'
        group by price order by price desc limit 8`,
      [WORLD_ID, item]
    );
    const asks = await pool.query(
      `select price, sum(qty) as qty from orders
        where world_id = $1 and item = $2 and side = 'sell'
        group by price order by price asc limit 8`,
      [WORLD_ID, item]
    );
    const trades = await pool.query(
      `select price, qty, extract(epoch from ts) * 1000 as ts from trades
        where world_id = $1 and item = $2 order by ts desc limit 12`,
      [WORLD_ID, item]
    );
    return {
      bids: bids.rows.map((r) => ({ price: Number(r.price), qty: Number(r.qty) })),
      asks: asks.rows.map((r) => ({ price: Number(r.price), qty: Number(r.qty) })),
      trades: trades.rows.map((r) => ({ price: Number(r.price), qty: Number(r.qty), ts: Number(r.ts) })),
    };
  }

  async myOrders(eid: number): Promise<OrderRow[]> {
    const r = await pool.query(
      `select id, side, item, qty, price from orders
        where world_id = $1 and owner_entity = $2 and asset_type = 'item' order by created_at desc`,
      [WORLD_ID, eid]
    );
    return r.rows.map((row) => ({
      id: Number(row.id),
      side: row.side,
      item: row.item,
      qty: Number(row.qty),
      price: Number(row.price),
    }));
  }

  // candles bucketed by minutes (1 = intraday, 10 = one game day per candle)
  async history(item: string, bucketMin: number): Promise<Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>> {
    const r = await pool.query(
      `select floor(extract(epoch from ts) / ($3 * 60)) as bucket,
              (array_agg(price order by ts asc))[1] as o,
              max(price) as h, min(price) as l,
              (array_agg(price order by ts desc))[1] as c,
              sum(qty) as v
         from trades where world_id = $1 and item = $2 and ts > now() - interval '48 hours'
        group by bucket order by bucket asc`,
      [WORLD_ID, item, bucketMin]
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

  // ---- placement + matching ----

  // Buy at the going rate, right now, for something the player is about to use
  // — a fixture they are placing, a component they are installing. It fills
  // against whatever is actually on offer and never rests; if nobody is
  // selling, it fails rather than conjuring the goods out of nothing.
  async buyNow(
    eid: number,
    item: string,
    qty: number
  ): Promise<{ filled: number; avgPrice: number | null; cash: Map<number, number>; notes: Array<{ eid: number; msg: string }> }> {
    if (!itemById(item)) throw new EconomyError("unknown item");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const r = await placeOrder(client, {
        assetType: "item",
        assetKey: item,
        label: itemById(item)?.label ?? item,
        eid,
        side: "buy",
        qty,
        price: 1_000_000,
        market: true,
        feeRate: FEE_RATE,
        hooks: ITEM_HOOKS,
      });
      if (r.filled < qty) {
        await client.query("rollback");
        throw new EconomyError(`nobody is selling ${itemById(item)?.label ?? item} right now`);
      }
      await client.query("commit");
      return { filled: r.filled, avgPrice: r.avgPrice, cash: r.cash, notes: r.notes };
    } catch (err) {
      await client.query("rollback").catch(() => {});
      // an empty book reads as a market failure; say what it means here
      if (err instanceof EconomyError && /liquidity/i.test(err.message))
        throw new EconomyError(`nobody is selling ${itemById(item)?.label ?? item} right now`);
      throw err;
    } finally {
      client.release();
    }
  }

  async place(
    eid: number,
    side: "buy" | "sell",
    item: string,
    qty: number,
    price: number
  ): Promise<{
    filled: number;
    rested: number;
    cash: Map<number, number>;
    pocketOf: number[]; // entities whose pockets changed
    notes: Array<{ eid: number; msg: string }>;
  }> {
    if (!itemById(item)) throw new EconomyError("unknown item");
    if (!Number.isInteger(qty) || qty < 1 || qty > 10_000) throw new EconomyError("bad quantity");
    price = Math.round(price * 100) / 100;
    if (!(price > 0) || price > 1_000_000) throw new EconomyError("bad price");
    // selling permitted goods through legal channels requires the permit
    if (side === "sell") {
      const cat = permitFor(item);
      if (cat && (!this.permits || !(await this.permits.has(eid, cat))))
        throw new EconomyError(`selling ${item} needs an active ${cat} permit`);
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const r = await placeOrder(client, {
        assetType: "item",
        assetKey: item,
        label: itemById(item)?.label ?? item,
        eid,
        side,
        qty,
        price,
        feeRate: FEE_RATE,
        hooks: ITEM_HOOKS,
      });
      await client.query("commit");
      return { filled: r.filled, rested: r.rested, cash: r.cash, pocketOf: [...r.touched], notes: r.notes };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async cancel(eid: number, orderId: number): Promise<{ pocketChanged: boolean }> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const o = await cancelOrder(client, eid, orderId, ITEM_HOOKS);
      await client.query("commit");
      return { pocketChanged: o.side === "sell" };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }
}

// item-asset hooks: escrow from / deliver to the entity's pocket inventory
const ITEM_HOOKS = {
  async escrowSell(c: PoolClient, eid: number, item: string, qty: number) {
    const take = await c.query(
      `update inventories set qty = qty - $4
        where world_id = $1 and holder_type = 'entity' and holder_id = $2 and item = $3 and qty >= $4`,
      [WORLD_ID, String(eid), item, qty]
    );
    if (!take.rowCount) throw new EconomyError("not enough items in your pocket");
  },
  async deliver(c: PoolClient, eid: number, item: string, qty: number) {
    await c.query(
      `insert into inventories (world_id, holder_type, holder_id, item, qty)
       values ($1,'entity',$2,$3,$4)
       on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + $4`,
      [WORLD_ID, String(eid), item, qty]
    );
  },
  async refund(c: PoolClient, eid: number, item: string, qty: number) {
    await ITEM_HOOKS.deliver(c, eid, item, qty);
  },
  // bag room for what we're buying (open buys count too): slot-based
  async buyGuard(c: PoolClient, eid: number, item: string, qty: number) {
    const pk = await c.query(
      `select item, qty from inventories
        where world_id = $1 and holder_type = 'entity' and holder_id = $2 and qty > 0`,
      [WORLD_ID, String(eid)]
    );
    const pending = await c.query(
      `select item, sum(qty) as n from orders
        where world_id = $1 and owner_entity = $2 and side = 'buy' and asset_type = 'item' group by item`,
      [WORLD_ID, eid]
    );
    const projected: Record<string, number> = {};
    for (const r of pk.rows) projected[r.item] = Number(r.qty);
    for (const r of pending.rows) projected[r.item] = (projected[r.item] ?? 0) + Number(r.n);
    if (!fitsPocket(projected, item, qty))
      throw new EconomyError(
        `no bag room for that buy (${POCKET_SLOTS} slots, ${stackLimit(item)} per stack, open buys count)`
      );
  },
};
