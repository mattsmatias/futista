// Lähdesivujen omat kanava- ja tilausmainokset ("Liity kanavallemme WhatsAppissa … LIITY NYT").
// Ne kuuluvat lähdesivulle, eivät Futistaan: poistetaan jutun tekstistä ja otteesta.
export const PROMO_TEXT =
  /liity\s+(kanavalle|kanavaamme|ryhmä|seuraajiin|whats?app|telegram)|whats?app-?kanava|liity\s+nyt\b|tilaa\s+uutiskirje|seuraa\s+meitä\s+(myös\s+)?(whats?app|telegram|instagram|facebook|tiktok|x:?ssä|twitter)/i;
export const PROMO_LINK = /(^|\/\/)(www\.)?(whatsapp\.com\/channel|chat\.whatsapp\.com|t\.me\/)/i;

/** Lyhyt tekstilohko, joka on kanavamainos (pitkää tekstiä ei poisteta, vaikka siinä mainittaisiin sana) */
export const isPromo = (text: string, links: string[] = []) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length > 300) return false;
  return PROMO_TEXT.test(t) || (links.some((h) => PROMO_LINK.test(h)) && /liity|seuraa|tilaa|join|follow/i.test(t));
};

/** Kanavamainokset pois jäsennetystä sivusta (lyhyet lohkot, joissa mainosteksti tai kanavalinkki) */
export function removePromos(doc: any) {
  for (const el of [...doc.querySelectorAll("p,h2,h3,h4,h5,li,blockquote,div,aside,section")] as any[]) {
    const links = [...el.querySelectorAll("a")].map((a: any) => a.getAttribute("href") || "");
    if (isPromo(el.textContent || "", links)) el.remove();
  }
}
