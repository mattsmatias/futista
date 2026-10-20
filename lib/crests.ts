// Joukkueiden logot football-data.orgin ilmaisesta rajapinnasta.
// Tarvitsee ympäristömuuttujan FOOTBALL_DATA_KEY (ilmainen avain: https://www.football-data.org/client/register).
// Ilman avainta palautetaan tyhjä, jolloin sivu näyttää seuran värimerkin.

import { staticCrest } from "./crest-ids";

const COMPETITIONS = ["PL", "PD", "CL"]; // Valioliiga, La Liga, Mestarien liiga

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

type ApiTeam = { name: string; shortName?: string; tla?: string; crest?: string };
let cache: { at: number; teams: ApiTeam[] } | null = null;

async function loadTeams(): Promise<ApiTeam[]> {
  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) return [];
  if (cache && Date.now() - cache.at < 6 * 3600_000) return cache.teams;
  const lists = await Promise.all(
    COMPETITIONS.map(async (c) => {
      try {
        const res = await fetch(`https://api.football-data.org/v4/competitions/${c}/teams`, {
          headers: { "X-Auth-Token": key },
          next: { revalidate: 86400 }, // logot vaihtuvat harvoin: kerran vuorokaudessa riittää
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.teams ?? []) as ApiTeam[];
      } catch {
        return [];
      }
    })
  );
  const teams = lists.flat().filter((t) => t.crest);
  if (teams.length) cache = { at: Date.now(), teams };
  return teams;
}

function match(name: string, teams: ApiTeam[]): string | undefined {
  const wanted = ALIAS[norm(name)] ?? name;
  const w = tokens(wanted);
  if (!w.length) return;
  // 1) täsmälleen sama nimi tai lyhytnimi
  const exact = teams.find((t) => [t.name, t.shortName].some((n) => n && tokens(n).join(" ") === w.join(" ")));
  if (exact) return exact.crest;
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
  return best?.crest;
}

/** Palauttaa funktion, joka antaa joukkueen nimelle logon osoitteen (tai undefined). */
export async function crestLookup(): Promise<(name: string) => string | undefined> {
  const teams = await loadTeams();
  const memo = new Map<string, string | undefined>();
  // 1) rajapinnan logo (jos avain on), 2) kiinteä tunnistelista, 3) ei logoa → värimerkki
  return (name) => {
    if (!memo.has(name)) memo.set(name, (teams.length ? match(name, teams) : undefined) ?? staticCrest(name));
    return memo.get(name);
  };
}
