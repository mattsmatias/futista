// football-data.org (ilmainen avain FOOTBALL_DATA_KEY). Vain palvelimella.
// Ilmaisessa versiossa on 10 hakua minuutissa, ja liika kuormitus voi sulkea tilin, joten:
//  - onnistuneet vastaukset tallennetaan jaettuun välimuistiin (Vercel Data Cache, unstable_cache):
//    kaikki kävijät ja kaikki palvelininstanssit käyttävät samaa vastausta
//  - samanaikaiset saman polun haut yhdistetään (lib/guard.ts)
//  - YHTEINEN kiintiö kaikille instansseille ja ympäristöille, joilla on sama avain (lib/quota.ts, Supabase):
//    enintään 8 hakua / liukuva 60 s, joista enintään 3 matalan prioriteetin hakuja (yksittäiset pelaajat,
//    keskinäiset ottelut, joukkueet). Varaus on atominen tietokantafunktiossa.
//  - 429 / X-Requests-Available-Minute: 0: yhteinen tauko Retry-After / X-RequestCounter-Reset mukaan;
//    401/403: 6 h yhteinen tauko; 5xx/aikakatkaisu: 15 s (instanssikohtainen)
//  - Vercelissä yhteinen kiintiö on pakollinen: jos sitä ei voi varmistaa, tehdään enintään 2 korkean
//    prioriteetin hakua / min / instanssi (muuten välimuistidata tai hallittu virhe). Paikallisessa kehityksessä ilman Supabasea: 6 hakua/min
//    (enintään 2 matalan prioriteetin) ja 429-tauko tämän prosessin sisällä. Tämä EI suojaa usean
//    prosessin tai palvelimen yhteiskäyttöä – siihen tarvitaan yhteinen kiintiö (docs/kiintio.md).
//  - ympäristömuuttuja FD_OFF=1 katkaisee kaikki haut heti
import { stableCache } from "./stable-cache";
import https from "node:https";
import http from "node:http";
import { createGuard, SourceError, type Fetched, type Priority } from "./guard";
import { fdQuotaStore, type QuotaStore } from "./quota";

// Testejä varten osoitteen voi korvata (FD_BASE_URL), mutta EI koskaan tuotannossa.
const BASE = (process.env.VERCEL_ENV !== "production" && process.env.FD_BASE_URL) || "https://api.football-data.org/v4";
const TIMEOUT_MS = 10_000;

let store: { key: string; s: QuotaStore | null } | null = null;
function sharedStore(): QuotaStore | null {
  const key = process.env.FOOTBALL_DATA_KEY ?? "";
  if (!store || store.key !== key) store = { key, s: key ? fdQuotaStore(key) : null };
  return store.s;
}

const guard = createGuard({
  perMin: 6,
  lowPerMin: 2,
  shared: sharedStore,
  requireShared: !!process.env.VERCEL || process.env.FD_QUOTA_REQUIRED === "1",
  // varaston häiriössä 2 tärkeää hakua / min / instanssi (ennen: ei yhtään → tuloksia ja taulukoita puuttui)
  degradedPerMin: 2,
});

function get(path: string, key: string): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const req = (BASE.startsWith("http://") ? http : https).get(BASE + path, { headers: { "X-Auth-Token": key }, timeout: TIMEOUT_MS }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({
        status: res.statusCode ?? 0,
        body,
        headers: {
          "retry-after": res.headers["retry-after"] as string | undefined,
          "x-requestcounter-reset": res.headers["x-requestcounter-reset"] as string | undefined,
          "x-requests-available-minute": res.headers["x-requests-available-minute"] as string | undefined,
        },
      }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

/** Matalan prioriteetin polut: käyttäjän valitsemat yksittäiset kohteet, joita voi olla rajattomasti */
const lowPriority = (path: string): Priority => (/^\/(persons|teams)\/\d+|\/head2head/.test(path) ? "low" : "high");

async function load(path: string): Promise<{ at: number; data: any }> {
  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) throw new SourceError("off", "no key");
  const data = await guard.run(path, () => get(path, key), (b) => JSON.parse(b), lowPriority(path));
  return { at: Date.now(), data };
}

export type FdResult<T> = { data: T; at: number | null } | null;

/** Haun lopputulos eriteltynä: löytyi / lähde vahvisti, ettei kohdetta ole (404) / ei käytössä / tilapäinen häiriö.
 *  Häiriöitä (tauko, kiintiö, aikakatkaisu, 5xx, migraatio puuttuu) ei tallenneta välimuistiin. */
export type FdOutcome<T> =
  | { status: "ok"; data: T; at: number | null }
  | { status: "notfound" }
  | { status: "off" }
  | { status: "unavailable"; reason: string };

export async function fdTry<T = any>(path: string, ttl: number): Promise<FdOutcome<T>> {
  if (!hasFd()) return { status: "off" };
  // ei hakuja julkaisun rakennusvaiheessa: sivut täydentyvät käyttöön
  if (process.env.NEXT_PHASE === "phase-production-build") return { status: "unavailable", reason: "build" };
  try {
    // sama välimuistiavain kuin aiemmin: julkaisu ei tyhjennä välimuistia eikä aiheuta hakuryöppyä.
    // Vanhat merkinnät ovat pelkkää dataa (ei hakuaikaa) → aika tuntematon (null) kunnes merkintä uusiutuu.
    const r: any = await stableCache(() => load(path), ["fd-v1", path], { revalidate: ttl })();
    const wrapped = r && typeof r === "object" && typeof r.at === "number" && "data" in r && Object.keys(r).length === 2;
    return wrapped ? { status: "ok", data: r.data as T, at: r.at } : { status: "ok", data: r as T, at: null };
  } catch (e) {
    const err = e as SourceError;
    if (err?.kind === "http" && err.status === 404) return { status: "notfound" };
    if (err?.kind !== "paused" && err?.kind !== "limit") console.error("football-data", path, err?.message ?? "");
    return { status: "unavailable", reason: err?.kind ?? "error" };
  }
}

/** Hakee polun ja hakuhetken; välimuistissa `ttl` sekuntia. null, jos avainta ei ole tai haku ei onnistu. */
export async function fdMeta<T = any>(path: string, ttl: number): Promise<FdResult<T>> {
  const r = await fdTry<T>(path, ttl);
  return r.status === "ok" ? { data: r.data, at: r.at } : null;
}

/** Hakee polun (ilman aikaleimaa). */
export async function fd<T = any>(path: string, ttl: number): Promise<T | null> {
  return (await fdMeta<T>(path, ttl))?.data ?? null;
}

export const hasFd = () => !!process.env.FOOTBALL_DATA_KEY && process.env.FD_OFF !== "1";
export const fdState = () => guard.state();

/** Onko football-data viime aikoina antanut virheen tai tauon (tämän palvelininstanssin näkökulmasta;
 *  yhteinen tauko näkyy tässä, kun instanssi on kerran kysynyt kiintiötä) */
export const fdFailingRecently = (ms = 10 * 60_000) => {
  const st = guard.state();
  return Date.now() < st.blockedUntil || (!!st.lastError && Date.now() - st.lastError.at < ms);
};
