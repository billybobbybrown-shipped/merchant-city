import { CityMap, CityMapWire, mapFromWire } from "@mc/shared";
import { SERVER_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

const TOKEN_KEY = "mc_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
  return data;
}

// When Supabase env vars are present the client authenticates against Supabase
// and hands its JWT to the game server; otherwise it uses the built-in dev auth.
let supabase: any = null;
async function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!supabase) {
    const { createClient } = await import("@supabase/supabase-js");
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

export async function register(email: string, password: string): Promise<void> {
  const sb = await getSupabase();
  if (sb) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error("check your email to confirm, then log in");
    setToken(data.session.access_token);
    return;
  }
  const { token } = await post("/auth/register", { email, password });
  setToken(token);
}

export async function login(email: string, password: string): Promise<void> {
  const sb = await getSupabase();
  if (sb) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    setToken(data.session.access_token);
    return;
  }
  const { token } = await post("/auth/login", { email, password });
  setToken(token);
}

export interface Me {
  userId: string;
  entityId: number | null;
  email: string;
  player: { name: string; cash: number; appearance: number } | null;
}

export async function me(): Promise<Me | null> {
  if (!getToken()) return null;
  const res = await fetch(`${SERVER_URL}/auth/me`, {
    headers: { authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    clearToken();
    return null;
  }
  return res.json();
}

export const setName = (name: string) => post("/auth/name", { name });

export async function fetchMap(): Promise<CityMap> {
  const res = await fetch(`${SERVER_URL}/map`);
  if (!res.ok) throw new Error("failed to load city map");
  return mapFromWire((await res.json()) as CityMapWire);
}
