// Haun puhdas logiikka (selain; testataan tests/ui.test.ts). Haku tehdään selaimessa valmiiksi ladatusta
// hakemistosta (/api/haku, CDN-välimuistissa) – ei ulkoista hakua näppäinpainalluksittain.

export type SearchTeam = { kind: "team"; name: string; code: string; crest?: string; id?: number; comps: string[]; href: string };
export type SearchComp = { kind: "comp"; id: string; name: string; country: string; href: string };
export type SearchNation = { kind: "nation"; id: string; name: string; names: string[]; flag?: string | null; href: string };
export type SearchItem = SearchTeam | SearchComp | SearchNation;
export type SearchIndex = { teams: SearchTeam[]; nations: SearchNation[]; partial: boolean; at: number | null };

export const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ß/g, "ss").replace(/ø/g, "o").replace(/æ/g, "ae")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Yleiset hyväksytyt nimivariaatiot → nimi, jolla joukkue on hakemistossa (normalisoituna) */
export const ALIASES: Record<string, string[]> = {
  barca: ["barcelona"], "fc barcelona": ["barcelona"],
  real: ["real madrid"], "los blancos": ["real madrid"],
  atleti: ["atletico madrid", "atletico"], atletico: ["atletico madrid"],
  "man utd": ["manchester united", "man united"], "man united": ["manchester united"], united: ["manchester united"],
  "man city": ["manchester city"], city: ["manchester city"],
  spurs: ["tottenham", "tottenham hotspur"],
  gunners: ["arsenal"], reds: ["liverpool"], villa: ["aston villa"], forest: ["nottingham", "nottingham forest"],
  bayern: ["bayern munchen", "fc bayern munchen", "bayern"], "bayern munich": ["bayern munchen", "bayern"],
  bvb: ["dortmund", "borussia dortmund"], gladbach: ["borussia monchengladbach", "m gladbach"],
  juve: ["juventus"], inter: ["inter", "internazionale"], milan: ["milan", "ac milan"],
  psg: ["paris saint germain", "psg", "paris sg"], om: ["marseille", "olympique marseille"],
  ajax: ["ajax", "afc ajax"], psv: ["psv", "psv eindhoven"], benfica: ["benfica", "sl benfica"], porto: ["porto", "fc porto"],
  "turku ps": ["tps"], turku: ["tps", "fc inter"], "inter turku": ["fc inter"], "hjk helsinki": ["hjk"],
  huuhkajat: ["suomi", "finland"], suomi: ["finland"], ruotsi: ["sweden"], norja: ["norway"], tanska: ["denmark"],
  englanti: ["england"], saksa: ["germany"], ranska: ["france"], espanja: ["spain"], italia: ["italy"],
};

/** Seuranimien yleiset etu- ja jälkiliitteet ("FC Lahti" = "Lahti", "Turku PS" = "Turku"), joita ei vaadita osumaan */
const AFFIX = new Set(["fc", "ac", "afc", "cf", "sc", "fk", "ff", "if", "ik", "sk", "bk", "ps", "cd", "ud", "sv", "ssc", "as", "rc", "fsv", "tsv", "vfb", "vfl"]);
const core = (s: string) => s.split(" ").filter((w) => !AFFIX.has(w)).join(" ");

function rawScore(q: string, n: string): number {
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.split(" ").some((w) => w.startsWith(q))) return 60;
  if (q.length >= 3 && n.includes(q)) return 40;
  return 0;
}

/** Kuinka hyvin haku osuu nimeen: 0 = ei, suurempi = parempi */
export function scoreName(q: string, name: string): number {
  const n = fold(name);
  const direct = rawScore(q, n);
  if (direct) return direct;
  // seuraliitteet pois molemmista: "fc lahti" → "lahti", "ac oulu" ↔ "oulu" (hieman suoraa osumaa heikompi)
  const cq = core(q), cn = core(n);
  if ((cq !== q || cn !== n) && cq.length >= 2) return Math.max(0, rawScore(cq, cn) - 5);
  return 0;
}

function bestScore(q: string, names: string[]): number {
  let best = 0;
  for (const nm of names) best = Math.max(best, scoreName(q, nm));
  return best;
}

/** Hakee hakemistosta; tulokset tyypeittäin, parhaat ensin (enintään `limit` / tyyppi) */
export function search(index: { teams: SearchTeam[]; comps: SearchComp[]; nations: SearchNation[] }, raw: string, limit = 8) {
  const q = fold(raw);
  if (q.length < 2) return { teams: [] as SearchTeam[], comps: [] as SearchComp[], nations: [] as SearchNation[] };
  const alt = ALIASES[q] ?? [];
  const rank = <T,>(items: T[], names: (x: T) => string[]) =>
    items
      .map((x) => {
        const ns = names(x);
        const direct = bestScore(q, ns);
        // alias hieman suoran osuman alle. Aliakseen verrataan ilman seuraliitteiden ohitusta: "turku" → "fc inter"
        // osuu vain FC Interiin, ei kaikkiin Inter-nimisiin seuroihin
        const viaAlias = alt.length ? Math.max(0, ...alt.flatMap((a) => ns.map((nm) => rawScore(a, fold(nm))))) - 5 : 0;
        return { x, s: Math.max(direct, viaAlias) };
      })
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((r) => r.x);
  return {
    teams: rank(index.teams, (t) => [t.name, t.code]),
    comps: rank(index.comps, (c) => [c.name, c.country]),
    nations: rank(index.nations, (n) => n.names),
  };
}
