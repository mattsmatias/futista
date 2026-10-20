// football-data.org (ilmainen avain FOOTBALL_DATA_KEY). Vain palvelimella.
// Ilmaisessa versiossa on 10 hakua minuutissa, ja liika kuormitus voi sulkea tilin, joten:
//  - onnistuneet vastaukset tallennetaan jaettuun välimuistiin (Vercel Data Cache, unstable_cache):
//    kaikki kävijät ja kaikki palvelininstanssit käyttävät samaa vastausta
//  - samanaikaiset saman polun haut yhdistetään (lib/guard.ts)
//  - jokainen palvelininstanssi tekee enintään 6 hakua minuutissa, joista enintään 2 matalan
//    prioriteetin hakuja (yksittäiset pelaajat, keskinäiset ottelut, joukkueet)
//  - 429: tauko Retry-After / X-RequestCounter-Reset mukaan; 401/403: 6 h tauko; 5xx/aikakatkaisu: 15 s
//  - ympäristömuuttuja FD_OFF=1 katkaisee kaikki haut heti
import https from "node:https";
import { unstable_cache } from "next/cache";
import { createGuard, SourceError, type Fetched, type Priority } from "./guard";

const BASE = "https://api.football-data.org/v4";
const TIMEOUT_MS = 10_000;

const guard = createGuard({ perMin: 6, lowPerMin: 2 });

function get(path: string, key: string): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const req = https.get(BASE + path, { headers: { "X-Auth-Token": key }, timeout: TIMEOUT_MS }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({
        status: res.statusCode ?? 0,
        body,
        headers: {
          "retry-after": res.headers["retry-after"] as string | undefined,
          "x-requestcounter-reset": res.headers["x-requestcounter-reset"] as string | undefined,
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

/** Hakee polun ja hakuhetken; välimuistissa `ttl` sekuntia. null, jos avainta ei ole tai haku ei onnistu. */
export async function fdMeta<T = any>(path: string, ttl: number): Promise<FdResult<T>> {
  if (!hasFd()) return null;
  // ei hakuja julkaisun rakennusvaiheessa: sivut täydentyvät käyttöön
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    // sama välimuistiavain kuin aiemmin: julkaisu ei tyhjennä välimuistia eikä aiheuta hakuryöppyä.
    // Vanhat merkinnät ovat pelkkää dataa (ei hakuaikaa) → aika tuntematon (null) kunnes merkintä uusiutuu.
    const r: any = await unstable_cache(() => load(path), ["fd-v1", path], { revalidate: ttl })();
    const wrapped = r && typeof r === "object" && typeof r.at === "number" && "data" in r && Object.keys(r).length === 2;
    return wrapped ? { data: r.data as T, at: r.at } : { data: r as T, at: null };
  } catch (e) {
    const err = e as SourceError;
    if (err?.kind !== "paused" && err?.kind !== "limit") console.error("football-data", path, err?.message ?? "");
    return null;
  }
}

/** Hakee polun (ilman aikaleimaa). */
export async function fd<T = any>(path: string, ttl: number): Promise<T | null> {
  return (await fdMeta<T>(path, ttl))?.data ?? null;
}

export const hasFd = () => !!process.env.FOOTBALL_DATA_KEY && process.env.FD_OFF !== "1";
export const fdState = () => guard.state();

/** Onko football-data viime aikoina antanut virheen tai tauon (tämän palvelininstanssin näkökulmasta) */
export const fdFailingRecently = (ms = 10 * 60_000) => {
  const st = guard.state();
  return Date.now() < st.blockedUntil || (!!st.lastError && Date.now() - st.lastError.at < ms);
};
