import {
  DOCK_BUILD_COST,
  DOCK_CAPACITY,
  HAULER_CAPACITY,
  MANAGER_CAPACITY,
  itemById,
  sourceByType,
  sourceWorkerRole,
} from "@mc/shared";
import { pool } from "./db.js";
import { EconomyError } from "./errors.js";
import { CITY_ENTITY, transfer } from "./accounts.js";
import { LotStore } from "./lots.js";
import { GoodsStore } from "./goods.js";
import { registry } from "./registry.js";
import type { WorkforceStore } from "./workforce.js";

const WORLD_ID = 1;

export interface DockLine {
  id: number;
  lotId: number;
  direction: "in" | "out";
  item: string;
  perMin: number;
  partnerLot: number;
}

export interface DockView {
  lotId: number;
  // what this property can actually put on a truck: its storage, plus whatever
  // its field or mine yields
  onHand: Record<string, number>;
  produces: string | null;
  held: number; // everything the property holds, pallets included
  storeCapacity: number; // all the storage the owner has built here
  stock: Record<string, number>;
  capacity: number;
  lines: DockLine[];
  // the far end of arrangements set up on another property's bay
  mirrored: Array<{ id: number; direction: string; item: string; perMin: number; partnerLot: number }>;
  haulers: number;
  managers: number;
}

// The delivery space: a loading bay on a plot. Goods cross the property line
// here and nowhere else.
//   hauler  — carries between the bays of two properties
//   manager — walks goods between the bay and the storage racks beside it
// Both run once per game day, so a supply chain keeps working while its owner
// is logged out.
export class LogisticsStore {
  acting: (actor: number) => Set<number> = (a) => new Set([a]);
  workforce?: WorkforceStore;
  companies?: { principalsOf(eid: number): Set<number> };

  constructor(
    private lots: LotStore,
    private goods: GoodsStore
  ) {}

  private operates(entity: number, lotId: number): boolean {
    return this.lots.ownsLot(entity, lotId) || this.lots.isTenant(entity, lotId);
  }

  private canUse(actor: number, lotId: number): number {
    for (const e of this.acting(actor)) if (this.operates(e, lotId)) return e;
    throw new EconomyError("that property isn't yours");
  }

  // ---- the bay ----

  async build(actor: number, lotId: number, cellX = 0, cellY = 0): Promise<void> {
    const payer = this.canUse(actor, lotId);
    const existing = await pool.query("select 1 from docks where lot_id = $1", [lotId]);
    if (existing.rowCount) throw new EconomyError("this plot already has a delivery space");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await transfer(client, payer, CITY_ENTITY, DOCK_BUILD_COST, "construction", `delivery space lot ${lotId}`);
      await client.query(
        "insert into docks (lot_id, world_id, cell_x, cell_y) values ($1,$2,$3,$4)",
        [lotId, WORLD_ID, Math.max(0, Math.round(cellX)), Math.max(0, Math.round(cellY))]
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
    registry.broadcast("dockChanged", { lotId });
  }

  // every bay in the world with how full it is — the client draws the pad and
  // stacks boxes on it from this
  async all(): Promise<Array<{ lotId: number; x: number; y: number; fill: number }>> {
    const r = await pool.query(
      `select d.lot_id, d.cell_x, d.cell_y,
              coalesce((select sum(i.qty) from inventories i
                         where i.world_id = d.world_id and i.holder_type = 'dock'
                           and i.holder_id = d.lot_id::text), 0) as stock
         from docks d where d.world_id = $1 and d.indoor = false`,
      [WORLD_ID]
    );
    return r.rows.map((row) => ({
      lotId: Number(row.lot_id),
      x: Number(row.cell_x),
      y: Number(row.cell_y),
      fill: Math.max(0, Math.min(1, Number(row.stock) / DOCK_CAPACITY)),
    }));
  }

  async view(lotId: number): Promise<DockView | null> {
    const d = await pool.query("select 1 from docks where lot_id = $1", [lotId]);
    if (!d.rowCount) return null;
    const lines = await pool.query(
      "select id, lot_id, direction, item, per_min, partner_lot from dock_lines where lot_id = $1 order by direction, id",
      [lotId]
    );
    // The other half of every arrangement set up at the far end: goods another
    // property ships here, and goods another property collects from here. You
    // never have to mirror a shipment by hand — it shows up on both bays.
    const mirrored = await pool.query(
      "select id, lot_id, direction, item, per_min from dock_lines where partner_lot = $1 order by direction, id",
      [lotId]
    );
    const staff = await pool.query(
      "select job_role, count(*) as n from npcs where employer_lot = $1 group by job_role",
      [lotId]
    );
    const roleCount = (r: string) => Number(staff.rows.find((x) => x.job_role === r)?.n ?? 0);
    const srcType = this.lots.get(lotId)?.source?.type;
    return {
      lotId,
      onHand: await this.goods.inventory("lot", String(lotId)),
      produces: srcType ? sourceByType(srcType)?.item ?? null : null,
      held: await this.goods.lotHeld(lotId),
      storeCapacity: await this.goods.lotCapacity(lotId),
      stock: await this.goods.inventory("dock", String(lotId)),
      capacity: DOCK_CAPACITY,
      lines: lines.rows.map((row) => ({
        id: Number(row.id),
        lotId: row.lot_id,
        direction: row.direction,
        item: row.item,
        perMin: Number(row.per_min),
        partnerLot: row.partner_lot,
      })),
      // set up elsewhere, shown here so the bay reads as one arrangement
      mirrored: mirrored.rows.map((row) => ({
        id: Number(row.id),
        // an 'out' line elsewhere pointing here means goods arrive here
        direction: row.direction === "out" ? "in" : "out",
        item: row.item,
        perMin: Number(row.per_min),
        partnerLot: Number(row.lot_id),
      })),
      haulers: await this.fleetFor(lotId),
      managers: await this.stagingCrew(lotId),
    };
  }

  // drivers available to this plot's operator — haulers you hired yourself
  // also drive for the companies you control
  private async fleetOf(owner: number): Promise<number> {
    if (!this.workforce) return 0;
    const principals = this.companies ? this.companies.principalsOf(owner) : new Set([owner]);
    return this.workforce.haulerCount([...principals]);
  }

  private async fleetFor(lotId: number): Promise<number> {
    const owner = this.ownerOf(lotId);
    return owner === null ? 0 : this.fleetOf(owner);
  }

  // ---- shipping instructions ----

  async addLine(
    actor: number,
    lotId: number,
    direction: string,
    item: string,
    perMin: number,
    partnerLot: number
  ): Promise<void> {
    this.canUse(actor, lotId);
    if (direction !== "in" && direction !== "out") throw new EconomyError("bad direction");
    if (!itemById(item)) throw new EconomyError("unknown item");
    if (!Number.isInteger(perMin) || perMin < 1 || perMin > 500) throw new EconomyError("bad amount");
    if (partnerLot === lotId) throw new EconomyError("pick a different property");
    // you may ship between anything you control — your own plots and those
    // held by your companies
    this.canUse(actor, partnerLot);
    // the far end needs a bay of its own to load from or unload into
    const partner = await pool.query("select 1 from docks where lot_id = $1", [partnerLot]);
    if (!partner.rowCount) throw new EconomyError("the other property needs a delivery space too");
    await pool.query(
      `insert into dock_lines (world_id, lot_id, direction, item, per_min, partner_lot)
       values ($1,$2,$3,$4,$5,$6)`,
      [WORLD_ID, lotId, direction, item, perMin, partnerLot]
    );
    registry.broadcast("dockChanged", { lotId });
  }

  async removeLine(actor: number, lineId: number): Promise<void> {
    const r = await pool.query("select lot_id from dock_lines where id = $1", [lineId]);
    if (!r.rowCount) throw new EconomyError("no such shipment");
    this.canUse(actor, r.rows[0].lot_id);
    await pool.query("delete from dock_lines where id = $1", [lineId]);
    registry.broadcast("dockChanged", { lotId: r.rows[0].lot_id });
  }

  // ---- movement helpers ----

  private async held(holder: "lot" | "dock", id: number, item: string): Promise<number> {
    const inv = await this.goods.inventory(holder, String(id));
    return inv[item] ?? 0;
  }

  private async total(holder: "lot" | "dock", id: number): Promise<number> {
    const inv = await this.goods.inventory(holder, String(id));
    return Object.values(inv).reduce((a, b) => a + b, 0);
  }

  // atomic hand-off between any two holders
  private async add(to: { holder: string; id: number }, item: string, qty: number): Promise<void> {
    if (qty <= 0) return;
    await pool.query(
      `insert into inventories (world_id, holder_type, holder_id, item, qty)
       values ($1,$2,$3,$4,$5)
       on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + $5`,
      [WORLD_ID, to.holder, String(to.id), item, qty]
    );
  }

  private async take(from: { holder: string; id: number }, item: string, qty: number): Promise<boolean> {
    if (qty <= 0) return false;
    const r = await pool.query(
      `update inventories set qty = qty - $4
        where world_id = $1 and holder_type = $2 and holder_id = $3 and item = $5 and qty >= $4`,
      [WORLD_ID, from.holder, String(from.id), qty, item]
    );
    return !!r.rowCount;
  }

  private async move(
    from: { holder: string; id: number },
    to: { holder: string; id: number },
    item: string,
    qty: number
  ): Promise<boolean> {
    if (qty <= 0) return false;
    const client = await pool.connect();
    try {
      await client.query("begin");
      const take = await client.query(
        `update inventories set qty = qty - $4
          where world_id = $1 and holder_type = $2 and holder_id = $3 and item = $5 and qty >= $4`,
        [WORLD_ID, from.holder, String(from.id), qty, item]
      );
      if (!take.rowCount) throw new EconomyError("stock moved");
      await client.query(
        `insert into inventories (world_id, holder_type, holder_id, item, qty)
         values ($1,$2,$3,$4,$5)
         on conflict (world_id, holder_type, holder_id, item) do update set qty = inventories.qty + $5`,
        [WORLD_ID, to.holder, String(to.id), item, qty]
      );
      await client.query("commit");
      return true;
    } catch (err) {
      await client.query("rollback");
      if (!(err instanceof EconomyError)) throw err;
      return false;
    } finally {
      client.release();
    }
  }

  // ---- the daily run ----

  // Deliveries run every minute of real time, not once a game day: goods
  // trickle along a route continuously instead of teleporting in one lump.
  async runMinute(): Promise<void> {
    const docks = await pool.query("select lot_id from docks where world_id = $1", [WORLD_ID]);
    const touched = new Set<number>();

    // 1. managers stage outbound goods from the racks into the bay
    for (const d of docks.rows) await this.stageOutbound(Number(d.lot_id), touched);
    // 2. the fleet runs every route its employer has, sharing one day's
    //    carrying capacity across them
    const budgets = new Map<number, number>();
    for (const d of docks.rows) {
      const owner = this.ownerOf(Number(d.lot_id));
      if (owner === null || budgets.has(owner)) continue;
      const drivers = await this.fleetOf(owner);
      budgets.set(owner, drivers * HAULER_CAPACITY);
    }
    for (const d of docks.rows) await this.haul(Number(d.lot_id), touched, budgets);
    // 3. managers put whatever arrived away into the racks
    for (const d of docks.rows) await this.storeInbound(Number(d.lot_id), touched);

    for (const lot of touched) {
      registry.broadcast("lotInvChanged", { lotId: lot });
      registry.broadcast("dockChanged", { lotId: lot });
    }
  }

  private async staff(lotId: number, role: string): Promise<number> {
    const r = await pool.query(
      "select count(*) as n from npcs where employer_lot = $1 and job_role = $2",
      [lotId, role]
    );
    return Number(r.rows[0].n);
  }

  // Who can load this bay. Managers walk goods between the racks and the bay;
  // on a production site there are no racks and no manager, so the people
  // already working the land — farmers, miners — load the day's harvest
  // onto the pallets themselves.
  private async stagingCrew(lotId: number): Promise<number> {
    const managers = await this.staff(lotId, "manager");
    const srcType = this.lots.get(lotId)?.source?.type;
    if (!srcType) return managers;
    return managers + (await this.staff(lotId, sourceWorkerRole(srcType)));
  }

  // racks (or the field) -> bay, for everything this property ships out
  private async stageOutbound(lotId: number, touched: Set<number>) {
    const crew = await this.stagingCrew(lotId);
    if (!crew) return;
    // with no racks the goods are already on the pallets — there is nothing to
    // carry, and pretending otherwise would burn the crew's day for nothing
    if (!(await this.goods.stores(lotId)).length) return;
    let budget = crew * MANAGER_CAPACITY;
    const lines = await pool.query(
      "select item, per_min from dock_lines where lot_id = $1 and direction = 'out'",
      [lotId]
    );
    for (const l of lines.rows) {
      if (budget <= 0) break;
      const inBay = await this.held("dock", lotId, l.item);
      const want = Math.max(0, Number(l.per_min) - inBay);
      const room = DOCK_CAPACITY - (await this.total("dock", lotId));
      const inStore = (await this.goods.inventory("lot", String(lotId)))[l.item] ?? 0;
      const qty = Math.min(want, budget, room, inStore);
      if (qty > 0 && (await this.goods.takeFromProperty(lotId, l.item, qty))) {
        await this.add({ holder: "dock", id: lotId }, l.item, qty);
        budget -= qty;
        touched.add(lotId);
      }
    }
  }

  // which entity runs this plot — the fleet is theirs
  private ownerOf(lotId: number): number | null {
    return this.lots.operatorOf(lotId);
  }

  // bay -> bay, carried by the employer's fleet out of a shared daily budget
  private async haul(lotId: number, touched: Set<number>, budgets: Map<number, number>) {
    const owner = this.ownerOf(lotId);
    if (owner === null) return;
    let budget = budgets.get(owner) ?? 0;
    if (budget <= 0) return;
    const lines = await pool.query(
      "select direction, item, per_min, partner_lot from dock_lines where lot_id = $1 order by direction desc",
      [lotId]
    );
    for (const l of lines.rows) {
      if (budget <= 0) break;
      // 'out' pushes from here to them, 'in' pulls from them to here
      const src = l.direction === "out" ? lotId : Number(l.partner_lot);
      const dst = l.direction === "out" ? Number(l.partner_lot) : lotId;
      // the receiving property has to have room for it — pallets and racks
      // together are all the storage it has
      const room = Math.min(
        DOCK_CAPACITY - (await this.total("dock", dst)),
        (await this.goods.lotCapacity(dst)) - (await this.goods.lotHeld(dst))
      );
      const qty = Math.min(Number(l.per_min), budget, room, await this.held("dock", src, l.item));
      if (qty > 0 && (await this.move({ holder: "dock", id: src }, { holder: "dock", id: dst }, l.item, qty))) {
        budget -= qty;
        touched.add(src);
        touched.add(dst);
      }
    }
    budgets.set(owner, budget);
  }

  // bay -> racks, so arrivals don't clog the loading area
  private async storeInbound(lotId: number, touched: Set<number>) {
    const crew = await this.stagingCrew(lotId);
    if (!crew) return;
    // nothing to put goods away into: on a property with no racks the pallets
    // are the storage, so arrivals simply stay where they landed
    if (!(await this.goods.stores(lotId)).length) return;
    let budget = crew * MANAGER_CAPACITY;
    const outbound = await pool.query(
      "select item from dock_lines where lot_id = $1 and direction = 'out'",
      [lotId]
    );
    const shipping = new Set(outbound.rows.map((r) => r.item));
    const bay = await this.goods.inventory("dock", String(lotId));
    for (const [item, qty] of Object.entries(bay)) {
      if (budget <= 0) break;
      if (shipping.has(item)) continue; // waiting to be collected, leave it
      const move = Math.min(qty, budget);
      const room = (await this.goods.lotCapacity(lotId)) - (await this.goods.lotHeld(lotId));
      const put = Math.min(move, Math.max(0, room));
      if (put > 0 && (await this.take({ holder: "dock", id: lotId }, item, put))) {
        await this.goods.putIntoProperty(lotId, item, put);
        budget -= put;
        touched.add(lotId);
      }
    }
  }
}
