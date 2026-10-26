import { NextResponse } from "next/server";
import { afGet, hasApiFootball } from "@/lib/apifootball";
import { stableCache } from "@/lib/stable-cache";

// Kehitystyökalu: API-Footballin kilpailun todellinen sisältö (nimi, maa, kaudet, kattavuus, oikeat ottelut).
// VAIN esikatselussa (ei tuotannossa), VAIN sallitut kilpailut ja kiinteät hakupolut → ei avoin välityspalvelin.
// Avain pysyy palvelimella. Tulos välimuistissa 6 h (enintään 5 lähdehakua / kilpailu).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED = new Set([140, 244, 245, 246, 640, 1087, 1, 4, 5, 32, 45, 48, 143, 81, 137, 66, 3, 848, 44, 525, 113, 103, 119]);

const summarize = (fx: any[]) => {
  const st: Record<string, number> = {};
  for (const f of fx) { const s = f?.fixture?.status?.short ?? "?"; st[s] = (st[s] ?? 0) + 1; }
  const dates = fx.map((f) => String(f?.fixture?.date ?? "")).filter(Boolean).sort();
  const rounds = [...new Set(fx.map((f) => f?.league?.round).filter(Boolean))];
  const teams = [...new Set(fx.flatMap((f) => [f?.teams?.home?.name, f?.teams?.away?.name]).filter(Boolean))];
  return { total: fx.length, status: st, first: dates[0] ?? null, last: dates.at(-1) ?? null, rounds: rounds.slice(0, 40), roundCount: rounds.length, teams: teams.slice(0, 40), teamCount: teams.length };
};

const check = (id: number) => stableCache(async () => {
  const lg = await afGet(`/leagues?id=${id}`);
  const r = lg?.response?.[0];
  if (!r) return { id, found: false };
  const seasons = (r.seasons ?? []).map((s: any) => ({ year: s.year, start: s.start, end: s.end, current: s.current, coverage: s.coverage }));
  const cur = seasons.find((s: any) => s.current) ?? seasons.at(-1);
  const out: any = { id, found: true, name: r.league?.name, type: r.league?.type, country: r.country?.name, logo: r.league?.logo, seasons: seasons.map((s: any) => ({ year: s.year, start: s.start, end: s.end, current: s.current })), chosen: cur ? { year: cur.year, start: cur.start, end: cur.end, coverage: cur.coverage } : null };
  if (!cur) return out;
  const fxj = await afGet(`/fixtures?league=${id}&season=${cur.year}&timezone=Europe/Helsinki`);
  const fx: any[] = fxj?.response ?? [];
  out.fixtures = summarize(fx);
  out.sampleFixture = fx[0] ? { status: fx[0].fixture?.status, date: fx[0].fixture?.date, timestamp: fx[0].fixture?.timestamp, round: fx[0].league?.round, home: fx[0].teams?.home, away: fx[0].teams?.away, goals: fx[0].goals, score: fx[0].score } : null;
  const done = fx.filter((f) => ["FT", "AET", "PEN"].includes(f?.fixture?.status?.short)).sort((a, b) => (b.fixture?.timestamp ?? 0) - (a.fixture?.timestamp ?? 0));
  out.pens = fx.filter((f) => f?.fixture?.status?.short === "PEN").slice(0, 2).map((f) => ({ goals: f.goals, score: f.score, teams: [f.teams?.home?.name, f.teams?.away?.name] }));
  out.aet = fx.filter((f) => f?.fixture?.status?.short === "AET").slice(0, 2).map((f) => ({ goals: f.goals, score: f.score }));
  if (done[0]) {
    const dj = await afGet(`/fixtures?id=${done[0].fixture.id}&timezone=Europe/Helsinki`);
    const d = dj?.response?.[0];
    out.detail = d ? {
      fixtureId: d.fixture?.id, date: d.fixture?.date, teams: [d.teams?.home?.name, d.teams?.away?.name], status: d.fixture?.status,
      events: (d.events ?? []).length, eventTypes: [...new Set((d.events ?? []).map((e: any) => `${e.type}/${e.detail}`))].slice(0, 12),
      lineups: (d.lineups ?? []).map((l: any) => ({ team: l.team?.name, formation: l.formation, startXI: (l.startXI ?? []).length, withGrid: (l.startXI ?? []).filter((p: any) => p?.player?.grid).length, subs: (l.substitutes ?? []).length, coach: !!l.coach?.name })),
      statistics: (d.statistics ?? []).map((s: any) => ({ team: s.team?.name, n: (s.statistics ?? []).length, types: (s.statistics ?? []).map((x: any) => x.type).slice(0, 20), nulls: (s.statistics ?? []).filter((x: any) => x.value === null).length })),
      players: (d.players ?? []).map((p: any) => ({ team: p.team?.name, n: (p.players ?? []).length, rated: (p.players ?? []).filter((x: any) => x?.statistics?.[0]?.games?.rating).length })),
    } : null;
  }
  const sj = await afGet(`/standings?league=${id}&season=${cur.year}`).catch((e) => ({ error: String(e?.code ?? e) }));
  const groups = sj?.response?.[0]?.league?.standings ?? [];
  out.standings = { groups: groups.length, sizes: groups.map((g: any[]) => g.length), names: groups.map((g: any[]) => g?.[0]?.group).slice(0, 20), error: sj?.error ?? null };
  const tj = await afGet(`/players/topscorers?league=${id}&season=${cur.year}`).catch((e) => ({ error: String(e?.code ?? e) }));
  out.topscorers = { n: (tj?.response ?? []).length, first: tj?.response?.[0] ? { name: tj.response[0].player?.name, team: tj.response[0].statistics?.[0]?.team?.name, goals: tj.response[0].statistics?.[0]?.goals?.total } : null, error: tj?.error ?? null };
  return out;
}, ["af-tarkistus-v1", String(id)], { revalidate: 6 * 3600 })();

const finland = stableCache(async () => {
  const j = await afGet(`/leagues?country=Finland`);
  return (j?.response ?? []).map((r: any) => ({ id: r.league?.id, name: r.league?.name, type: r.league?.type, seasons: (r.seasons ?? []).filter((s: any) => s.year >= 2023).map((s: any) => ({ year: s.year, current: s.current, start: s.start, end: s.end })) }));
}, ["af-tarkistus-fi-v1"], { revalidate: 6 * 3600 });

// VÄLIAIKAINEN (esikatselu): miksi kertoimia ei löydy – päivän ottelut, API-Footballin nimet ja yhdistäminen
import { getStatsWith } from "@/lib/stats";
import { afFindFixture, afOdds } from "@/lib/af-league";
import { helsinkiEpoch } from "@/lib/live-core";
async function findCheck(l: string, d: string) {
  const s = (await getStatsWith([l as any]).catch(() => null))?.find((x) => x.source === l);
  const ms = [...(s?.fixtures ?? []), ...(s?.results ?? [])].filter((x) => x.date === d);
  const af = await afGet(`/fixtures?league=${({ superlig: 203, laliga: 140, bundesliga: 78, seriea: 135, ligue1: 61, mls: 253, eredivisie: 88, primeira: 94 } as any)[l]}&date=${d}&season=2026&timezone=Europe/Helsinki`).catch(() => null);
  const afl = (af?.response ?? []).map((f: any) => `${f.teams?.home?.name} – ${f.teams?.away?.name} ${String(f.fixture?.date).slice(11, 16)}`);
  const out = [];
  for (const m of ms) {
    const k = (m as any).time && /^\d{1,2}:\d{2}$/.test((m as any).time) ? helsinkiEpoch(m.date, (m as any).time) : null;
    const id = await afFindFixture(l, d, k, m.home.name, m.away.name);
    const o = typeof id === "number" ? await afOdds(l, id, "far") : null;
    out.push([`${m.home.name} – ${m.away.name} ${(m as any).time ?? ""}`, id, o ? `${o.h}/${o.d}/${o.a} n${o.n}` : null]);
  }
  return { l, d, ours: out, af: afl, afErrors: af?.errors };
}

export async function GET(req: Request) {
  const fq = new URL(req.url).searchParams;
  if (fq.get("find") && process.env.VERCEL_ENV !== "production" && hasApiFootball()) return NextResponse.json(await findCheck(fq.get("find")!, fq.get("d") ?? ""), { headers: { "Cache-Control": "no-store" } });
  if (process.env.VERCEL_ENV === "production" || !hasApiFootball()) return NextResponse.json({ error: "off" }, { status: 404 });
  const q = new URL(req.url).searchParams.get("id") ?? "";
  try {
    if (q === "fi") return NextResponse.json({ finland: await finland() });
    const id = Number(q);
    if (!Number.isInteger(id) || !ALLOWED.has(id)) return NextResponse.json({ error: "not allowed" }, { status: 400 });
    return NextResponse.json(await check(id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String((e as { code?: string })?.code ?? "error") }, { status: 503 });
  }
}
