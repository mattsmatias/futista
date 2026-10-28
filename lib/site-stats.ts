// Kävijätunniste (palvelimella): päivittäin vaihtuva pseudonyymi = HMAC(salaisuus, päivä + IP + selain), 16 heksamerkkiä.
// IP-osoitetta ei tallenneta; tunnisteet eivät ole yhdistettävissä päivien välillä. Salaisuus ei lähde palvelimelta.
import { createHmac } from "node:crypto";

const LABEL = "futista-stats-v1";
const secret = () => process.env.STATS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const statsOn = () => !!secret() && process.env.STATS_OFF !== "1";

export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("cf-connecting-ip") || h.get("x-real-ip") || (h.get("x-forwarded-for") ?? "").split(",")[0] || "").trim().slice(0, 64);
}

export function visitorId(day: string, ip: string, ua: string, key = secret()): string {
  return createHmac("sha256", key).update(`${LABEL}|${day}|${ip}|${ua.slice(0, 400)}`).digest("hex").slice(0, 16);
}

/** Hallintapaneelin käyttäjät: FUTISTA_ADMINS = pilkuilla erotetut käyttäjätunnukset (ympäristömuuttuja, ei koodissa) */
export function isAdmin(username: string | null | undefined): boolean {
  if (!username) return false;
  const list = (process.env.FUTISTA_ADMINS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return list.includes(username.toLowerCase());
}
