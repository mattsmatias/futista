// Pelaajien kuvat: ensin TheSportsDB:n profiilikuva (taustasta irrotettu kasvokuva, ilmainen avain "123"),
// varalla Wikipedia (Wikimedia Commons). Vain palvelimella.
// Tulos (myös "kuvaa ei löytynyt") tallennetaan viikoksi; epäonnistunutta hakua ei tallenneta.
import { stableCache } from "./stable-cache";
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

/** Wikipedian artikkelikuva, jos artikkeli on jalkapalloilijasta (kuvaus "... footballer") */
async function wiki(name: string): Promise<string | null> {
  for (const title of [name, `${name} (footballer)`]) {
    const j = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, 6000).catch(() => null);
    if (!j || j.type !== "standard") continue;
    if (!/footballer|soccer player/i.test(String(j.description ?? ""))) continue;
    const src: string | undefined = j.thumbnail?.source;
    if (!src) return null;
    // suurempi pienoiskuva (330 px) terävämmäksi profiiliin
    return src.replace(/\/(\d+)px-/, (m: string, w: string) => (Number(w) < 330 ? "/330px-" : m));
  }
  return null;
}

/** Kuva: ensin TheSportsDB:n taustasta irrotettu profiilikuva (cutout; uusimmat kauden 2026–27 kuvat), varalla
 *  Wikipedian artikkelikuva. TheSportsDB:n pelaaja hyväksytään vain, kun nimi TÄSMÄÄ JA lisäksi seura tai
 *  kansallisuus täsmää – ei koskaan pelkän nimen perusteella. */
const key = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
async function find(name: string, team: string, nation = ""): Promise<{ url: string; cutout: boolean } | null> {
  const list = (await search(name).catch(() => [])).filter((p) => !String(p.strTeam ?? "").startsWith("_") && sameName(name, p.strPlayer ?? ""));
  const tw = words(team);
  const teamOk = (p: any) => tw.length > 0 && [p.strTeam, p.strTeam2].some((t) => words(t ?? "").some((w) => w.length >= 4 && tw.includes(w)));
  const natOk = (p: any) => !!nation && key(p.strNationality ?? "") === key(nation);
  const p = list.find(teamOk) ?? list.find(natOk);
  if (p?.strCutout) return { url: `${p.strCutout}/small`, cutout: true };
  if (p?.strThumb) return { url: `${p.strThumb}/small`, cutout: false };
  const w = await wiki(name).catch(() => null);
  return w ? { url: w, cutout: false } : null;
}

type Found = { url: string | null; cutout?: boolean };
const cached = (name: string, team: string, nation: string) =>
  stableCache(async (): Promise<Found> => { const r = await find(name, team, nation); return r ? { url: r.url, cutout: r.cutout } : { url: null }; },
    ["photo-v3", name, team, nation], { revalidate: 7 * 86400 })();

export async function getPhoto(name: string, team = "", nation = ""): Promise<string | null> {
  if (!name) return null;
  try { return (await cached(name, team, nation)).url; } catch { return null; }
}

/** Sama kuin getPhoto, mutta kertoo myös, oliko haku hetkellisesti mahdoton (ei tallenneta välimuistiin) */
export async function lookupPhoto(name: string, team = "", nation = ""): Promise<{ url: string | null; cutout: boolean; ok: boolean }> {
  try { const r = await cached(name, team, nation); return { url: r.url, cutout: !!r.cutout, ok: true }; }
  catch { return { url: null, cutout: false, ok: false }; }
}
