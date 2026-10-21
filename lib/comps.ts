// Kilpailujen esitystiedot: järjestys, maa ja tunnusmerkki (lyhenne + väri tunnisteena, ei koko käyttöliittymän väritys)
import { SOURCES, type SourceId } from "./sources";

/** Johdonmukainen järjestys otteluiden etusivulla ja Sarjat-hakemistossa */
export const COMP_ORDER: SourceId[] = ["ucl", "laliga", "valioliiga", "bundesliga", "seriea", "ligue1", "eredivisie", "primeira", "championship"];
export const POPULAR: SourceId[] = ["laliga", "valioliiga", "ucl"];

export const COMP_META: Record<SourceId, { mark: string; country: "es" | "en" | "eu" | "de" | "it" | "fr" | "nl" | "pt" }> = {
  ucl: { mark: "MLI", country: "eu" },
  laliga: { mark: "LL", country: "es" },
  valioliiga: { mark: "PL", country: "en" },
  bundesliga: { mark: "BL", country: "de" },
  seriea: { mark: "SA", country: "it" },
  ligue1: { mark: "L1", country: "fr" },
  eredivisie: { mark: "ED", country: "nl" },
  primeira: { mark: "LP", country: "pt" },
  championship: { mark: "CH", country: "en" },
};

export const compIds = () => COMP_ORDER.filter((id) => SOURCES.some((s) => s.id === id));
export const hasNews = (id: string) => !!SOURCES.find((s) => s.id === id)?.feeds.length;
