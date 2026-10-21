// Pelaajahaku: pelaajat football-datan sarjakohtaisista joukkuelistoista (/competitions/{koodi}/teams, sisältää
// kokoonpanot). Yksi haku sarjaa kohden, välimuistissa vuorokauden → ei kuormita ilmaista kiintiötä.
// Haku tehdään palvelimella, joten selain ei lataa tuhansia nimiä.
import { fd } from "./fd";
import { SOURCES } from "./sources";
import { fold } from "./search-core";

export type PlayerHit = { id: number; name: string; team: string; crest?: string; position: string | null; href: string };
type Row = PlayerHit & { key: string; words: string[] };

export function buildPlayers(teamLists: any[][]): Row[] {
  const seen = new Map<number, Row>();
  for (const teams of teamLists) {
    for (const t of teams ?? []) {
      for (const p of t?.squad ?? []) {
        if (typeof p?.id !== "number" || !p?.name || seen.has(p.id)) continue;
        const key = fold(p.name);
        seen.set(p.id, {
          id: p.id, name: p.name, team: t.shortName || t.name || "", crest: t.crest || undefined,
          position: p.position ?? null, href: `/pelaaja/${p.id}`, key, words: key.split(" "),
        });
      }
    }
  }
  return [...seen.values()];
}

/** Osuma: kaikki hakusanat alkavat jonkin nimen sanan alusta. Paras ensin: koko nimi alkaa hausta, sukunimi, muut. */
export function searchPlayers(rows: Row[], raw: string, limit = 8): PlayerHit[] {
  const q = fold(raw);
  if (q.length < 2) return [];
  const qw = q.split(" ");
  const scored: { r: Row; s: number }[] = [];
  for (const r of rows) {
    if (!qw.every((w) => r.words.some((x) => x.startsWith(w)))) continue;
    const s = r.key === q ? 0 : r.key.startsWith(q) ? 1 : r.words[r.words.length - 1].startsWith(qw[0]) ? 2 : 3;
    scored.push({ r, s });
  }
  scored.sort((a, b) => a.s - b.s || a.r.name.localeCompare(b.r.name));
  return scored.slice(0, limit).map(({ r }) => ({ id: r.id, name: r.name, team: r.team, crest: r.crest, position: r.position, href: r.href }));
}

export async function getPlayerRows(): Promise<{ rows: Row[]; partial: boolean }> {
  const codes = [...new Set(SOURCES.map((s) => s.fd).filter(Boolean))];
  const lists = await Promise.all(codes.map((c) => fd<any>(`/competitions/${c}/teams`, 86400).catch(() => null)));
  return { rows: buildPlayers(lists.map((l) => l?.teams ?? [])), partial: lists.some((l) => !l) };
}
