// Futista Fantasy: tietokantakutsut palvelimella (Supabase PostgREST RPC, secret/service_role-avain).
// Kaikki käsittely SECURITY DEFINER -funktioiden kautta (supabase/migrations/20261027_fantasy.sql). Avain ei lähde selaimeen.
import { nodeFetch } from "./http";
import { supabaseHeaders, supabaseServer } from "./supabase-rest";

export class FantasyDbError extends Error { constructor(public code: "off" | "missing" | "db", msg: string) { super(msg); } }

export const fantasyDbOn = () => !!supabaseServer() && process.env.FANTASY_OFF !== "1";

/** Kutsuu funktiota public.<fn>(nimetyt parametrit). Palauttaa funktion jsonb-arvon (null, jos ei riviä). */
export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const s = supabaseServer();
  if (!s || process.env.FANTASY_OFF === "1") throw new FantasyDbError("off", "not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res;
  try {
    res = await nodeFetch(`${s.url}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: { ...supabaseHeaders(s.key), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args), signal: ctrl.signal,
    });
  } catch { throw new FantasyDbError("db", `${fn}: network`); } finally { clearTimeout(timer); }
  const text = await res.text();
  // funktiota ei ole → migraatio ajamatta (PostgREST: 404 / PGRST202)
  if (res.status === 404 || /PGRST202|Could not find the function/.test(text)) throw new FantasyDbError("missing", `${fn}: missing`);
  if (!res.ok) throw new FantasyDbError("db", `${fn}: http ${res.status}`);
  try { return (text ? JSON.parse(text) : null) as T; } catch { throw new FantasyDbError("db", `${fn}: parse`); }
}
