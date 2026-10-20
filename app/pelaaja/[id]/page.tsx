import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fd } from "@/lib/fd";
import { getStatsWith, type LeagueStats, type Team } from "@/lib/stats";
import { SOURCES } from "@/lib/sources";
import { helsinkiParts } from "@/lib/live-core";
import { matchHref, teamHref } from "@/lib/routes";
import { getPhoto } from "@/lib/photos";
import PlayerView, { type PlayerData } from "./PlayerView";

export const revalidate = 1800;
export const maxDuration = 60;

type Props = { params: { id: string } };
const NATIONAL = new Set(["WC", "EC", "UNL", "QCAF", "QUEFA", "CAF", "CA", "FRIENDLY"]);

/** Joukkue meidän tilastoista football-data-tunnisteella (nimi ja sarja linkkejä varten) */
function ours(stats: LeagueStats[], source: string | undefined, id: number): Team | undefined {
  const pool = stats.filter((s) => !source || s.source === source);
  for (const s of pool) {
    const t = [...s.table.map((r) => r.team), ...s.results.flatMap((r) => [r.home, r.away]), ...s.fixtures.flatMap((f) => [f.home, f.away])].find((x) => x.id === id);
    if (t) return t;
  }
}

async function load(id: string): Promise<PlayerData | null> {
  if (!/^\d+$/.test(id)) return null;
  const [p, pm] = await Promise.all([
    fd<any>(`/persons/${id}`, 86400),
    fd<any>(`/persons/${id}/matches?limit=12`, 1800),
  ]);
  if (!p?.name) return null;
  const matches: any[] = pm?.matches ?? [];
  // uutissarjat + ne muut sarjat, joissa pelaaja on pelannut (nimiä ja linkkejä varten)
  const comps = [...new Set(matches.map((m) => SOURCES.find((s) => s.fd === m.competition?.code)?.id).filter(Boolean))] as string[];
  const stats = await getStatsWith(comps);

  // seura = joukkue, joka esiintyy useimmin seurajoukkueiden otteluissa
  const count = new Map<number, { n: number; team: any; comp: string }>();
  for (const m of matches.filter((x) => !NATIONAL.has(x.competition?.code))) {
    for (const t of [m.homeTeam, m.awayTeam]) {
      const c = count.get(t.id) ?? { n: 0, team: t, comp: m.competition.code };
      c.n++; count.set(t.id, c);
    }
  }
  const top = [...count.values()].sort((a, b) => b.n - a.n)[0];
  let club: PlayerData["club"] = null;
  if (top && top.n >= 2) {
    // kotimaan sarja ensin, Mestarien liiga vasta sitten
    const ordered = [...stats.filter((s) => s.source !== "ucl"), ...stats.filter((s) => s.source === "ucl")];
    const homeStats = ordered.find((s) => s.table.some((r) => r.team.id === top.team.id));
    const mine = homeStats?.table.find((r) => r.team.id === top.team.id)?.team;
    const home = homeStats?.source;
    club = {
      name: mine?.name ?? top.team.shortName ?? top.team.name,
      crest: mine?.crest ?? top.team.crest,
      href: mine && home ? teamHref(home, mine.name) : null,
    };
  }

  const photo = await getPhoto(p.name, club?.name ?? "");
  return {
    id: p.id, name: p.name, photo, dateOfBirth: p.dateOfBirth ?? null, nationality: p.nationality ?? null,
    position: p.position ?? p.section ?? null, shirtNumber: p.shirtNumber ?? null, club,
    matches: matches.map((m) => {
      const source = SOURCES.find((s) => s.fd === m.competition?.code)?.id;
      const date = helsinkiParts(Date.parse(m.utcDate));
      const h = source ? ours(stats, source, m.homeTeam.id) : undefined;
      const a = source ? ours(stats, source, m.awayTeam.id) : undefined;
      const done = (m.status === "FINISHED" || m.status === "AWARDED") && m.score?.fullTime?.home != null;
      return {
        source: source ?? null, comp: m.competition?.name ?? "", emblem: m.competition?.emblem ?? null,
        date: date.date, time: date.time,
        home: { name: h?.name ?? m.homeTeam.shortName ?? m.homeTeam.name, code: m.homeTeam.tla ?? "", crest: h?.crest ?? m.homeTeam.crest },
        away: { name: a?.name ?? m.awayTeam.shortName ?? m.awayTeam.name, code: m.awayTeam.tla ?? "", crest: a?.crest ?? m.awayTeam.crest },
        hs: done ? m.score.fullTime.home : null, as: done ? m.score.fullTime.away : null,
        href: source && h && a ? matchHref(source, date.date, h.name, a.name) : null,
      };
    }).sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time)),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load(params.id);
  return { title: d ? `${d.name} – pelaaja – Futista` : "Futista" };
}

export default async function PlayerPage({ params }: Props) {
  const d = await load(params.id);
  if (!d) notFound();
  return <PlayerView p={d} />;
}
