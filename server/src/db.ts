import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/merchant_city";

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });

// MC_PROFILE_SQL=1 records what the database is actually asked to do — how many
// times each statement runs and what it costs — so scaling work can be aimed at
// measured hot spots instead of guesses. Off unless the env var is set.
interface QueryStat {
  n: number;
  ms: number;
  rows: number;
}
export const sqlStats = new Map<string, QueryStat>();
export const sqlProfiling = process.env.MC_PROFILE_SQL === "1";
if (sqlProfiling) {
  const raw = pool.query.bind(pool) as (...args: unknown[]) => Promise<{ rowCount: number | null }>;
  (pool as unknown as { query: unknown }).query = async (...args: unknown[]) => {
    const text = typeof args[0] === "string" ? args[0] : (args[0] as { text: string })?.text ?? "?";
    // collapse whitespace and literals so variants of one statement group together
    const key = text.replace(/\s+/g, " ").trim().slice(0, 160);
    const t0 = process.hrtime.bigint();
    try {
      return await raw(...args);
    } finally {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const st = sqlStats.get(key) ?? { n: 0, ms: 0, rows: 0 };
      st.n++;
      st.ms += ms;
      sqlStats.set(key, st);
    }
  };
  console.log("[db] SQL profiling on");
}

const MIGRATIONS_DIR = path.resolve(__dirname, "../../db");

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `create table if not exists schema_migrations (
         name text primary key, applied_at timestamptz not null default now()
       )`
    );
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const { rowCount } = await client.query(
        "select 1 from schema_migrations where name = $1",
        [file]
      );
      if (rowCount) continue;
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`[db] applied ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
  } finally {
    client.release();
  }
}
