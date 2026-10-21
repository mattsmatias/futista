// Uutisten reaktiot ("Piditkö tästä uutisesta?"): vain jutun yhteissummat Supabasessa, ei käyttäjätietoja.
// Puhdas validointi testataan tests/ui.test.ts. Tietokantakutsu vain palvelimella (secret-avain).
import { supabaseServer, supabaseHeaders } from "./supabase-rest";
import { nodeFetch } from "./http";

export * from "./reactions-core";
import type { Counts, Vote } from "./reactions-core";

async function rest(path: string, init: { method?: string; body?: string } = {}) {
  const conn = supabaseServer();
  if (!conn) return null;
  const res = await nodeFetch(`${conn.url}${path}`, {
    method: init.method ?? "GET",
    headers: { ...supabaseHeaders(conn.key), "Content-Type": "application/json" },
    body: init.body,
  });
  if (!res.ok) throw new Error(`reactions http ${res.status}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

export const reactionsOn = () => !!supabaseServer() && process.env.REACTIONS_ENABLED !== "0";

export async function getCounts(article: string): Promise<Counts> {
  const rows = await rest(`/rest/v1/news_reactions?select=up,down&article=eq.${encodeURIComponent(article)}`);
  const r = Array.isArray(rows) ? rows[0] : null;
  return { up: Number(r?.up) || 0, down: Number(r?.down) || 0 };
}

export async function react(article: string, prev: Vote, next: Vote): Promise<Counts> {
  const r = await rest("/rest/v1/rpc/news_react", { method: "POST", body: JSON.stringify({ p_article: article, p_prev: prev, p_next: next }) });
  return { up: Number(r?.up) || 0, down: Number(r?.down) || 0 };
}
