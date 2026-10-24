// Mainosta-sivun yhteydenottolomake: syötteiden tarkistus (puhdas logiikka, testataan tests/contact.test.ts).
// Sama tarkistus palvelimella (pakollinen) ja selaimessa (vain käyttäjän avuksi).

export const LIMITS = { name: [2, 100], company: [0, 120], email: [6, 254], message: [10, 3000] } as const;
export const MIN_FILL_MS = 2500;   // nopeampi täyttö = todennäköisesti botti
export const MAX_LINKS = 5;        // enemmän linkkejä = todennäköisesti roskapostia
export const MAX_BODY_BYTES = 12_000;

export type ContactInput = { name: string; company: string; email: string; message: string };
export type FieldError = "name" | "company" | "email" | "message";

// rivinvaihdot sallitaan vain viestissä; muut ohjausmerkit poistetaan kaikkialta
const oneLine = (v: unknown) => (typeof v === "string" ? v : "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
const multiLine = (v: unknown) => (typeof v === "string" ? v : "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/g, "").replace(/\n{4,}/g, "\n\n\n").trim();
const EMAIL = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]{2,}$/;
const len = (s: string) => [...s].length;

export function normalizeContact(raw: Record<string, unknown>): ContactInput {
  return { name: oneLine(raw.name), company: oneLine(raw.company), email: oneLine(raw.email).toLowerCase(), message: multiLine(raw.message) };
}

export function validateContact(c: ContactInput): FieldError[] {
  const bad: FieldError[] = [];
  const within = (s: string, [lo, hi]: readonly [number, number]) => len(s) >= lo && len(s) <= hi;
  if (!within(c.name, LIMITS.name)) bad.push("name");
  if (!within(c.company, LIMITS.company)) bad.push("company");
  if (!within(c.email, LIMITS.email) || !EMAIL.test(c.email)) bad.push("email");
  if (!within(c.message, LIMITS.message)) bad.push("message");
  return bad;
}

/** Kevyt roskapostisuoja: piilokenttä täytetty, liian nopea täyttö tai paljon linkkejä. */
export function looksLikeSpam(raw: Record<string, unknown>, c: ContactInput): boolean {
  if (typeof raw.website === "string" && raw.website.trim() !== "") return true;
  const ms = Number(raw.elapsed);
  if (!Number.isFinite(ms) || ms < MIN_FILL_MS) return true;
  const links = (c.message.match(/https?:\/\/|www\./gi) ?? []).length;
  return links > MAX_LINKS;
}

/** Sähköpostin otsikko: ei rivinvaihtoja (otsakeinjektio), rajattu pituus */
export const subjectFor = (c: ContactInput) => `Futista: mainosyhteydenotto – ${c.name}${c.company ? ` (${c.company})` : ""}`.slice(0, 180);

export const bodyFor = (c: ContactInput) =>
  [`Nimi: ${c.name}`, `Yritys: ${c.company || "–"}`, `Sähköposti: ${c.email}`, "", "Viesti:", c.message, "", "—", "Lähetetty Futistan Mainosta-sivun lomakkeella (futista.fi/mainosta)."].join("\n");

/** Liukuva ikkuna (muistissa). Palauttaa true, jos uusi tapahtuma mahtuu rajaan. */
export function slidingAllow(times: number[], now: number, limit: number, windowMs: number): { ok: boolean; times: number[] } {
  const kept = times.filter((x) => now - x < windowMs);
  if (kept.length >= limit) return { ok: false, times: kept };
  return { ok: true, times: [...kept, now] };
}
