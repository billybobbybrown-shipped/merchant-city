import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { pool } from "./db.js";

const SECRET = process.env.SERVER_SECRET ?? "dev-secret-change-me";
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const TOKEN_TTL_SEC = 60 * 60 * 24 * 7;

const b64u = (b: Buffer) => b.toString("base64url");

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `${b64u(salt)}.${b64u(hash)}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split(".");
  if (!saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(hashB64, "base64url");
  const actual = scryptSync(password, salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Dev session token: mc1.<payload>.<hmac>. Swapped for Supabase JWTs in prod.
export function issueToken(uid: string): string {
  const payload = b64u(
    Buffer.from(JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC }))
  );
  const sig = b64u(createHmac("sha256", SECRET).update(payload).digest());
  return `mc1.${payload}.${sig}`;
}

function verifyDevToken(token: string): string | null {
  const [prefix, payload, sig] = token.split(".");
  if (prefix !== "mc1" || !payload || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(payload).digest();
  const actual = Buffer.from(sig, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof uid !== "string" || typeof exp !== "number") return null;
    if (exp < Date.now() / 1000) return null;
    return uid;
  } catch {
    return null;
  }
}

async function verifySupabaseJwt(token: string): Promise<string | null> {
  if (!SUPABASE_JWT_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = createHmac("sha256", SUPABASE_JWT_SECRET).update(`${h}.${p}`).digest();
  const actual = Buffer.from(s, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    if (typeof claims.sub !== "string") return null;
    if (typeof claims.exp === "number" && claims.exp < Date.now() / 1000) return null;
    // Mirror the Supabase user into our users table so FKs hold.
    await pool.query(
      `insert into users (id, email) values ($1, $2) on conflict (id) do nothing`,
      [claims.sub, claims.email ?? `${claims.sub}@supabase.local`]
    );
    return claims.sub;
  } catch {
    return null;
  }
}

export async function verifyToken(token: string): Promise<string | null> {
  if (token.startsWith("mc1.")) return verifyDevToken(token);
  return verifySupabaseJwt(token);
}
