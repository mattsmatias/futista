"use client";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { matchState, isOn, helsinkiParts, bestTeam, knownFixture, type LiveMatch, type MatchState } from "./live-core";
import { acceptList } from "./live-merge";
import { FAST, SLOW } from "./live-fresh";
import type { Fixture, LeagueStats, Team } from "./stats";
import { useI18n } from "./i18n";

type Meta = {
  checkedAt: number | null;   // milloin Futista sai näytettävän tiedon lähteeltä (palvelimen hakuhetki,
                              // ei selaimen hakuhetki eikä välimuistin tarjoiluhetki); null = ei tiedossa
  lastOkAt: number | null;    // milloin selain viimeksi sai kelvollisen vastauksen
  failing: boolean;           // viimeisin haku epäonnistui (näytetään edellinen kelvollinen tieto)
  loading: boolean;           // ensimmäistä vastausta ei ole vielä tullut
  pending: boolean;           // tarkistus käynnissä (esim. välilehti palasi näkyviin)
  busy: boolean;              // jokin ottelu käynnissä tai alkamassa → tiheämpi tarkistus
  offline: boolean;           // selaimella ei verkkoyhteyttä
  sources: Record<string, { state: string; fetchedAt: number | null }> | null;
};
type Ctx = { live: LiveMatch[]; now: number | null; enabled: boolean; meta: Meta; subscribe: () => () => void };
const EMPTY_META: Meta = { checkedAt: null, lastOkAt: null, failing: false, loading: true, pending: false, busy: false, offline: false, sources: null };
const LiveCtx = createContext<Ctx>({ live: [], now: null, enabled: true, meta: EMPTY_META, subscribe: () => () => {} });

const MAX_BACKOFF = 600_000;
const RESUME_MIN = 20_000; // näkyviin palattaessa ei tarkisteta uudelleen, jos edellisestä yrityksestä on alle 20 s

/** Onko jokin ottelu käynnissä tai alkamassa 20 min sisällä → tiheä päivitys */
const busyNow = (live: LiveMatch[], now: number) =>
  live.some((m) => isOn(m.status) || (Math.abs(m.kickoff - now) < 20 * 60_000 && m.status !== "FINISHED" && m.status !== "POSTPONED" && m.status !== "CANCELLED"));

/** Yksi yhteinen live-haku koko sovellukselle. Hakee VAIN, kun jokin näkymä käyttää live-tietoa (tilaus):
 *  Tietoa-, Tietosuoja- ja uutissivut eivät hae. Tiheästi vain kun jotain on käynnissä, ei ollenkaan
 *  piilotetussa välilehdessä; näkyviin palattaessa tarkistetaan kerran hallitusti.
 *  Virheen jälkeen odotus pitenee (1, 2, 4… min, enintään 10 min).
 *  Vanhempi vastaus (esim. välimuistista) ei korvaa uudempaa, ja ottelut hyväksytään yksitellen
 *  (lib/live-merge.ts acceptMatch): sisällöltään vanhempi tieto ei korvaa uudempaa. */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [live, setLive] = useState<LiveMatch[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [subs, setSubs] = useState(0);
  const subscribe = useCallback(() => { setSubs((n) => n + 1); return () => setSubs((n) => n - 1); }, []);
  const active = subs > 0;
  // tila säilyy tilausten välillä (esim. sivulta toiselle siirryttäessä), haku vain aktiivisena
  const st = useRef({ checkedAt: null as number | null, fails: 0, current: [] as LiveMatch[], lastAttempt: 0, inflight: false });
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const s = st.current;
    const schedule = (ms: number) => { if (timer) clearTimeout(timer); timer = setTimeout(load, ms); };
    async function load() {
      if (stop || s.inflight) return;
      if (document.hidden) return; // jatkuu, kun välilehti tulee näkyviin
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setMeta((m) => ({ ...m, offline: true, loading: false }));
        return; // jatkuu online-tapahtumasta
      }
      s.inflight = true; s.lastAttempt = Date.now();
      setMeta((m) => ({ ...m, pending: true, offline: false }));
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 15_000);
        const r = await fetch("/api/live", { signal: ctl.signal });
        clearTimeout(to);
        const d = await r.json();
        if (!r.ok || d.error) throw new Error("live " + r.status);
        if (stop) return;
        // otteluittain: kunkin ottelun uudempi tieto hyväksytään (acceptList), vaikka toinen lähde olisi jäänyt
        // hetkeksi vanhaan – koko vastausta ei hylätä, joten päivitys ei voi pysähtyä
        if (typeof d.checkedAt === "number" && (s.checkedAt === null || d.checkedAt > s.checkedAt)) s.checkedAt = d.checkedAt;
        s.current = acceptList(s.current, d.matches ?? []);
        setLive(s.current);
        setEnabled(d.enabled !== false);
        s.fails = 0;
        const b = busyNow(s.current, Date.now());
        setMeta({ checkedAt: s.checkedAt, lastOkAt: Date.now(), failing: false, loading: false, pending: false, busy: b, offline: false, sources: d.sources ?? null });
        schedule(b ? FAST : SLOW);
      } catch {
        if (stop) return;
        s.fails++;
        // hetkellinen virhe: pidetään edellinen kelvollinen tieto ja kerrotaan siitä
        setMeta((m) => ({ ...m, failing: true, loading: false, pending: false }));
        schedule(Math.min(MAX_BACKOFF, FAST * 2 ** (s.fails - 1)));
      } finally {
        s.inflight = false;
        setNow(Date.now());
      }
    }
    setNow(Date.now());
    // ensimmäinen haku heti; aiemmin haettu tieto näytetään sillä välin
    if (Date.now() - s.lastAttempt > RESUME_MIN) load(); else schedule(RESUME_MIN - (Date.now() - s.lastAttempt));
    // peliminuutti vaihtuu sekunnilleen oikeaan aikaan: käynnissä olevien otteluiden aikana näkymä päivittyy
    // joka sekunti, muuten 30 s välein
    let ticks = 0;
    const b = setInterval(() => {
      ticks++;
      const anyLive = s.current.some((m) => m.status === "IN_PLAY" || m.status === "EXTRA_TIME");
      if (!document.hidden && (anyLive || ticks % 30 === 0)) setNow(Date.now());
    }, 1000);
    const vis = () => {
      if (document.hidden) return;
      setNow(Date.now());
      if (Date.now() - s.lastAttempt > RESUME_MIN) load();
    };
    const online = () => { setMeta((m) => ({ ...m, offline: false })); load(); };
    const offline = () => setMeta((m) => ({ ...m, offline: true }));
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      stop = true; if (timer) clearTimeout(timer); clearInterval(b);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("online", online); window.removeEventListener("offline", offline);
    };
  }, [active]);
  return <LiveCtx.Provider value={{ live, now, enabled, meta, subscribe }}>{children}</LiveCtx.Provider>;
}

/** Näkymä, joka näyttää live-tietoa, tilaa yhteisen haun (ilman tilaajia haku on pysähdyksissä) */
function useLive(): Ctx {
  const c = useContext(LiveCtx);
  const { subscribe } = c;
  useEffect(() => subscribe(), [subscribe]);
  return c;
}

/** Live-tilanteet ja nykyhetki listan omaan laskentaan (esim. Live-suodatin ja -määrä) */
export function useLiveData() { const { live, now } = useLive(); return { live, now }; }

/** Live-tietojen tila (päivitysaika, virhe, lataus) */
export function useLiveMeta() { return useLive().meta; }

export function useMatchState(m: Parameters<typeof matchState>[0]): MatchState {
  const { live, now } = useLive();
  return matchState(m, live, now);
}

/** Käynnissä olevat ottelut, joita lähteen otteluohjelmassa ei (enää) ole – näytetään LIVE-listoissa */
export function useLiveExtras(stats: LeagueStats[]): (Fixture & { s: string; league: string })[] {
  const { live, now } = useLive();
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
export function useDataEnabled() { return useLive().enabled; }

/** Pieni tilamerkki: LIVE 67', Puoliaika, Jatkoaika, Rangaistuspotkut, Päättynyt (ja./rp.), Keskeytetty, Siirretty, Peruttu.
 *  Vahvistamaton tila: "Aloitusaika ohitettu – tilaa ei vahvistettu".
 *  Ristiriitainen tila: "?"-merkki. explain = avattava selitys (kosketus ja näppäimistö); listoissa (linkin sisällä)
 *  merkillä on saavutettava nimi ja selitys on ottelusivulla. */
export function StatusPill({ s, explain }: { s: MatchState; explain?: boolean }) {
  const { t } = useI18n();
  if (s.kind === "upcoming") return null;
  if (s.uncertain) {
    const base = <StatusPill s={{ ...s, uncertain: false }} />;
    if (explain) return <span className="st-wrap">{base}<ConflictInfo what={s.uncertainWhat} /></span>;
    return <span className="st-wrap">{base}<span className="st-q" role="img" aria-label={t("conflictHint")} title={t("conflictHint")}>?</span></span>;
  }
  if (s.kind === "unconfirmed") return <span className="st st-unc" title={t("inferredHint")}>{s.late ? t("awaitingResult") : t("started")}</span>;
  if (s.kind === "live") {
    if (s.phase === "pens") return <span className="st st-live"><i />{t("penalties")}{s.pens && <b className="st-min">{s.pens[0]}–{s.pens[1]}</b>}</span>;
    return <span className="st st-live"><i />{s.phase === "et" ? t("extraTime") : t("live")}{s.min && <b className="st-min">{s.min}</b>}</span>;
  }
  if (s.kind === "ft") {
    const extra = s.pens ? ` · ${t("pensShort")} ${s.pens[0]}–${s.pens[1]}` : s.aet ? ` · ${t("aetShort")}` : "";
    return <span className="st st-ft">{t("statusFt")}{extra}</span>;
  }
  const label = s.kind === "ht" ? t("halfTime") : s.kind === "suspended" ? t("suspended") : s.kind === "postponed" ? t("postponed") : t("cancelled");
  return <span className={`st st-${s.kind}`}>{s.kind === "ht" && <i />}{label}</span>;
}

/** Ristiriidan selitys: painike (saavutettava nimi) avaa ja sulkee selityksen; toimii kosketuksella ja näppäimistöllä */
export function ConflictInfo({ what }: { what?: "status" | "score" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  const pop = useRef<HTMLSpanElement>(null);
  // pidä selitys näytön sisällä (painike voi olla lähellä reunaa kapealla näytöllä)
  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el) return;
    el.style.setProperty("--shift", "0px");
    const r = el.getBoundingClientRect(), m = 8, w = document.documentElement.clientWidth;
    const shift = r.right > w - m ? w - m - r.right : r.left < m ? m - r.left : 0;
    el.style.setProperty("--shift", `${Math.round(shift)}px`);
  }, [open]);
  return (
    <span className="conflict">
      <button type="button" className="st-q st-qbtn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
        <span aria-hidden="true">?</span><span className="sr-only">{t("conflictOpen")}</span>
      </button>
      {open && (
        <span id={id} ref={pop} className="conflict-pop" role="note">
          <b>{t("conflictHint")}</b>
          <span>{what === "score" ? t("conflictScore") : what === "status" ? t("conflictStatus") : t("conflictGeneric")}</span>
          <span className="muted">{t("conflictNote")}</span>
        </span>
      )}
    </span>
  );
}

const hm = (ms: number) => new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

