// Pelaajahaku: pelaajat football-datan sarjakohtaisista joukkuelistoista (/competitions/{koodi}/teams, sisältää
// kokoonpanot). Yksi haku sarjaa kohden, välimuistissa vuorokauden → ei kuormita ilmaista kiintiötä.
// Muiden sarjojen (Veikkausliiga, Ykkösliiga, Kansallinen Liiga, Pohjoismaat, WSL, Süper Lig, MLS, Eurooppa-liiga,
// Konferenssiliiga) pelaajat API-Footballin kokoonpanoista (lib/af-players.ts), profiili /pelaaja/af-{id}.
// Haku tehdään palvelimella, joten selain ei lataa tuhansia nimiä.
import { fd } from "./fd";
import { SOURCES } from "./sources";
import { fold } from "./search-core";
import { matchTeam, type AfTeam } from "./apifootball-core";
import type { AfSquad } from "./af-players-core";

export type PlayerHit = { id: number; name: string; team: string; crest?: string; position: string | null; href: string; photo?: string | null };
type Row = PlayerHit & { key: string; words: string[] };

const rowOf = (h: PlayerHit): Row => { const key = fold(h.name); return { ...h, key, words: key.split(" ") }; };

export function buildPlayers(teamLists: any[][]): Row[] {
  const seen = new Map<number, Row>();
  for (const teams of teamLists) {
    for (const t of teams ?? []) {
      for (const p of t?.squad ?? []) {
        if (typeof p?.id !== "number" || !p?.name || seen.has(p.id)) continue;
        seen.set(p.id, rowOf({ id: p.id, name: p.name, team: t.shortName || t.name || "", crest: t.crest || undefined, position: p.position ?? null, href: `/pelaaja/${p.id}` }));
      }
    }
  }
  return [...seen.values()];
}

/** API-Footballin kokoonpanot hakuriveiksi. europe = Eurooppa-liigan/Konferenssiliigan joukkueet: ohitetaan ne, jotka
 *  löytyvät yksiselitteisesti football-datan joukkueista (sama pelaaja ei näy kahdesti). Pelaaja kerran (lähteen tunniste). */
export function buildAfPlayers(leagues: { squads: AfSquad[]; europe: boolean }[], fdTeams: AfTeam[]): Row[] {
  const seenTeam = new Set<number>(), seen = new Map<number, Row>();
  for (const l of leagues) {
    for (const s of l.squads) {
      if (seenTeam.has(s.team.id)) continue;
      seenTeam.add(s.team.id);
      if (l.europe && matchTeam(s.team.name, fdTeams)) continue;
      for (const p of s.players) {
        if (seen.has(p.id)) continue;
        seen.set(p.id, rowOf({ id: p.id, name: p.name, team: s.team.name, crest: s.team.logo ?? undefined, position: p.position, href: `/pelaaja/af-${p.id}`, photo: p.photo }));
      }
    }
  }
  return [...seen.values()];
}

/** Hakusana osuu nimen sanaan: sana alkaa haulla, tai nimen sana on alkukirjain ("K. Walker" ↔ "kyle walker") */
const wordHit = (w: string, x: string) => x.startsWith(w) || (x.length === 1 && w.startsWith(x));

/** Osuma: kaikki hakusanat osuvat eri nimen sanoihin. Paras ensin: koko nimi alkaa hausta, sukunimi, muut. */
export function searchPlayers(rows: Row[], raw: string, limit = 8): PlayerHit[] {
  const q = fold(raw);
  if (q.length < 2) return [];
  const qw = q.split(" ");
  const scored: { r: Row; s: number }[] = [];
  for (const r of rows) {
    if (!qw.every((w) => r.words.some((x) => wordHit(w, x)))) continue;
    // pelkkiä alkukirjaimia ei hyväksytä: vähintään yhden hakusanan on osuttava kokonaiseen sanaan
    if (!qw.some((w) => r.words.some((x) => x.length > 1 && x.startsWith(w)))) continue;
    const last = r.words[r.words.length - 1];
    const s = r.key === q ? 0 : r.key.startsWith(q) ? 1 : last.startsWith(qw[qw.length - 1]) || last.startsWith(qw[0]) ? 2 : 3;
    scored.push({ r, s });
  }
  scored.sort((a, b) => a.s - b.s || a.r.name.localeCompare(b.r.name));
  return scored.slice(0, limit).map(({ r }) => ({ id: r.id, name: r.name, team: r.team, crest: r.crest, position: r.position, href: r.href, ...(r.photo ? { photo: r.photo } : {}) }));
}

export async function getPlayerRows(): Promise<{ rows: Row[]; teams: AfTeam[]; partial: boolean }> {
  const codes = [...new Set(SOURCES.map((s) => s.fd).filter(Boolean))];
  const lists = await Promise.all(codes.map((c) => fd<any>(`/competitions/${c}/teams`, 86400).catch(() => null)));
  const teams: AfTeam[] = lists.flatMap((l) => (l?.teams ?? []).filter((t: any) => typeof t?.id === "number" && t?.name).map((t: any) => ({ id: t.id, name: t.name })));
  return { rows: buildPlayers(lists.map((l) => l?.teams ?? [])), teams, partial: lists.some((l) => !l) };
}
