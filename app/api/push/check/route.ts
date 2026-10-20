import { NextResponse } from "next/server";
import { getArticles } from "@/lib/feed";
import { getStats } from "@/lib/stats";
import { toLocal } from "@/lib/links";
import { storyIsAbout, playedIn } from "@/lib/teams";
import { pushConfigured, allSubscriptions, alreadySent, anythingSentEver, markSent, sendPush, deleteSubscription, type Payload, type StoredSub } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ajastettu tarkistus (Supabase kutsuu 10 min välein):
// etsii uudet jutut ja lopputulokset ja lähettää ilmoituksen niille, joiden suosikki on mukana.

const T = {
  fi: { ft: "Lopputulos", news: "Uusi juttu" },
  sv: { ft: "Slutresultat", news: "Ny artikel" },
  en: { ft: "Full time", news: "New story" },
} as const;

type Item = { key: string; teamsMatch: (team: string) => boolean; payload: (lang: keyof typeof T, team: string) => Payload };

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const [articles, stats] = await Promise.all([getArticles(), getStats()]);
  const now = Date.now();
  const items: Item[] = [];

  // Uudet jutut viimeisen 6 tunnin ajalta
  for (const a of articles) {
    if (now - new Date(a.date).getTime() > 6 * 3600_000) continue;
    items.push({
      key: `a:${a.id}`,
      teamsMatch: (team) => storyIsAbout(team, a.tags),
      payload: (lang, team) => ({ title: `${team} · ${T[lang].news}`, body: a.title, url: toLocal(a.link), tag: `a:${a.id}` }),
    });
  }
  // Lopputulokset viimeisen 3 päivän ajalta
  for (const s of stats) {
    for (const r of s.results) {
      if (now - new Date(r.date + "T23:59:00").getTime() > 3 * 86400_000) continue;
      const key = `r:${r.date}:${r.home.name}:${r.away.name}`;
      items.push({
        key,
        teamsMatch: (team) => playedIn(team, r.home.name, r.away.name),
        payload: (lang) => ({ title: T[lang].ft, body: `${r.home.name} ${r.hs}–${r.as} ${r.away.name}`, url: "/?nakyma=tulokset", tag: key }),
      });
    }
  }

  // Ensimmäisellä ajokerralla vain merkitään nykyiset asiat nähdyiksi, ettei tule vanhoja ilmoituksia
  if (!(await anythingSentEver())) {
    await markSent(items.map((i) => i.key));
    return NextResponse.json({ ok: true, firstRun: true, marked: items.length });
  }

  const sent = await alreadySent(items.map((i) => i.key));
  const fresh = items.filter((i) => !sent.has(i.key));
  if (!fresh.length) return NextResponse.json({ ok: true, new: 0 });

  const subs = await allSubscriptions();
  const dead = new Set<string>();
  let delivered = 0;

  await Promise.all(
    subs.map(async (sub: StoredSub) => {
      const lang = (["fi", "sv", "en"].includes(sub.lang) ? sub.lang : "fi") as keyof typeof T;
      // korkeintaan 5 ilmoitusta kerralla per puhelin
      const mine = fresh
        .map((item) => ({ item, team: sub.teams.find((t) => item.teamsMatch(t)) }))
        .filter((x): x is { item: Item; team: string } => !!x.team)
        .slice(0, 5);
      for (const { item, team } of mine) {
        const ok = await sendPush(sub, item.payload(lang, team));
        if (!ok) { dead.add(sub.endpoint); break; }
        delivered++;
      }
    })
  );

  await Promise.all([...dead].map(deleteSubscription));
  await markSent(fresh.map((i) => i.key));
  return NextResponse.json({ ok: true, new: fresh.length, delivered, removed: dead.size });
}
