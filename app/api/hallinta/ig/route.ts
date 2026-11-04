import { fantasyDbOn } from "@/lib/fantasy-db";
import { currentUser } from "@/lib/fantasy-auth";
import { j, fail } from "@/lib/fantasy-api";
import { isAdmin } from "@/lib/site-stats";
import { getArticles } from "@/lib/feed";
import { toLocal } from "@/lib/links";
import { igCaption, igFile } from "@/lib/ig-core";

// Instagram-luonnokset hallintapaneeliin: uusimmat uutiset valmiina kuvateksteinä (kuva: /api/hallinta/ig/kuva?id=…).
// Vain FUTISTA_ADMINS-tileille; muille 404. Uusi uutinen näkyy luonnoksena heti, kun se on syötteessä.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!fantasyDbOn()) return fail("off", 503);
  const u = await currentUser(req);
  if (!u) return fail("login", 401);
  if (!isAdmin(u.username)) return fail("notfound", 404);
  const list = (await getArticles().catch(() => [])).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  return j({
    at: new Date().toISOString(),
    items: list.map((a) => ({
      id: a.id, title: a.title, date: a.date, type: a.type, league: a.league, sourceName: a.sourceName,
      href: toLocal(a.link), caption: igCaption(a), file: igFile(a),
    })),
  });
}
