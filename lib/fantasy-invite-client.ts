// Selaimessa: istuntoon tallennettu kutsukoodi (app/fantasy/Invite.tsx tallentaa sen ?kutsu=-linkistä).
// Lähetetään tilin luonnin yhteydessä, jotta palvelin voi kirjata kutsujan ja antaa kutsupalkinnon. Palvelin tarkistaa koodin.
export const INVITE_KEY = "ff_kutsu";
export const INVITE_RE = /^[0-9a-z]{1,11}-[A-Za-z0-9_-]{12}$/;
export function pendingInvite(): string | undefined {
  try { const c = sessionStorage.getItem(INVITE_KEY); return c && INVITE_RE.test(c) ? c : undefined; } catch { return undefined; }
}
