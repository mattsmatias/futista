// Pelaajien kuvat TheSportsDB:stä (ilmainen avain "123"). Vain palvelimella.
// Tulos (myös "kuvaa ei löytynyt") tallennetaan viikoksi; epäonnistunutta hakua ei tallenneta.
import { unstable_cache } from "next/cache";
import { words } from "./live-core";
import { getJson } from "./http";

const PER_MIN = 20;
const calls: number[] = [];

async function search(name: string): Promise<any[]> {
  const now = Date.now();
  while (calls.length && now - calls[0] > 60_000) calls.shift();
  if (calls.length >= PER_MIN) throw new Error("local limit");
  calls.push(now);
  const j = await getJson(`https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=${encodeURIComponent(name)}`);
  return (j?.player ?? []).filter((p: any) => p?.strSport === "Soccer");
}

/** Kaikki haetun nimen sanat löytyvät pelaajan nimestä (tai päinvastoin), esim. "Joan García" ↔ "Joan Garcia" */
function sameName(a: string, b: string) {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  return x.every((w) => y.includes(w)) || y.every((w) => x.includes(w));
}

async function find(name: string, team: string): Promise<string | null> {
  const list = (await search(name)).filter((p) => !String(p.strTeam ?? "").startsWith("_") && sameName(name, p.strPlayer ?? ""));
  // sama seura ensin, muuten ainoa nimeä vastaava pelaaja
  const tw = words(team);
  const byTeam = tw.length ? list.find((p) => words(p.strTeam ?? "").some((w) => w.length >= 4 && tw.includes(w))) : undefined;
  const p = byTeam ?? (list.length === 1 ? list[0] : undefined);
  const url = p?.strCutout || p?.strThumb || null;
  return url ? `${url}/small` : null;
}

export async function getPhoto(name: string, team = ""): Promise<string | null> {
  if (!name) return null;
  try {
    const r = await unstable_cache(async () => ({ url: await find(name, team) }), ["photo-v1", name, team], { revalidate: 7 * 86400 })();
    return r.url;
  } catch {
    return null;
  }
}

/** Sama kuin getPhoto, mutta kertoo myös, oliko haku hetkellisesti mahdoton (ei tallenneta välimuistiin) */
export async function lookupPhoto(name: string, team = ""): Promise<{ url: string | null; ok: boolean }> {
  try {
    const r = await unstable_cache(async () => ({ url: await find(name, team) }), ["photo-v1", name, team], { revalidate: 7 * 86400 })();
    return { url: r.url, ok: true };
  } catch {
    return { url: null, ok: false };
  }
}
