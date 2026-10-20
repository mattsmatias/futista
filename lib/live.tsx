"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { matchState, isOn, helsinkiParts, bestTeam, knownFixture, type LiveMatch, type MatchState } from "./live-core";
import { isNewer } from "./live-merge";
import type { Fixture, LeagueStats, Team } from "./stats";
import { useI18n } from "./i18n";

type Meta = {
  asOf: number | null;        // näytettävän tilannekuvan ikä (lähteen hakuhetki, ei selaimen hakuhetki)
  lastOkAt: number | null;    // milloin selain viimeksi sai kelvollisen vastauksen
  failing: boolean;           // viimeisin haku epäonnistui (näytetään edellinen kelvollinen tieto)
  loading: boolean;           // ensimmäistä vastausta ei ole vielä tullut
  sources: Record<string, { state: string; at: number | null }> | null;
};
type Ctx = { live: LiveMatch[]; now: number | null; enabled: boolean; meta: Meta };
const EMPTY_META: Meta = { asOf: null, lastOkAt: null, failing: false, loading: true, sources: null };
const LiveCtx = createContext<Ctx>({ live: [], now: null, enabled: true, meta: EMPTY_META });

const FAST = 60_000;     // kun ottelu on käynnissä tai alkamassa
const SLOW = 300_000;    // kun mitään ei ole käynnissä
const MAX_BACKOFF = 600_000;

/** Onko jokin ottelu käynnissä tai alkamassa 20 min sisällä → tiheä päivitys */
const busy = (live: LiveMatch[], now: number) =>
  live.some((m) => isOn(m.status) || (Math.abs(m.kickoff - now) < 20 * 60_000 && m.status !== "FINISHED" && m.status !== "POSTPONED" && m.status !== "CANCELLED"));

/** Hakee otteluiden tilan: tiheästi vain kun jotain on käynnissä, ei ollenkaan piilotetussa välilehdessä.
 *  Virheen jälkeen odotus pitenee (1, 2, 4… min, enintään 10 min). Vanhempi tilannekuva ei korvaa uudempaa. */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [live, setLive] = useState<LiveMatch[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let asOf: number | null = null;
    let fails = 0;
    let current: LiveMatch[] = [];
    const schedule = (ms: number) => { if (timer) clearTimeout(timer); timer = setTimeout(load, ms); };
    async function load() {
      if (stop) return;
      if (document.hidden) return; // jatkuu, kun välilehti tulee näkyviin
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 15_000);
        const r = await fetch("/api/live", { signal: ctl.signal });
        clearTimeout(to);
        const d = await r.json();
        if (!r.ok || d.error) throw new Error("live " + r.status);
        if (stop) return;
        if (isNewer(asOf, d.asOf)) {
          asOf = d.asOf;
          current = d.matches ?? [];
          setLive(current);
        }
        setEnabled(d.enabled !== false);
        fails = 0;
        setMeta({ asOf, lastOkAt: Date.now(), failing: false, loading: false, sources: d.sources ?? null });
        schedule(busy(current, Date.now()) ? FAST : SLOW);
      } catch {
        if (stop) return;
        fails++;
        // hetkellinen virhe: pidetään edellinen kelvollinen tieto ja kerrotaan siitä
        setMeta((m) => ({ ...m, failing: true, loading: false }));
        schedule(Math.min(MAX_BACKOFF, FAST * 2 ** (fails - 1)));
      }
    }
    setNow(Date.now());
    load();
    const b = setInterval(() => setNow(Date.now()), 30_000);
    const vis = () => { if (!document.hidden) { setNow(Date.now()); load(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; if (timer) clearTimeout(timer); clearInterval(b); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return <LiveCtx.Provider value={{ live, now, enabled, meta }}>{children}</LiveCtx.Provider>;
}

/** Live-tietojen tila (päivitysaika, virhe, lataus) */
export function useLiveMeta() { return useContext(LiveCtx).meta; }

export function useMatchState(m: Parameters<typeof matchState>[0]): MatchState {
  const { live, now } = useContext(LiveCtx);
  return matchState(m, live, now);
}

/** Käynnissä olevat ottelut, joita lähteen otteluohjelmassa ei (enää) ole – näytetään LIVE-listoissa */
export function useLiveExtras(stats: LeagueStats[]): (Fixture & { s: string; league: string })[] {
  const { live, now } = useContext(LiveCtx);
  const out: (Fixture & { s: string; league: string })[] = [];
  // käynnissä olevat + juuri päättyneet (kunnes lähde päivittää tuloksen)
  const recent = (x: LiveMatch) => (x.status === "FINISHED" || x.status === "AWARDED") && now !== null && now - x.kickoff < 4 * 3600_000;
  for (const l of live.filter((x) => isOn(x.status) || recent(x))) {
    const st = stats.find((s) => s.source === l.source);
    if (!st) continue;
    const known = knownFixture([...st.fixtures, ...st.results], l);
    if (known) continue;
    const teams = st.table.map((r) => r.team);
    const pick = (w: string[], name?: string, crest?: string): Team =>
      bestTeam(teams, w) ?? { name: name ?? w.join(" "), code: (name ?? "").slice(0, 3).toUpperCase(), crest };
    const { date, time } = helsinkiParts(l.kickoff);
    out.push({ date, time, home: pick(l.home, l.homeName, l.homeCrest), away: pick(l.away, l.awayName, l.awayCrest), s: l.source, league: st.league });
  }
  return out;
}

/** Onko football-data käytössä (muut sarjat, maalipörssi, pelaajat) */
export function useDataEnabled() { const c: Ctx = useContext(LiveCtx); return c.enabled; }

/** Pieni tilamerkki: LIVE 67', Puoliaika, Jatkoaika, Rangaistuspotkut, Päättynyt (ja./rp.), Keskeytetty, Siirretty, Peruttu.
 *  Päätelty tila (ei rajapinnan tietoa) näytetään muodossa "Alkanut" / "Odottaa tulosta". */
export function StatusPill({ s }: { s: MatchState }) {
  const { t } = useI18n();
  if (s.kind === "upcoming") return null;
  if (s.kind === "live") {
    if (s.inferred) return <span className="st st-ht" title={t("inferredHint")}>{t("started")}</span>;
    if (s.phase === "pens") return <span className="st st-live"><i />{t("penalties")}{s.pens && <b className="st-min">{s.pens[0]}–{s.pens[1]}</b>}</span>;
    return <span className="st st-live"><i />{s.phase === "et" ? t("extraTime") : t("live")}{s.min && <b className="st-min">{s.min}</b>}</span>;
  }
  if (s.kind === "ft") {
    if (s.inferred) return <span className="st" title={t("inferredHint")}>{t("awaitingResult")}</span>;
    const extra = s.pens ? ` · ${t("pensShort")} ${s.pens[0]}–${s.pens[1]}` : s.aet ? ` · ${t("aetShort")}` : "";
    return <span className="st st-ft">{t("statusFt")}{extra}</span>;
  }
  const label = s.kind === "ht" ? t("halfTime") : s.kind === "suspended" ? t("suspended") : s.kind === "postponed" ? t("postponed") : t("cancelled");
  return <span className={`st st-${s.kind}`}>{s.kind === "ht" && <i />}{label}</span>;
}

const hm = (ms: number) => new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

/** Live-tietojen päivitysrivi: milloin tilanne on viimeksi päivittynyt lähteessä, ja varoitus vanhasta tiedosta */
export function LiveFreshness({ always }: { always?: boolean }) {
  const { t } = useI18n();
  const { meta, now } = useContext(LiveCtx);
  if (meta.loading) return always ? <p className="fresh-line">{t("liveLoading")}</p> : null;
  if (meta.asOf === null) return <p className="fresh-line warn" role="status">{t("liveDown")}</p>;
  const age = now !== null ? now - meta.asOf : 0;
  const old = meta.failing || age > 5 * 60_000;
  if (!old && !always) return null;
  return (
    <p className={`fresh-line${old ? " warn" : ""}`} role="status">
      {old ? t("liveStale") : t("liveUpdated")} {hm(meta.asOf)}
    </p>
  );
}
