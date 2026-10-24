// Yhteydenottopyynnön toimitus ylläpidon sähköpostiin Resendin HTTP-rajapinnalla (https://resend.com/docs/api-reference/emails/send-email).
// Vain palvelimella. Asetukset ympäristömuuttujina (Vercel → Settings → Environment Variables, Production):
//   RESEND_API_KEY      Resendin API-avain (tyyppi Sensitive)
//   CONTACT_TO_EMAIL    vastaanottaja(t), pilkulla eroteltuna – ylläpidon vahvistama osoite
//   CONTACT_FROM_EMAIL  lähettäjä Resendissä vahvistetusta verkkotunnuksesta, esim. "Futista <lomake@futista.fi>"
// Jos jokin puuttuu, lomake ei lähetä mitään eikä näytä onnistumista.
// Lokeihin kirjataan vain tila (ei viestin sisältöä, nimeä eikä sähköpostiosoitteita).
import { nodeFetch } from "./http";
import { bodyFor, subjectFor, type ContactInput } from "./contact-core";

const BASE = (process.env.VERCEL_ENV !== "production" && process.env.RESEND_BASE_URL) || "https://api.resend.com";
const ADDR = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

const recipients = () => (process.env.CONTACT_TO_EMAIL ?? "").split(",").map((x) => x.trim()).filter((x) => ADDR.test(x));
const sender = () => {
  const f = (process.env.CONTACT_FROM_EMAIL ?? "").trim();
  const addr = f.match(/<([^>]+)>$/)?.[1] ?? f;
  return ADDR.test(addr) ? f : "";
};

/** Onko lomake käytettävissä (kaikki asetukset annettu)? Ei paljasta arvoja. */
export const contactConfigured = () => !!process.env.RESEND_API_KEY && recipients().length > 0 && !!sender();

/** Puuttuvien asetusten NIMET (ei arvoja) – raportointia varten */
export const contactMissing = () => [
  !process.env.RESEND_API_KEY && "RESEND_API_KEY",
  !recipients().length && "CONTACT_TO_EMAIL",
  !sender() && "CONTACT_FROM_EMAIL",
].filter(Boolean) as string[];

export async function sendContactMail(c: ContactInput): Promise<"sent" | "off" | "failed"> {
  if (!contactConfigured()) return "off";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await nodeFetch(`${BASE}/emails`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: sender(), to: recipients(), reply_to: c.email, subject: subjectFor(c), text: bodyFor(c) }),
    });
    const txt = await res.text();
    let id: unknown = null;
    try { id = JSON.parse(txt)?.id; } catch { /* ei JSON */ }
    if (res.ok && typeof id === "string" && id) return "sent";
    console.error("yhteydenotto: lähetys epäonnistui", res.status);
    return "failed";
  } catch {
    console.error("yhteydenotto: lähetys epäonnistui (verkko)");
    return "failed";
  } finally { clearTimeout(timer); }
}
