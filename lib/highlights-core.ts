// Ottelun kohokohtavideo virallisilta YouTube-kanavilta (puhdas logiikka, testit tests/highlights.test.ts).
// Periaatteet:
//  - Vain kiinteät, varmennetut kanavat (sarjat, oikeudenhaltijat, seurat). Kanavatunnisteet ja otsikkomuodot
//    tarkistettu oikeista syötteistä 26.10.2026. Ei hakua koko YouTubesta.
//  - Video yhdistetään otteluun vain, jos otsikossa ovat molemmat joukkueet (koti ensin), video on julkaistu
//    ottelupäivän jälkeen ikkunassa, ja otsikon tulos/päivämäärä (jos on) täsmää. Epäselvä → ei videota.
import { words } from "./live-core";

export type YtChannel = {
  id: string; name: string;
  /** otsikon on täsmättävä (ottelukooste, ei lehdistötilaisuus, live-lähetys tms.) */
  must: RegExp;
  reject?: RegExp;
};
export type YtVideo = { id: string; channel: string; title: string; published: string };

const NO = /rueda de prensa|press conference|conferenza|pressekonferenz|mediatilaisuus|reaktio|haastattelu|interview|\blive\b|en directo|🔴|#shorts/i;

const CH = {
  laliga: { id: "UCTv-XvfzLX3i4IGWAm4sbmA", name: "LALIGA EA SPORTS", must: /\|\s*RESUMEN\b/i },
  bundesliga: { id: "UC6UL29enLNe4mqwTfAyeNuw", name: "Bundesliga", must: /\|\s*Highlights\s*\|/i, reject: /ALL HIGHLIGHTS|Bundesliga 2\b|2\. Bundesliga/i },
  seriea: { id: "UCBJeMCIeLQos7wacox4hmLQ", name: "Serie A", must: /\|\s*HIGHLIGHTS\s*\|/i },
  ligue1: { id: "UCQsH5XtIc9hONE1BQjucM0g", name: "Ligue 1", must: /\(\d+\s*-\s*\d+\)\s*\|\s*Week\s*\d+/i },
  mls: { id: "UCSZbXT5TLLW_i-5W8FZpFsg", name: "Major League Soccer", must: /\|\s*Full Match Highlights/i, reject: /MLS NEXT/i },
  primeira: { id: "UCuIlu5oGIj1RzHOYmeSV5Eg", name: "VSPORTS - Liga Portugal", must: /^Resumo:.*\(Liga\s/i },
  superlig: { id: "UCPe9vNjHF1kEExT5kHwc7aw", name: "beIN SPORTS Türkiye", must: /Highlights\/Özet\s*\|\s*Trendyol Süper Lig/i },
  eredivisie: { id: "UCXnPiEv1DoUCDAqDUXT9shQ", name: "ESPN NL", must: /\|\s*Samenvatting\s/i },
  eliteserien: { id: "UC9QZZRUajPEoo1Q-V3MfvnQ", name: "TV 2 Sport", must: /^[^|]*\d+\s*-\s*\d+[^|]*$/ },
  vl: { id: "UCKShOO7m4qhA7qgfZA7WnJA", name: "Veikkausliiga", must: /Ottelun kohokohdat/i },
  hjk: { id: "UCm9p5KnMlh7N4wb5rgcIZ2A", name: "HJK TV", must: /^MATSIKOOSTE\s*\|/i },
  kups: { id: "UCmYkXPWJZSWHkfwUBRhXyow", name: "KuPS1923", must: /kooste/i },
  ilves: { id: "UCReVv0AFjhjuhqUGTEQQvpg", name: "Ilves Football", must: /^Highlights\s*\|\s*Veikkausliiga/i },
  tps: { id: "UC7-qMh4Gg2hGNNWeZbdChNg", name: "TPS TV – TPS Jalkapallo", must: /^Kooste:/i },
  vps: { id: "UCq7IX31j-_A441ap4XKY3Ww", name: "VPS1924", must: /kooste/i },
} satisfies Record<string, YtChannel>;

/** Sarja → kanavat (järjestys = etusija, jos useampi kanava julkaisee saman ottelun) */
export const HL_CHANNELS: Record<string, YtChannel[]> = {
  laliga: [CH.laliga], bundesliga: [CH.bundesliga], seriea: [CH.seriea], ligue1: [CH.ligue1], mls: [CH.mls],
  primeira: [CH.primeira], superlig: [CH.superlig], eredivisie: [CH.eredivisie], eliteserien: [CH.eliteserien],
  veikkausliiga: [CH.vl, CH.hjk, CH.kups, CH.ilves, CH.tps, CH.vps],
};
export const ALL_CHANNELS: YtChannel[] = [...new Map(Object.values(HL_CHANNELS).flat().map((c) => [c.id, c])).values()];
export const hlOn = (source: string) => !!HL_CHANNELS[source]?.length;

const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** YouTuben kanavasyöte (Atom) → videot. Tunnistamaton rivi ohitetaan. */
export function parseFeed(xml: string, channel: string): YtVideo[] {
  const out: YtVideo[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    const title = e.match(/<title>([^<]*)<\/title>/)?.[1];
    const published = e.match(/<published>([^<]+)<\/published>/)?.[1];
    if (!id || !title || !published || Number.isNaN(Date.parse(published))) continue;
    out.push({ id, channel, title: unesc(title).trim(), published: new Date(published).toISOString() });
  }
  return out;
}

export type HlMatch = { date: string; kickoff: number | null; home: string; away: string; score: [number, number] | null };

const DAY = 86400_000;
/** Ottelupäivän alku (Suomen aika, karkeasti UTC-3 h) ja ikkunan loppu: kooste julkaistaan yleensä samana tai seuraavana päivänä */
export const windowOf = (m: HlMatch): [number, number] => {
  const start = m.kickoff ?? Date.parse(`${m.date}T00:00:00Z`) - 3 * 3600_000;
  return [start, Date.parse(`${m.date}T00:00:00Z`) + 5 * DAY];
};

// Yleiset nimen osat, jotka eivät yksin tunnista joukkuetta (Real Madrid ≠ Real Sociedad)
const GENERIC = new Set(["real", "borussia", "athletic", "atletico", "sporting", "olympique", "stade", "racing", "dynamo", "union", "united", "city",
  "town", "rovers", "west", "inter", "deportivo", "eintracht", "hertha", "werder", "bayer", "vitoria", "academico", "sparta", "young", "boys"]);
// sanat samat, tai pidempi sana päättyy lyhyempään (mönchengladbach ↔ gladbach), vähintään 6 kirjainta
// tai alkaa sillä (erzurum ↔ erzurumspor)
const tokEq = (x: string, t: string) => x === t || (t.length >= 6 && (x.endsWith(t) || x.startsWith(t))) || (x.length >= 6 && (t.endsWith(x) || t.startsWith(x)));
// turkin pisteetön ı ei hajoa Unicode-normalisoinnissa (Kasımpaşa → kasimpasa)
const tw0 = (s: string) => words(s.replace(/ı/g, "i").replace(/İ/g, "I"));

// Tietolähteen nimi → nimi, jolla kanavat otsikoivat (tarkistettu oikeista otsikoista 26.10.2026)
const TITLE_ALIAS: Record<string, string[]> = {
  "hjk helsinki": ["HJK"], "inter turku": ["FC Inter"], "turku ps": ["TPS"], hsv: ["Hamburger SV"],
};

/** Joukkueen sijainti otsikon sanoissa: kaikki nimen sanat löytyvät, tai muuten nimen tunnistava (ei yleinen) sana; -1 = ei löydy */
export function posOf(team: string, tw: string[]): number {
  const alts = TITLE_ALIAS[tw0(team).join(" ")] ?? [];
  const all = [team, ...alts].map((x) => pos1(x, tw)).filter((i) => i >= 0);
  return all.length ? Math.min(...all) : -1;
}
function pos1(team: string, tw: string[]): number {
  const w = tw0(team);
  if (!w.length) return -1;
  const at = (x: string) => tw.findIndex((t) => tokEq(x, t));
  const all = w.map(at);
  if (all.every((i) => i >= 0)) return Math.min(...all);
  const key = w.filter((x) => x.length >= 3 && !GENERIC.has(x)).map(at).filter((i) => i >= 0);
  return key.length ? Math.min(...key) : -1;
}

/** Otsikon tulokset ("1 - 2", "2–2", "(0-0)") – vuosiluvut ja kaudet (2026/27, 26/27) eivät ole tuloksia */
export function scoresIn(title: string): [number, number][] {
  const t = title.replace(/\b\d{2,4}\s*[/–-]\s*\d{2,4}\b(?=\s*\)|\s*$|\s*\||\s*#)/g, " ").replace(/\b(19|20)\d{2}\b/g, " ");
  return [...t.matchAll(/(?:^|[^\d.:/])(\d{1,2})\s*[-–]\s*(\d{1,2})(?![\d.:/])/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
}
/** Otsikon päivämäärä (8.9.2026 / 03.10.2025) → YYYY-MM-DD */
export function dateIn(title: string): string | null {
  const m = title.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** Ottelun kooste annetuista videoista. null = ei yksiselitteistä osumaa. */
export function pickHighlight(videos: YtVideo[], m: HlMatch, channels: YtChannel[]): YtVideo | null {
  const [from, to] = windowOf(m);
  const byId = new Map(channels.map((c, i) => [c.id, { c, i }]));
  const hits = videos.filter((v) => {
    const ch = byId.get(v.channel);
    if (!ch) return false;
    const t = Date.parse(v.published);
    if (!(t >= from && t <= to)) return false;
    if (!ch.c.must.test(v.title) || ch.c.reject?.test(v.title) || NO.test(v.title)) return false;
    const d = dateIn(v.title);
    if (d && d !== m.date) return false;
    const tw = tw0(v.title);
    const h = posOf(m.home, tw), a = posOf(m.away, tw);
    if (h < 0 || a < 0 || h >= a) return false; // molemmat joukkueet, koti ensin
    const sc = scoresIn(v.title);
    if (sc.length && !(m.score && sc.some(([x, y]) => x === m.score![0] && y === m.score![1]))) return false;
    return true;
  });
  if (!hits.length) return null;
  // etusija: kanavalistan järjestys, sitten aikaisin julkaistu (alkuperäinen lataus)
  hits.sort((x, y) => byId.get(x.channel)!.i - byId.get(y.channel)!.i || Date.parse(x.published) - Date.parse(y.published));
  return hits[0];
}
