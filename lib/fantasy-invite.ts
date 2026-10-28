// Fantasyn kutsulinkki: /fantasy?kutsu=<koodi>. Koodi = joukkueen tunniste + palvelimen HMAC-allekirjoitus,
// joten koodia ei voi arvata eikä muiden joukkueiden tietoja voi selata numeroimalla. Ei tietokantamuutosta.
// Avain johdetaan palvelimen salaisuudesta omalla käyttötarkoitusmerkinnällä; salaisuus ei koskaan lähde palvelimelta.
import { createHmac, timingSafeEqual } from "node:crypto";

const LABEL = "futista-fantasy-invite-v1";
const secret = () => process.env.FANTASY_INVITE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function sig(teamId: number, key: string): string {
  return createHmac("sha256", key).update(`${LABEL}:${teamId}`).digest("base64url").slice(0, 12);
}

/** Joukkueen kutsukoodi; null jos palvelimen salaisuutta ei ole (kutsut pois käytöstä). */
export function inviteCode(teamId: number, key = secret()): string | null {
  if (!key || !Number.isSafeInteger(teamId) || teamId <= 0) return null;
  return `${teamId.toString(36)}-${sig(teamId, key)}`;
}

/** Tarkistaa kutsukoodin; palauttaa joukkueen tunnisteen tai null. */
export function parseInvite(code: unknown, key = secret()): number | null {
  if (!key || typeof code !== "string" || code.length > 40) return null;
  const m = /^([0-9a-z]{1,11})-([A-Za-z0-9_-]{12})$/.exec(code);
  if (!m) return null;
  const id = parseInt(m[1], 36);
  if (!Number.isSafeInteger(id) || id <= 0 || id.toString(36) !== m[1]) return null;
  const a = Buffer.from(m[2]), b = Buffer.from(sig(id, key));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
