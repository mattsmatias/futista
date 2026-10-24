// Kokoonpano- ja tilastorajapinnan yhteinen osa (palvelin): Futistan ottelu osoitteen sarjasta, päivästä ja joukkueista.
// Vain Futistan tuntemat ottelut (sarjan tulokset/otteluohjelma) hyväksytään: mielivaltaiset osoitteet eivät tee lähdehakuja.
import { getStatsWith } from "./stats";
import { SOURCES } from "./sources";
import { teamSlug, findTeam } from "./routes";
import { todayHel } from "./day";
import { helsinkiEpoch } from "./live-core";
import { isDate } from "./day";

export type OurMatch = { source: string; date: string; pair: string; kickoff: number | null; finished: boolean; aet: boolean; eid?: string; afid?: number; home: { name: string; id?: number }; away: { name: string; id?: number } };

/** null = tuntematon ottelu (404); "unavailable" = sarjan tietoja ei saatu juuri nyt */
export async function ourMatch(source: string, date: string, pair: string): Promise<OurMatch | null | "unavailable"> {
  if (!SOURCES.some((s) => s.id === source) || !isDate(date) || !/^[a-z0-9-]+--[a-z0-9-]+$/.test(pair) || pair.length > 120) return null;
  const all = await getStatsWith([source]).catch(() => null);
  const s = all?.find((x) => x.source === source);
  if (!s) return "unavailable";
  const [h, a] = pair.split("--");
  const hit = (x: { date: string; home: { name: string }; away: { name: string } }) => x.date === date && teamSlug(x.home.name) === h && teamSlug(x.away.name) === a;
  const r = s.results.find(hit), f = r ? undefined : s.fixtures.find(hit);
  const m = r ?? f;
  // lähde ei antanut kaikkia osia → ei voida sanoa, ettei ottelua ole
  if (!m) return s.failed?.length ? "unavailable" : null;
  const time = (r?.time ?? f?.time) || "";
  return {
    source, date, pair,
    kickoff: /^\d{1,2}:\d{2}$/.test(time) ? helsinkiEpoch(date, time) : null,
    finished: !!r, aet: !!r?.note, ...(m.eid ? { eid: m.eid } : {}), ...(m.afid ? { afid: m.afid } : {}),
    home: { name: m.home.name, id: m.home.id }, away: { name: m.away.name, id: m.away.id },
  };
}

/** Tämän päivän käynnissä oleva ottelu, joka on jo poistunut lähteen otteluohjelmasta (kuten ottelusivulla):
 *  joukkueet sarjan tiedoista, alkamisaika tuntematon. Vain tälle päivälle; null = ei tunnistettu. */
export async function liveOurMatch(source: string, date: string, pair: string): Promise<OurMatch | null> {
  if (date !== todayHel() || !/^[a-z0-9-]+--[a-z0-9-]+$/.test(pair) || pair.length > 120) return null;
  const s = (await getStatsWith([source]).catch(() => null))?.find((x) => x.source === source);
  if (!s) return null;
  const [h, a] = pair.split("--");
  const home = findTeam(s, h), away = findTeam(s, a);
  if (!home || !away || home.name === away.name) return null;
  return { source, date, pair, kickoff: null, finished: false, aet: false, home: { name: home.name, id: home.id }, away: { name: away.name, id: away.id } };
}
