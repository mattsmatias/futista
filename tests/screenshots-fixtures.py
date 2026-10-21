# Ennen/jälkeen-kuvakaappausten paikallinen data: lisää ERILLISEEN työkopioon (git worktree) koukun, joka lukee
# sarjat, uutiset, maaottelut ja live-tilan JSON-tiedostoista (FUTISTA_FIXTURES=<kansio>), jotta vanha ja uusi
# käyttöliittymä voidaan kuvata samalla, esikatselusta tallennetulla oikealla datalla ilman verkkoa.
# Koukku toimii vain ilman VERCEL-ympäristömuuttujaa. ÄLÄ aja tätä varsinaisessa työhakemistossa äläkä commitoi tulosta.
#   python3 tests/screenshots-fixtures.py /tmp/wt-after
# Kansion tiedostot: main.json (pääsarjojen LeagueStats[]), league-<id>.json ({stats}), news.json ({articles}),
# intl.json ({games, at}), live.json ({matches}).
import sys,re,os
d=sys.argv[1]
open(os.path.join(d,"lib/fixtures.ts"),"w").write('''// VAIN paikallinen kuvakaappausajo (ei koskaan Vercelissä): tallennettu data tiedostoista.
import { readFileSync } from "node:fs";
export function fixture<T = any>(name: string): T | undefined {
  const dir = process.env.FUTISTA_FIXTURES;
  if (!dir || process.env.VERCEL) return undefined;
  try { return JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8")) as T; } catch { return undefined; }
}
''')
def edit(f, old, new, count=1):
  p=os.path.join(d,f); s=open(p).read()
  assert old in s, (f, old)
  s=s.replace(old,new,count)
  if 'from "@/lib/fixtures"' not in s and 'from "./fixtures"' not in s:
    s='import { fixture } from "@/lib/fixtures";\n'+s if not s.startswith('"use') else s
  open(p,"w").write(s)
edit("lib/stats.ts","export async function getStats(): Promise<LeagueStats[]> {\n","export async function getStats(): Promise<LeagueStats[]> {\n  { const fx = fixture<LeagueStats[]>(\"main\"); if (fx) return fx; }\n")
edit("lib/stats.ts","  const s = SOURCES.find((x) => x.id === id);\n  if (!s) return null;\n","  const s = SOURCES.find((x) => x.id === id);\n  if (!s) return null;\n  { const fx = fixture<any>(`league-${id}`); if (fx && !s.feeds.length) return fx.stats; }\n")
edit("lib/feed.ts",'export const getArticles = unstable_cache(readAll,','const _getArticles = unstable_cache(readAll,')
p=os.path.join(d,"lib/feed.ts"); s=open(p).read(); s+='\nexport const getArticles = async () => fixture<any>("news")?.articles ?? _getArticles();\n'; open(p,"w").write(s)
edit("lib/espn.ts","export async function getIntl(): Promise<{ games: Game[]; at: number | null; failed: number } | null> {\n","export async function getIntl(): Promise<{ games: Game[]; at: number | null; failed: number } | null> {\n  { const fx = fixture<any>(\"intl\"); if (fx) return { games: fx.games, at: fx.at, failed: 0 }; }\n")
edit("app/api/live/route.ts","export async function GET() {\n","export async function GET() {\n  { const fx = fixture<any>('live'); if (fx) { const now = Date.now(); return NextResponse.json({ enabled: true, matches: fx.matches ?? [], checkedAt: now, sources: { fd: { state: 'ok', fetchedAt: now }, espn: { state: 'ok', fetchedAt: now } }, error: false }); } }\n")
print("ok")
