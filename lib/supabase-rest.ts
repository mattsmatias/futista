// Supabasen REST-kutsujen otsakkeet palvelimella (vain palvelin; avainta ei koskaan lähetetä selaimeen).
// Tukee molempia avaintyyppejä:
//  - uudet secret-avaimet (sb_secret_…): EIVÄT ole JWT-tunnisteita → lähetetään vain apikey-otsakkeessa.
//    Supabasen ohje: jos sama avain annetaan myös Authorization: Bearer -otsakkeessa, alusta yrittää
//    tulkita sen JWT:nä ja voi hylätä pyynnön ("Invalid JWT").
//  - vanhat service_role-avaimet (JWT, alkaa "eyJ"): apikey + Authorization: Bearer kuten ennenkin.
// https://supabase.com/docs/guides/api/api-keys

export type KeyKind = "secret" | "legacy-jwt" | "publishable" | "unknown";

export function keyKind(key: string): KeyKind {
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (/^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(key)) return "legacy-jwt";
  return "unknown";
}

export function supabaseHeaders(key: string): Record<string, string> {
  const h: Record<string, string> = { apikey: key };
  if (keyKind(key) === "legacy-jwt") h.Authorization = `Bearer ${key}`;
  return h;
}

/** Palvelimen Supabase-yhteys, tai null jos ympäristömuuttujat puuttuvat */
export function supabaseServer(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}
