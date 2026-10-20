// football-data.org (ilmainen avain FOOTBALL_DATA_KEY). Vain palvelimella.
// Onnistuneet vastaukset tallennetaan välimuistiin (unstable_cache), virheitä ei – näin
// rajapinnan minuuttiraja (10 hakua) ei jätä sivulle tyhjiä kohtia pitkäksi aikaa.
import https from "node:https";
import { unstable_cache } from "next/cache";

const BASE = "https://api.football-data.org/v4";

function get(path: string, key: string): Promise<{ status: number; reset: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(BASE + path, { headers: { "X-Auth-Token": key }, timeout: 15000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, reset: Number(res.headers["x-requestcounter-reset"] ?? 10), body }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function load(path: string) {
  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) throw new Error("no key");
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await get(path, key);
    if (r.status === 200) return JSON.parse(r.body);
    // minuuttiraja täynnä: odotetaan, kunnes laskuri nollautuu (enintään 20 s)
    if (r.status === 429 && attempt < 2) { await new Promise((ok) => setTimeout(ok, Math.min(12, Math.max(2, r.reset)) * 1000)); continue; }
    throw new Error(`football-data ${r.status}: ${r.body.slice(0, 160)}`);
  }
}

/** Hakee polun, välimuistissa `ttl` sekuntia. Palauttaa null, jos avainta ei ole tai haku epäonnistuu. */
export async function fd<T = any>(path: string, ttl: number): Promise<T | null> {
  if (!process.env.FOOTBALL_DATA_KEY) return null;
  // ei hakuja julkaisun rakennusvaiheessa: sivut täydentyvät heti ensimmäisellä käynnillä
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    return await unstable_cache(() => load(path), ["fd-v1", path], { revalidate: ttl })();
  } catch (e) {
    console.error("football-data", path, (e as Error)?.message);
    return null;
  }
}

export const hasFd = () => !!process.env.FOOTBALL_DATA_KEY;
