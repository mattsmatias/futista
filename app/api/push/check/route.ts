import { NextResponse } from "next/server";
import { getArticles } from "@/lib/feed";
import { getStats } from "@/lib/stats";
import { toLocal } from "@/lib/links";
import { storyIsAbout, playedIn } from "@/lib/teams";
import { pushMissing, sendPush, supabasePushStore } from "@/lib/push-server";
import { runPushCheck, type PushItem, type Lang } from "@/lib/push-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ajastettu tarkistus (Supabasen ajastus kutsuu 10 min välein, docs/ilmoitukset.md):
// etsii uudet jutut ja lopputulokset ja lähettää ilmoituksen niille, joiden suosikki on mukana.
// Lopputulokset vain La Ligasta, Valioliigasta ja Mestarien liigasta (getStats).

const T: Record<Lang, { ft: string; news: string }> = {
  fi: { ft: "Lopputulos", news: "Uusi juttu" },
  sv: { ft: "Slutresultat", news: "Ny artikel" },
  en: { ft: "Full time", news: "New story" },
};

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("ilmoitukset: tarkistus hylätty (väärä tai puuttuva tunniste)");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const missing = pushMissing();
  if (missing.length) return NextResponse.json({ error: "not configured", missing }, { status: 503 });

  const [articles, stats] = await Promise.all([getArticles(), getStats()]);
  const now = Date.now();
  const items: PushItem[] = [];
  for (const a of articles) {
    if (now - new Date(a.date).getTime() > 6 * 3600_000) continue;
    items.push({
      key: `a:${a.id}`,
      teamsMatch: (team) => storyIsAbout(team, a.tags),
      payload: (lang, team) => ({ title: `${team} · ${T[lang].news}`, body: a.title, url: toLocal(a.link), tag: `a:${a.id}` }),
    });
  }
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
  try {
    const r = await runPushCheck(items, supabasePushStore, sendPush);
    // ajon yhteenveto lokiin (vain lukumäärät, ei tilauksia eikä salaisuuksia): näkyy, että ajastus toimii
    console.info("ilmoitukset: ajo", JSON.stringify({ items: items.length, ...r }));
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    // varaus tai tilausten luku epäonnistui → ei lähetetty mitään (ei kaksoislähetyksiä)
    console.warn("ilmoitukset: tietokanta ei vastannut", (e as Error)?.message ?? "");
    return NextResponse.json({ error: "store unavailable" }, { status: 503 });
  }
}
