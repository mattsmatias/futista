// Hakukoneoptimointi: rakenteinen tieto (schema.org JSON-LD) ja kuvaukset. Puhdas logiikka testataan tests/seo.test.ts.
// Vain todellista tietoa: ei keksittyjä arvoja (puuttuva kenttä jätetään pois).
export const SITE = "https://www.futista.fi";

export const siteLd = () => ({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: `${SITE}/`, name: "Futista", alternateName: "futista.fi", inLanguage: "fi",
      description: "Jalkapallon tulokset, ottelut, sarjataulukot ja uutiset suomeksi." },
    { "@type": "Organization", "@id": `${SITE}/#org`, name: "Futista", url: `${SITE}/`, logo: `${SITE}/icons/icon-512.png?v=2` },
  ],
});

/** Helsingin aika → ISO-aikaleima (+03:00 / +02:00 kesä-/talviajan mukaan). time = "HH:MM" tai tyhjä. */
export function helsinkiIso(date: string, time?: string | null): string {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return date;
  const [h, m] = time.split(":").map(Number);
  // selvitetään Helsingin poikkeama UTC:stä kyseisenä päivänä
  const probe = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Helsinki", hour: "2-digit", hourCycle: "h23" }).format(probe);
  const off = Number(parts) - 12;
  const sign = off >= 0 ? "+" : "-";
  return `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00${sign}${String(Math.abs(off)).padStart(2, "0")}:00`;
}

export function matchLd(o: { url: string; league: string; date: string; time?: string | null; home: string; away: string; hs?: number | null; as?: number | null; finished: boolean }) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${o.home} – ${o.away}`,
    url: o.url,
    sport: "Soccer",
    startDate: helsinkiIso(o.date, o.time),
    eventStatus: "https://schema.org/EventScheduled",
    superEvent: { "@type": "SportsEvent", name: o.league },
    homeTeam: { "@type": "SportsTeam", name: o.home },
    awayTeam: { "@type": "SportsTeam", name: o.away },
    competitor: [{ "@type": "SportsTeam", name: o.home }, { "@type": "SportsTeam", name: o.away }],
    ...(o.finished && o.hs != null && o.as != null ? { description: `${o.home} ${o.hs}–${o.as} ${o.away} (${o.league})` } : {}),
  };
}

export function teamLd(o: { url: string; name: string; league: string; logo?: string | null }) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: o.name,
    url: o.url,
    sport: "Soccer",
    memberOf: { "@type": "SportsOrganization", name: o.league },
    ...(o.logo ? { logo: o.logo } : {}),
  };
}

export const breadcrumbLd = (items: { name: string; url: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.name, item: x.url })),
});

const FI_DAYS = ["su", "ma", "ti", "ke", "to", "pe", "la"];
/** "su 25.10.2026" */
export function fiDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${FI_DAYS[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}
