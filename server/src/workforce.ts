import { pool } from "./db.js";
import { EconomyError } from "./errors.js";
import { LotStore } from "./lots.js";

const WORLD_ID = 1;

export type JobRole = "cashier" | "stocker" | "crafter" | "miner" | "farmer" | "hauler" | "manager";
export const JOB_ROLES: JobRole[] = ["cashier", "stocker", "crafter", "miner", "farmer", "hauler", "manager"];

export interface WorkerRow {
  eid: number;
  name: string;
  wage: number;
  lotId: number | null;
  role: JobRole | null;
}

export interface OfferRow {
  id: number;
  employer: number;
  wage: number;
  slots: number;
  assignLot: number | null;
  assignRole: JobRole | null;
}

// The workforce: employers post hire offers, citizens accept them on the job
// hunt, and hired workers are assigned (and freely reassigned) to any lot and
// role their employer operates. Staffing effects read the assignments.
export class WorkforceStore {
  // entities `actor` may act for — injected from the companies control map
  acting: (actor: number) => Set<number> = (a) => new Set([a]);
  // in-memory sim sync, wired at boot
  sync?: {
    applyEmployment(
      npcEid: number,
      emp: { employer: number | null; lotId: number | null; role: string | null; wage: number }
    ): void;
  };

  constructor(private lots: LotStore) {}

  private canActFor(actor: number, employer: number): boolean {
    return this.acting(actor).has(employer);
  }

  async postOffer(
    actor: number,
    employer: number,
    wage: number,
    slots: number,
    assignLot: number | null = null,
    assignRole: string | null = null
  ): Promise<void> {
    if (!this.canActFor(actor, employer)) throw new EconomyError("not your entity");
    if (!(wage > 0) || wage > 100_000) throw new EconomyError("bad wage");
    if (!Number.isInteger(slots) || slots < 1 || slots > 20) throw new EconomyError("bad slots");
    if (assignRole !== null && !JOB_ROLES.includes(assignRole as JobRole))
      throw new EconomyError("unknown role");
    if (assignLot !== null && this.lots.operatorOf(assignLot) !== employer)
      throw new EconomyError("that lot isn't on this employer's books");
    await pool.query(
      `insert into hire_offers (world_id, employer_entity, wage, slots, assign_lot, assign_role)
       values ($1,$2,$3,$4,$5,$6)`,
      [WORLD_ID, employer, wage, slots, assignLot, assignRole]
    );
  }

  async cancelOffer(actor: number, offerId: number): Promise<void> {
    const r = await pool.query("select employer_entity from hire_offers where id = $1", [offerId]);
    if (!r.rowCount) throw new EconomyError("no such offer");
    if (!this.canActFor(actor, Number(r.rows[0].employer_entity))) throw new EconomyError("not your offer");
    await pool.query("delete from hire_offers where id = $1", [offerId]);
  }

  // for the NPC job hunt
  async openOffers(): Promise<OfferRow[]> {
    const r = await pool.query("select * from hire_offers where world_id = $1 and slots > 0", [WORLD_ID]);
    return r.rows.map((row) => ({
      id: Number(row.id),
      employer: Number(row.employer_entity),
      wage: Number(row.wage),
      slots: row.slots,
      assignLot: row.assign_lot,
      assignRole: row.assign_role,
    }));
  }

  // a citizen took the offer: consume a slot. The last slot deletes the row —
  // decrementing to zero would violate the positive-slots constraint.
  async consumeOffer(offerId: number): Promise<void> {
    const del = await pool.query("delete from hire_offers where id = $1 and slots <= 1", [offerId]);
    if (!del.rowCount)
      await pool.query("update hire_offers set slots = slots - 1 where id = $1 and slots > 1", [offerId]);
  }

  // the whole payroll an actor manages: their own hires plus every worker
  // employed by a company they control
  async manageable(actor: number): Promise<{
    employers: Array<{ eid: number; name: string; kind: string; cash: number }>;
    workers: Array<WorkerRow & { employer: number; employerName: string }>;
    offers: Array<OfferRow & { employerName: string }>;
  }> {
    const ids = [...this.acting(actor)];
    const ents = await pool.query(
      `select e.id, e.name, e.kind, coalesce(a.balance, 0) as cash
         from entities e
         left join accounts a on a.entity_id = e.id and a.currency = 'clean'
        where e.id = any($1)`,
      [ids]
    );
    const nameOf = new Map(ents.rows.map((r) => [Number(r.id), r.name]));
    const workers = await pool.query(
      `select n.entity_id, e.name, n.wage, n.employer_lot, n.job_role, n.employer_entity
         from npcs n join entities e on e.id = n.entity_id
        where n.employer_entity = any($1) order by e.name`,
      [ids]
    );
    const offers = await pool.query(
      "select * from hire_offers where world_id = $1 and employer_entity = any($2) order by id",
      [WORLD_ID, ids]
    );
    return {
      employers: ents.rows
        .map((r) => ({ eid: Number(r.id), name: r.name, kind: r.kind, cash: Number(r.cash) }))
        .sort((a, b) => (a.kind === "player" ? -1 : b.kind === "player" ? 1 : a.name.localeCompare(b.name))),
      workers: workers.rows.map((row) => ({
        eid: Number(row.entity_id),
        name: row.name,
        wage: Number(row.wage),
        lotId: row.employer_lot,
        role: row.job_role,
        employer: Number(row.employer_entity),
        employerName: nameOf.get(Number(row.employer_entity)) ?? "—",
      })),
      offers: offers.rows.map((row) => ({
        id: Number(row.id),
        employer: Number(row.employer_entity),
        employerName: nameOf.get(Number(row.employer_entity)) ?? "—",
        wage: Number(row.wage),
        slots: row.slots,
        assignLot: row.assign_lot,
        assignRole: row.assign_role,
      })),
    };
  }

  async workersOf(employer: number): Promise<WorkerRow[]> {
    const r = await pool.query(
      `select n.entity_id, e.name, n.wage, n.employer_lot, n.job_role
         from npcs n join entities e on e.id = n.entity_id
        where n.employer_entity = $1 order by e.name`,
      [employer]
    );
    return r.rows.map((row) => ({
      eid: Number(row.entity_id),
      name: row.name,
      wage: Number(row.wage),
      lotId: row.employer_lot,
      role: row.job_role,
    }));
  }

  async offersOf(employer: number): Promise<OfferRow[]> {
    const r = await pool.query(
      "select * from hire_offers where world_id = $1 and employer_entity = $2 order by id",
      [WORLD_ID, employer]
    );
    return r.rows.map((row) => ({
      id: Number(row.id),
      employer: Number(row.employer_entity),
      wage: Number(row.wage),
      slots: row.slots,
      assignLot: row.assign_lot,
      assignRole: row.assign_role,
    }));
  }

  private async workerEmployer(npcEid: number): Promise<number> {
    const r = await pool.query("select employer_entity from npcs where entity_id = $1", [npcEid]);
    if (!r.rowCount || r.rows[0].employer_entity === null) throw new EconomyError("not your worker");
    return Number(r.rows[0].employer_entity);
  }

  // put a worker on a job — any role, at any lot the ACTOR controls (their own
  // or one held by a company they control). Wages still come from whichever
  // entity employs the worker.
  async assign(actor: number, npcEid: number, lotId: number | null, role: string): Promise<void> {
    const employer = await this.workerEmployer(npcEid);
    if (!this.canActFor(actor, employer)) throw new EconomyError("not your worker");
    if (!JOB_ROLES.includes(role as JobRole)) throw new EconomyError("unknown role");

    // A hauler drives between properties, so they belong to the fleet rather
    // than to one address — their carrying capacity serves every delivery
    // bay their employer runs.
    if (role === "hauler") {
      await pool.query(
        "update npcs set employer_lot = null, job_role = 'hauler' where entity_id = $1",
        [npcEid]
      );
      await this.syncFromDb(npcEid);
      return;
    }

    if (lotId === null) throw new EconomyError("pick a property for this job");
    // The lot has to be on the EMPLOYER's own books — a company's staff work
    // company property, your staff work yours. ownsLot can't say that: it runs
    // through the control resolver, which expands you to every company you
    // control. operatorOf answers for the lot itself (tenant, else owner).
    if (this.lots.operatorOf(lotId) !== employer)
      throw new EconomyError("that lot isn't on this employer's books");
    const st = this.lots.get(lotId);
    if (!st?.building && !st?.source && this.lots.buildingDef(lotId) === null)
      throw new EconomyError("nothing there to work");
    await pool.query(
      "update npcs set employer_lot = $2, job_role = $3 where entity_id = $1",
      [npcEid, lotId, role]
    );
    await this.syncFromDb(npcEid);
  }

  // how many drivers these employers have on the road between them
  async haulerCount(employers: number[]): Promise<number> {
    if (!employers.length) return 0;
    const r = await pool.query(
      "select count(*) as n from npcs where employer_entity = any($1) and job_role = 'hauler'",
      [employers]
    );
    return Number(r.rows[0].n);
  }

  async unassign(actor: number, npcEid: number): Promise<void> {
    const employer = await this.workerEmployer(npcEid);
    if (!this.canActFor(actor, employer)) throw new EconomyError("not your worker");
    await pool.query("update npcs set employer_lot = null, job_role = null where entity_id = $1", [npcEid]);
    await this.syncFromDb(npcEid);
  }

  async fire(actor: number, npcEid: number): Promise<void> {
    const employer = await this.workerEmployer(npcEid);
    if (!this.canActFor(actor, employer)) throw new EconomyError("not your worker");
    await pool.query(
      "update npcs set employer_entity = null, employer_lot = null, job_role = null, wage = 0 where entity_id = $1",
      [npcEid]
    );
    this.sync?.applyEmployment(npcEid, { employer: null, lotId: null, role: null, wage: 0 });
  }

  // employer went under: everyone out, offers pulled (used by the sim)
  async fireAllOf(employer: number): Promise<void> {
    const r = await pool.query(
      "update npcs set employer_entity = null, employer_lot = null, job_role = null, wage = 0 where employer_entity = $1 returning entity_id",
      [employer]
    );
    for (const row of r.rows)
      this.sync?.applyEmployment(Number(row.entity_id), { employer: null, lotId: null, role: null, wage: 0 });
    await pool.query("delete from hire_offers where employer_entity = $1", [employer]);
  }

  private async syncFromDb(npcEid: number): Promise<void> {
    const r = await pool.query(
      "select employer_entity, employer_lot, job_role, wage from npcs where entity_id = $1",
      [npcEid]
    );
    if (r.rowCount)
      this.sync?.applyEmployment(npcEid, {
        employer: r.rows[0].employer_entity !== null ? Number(r.rows[0].employer_entity) : null,
        lotId: r.rows[0].employer_lot,
        role: r.rows[0].job_role,
        wage: Number(r.rows[0].wage),
      });
  }

  // staffed role counts per lot — the gating source of truth
  async staffing(): Promise<Map<number, Map<JobRole, number>>> {
    const r = await pool.query(
      `select employer_lot, job_role, count(*) as n from npcs
        where world_id = $1 and employer_lot is not null and job_role is not null
        group by employer_lot, job_role`,
      [WORLD_ID]
    );
    const out = new Map<number, Map<JobRole, number>>();
    for (const row of r.rows) {
      if (!out.has(row.employer_lot)) out.set(row.employer_lot, new Map());
      out.get(row.employer_lot)!.set(row.job_role, Number(row.n));
    }
    return out;
  }

  // who works this lot (for the lot panel)
  async forLot(lotId: number): Promise<Array<{ eid: number; name: string; role: string; wage: number }>> {
    const r = await pool.query(
      `select n.entity_id, e.name, n.job_role, n.wage
         from npcs n join entities e on e.id = n.entity_id
        where n.employer_lot = $1 order by n.job_role, e.name`,
      [lotId]
    );
    return r.rows.map((row) => ({
      eid: Number(row.entity_id),
      name: row.name,
      role: row.job_role,
      wage: Number(row.wage),
    }));
  }

  // NPC-employer convenience: make sure (lot, role) is covered by a worker or
  // an open preset offer — entrepreneurs and companies staff through this
  async ensureStaffed(employer: number, lotId: number, role: JobRole, wage: number, count = 1): Promise<void> {
    const assigned = await pool.query(
      "select count(*) as n from npcs where employer_entity = $1 and employer_lot = $2 and job_role = $3",
      [employer, lotId, role]
    );
    const offered = await pool.query(
      "select coalesce(sum(slots), 0) as n from hire_offers where employer_entity = $1 and assign_lot = $2 and assign_role = $3",
      [employer, lotId, role]
    );
    const short = count - Number(assigned.rows[0].n) - Number(offered.rows[0].n);
    if (short <= 0) return;
    await pool.query(
      `insert into hire_offers (world_id, employer_entity, wage, slots, assign_lot, assign_role)
       values ($1,$2,$3,$4,$5,$6)`,
      [WORLD_ID, employer, wage, short, lotId, role]
    );
  }
}
