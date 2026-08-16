import type { PoolClient } from "pg";
import { pool } from "./db.js";
import { EconomyError } from "./errors.js";

// THE money choke point. Every balance mutation in the game goes through
// debit/credit/transfer here — no other code touches accounts.balance.
// Accounts are (entity, currency); the city treasury is entity 1.

export const CITY_ENTITY = 1;

export type Currency = "clean" | "dirty" | string; // coin codes are currencies too

// machine-readable ledger categories — Phase 4 GDP/CPI aggregates on these
export type LedgerCategory =
  | "land"
  | "rent"
  | "retail_sale"
  | "trade"
  | "fee"
  | "tax"
  | "wage"
  | "construction"
  | "production_setup"
  | "demolition"
  | "furniture"
  | "bribe"
  | "seizure"
  | "transfer"
  | "dividend"
  | "ipo";

// what dirty money and coin can never pay for, enforced here and nowhere else
const NOTHING_BLOCKED: ReadonlySet<LedgerCategory> = new Set();
const DIRTY_BLOCKED: ReadonlySet<LedgerCategory> = new Set([
  "land",
  "construction",
  "production_setup",
  "trade",
] as LedgerCategory[]);
// coin also can't pay fees — permits, audits and taxes are clean-cash only
const COIN_BLOCKED: ReadonlySet<LedgerCategory> = new Set([
  "land",
  "construction",
  "production_setup",
  "trade",
  "fee",
] as LedgerCategory[]);

// Anything that is not clean or dirty cash is a coin, whatever its code — the
// wall applies to every coin, including ones added later.
function blockedFor(currency: Currency): ReadonlySet<LedgerCategory> {
  if (currency === "clean") return NOTHING_BLOCKED;
  if (currency === "dirty") return DIRTY_BLOCKED;
  return COIN_BLOCKED;
}

export async function entityForUser(uid: string): Promise<number | null> {
  const r = await pool.query("select entity_id from players where id = $1", [uid]);
  return r.rowCount && r.rows[0].entity_id !== null ? Number(r.rows[0].entity_id) : null;
}

export async function balanceOf(entityId: number, currency: Currency = "clean"): Promise<number> {
  const r = await pool.query(
    "select balance from accounts where entity_id = $1 and currency = $2",
    [entityId, currency]
  );
  return r.rowCount ? Number(r.rows[0].balance) : 0;
}

async function ensureAccount(c: PoolClient, entityId: number, currency: Currency) {
  await c.query(
    "insert into accounts (entity_id, currency, balance) values ($1, $2, 0) on conflict (entity_id, currency) do nothing",
    [entityId, currency]
  );
}

function assertSpendable(currency: Currency, category: LedgerCategory) {
  if (blockedFor(currency).has(category))
    throw new EconomyError(`${currency} money can't pay for that`);
}

async function ledgerRow(
  c: PoolClient,
  fromEntity: number | null,
  toEntity: number | null,
  amount: number,
  category: LedgerCategory,
  reason: string,
  currency: Currency
) {
  await c.query(
    `insert into ledger (amount, reason, category, currency, from_account, to_account)
     values ($1, $2, $3, $4,
       (select id from accounts where entity_id = $5 and currency = $4),
       (select id from accounts where entity_id = $6 and currency = $4))`,
    [amount, reason, category, currency, fromEntity, toEntity]
  );
}

// guarded debit — throws EconomyError when the balance can't cover it.
// Returns the new balance.
export async function debit(
  c: PoolClient,
  entityId: number,
  amount: number,
  category: LedgerCategory,
  reason: string,
  currency: Currency = "clean"
): Promise<number> {
  if (!(amount > 0)) throw new EconomyError("bad amount");
  assertSpendable(currency, category);
  await ensureAccount(c, entityId, currency);
  const r = await c.query(
    `update accounts set balance = balance - $3
      where entity_id = $1 and currency = $2 and balance >= $3
      returning balance`,
    [entityId, currency, amount]
  );
  if (!r.rowCount) throw new EconomyError("not enough cash");
  await ledgerRow(c, entityId, null, amount, category, reason, currency);
  return Number(r.rows[0].balance);
}

export async function credit(
  c: PoolClient,
  entityId: number,
  amount: number,
  category: LedgerCategory,
  reason: string,
  currency: Currency = "clean"
): Promise<number> {
  if (!(amount > 0)) throw new EconomyError("bad amount");
  await ensureAccount(c, entityId, currency);
  const r = await c.query(
    `update accounts set balance = balance + $3
      where entity_id = $1 and currency = $2 returning balance`,
    [entityId, currency, amount]
  );
  await ledgerRow(c, null, entityId, amount, category, reason, currency);
  return Number(r.rows[0].balance);
}

// atomic move between entities; returns both new balances
export async function transfer(
  c: PoolClient,
  fromEntity: number,
  toEntity: number,
  amount: number,
  category: LedgerCategory,
  reason: string,
  currency: Currency = "clean"
): Promise<{ from: number; to: number }> {
  if (!(amount > 0)) throw new EconomyError("bad amount");
  assertSpendable(currency, category);
  await ensureAccount(c, fromEntity, currency);
  await ensureAccount(c, toEntity, currency);
  const d = await c.query(
    `update accounts set balance = balance - $3
      where entity_id = $1 and currency = $2 and balance >= $3
      returning balance`,
    [fromEntity, currency, amount]
  );
  if (!d.rowCount) throw new EconomyError("not enough cash");
  const cr = await c.query(
    `update accounts set balance = balance + $3
      where entity_id = $1 and currency = $2 returning balance`,
    [toEntity, currency, amount]
  );
  await ledgerRow(c, fromEntity, toEntity, amount, category, reason, currency);
  return { from: Number(d.rows[0].balance), to: Number(cr.rows[0].balance) };
}
