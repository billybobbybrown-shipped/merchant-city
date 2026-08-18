import { pool } from "./db.js";
import { EconomyError } from "./errors.js";
import { CITY_ENTITY, transfer } from "./accounts.js";
import { BASE_PRICE } from "@mc/shared";
import { LotStore } from "./lots.js";

export const REGISTRATION_FEE = 1000;

export interface CompanyRow {
  entityId: number;
  name: string;
  founder: number;
  share: number;
  cash: number;
}

// Registered companies: entities with their own accounts that can own lots,
// inventory, and staff. Control (>50% share) lets a player act as the company
// — resolved through controlSets, which LotStore consumes for ownership checks.
export class CompaniesStore {
  // company entity -> controller entities (share > 0.5)
  private controllers = new Map<number, Set<number>>();

  constructor(private lots: LotStore) {}

  async load(): Promise<void> {
    const r = await pool.query(
      `select o.owned_entity_id, o.owner_entity_id
         from entity_ownership o
         join companies c on c.entity_id = o.owned_entity_id
        where o.share > 0.5`
    );
    this.controllers.clear();
    for (const row of r.rows) {
      const owned = Number(row.owned_entity_id);
      if (!this.controllers.has(owned)) this.controllers.set(owned, new Set());
      this.controllers.get(owned)!.add(Number(row.owner_entity_id));
    }
  }

  controls(eid: number, companyEid: number): boolean {
    return this.controllers.get(companyEid)?.has(eid) ?? false;
  }

  // once a company lists, the stock market owns the control answer
  setControllers(companyEid: number, controllers: Set<number>): void {
    this.controllers.set(companyEid, controllers);
  }

  // eid plus whoever controls it, walking up the ownership chain — a company's
  // people are its owner's people too
  principalsOf(eid: number): Set<number> {
    const out = new Set([eid]);
    const queue = [eid];
    while (queue.length) {
      for (const owner of this.controllers.get(queue.pop()!) ?? []) {
        if (out.has(owner)) continue;
        out.add(owner);
        queue.push(owner);
      }
    }
    return out;
  }

  // all entities eid may act as (self + controlled companies)
  actingSet(eid: number): Set<number> {
    const out = new Set([eid]);
    for (const [company, ctrl] of this.controllers.entries()) if (ctrl.has(eid)) out.add(company);
    return out;
  }

  async form(founderEid: number, name: string): Promise<{ companyEid: number; cash: Map<number, number> }> {
    const clean = name.trim();
    if (clean.length < 3 || clean.length > 40) throw new EconomyError("name must be 3-40 characters");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const dup = await client.query("select 1 from companies where lower(registered_name) = lower($1)", [clean]);
      if (dup.rowCount) throw new EconomyError("that name is taken");
      const ent = await client.query(
        "insert into entities (kind, name, parent_entity_id) values ('company', $1, $2) returning id",
        [clean, founderEid]
      );
      const companyEid = Number(ent.rows[0].id);
      await client.query("insert into accounts (entity_id, currency, balance) values ($1, 'clean', 0)", [companyEid]);
      await client.query(
        "insert into companies (entity_id, founder_entity, registered_name) values ($1, $2, $3)",
        [companyEid, founderEid, clean]
      );
      await client.query(
        "insert into entity_ownership (owner_entity_id, owned_entity_id, share) values ($1, $2, 1)",
        [founderEid, companyEid]
      );
      const bal = await transfer(client, founderEid, CITY_ENTITY, REGISTRATION_FEE, "fee", `company registration: ${clean}`);
      await client.query("commit");
      if (!this.controllers.has(companyEid)) this.controllers.set(companyEid, new Set());
      this.controllers.get(companyEid)!.add(founderEid);
      return { companyEid, cash: new Map([[founderEid, bal.from]]) };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async mine(eid: number): Promise<CompanyRow[]> {
    const r = await pool.query(
      `select c.entity_id, c.registered_name, c.founder_entity, o.share,
              coalesce(a.balance, 0) as cash
         from entity_ownership o
         join companies c on c.entity_id = o.owned_entity_id
         left join accounts a on a.entity_id = c.entity_id and a.currency = 'clean'
        where o.owner_entity_id = $1
        order by c.created_at`,
      [eid]
    );
    return r.rows.map((row) => ({
      entityId: Number(row.entity_id),
      name: row.registered_name,
      founder: Number(row.founder_entity),
      share: Number(row.share),
      cash: Number(row.cash),
    }));
  }

  // deposit (amount > 0) or withdraw (amount < 0) clean cash
  async moveCash(eid: number, companyEid: number, amount: number): Promise<Map<number, number>> {
    if (!this.controls(eid, companyEid)) throw new EconomyError("not your company");
    if (!Number.isFinite(amount) || amount === 0) throw new EconomyError("bad amount");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const bal =
        amount > 0
          ? await transfer(client, eid, companyEid, amount, "transfer", "capital deposit")
          : await transfer(client, companyEid, eid, -amount, "transfer", "owner withdrawal");
      await client.query("commit");
      return new Map([[eid, amount > 0 ? bal.from : bal.to]]);
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  // move a lot between the player and a controlled company (no money moves)
  async transferLot(eid: number, companyEid: number, lotId: number, toCompany: boolean) {
    if (!this.controls(eid, companyEid)) throw new EconomyError("not your company");
    const from = toCompany ? eid : companyEid;
    const to = toCompany ? companyEid : eid;
    const st = this.lots.get(lotId);
    if (!st || st.ownerType === "city" || st.ownerId !== String(from))
      throw new EconomyError(toCompany ? "you don't own this lot" : "the company doesn't own this lot");
    const upd = await pool.query(
      "update lots set owner_entity_id = $1, for_sale = false, price = null where id = $2 and owner_entity_id = $3",
      [to, lotId, from]
    );
    if (!upd.rowCount) throw new EconomyError("lot state changed, try again");
    return this.lots.reassignOwner(lotId, to);
  }

  // daily P&L + balance sheet, derived entirely from ledger + holdings
  async financials(companyEid: number): Promise<{
    days: Array<{ day: string; inflow: Record<string, number>; outflow: Record<string, number> }>;
    cash: number;
    lots: Array<{ id: number; value: number }>;
    inventoryValue: number;
  }> {
    // buckets are GAME days (10 real minutes), labelled by their wall-clock
    // start — a calendar-day bucket is 144 game days and made every "per day"
    // figure read 144x too large. Dollars only: coin-denominated rows are a
    // different currency, not revenue.
    const led = await pool.query(
      `select floor(extract(epoch from l.ts) / 600) as bucket,
              to_char(to_timestamp(floor(extract(epoch from l.ts) / 600) * 600), 'HH24:MI') as day,
              case when l.reason like 'trade % s:%' then 'shares'
                   else coalesce(l.category, 'other') end as category,
              sum(case when a_to.entity_id = $1 then l.amount else 0 end) as inflow,
              sum(case when a_from.entity_id = $1 then l.amount else 0 end) as outflow
         from ledger l
         left join accounts a_to on a_to.id = l.to_account
         left join accounts a_from on a_from.id = l.from_account
        where (a_to.entity_id = $1 or a_from.entity_id = $1) and l.currency = 'clean'
        group by 1, 2, 3 order by 1 desc limit 400`,
      [companyEid]
    );
    const byDay = new Map<string, { label: string; inflow: Record<string, number>; outflow: Record<string, number> }>();
    for (const row of led.rows) {
      if (!byDay.has(row.bucket)) byDay.set(row.bucket, { label: row.day, inflow: {}, outflow: {} });
      const d = byDay.get(row.bucket)!;
      if (Number(row.inflow) > 0) d.inflow[row.category] = Number(row.inflow);
      if (Number(row.outflow) > 0) d.outflow[row.category] = Number(row.outflow);
    }
    const bal = await pool.query(
      "select coalesce(balance, 0) as b from accounts where entity_id = $1 and currency = 'clean'",
      [companyEid]
    );
    const lotRows = await pool.query("select id, value from lots where owner_entity_id = $1", [companyEid]);
    const inv = await pool.query(
      "select item, qty from inventories where holder_type = 'entity' and holder_id = $1",
      [String(companyEid)]
    );
    let inventoryValue = 0;
    for (const row of inv.rows) inventoryValue += Number(row.qty) * (BASE_PRICE[row.item] ?? 0);
    return {
      days: [...byDay.values()].map((v) => ({ day: v.label, inflow: v.inflow, outflow: v.outflow })),
      cash: bal.rowCount ? Number(bal.rows[0].b) : 0,
      lots: lotRows.rows.map((r) => ({ id: r.id, value: Number(r.value) })),
      inventoryValue: Math.round(inventoryValue * 100) / 100,
    };
  }
}
