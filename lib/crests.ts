// Joukkueiden logot football-data.orgin ilmaisesta rajapinnasta.
// Tarvitsee ympäristömuuttujan FOOTBALL_DATA_KEY (ilmainen avain: https://www.football-data.org/client/register).
// Ilman avainta palautetaan tyhjä, jolloin sivu näyttää seuran värimerkin.

import { staticCrest } from "./crest-ids";
import { fd } from "./fd";
import { words } from "./live-core";

const COMPETITIONS = ["PL", "PD", "CL"]; // sarjat, joiden tiedot luetaan lähdesivuilta (muissa logo tulee suoraan rajapinnasta)

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const FILLER = new Set(["fc", "cf", "afc", "sad", "club", "de", "la", "rc", "rcd", "ca", "cd", "ud", "sd", "real club", "futbol", "and", "hove", "albion"]);
const tokens = (s: string) => norm(s).split(" ").filter((t) => t && !FILLER.has(t));

// Nimet, jotka lähdesivulla poikkeavat rajapinnan nimistä
const ALIAS: Record<string, string> = {
  deportivo: "deportivo coruna",
  "deportivo alaves": "alaves",
  athletic: "athletic club",
  "racing santander": "racing santander",
  nottingham: "nottingham forest",
  brighton: "brighton",
  "man city": "manchester city",
  "man utd": "manchester united",
};

type ApiTeam = { id: number; name: string; shortName?: string; tla?: string; crest?: string };

async function loadTeams(): Promise<ApiTeam[]> {
  // logot ja tunnisteet vaihtuvat harvoin: kerran vuorokaudessa riittää
  const lists = await Promise.all(COMPETITIONS.map((c) => fd<{ teams: ApiTeam[] }>(`/competitions/${c}/teams`, 86400)));
  return lists.flatMap((l) => l?.teams ?? []);
}

function match(name: string, teams: ApiTeam[]): ApiTeam | undefined {
  const wanted = ALIAS[norm(name)] ?? name;
  const w = tokens(wanted);
  if (!w.length) return;
  // 1) täsmälleen sama nimi tai lyhytnimi
  const exact = teams.find((t) => [t.name, t.shortName].some((n) => n && tokens(n).join(" ") === w.join(" ")));
  if (exact) return exact;
  // 2) kaikki haetun nimen sanat löytyvät joukkueen nimestä; valitaan se, jossa vähiten ylimääräistä
  let best: ApiTeam | undefined;
  let extra = Infinity;
  for (const t of teams) {
    const tt = tokens(`${t.name} ${t.shortName ?? ""}`);
    if (w.every((x) => tt.includes(x))) {
      const e = tokens(t.name).length - w.length;
      if (e < extra) { extra = e; best = t; }
    }
  }
  if (best) return best;
  // 3) yksiselitteinen nimen osa (esim. "Sabah FC Masazir" ↔ "Sabah FK")
  const withWords = teams.map((t) => ({ ...t, name: t.name, w: [...words(t.name), ...words(t.shortName ?? ""), ...words(t.tla ?? "")] }));
  const hit = withWords.filter((t) => words(name).some((x) => x.length >= 4 && t.w.includes(x)));
  return hit.length === 1 ? hit[0] : undefined;
}

export type TeamRef = { crest?: string; id?: number };

/** Palauttaa funktion, joka antaa joukkueen nimelle logon ja football-data-tunnisteen. */
export async function crestLookup(): Promise<(name: string) => TeamRef> {
  const teams = await loadTeams();
  const memo = new Map<string, TeamRef>();
  // 1) rajapinnan logo ja tunniste (jos avain on), 2) kiinteä logolista, 3) ei logoa → värimerkki
  return (name) => {
    if (!memo.has(name)) {
      const t = teams.length ? match(name, teams) : undefined;
      memo.set(name, { crest: t?.crest ?? staticCrest(name), id: t?.id });
    }
    return memo.get(name)!;
  };
}
