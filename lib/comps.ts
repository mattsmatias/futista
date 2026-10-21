// Kilpailujen esitystiedot: järjestys, maa ja tunnusmerkki (lyhenne + väri tunnisteena, ei koko käyttöliittymän väritys)
import { SOURCES, type SourceId } from "./sources";

/** Johdonmukainen järjestys otteluiden etusivulla ja Sarjat-hakemistossa */
export const COMP_ORDER: SourceId[] = ["ucl", "laliga", "valioliiga", "bundesliga", "seriea", "ligue1", "eredivisie", "primeira", "championship", "superlig", "mls"];
export const POPULAR: SourceId[] = ["laliga", "valioliiga", "ucl"];

export const COMP_META: Record<SourceId, { mark: string; country: "es" | "en" | "eu" | "de" | "it" | "fr" | "nl" | "pt" | "tr" | "us" }> = {
  ucl: { mark: "MLI", country: "eu" },
  laliga: { mark: "LL", country: "es" },
  valioliiga: { mark: "PL", country: "en" },
  bundesliga: { mark: "BL", country: "de" },
  seriea: { mark: "SA", country: "it" },
  ligue1: { mark: "L1", country: "fr" },
  eredivisie: { mark: "ED", country: "nl" },
  primeira: { mark: "LP", country: "pt" },
  championship: { mark: "CH", country: "en" },
  superlig: { mark: "SL", country: "tr" },
  mls: { mark: "MLS", country: "us" },
};

/** Kilpailun oma logo. Lähteet ovat jo käytössä olevia tietolähteitä (ESPN ja football-data), ei uusia.
 *  Valinta 21.10.2026: ESPN:n logot ovat pääosin uudempia (esim. La Ligan nykyinen LALIGA-logo, päivitetty 7/2025)
 *  ja niistä on erillinen versio tummalle pohjalle. Championshipin uudempi logo on football-datalla (12/2024).
 *  Kaikki osoitteet tarkistettu (200 image/png). */
const espn = (n: number) => ({ light: `https://a.espncdn.com/i/leaguelogos/soccer/500/${n}.png`, dark: `https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${n}.png` });
export const COMP_EMBLEM: Record<SourceId, { light: string; dark?: string }> = {
  ucl: espn(2),
  laliga: espn(15),
  valioliiga: espn(23),
  bundesliga: espn(10),
  seriea: espn(12),
  ligue1: espn(9),
  eredivisie: espn(11),
  primeira: espn(14),
  championship: { light: "https://crests.football-data.org/ELC.png" },
  superlig: espn(18),
  mls: espn(19),
};

export const compIds = () => COMP_ORDER.filter((id) => SOURCES.some((s) => s.id === id));
export const hasNews = (id: string) => !!SOURCES.find((s) => s.id === id)?.feeds.length;
