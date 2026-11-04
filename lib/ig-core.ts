// Instagram-luonnokset uutisista (puhdas logiikka; testataan tests/ig.test.ts).
// Luonnos = uutisen oma kuva taustalla (käyttäjän valinta 5.11.2026; kuvan käyttöoikeus on julkaisijan vastuulla)
// tai Futistan kuvapohja, jos uutisella ei ole kuvaa, + otsikko, sarja, juttutyyppi ja valmis kuvateksti.
// Teksti on uutisen omaa otsikkoa ja ingressiä – mitään ei keksitä. Lähde ja kuvan lähde mainitaan kuvatekstissä.
// Julkaisu tehdään käsin (ei suoraa Instagram-yhteyttä).

export type IgArticle = { id: string; title: string; date: string; type: string; league: string; sourceName: string; excerpt: string; link: string; image?: string | null };

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, "") + "…";
};

/** Otsikko kuvaan: enintään 120 merkkiä */
export const igTitle = (a: Pick<IgArticle, "title">) => clip(a.title, 120);

/** Otsikon fonttikoko pituuden mukaan (1080 px leveä kuva) */
export const igTitleSize = (title: string) => (title.length <= 40 ? 92 : title.length <= 70 ? 76 : title.length <= 95 ? 64 : 56);

/** Sarjan nimi tunnisteeksi: "La Liga" → #laliga, "Valioliiga" → #valioliiga */
const tag = (s: string) => "#" + s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Valmis kuvateksti: otsikko, ingressi (enintään 2 virkettä / 260 merkkiä), ohjaus juttuun, lähde, tunnisteet */
export function igCaption(a: IgArticle): string {
  const tags = [...new Set(["#futista", "#jalkapallo", a.league ? tag(a.league) : "", "#futisuutiset"].filter((x) => x.length > 1))];
  const parts = [
    a.title.trim(),
    a.excerpt.trim() ? clip(a.excerpt, 260) : "",
    "Lue koko juttu Futistasta – linkki biossa 👆",
    a.sourceName ? `${a.image ? "Lähde ja kuva" : "Lähde"}: ${a.sourceName}` : "",
    tags.join(" "),
  ].filter(Boolean);
  return parts.join("\n\n");
}

/** Tiedostonimi ladattavalle kuvalle */
export const igFile = (a: Pick<IgArticle, "title" | "date">) =>
  `futista-${a.date.slice(0, 10)}-${a.title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}.png`;
