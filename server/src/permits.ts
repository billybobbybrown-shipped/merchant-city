import { pool } from "./db.js";
import { EconomyError } from "./errors.js";
import { CITY_ENTITY, transfer } from "./accounts.js";
import {
  DAY_LENGTH_SEC,
  PERMIT_CATEGORIES,
  PERMIT_DAYS,
  PERMIT_STATIONS,
  PermitCategory,
  permitFee,
} from "@mc/shared";

const WORLD_ID = 1;

// City-issued production+retail permits. One per entity per category,
// renewable; fee scales with the operation's station count (public record).
export class PermitsStore {
  // active-permit cache: "entity:category" -> expiry ms
  private cache = new Map<string, number>();
  private cacheLoaded = 0;

  private async refreshCache(): Promise<void> {
    if (Date.now() - this.cacheLoaded < 15_000) return;
    const r = await pool.query("select entity_id, category, expires_at from permits where expires_at > now()");
    this.cache.clear();
    for (const row of r.rows)
      this.cache.set(`${row.entity_id}:${row.category}`, new Date(row.expires_at).getTime());
    this.cacheLoaded = Date.now();
  }

  async has(entityId: number, category: PermitCategory): Promise<boolean> {
    await this.refreshCache();
    const exp = this.cache.get(`${entityId}:${category}`);
    return exp !== undefined && exp > Date.now();
  }

  // fee for this entity right now: base + per-station on lots the entity owns
  async feeFor(entityId: number, category: PermitCategory): Promise<number> {
    const r = await pool.query(
      `select count(*) as n
         from furniture f
         join lots l on l.id = f.lot_id and l.world_id = f.world_id
        where f.world_id = $1 and l.owner_entity_id = $2 and f.item = any($3)`,
      [WORLD_ID, entityId, PERMIT_STATIONS[category]]
    );
    return permitFee(category, Number(r.rows[0].n));
  }

  // issue or renew for `forEntity`; the buyer must be or control it
  async issue(
    canAct: (target: number) => boolean,
    forEntity: number,
    category: string
  ): Promise<{ fee: number; expiresAt: string; cash: Map<number, number> }> {
    if (!PERMIT_CATEGORIES.includes(category as PermitCategory)) throw new EconomyError("unknown permit category");
    if (!canAct(forEntity)) throw new EconomyError("not your entity");
    const cat = category as PermitCategory;
    const fee = await this.feeFor(forEntity, cat);
    const durationSec = PERMIT_DAYS * DAY_LENGTH_SEC;
    const client = await pool.connect();
    try {
      await client.query("begin");
      const bal = await transfer(client, forEntity, CITY_ENTITY, fee, "fee", `${cat} permit`);
      // renewal extends from the current expiry when still active
      const r = await client.query(
        `insert into permits (entity_id, category, expires_at, fee_paid)
         values ($1, $2, now() + make_interval(secs => $3), $4)
         on conflict (entity_id, category) do update
           set expires_at = greatest(permits.expires_at, now()) + make_interval(secs => $3),
               fee_paid = $4, issued_at = now()
         returning expires_at`,
        [forEntity, cat, durationSec, fee]
      );
      await client.query("commit");
      this.cache.set(`${forEntity}:${cat}`, new Date(r.rows[0].expires_at).getTime());
      return { fee, expiresAt: r.rows[0].expires_at, cash: new Map([[forEntity, bal.from]]) };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async of(entityId: number) {
    const r = await pool.query(
      "select category, issued_at, expires_at, fee_paid from permits where entity_id = $1 order by category",
      [entityId]
    );
    return r.rows.map((row) => ({
      category: row.category,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      fee: Number(row.fee_paid),
      active: new Date(row.expires_at).getTime() > Date.now(),
    }));
  }

  // the public registry
  async registry() {
    const r = await pool.query(
      `select p.entity_id, e.name, e.kind, p.category, p.expires_at
         from permits p join entities e on e.id = p.entity_id
        where p.expires_at > now()
        order by p.category, e.name`
    );
    return r.rows.map((row) => ({
      entityId: Number(row.entity_id),
      name: row.name,
      kind: row.kind,
      category: row.category,
      expiresAt: row.expires_at,
    }));
  }
}
