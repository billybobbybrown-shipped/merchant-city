import { PoolClient } from "pg";
import { EconomyError } from "./errors.js";
import { CITY_ENTITY, transfer } from "./accounts.js";

const WORLD_ID = 1;

export type AssetType = "item" | "stock" | "coin";

// Asset-class hooks: how the thing being traded is escrowed and delivered.
// Cash legs (clean only), fees, price-time priority, self-cross handling and
// resting-buyer voiding are identical for every asset class.
export interface AssetHooks {
  // move qty of the asset out of the seller before the order can rest/match
  escrowSell(c: PoolClient, eid: number, assetKey: string, qty: number): Promise<void>;
  // hand qty of the asset to a buyer on fill
  deliver(c: PoolClient, eid: number, assetKey: string, qty: number): Promise<void>;
  // return escrowed qty on cancel
  refund(c: PoolClient, eid: number, assetKey: string, qty: number): Promise<void>;
  // buyer-side capacity/validity check before matching (bag room etc.)
  buyGuard?(c: PoolClient, eid: number, assetKey: string, qty: number, price: number): Promise<void>;
}

export interface MatchResult {
  filled: number;
  rested: number;
  avgPrice: number | null;
  cash: Map<number, number>;
  touched: Set<number>; // entities whose asset holdings changed
  notes: Array<{ eid: number; msg: string }>;
}

const MAX_OPEN_ORDERS = 20;

// Generic price-time-priority matcher over the shared orders table. Runs
// inside its own transaction; commits on success.
export async function placeOrder(
  c: PoolClient,
  opts: {
    assetType: AssetType;
    assetKey: string;
    label: string;
    eid: number;
    side: "buy" | "sell";
    qty: number;
    price: number;
    feeRate: number;
    hooks: AssetHooks;
    market?: boolean; // fill what the book offers, never rest a remainder
  }
): Promise<MatchResult> {
  const { assetType, assetKey, label, eid, side, qty, price, feeRate, hooks, market } = opts;

  const open = await c.query(
    "select count(*) as n from orders where world_id = $1 and owner_entity = $2",
    [WORLD_ID, eid]
  );
  if (Number(open.rows[0].n) >= MAX_OPEN_ORDERS) throw new EconomyError("too many open orders");

  if (side === "sell") await hooks.escrowSell(c, eid, assetKey, qty);
  else if (!market) {
    // limit buys prove they can cover the full order up front; market buys
    // are guarded per fill by the transfer itself
    const bal = await c.query(
      "select balance from accounts where entity_id = $1 and currency = 'clean'",
      [eid]
    );
    if (Number(bal.rows[0]?.balance ?? 0) < qty * price)
      throw new EconomyError("not enough cash for that order");
    if (hooks.buyGuard) await hooks.buyGuard(c, eid, assetKey, qty, price);
  } else if (hooks.buyGuard) await hooks.buyGuard(c, eid, assetKey, qty, price);

  const cash = new Map<number, number>();
  const touched = new Set<number>([eid]);
  const notes: Array<{ eid: number; msg: string }> = [];
  let filled = 0;
  let notionalSum = 0;
  let remaining = qty;

  while (remaining > 0) {
    const opp = await c.query(
      side === "sell"
        ? `select id, owner_entity, qty, price from orders
            where world_id = $1 and asset_type = $2 and item = $3 and side = 'buy' and price >= $4
            order by price desc, created_at asc limit 1 for update`
        : `select id, owner_entity, qty, price from orders
            where world_id = $1 and asset_type = $2 and item = $3 and side = 'sell' and price <= $4
            order by price asc, created_at asc limit 1 for update`,
      [WORLD_ID, assetType, assetKey, price]
    );
    if (!opp.rowCount) break;
    const o = opp.rows[0];
    if (Number(o.owner_entity) === eid) break; // self-cross: rest behind our own order

    const fill = Math.min(remaining, Number(o.qty));
    const px = Number(o.price);
    const notional = Math.round(fill * px * 100) / 100;
    const fee = Math.round(notional * feeRate * 100) / 100;
    const buyer = side === "sell" ? Number(o.owner_entity) : eid;
    const seller = side === "sell" ? eid : Number(o.owner_entity);

    try {
      const bal = await transfer(c, buyer, seller, notional - fee, "trade", `trade ${fill} ${assetKey} @ ${px}`);
      cash.set(buyer, bal.from);
      cash.set(seller, bal.to);
      if (fee > 0) {
        const feeBal = await transfer(c, buyer, CITY_ENTITY, fee, "fee", `exchange fee ${assetKey}`);
        cash.set(buyer, feeBal.from);
      }
    } catch (err) {
      if (err instanceof EconomyError && side === "sell") {
        // resting buyer can no longer pay — void their order and move on
        await c.query("delete from orders where id = $1", [o.id]);
        notes.push({ eid: Number(o.owner_entity), msg: "Buy order voided (insufficient cash)" });
        continue;
      }
      throw err;
    }

    await hooks.deliver(c, buyer, assetKey, fill);
    touched.add(buyer);
    touched.add(seller);

    if (fill >= Number(o.qty)) await c.query("delete from orders where id = $1", [o.id]);
    else await c.query("update orders set qty = qty - $2 where id = $1", [o.id, fill]);

    await c.query(
      `insert into trades (world_id, asset_type, item, qty, price, buyer_entity, seller_entity)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [WORLD_ID, assetType, assetKey, fill, px, buyer, seller]
    );

    notes.push({ eid: buyer, msg: `Bought ${fill} ${label} @ $${px}` });
    notes.push({ eid: seller, msg: `Sold ${fill} ${label} @ $${px}` });
    remaining -= fill;
    filled += fill;
    notionalSum += notional;
  }

  if (remaining > 0) {
    if (market) {
      // market orders never rest — hand back the unfilled escrow
      if (side === "sell") await hooks.refund(c, eid, assetKey, remaining);
    } else {
      await c.query(
        `insert into orders (world_id, owner_entity, asset_type, side, item, qty, price)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [WORLD_ID, eid, assetType, side, assetKey, remaining, price]
      );
    }
  }
  if (market && filled === 0) throw new EconomyError("no liquidity right now — try again shortly");

  return {
    filled,
    rested: remaining,
    avgPrice: filled > 0 ? Math.round((notionalSum / filled) * 100) / 100 : null,
    cash,
    touched,
    notes,
  };
}

export async function cancelOrder(
  c: PoolClient,
  eid: number,
  orderId: number,
  hooks: AssetHooks
): Promise<{ side: "buy" | "sell"; assetKey: string; qty: number }> {
  const del = await c.query(
    `delete from orders where id = $1 and world_id = $2 and owner_entity = $3
     returning side, item, qty`,
    [orderId, WORLD_ID, eid]
  );
  if (!del.rowCount) throw new EconomyError("no such order");
  const o = del.rows[0];
  if (o.side === "sell") await hooks.refund(c, eid, o.item, Number(o.qty));
  return { side: o.side, assetKey: o.item, qty: Number(o.qty) };
}
