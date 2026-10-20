// football-data.org (ilmainen avain FOOTBALL_DATA_KEY). Vain palvelimella.
// Ilmaisessa versiossa on 10 hakua minuutissa, ja liika kuormitus voi sulkea tilin, joten:
//  - onnistuneet vastaukset tallennetaan välimuistiin (unstable_cache), ja ne jaetaan kaikkien kävijöiden kesken
//  - jokainen palvelininstanssi tekee enintään 6 hakua minuutissa
//  - virheen jälkeen (429 / 403) hakuja ei tehdä hetkeen ollenkaan ("katkaisin")
//  - ympäristömuuttuja FD_OFF=1 katkaisee kaikki haut heti
import https from "node:https";
import { unstable_cache } from "next/cache";

const BASE = "https://api.football-data.org/v4";
const PER_MIN = 6;

let blockedUntil = 0;
const calls: number[] = [];

function get(path: string, key: string): Promise<{ status: number; reset: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(BASE + path, { headers: { "X-Auth-Token": key }, timeout: 15000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, reset: Number(res.headers["x-requestcounter-reset"] ?? 60), body }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function load(path: string) {
  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) throw new Error("no key");
  const now = Date.now();
  if (now < blockedUntil) throw new Error("paused");
  while (calls.length && now - calls[0] > 60_000) calls.shift();
  if (calls.length >= PER_MIN) throw new Error("local limit");
  calls.push(now);
  const r = await get(path, key);
  if (r.status === 200) return JSON.parse(r.body);
  if (r.status === 429) blockedUntil = Date.now() + Math.max(10, r.reset) * 1000;
  if (r.status === 403 || r.status === 401) blockedUntil = Date.now() + 6 * 3600_000;
  throw new Error(`football-data ${r.status}: ${r.body.slice(0, 120)}`);
}

/** Hakee polun, välimuistissa `ttl` sekuntia. Palauttaa null, jos avainta ei ole tai haku ei onnistu. */
export async function fd<T = any>(path: string, ttl: number): Promise<T | null> {
  if (!hasFd()) return null;
  // ei hakuja julkaisun rakennusvaiheessa: sivut täydentyvät käyttöön
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    return await unstable_cache(() => load(path), ["fd-v1", path], { revalidate: ttl })();
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (msg !== "paused" && msg !== "local limit") console.error("football-data", path, msg);
    return null;
  }
}

export const hasFd = () => !!process.env.FOOTBALL_DATA_KEY && process.env.FD_OFF !== "1";
