"use client";
// Tehtävät: kierroksen tehtävät (Futista-kolikoita) ja kausitavoitteet (joukkuebudjetti, enintään katto).
// Selain vain näyttää palvelimen tilan: palkinnot tarkistetaan ja kirjataan palvelimella. Edistyminen näytetään vain
// tallennetusta datasta (avoimella kierroksella ottelutietoja ei vielä ole → ei arvioita).
import Link from "next/link";
import { useLoad, localTime, type ApiErr } from "@/lib/fantasy-client";
import { AuthBox, Countdown, ErrorBox, Loading, Notice } from "../ui";
import { FCoins } from "../FCoin";
import { Money } from "../Coin";

type Claim = { status: "done" | "failed"; value: number; reward: number; at: string };
type Task = { slot: number; id: string; kind: "participate" | "captain" | "points" | "goals" | "assists"; target: number; reward: number; title: string; help: string; claim: Claim | null };
type Round = {
  no: number; label: string; deadline: string; locked: boolean; status: string; confirmAt: string | null;
  hasPicks: boolean; captain: boolean; joined: boolean; points: { total: number; provisional: boolean; goals: number; assists: number } | null; tasks: Task[];
};
type Goal = { id: string; rounds: number; bonus: number; awarded: number | null; at: string | null };
type Resp = {
  now: string; enabled: boolean; hasTeam: boolean; confirmHours: number | null; budget: { base: number; bonus: number; cap: number; total: number } | null;
  participated: number; startRound: number | null; startLabel: string | null; remaining: number; goals: Goal[]; rounds: Round[];
};
type State = "open" | "pending" | "done" | "failed" | "missed";
const STATE_TEXT: Record<State, string> = { open: "Kesken", pending: "Odottaa kierroksen vahvistusta", done: "Valmis", failed: "Ei saavutettu", missed: "Ei osallistunut" };
const UNIT: Record<Task["kind"], string> = { participate: "", captain: "", points: "p", goals: "maalia", assists: "syöttöä" };
const m1 = (n: number) => n.toFixed(1).replace(".", ",");
const DATE = new Intl.DateTimeFormat("fi-FI", { timeZone: "Europe/Helsinki", weekday: "short", day: "numeric", month: "numeric" });

/** Tehtävän tila ja edistyminen palvelimen tiedoista (ei arvioita) */
function taskState(r: Round, t: Task, now: number): { state: State; value: number | null; note: string } {
  if (t.claim) return { state: t.claim.status, value: t.claim.value, note: t.claim.status === "done" ? `+${t.claim.reward} kolikkoa maksettu` : "Tavoitetta ei saavutettu tällä kierroksella" };
  const light = t.kind === "participate" || t.kind === "captain";
  if (!r.locked) {
    if (light) {
      const ready = r.hasPicks && (t.kind === "participate" || r.captain);
      return { state: "open", value: ready ? 1 : 0, note: ready ? "Joukkue on tallennettu – suoritus kirjataan, kun kierros on lopullinen." : "Tallenna 15 pelaajan joukkue ennen määräaikaa." };
    }
    return { state: "open", value: null, note: "Edistyminen alkaa kierroksen otteluista." };
  }
  if (!r.joined) return { state: "missed", value: null, note: "Joukkuetta ei ollut tallennettu kierroksen määräajalla." };
  const p = r.points;
  const value = light ? 1 : !p ? null : t.kind === "points" ? p.total : t.kind === "goals" ? p.goals : p.assists;
  const confirm = r.confirmAt ? Date.parse(r.confirmAt) : null;
  const note = r.status !== "final" || p?.provisional
    ? "Kierros on kesken – luvut ovat alustavia."
    : !light && confirm && confirm > now ? `Vahvistetaan korjausajan jälkeen (${DATE.format(new Date(confirm))}).` : "Vahvistetaan seuraavassa päivityksessä.";
  return { state: "pending", value, note };
}

export function Tasks() {
  const r = useLoad<Resp>("/api/fantasy/tehtavat");
  if (r.loading && !r.data) return <Loading />;
  if (r.err) return r.err.error === "login" ? <AuthBox onDone={r.reload} /> : <ErrorBox err={r.err as ApiErr} retry={r.reload} />;
  const d = r.data!;
  if (!d.enabled) return <Notice>Tehtävät otetaan käyttöön pian. Kierroksen tehtävät näkyvät täällä ennen määräaikaa.</Notice>;
  const now = Date.parse(d.now);
  const open = d.rounds.find((x) => !x.locked) ?? null;
  const past = d.rounds.filter((x) => x.locked);
  const b = d.budget;
  const atCap = !!b && b.total >= b.cap - 1e-9 && b.cap > b.base;
  const openReward = open ? open.tasks.reduce((a, t) => a + t.reward, 0) : 0;

  return (
    <div className="fxt">
      <section className="fxt-hero" aria-labelledby="fxt-h">
        <div>
          <h2 id="fxt-h">Tehtävät</h2>
          {open
            ? <p><b>{open.label}</b> · määräaika {localTime(open.deadline)} · <span className="fxt-cd"><Countdown to={open.deadline} /></span></p>
            : <p className="muted">Kauden kaikki kierrokset on lukittu.</p>}
        </div>
        {open && <div className="fxt-pot" aria-label={`Kierroksen tehtävistä yhteensä ${openReward} Futista-kolikkoa`}><small aria-hidden="true">Jaossa</small><FCoins v={openReward} size={20} /></div>}
      </section>

      {!d.hasTeam && <Notice>Luo ensin joukkue, niin pääset suorittamaan tehtäviä. <Link href="/fantasy">Luo joukkue →</Link></Notice>}

      {open && (
        <section aria-label={`${open.label}: tehtävät`} className="fxt-list">
          {open.tasks.map((t) => <TaskCard key={t.slot} r={open} t={t} now={now} />)}
        </section>
      )}

      <section className="fxt-season" aria-labelledby="fxt-s-h">
        <h2 id="fxt-s-h">Kausitavoitteet</h2>
        {b && (
          <div className="fxt-budget">
            <div className="fxt-budget-row">
              <span>Joukkuebudjetti</span>
              <b><Money v={b.total} size={18} /> <small className="muted">/ {m1(b.cap)} M</small></b>
            </div>
            <div className="fxt-bar" role="progressbar" aria-label="Ansaittu budjetin lisäys" aria-valuemin={0} aria-valuemax={Math.max(0, b.cap - b.base)} aria-valuenow={b.bonus}
              aria-valuetext={`+${m1(b.bonus)} M / enintään +${m1(Math.max(0, b.cap - b.base))} M`}>
              <i style={{ width: `${b.cap > b.base ? Math.min(100, (b.bonus / (b.cap - b.base)) * 100) : 0}%` }} />
            </div>
            <p className="muted small">Aloitus {m1(b.base)} M · kausitavoitteista enintään +{m1(Math.max(0, b.cap - b.base))} M</p>
            {atCap && <Notice kind="ok"><p>Olet saavuttanut kauden enimmäisbudjetin {m1(b.cap)} M€. Voit edelleen suorittaa viikkotehtäviä ja ansaita kolikoita.</p></Notice>}
          </div>
        )}
        <ul className="fxt-goals">
          {d.goals.map((g) => {
            const done = g.awarded !== null;
            const left = Math.max(0, g.rounds - d.participated);
            const reachable = done || left <= d.remaining;
            return (
              <li key={g.id} className={done ? "done" : ""}>
                <div className="fxt-goal-h">
                  <span>Osallistu {g.rounds} lopulliseen kierrokseen</span>
                  <b>{done && g.awarded === 0 ? "katto täynnä" : `+${m1(g.bonus)} M`}</b>
                </div>
                <div className="fxt-bar sm" role="progressbar" aria-label={`Osallistu ${g.rounds} kierrokseen`} aria-valuemin={0} aria-valuemax={g.rounds} aria-valuenow={Math.min(g.rounds, d.participated)}>
                  <i style={{ width: `${Math.min(100, (d.participated / g.rounds) * 100)}%` }} />
                </div>
                <small className="muted">{done ? "Saavutettu" : `${Math.min(d.participated, g.rounds)}/${g.rounds} kierrosta${reachable ? "" : " · ei enää saavutettavissa tällä kaudella"}`}</small>
              </li>
            );
          })}
        </ul>
        <p className="muted small">Osallistumisia {d.participated} · kaudella jäljellä {d.remaining} kierrosta{d.startLabel ? ` · lasketaan kierroksesta ${d.startLabel.replace(/^Kierros /, "")} alkaen` : ""}</p>
      </section>

      {past.length > 0 && (
        <section className="fxt-past" aria-labelledby="fxt-p-h">
          <h2 id="fxt-p-h">Aiemmat kierrokset</h2>
          {past.map((x) => (
            <details key={x.no} open={x === past[0] && x.tasks.some((t) => !t.claim)}>
              <summary><b>{x.label}</b><span className="muted">{x.joined ? `${x.tasks.filter((t) => t.claim?.status === "done").length}/${x.tasks.length} valmis` : "ei osallistunut"}</span></summary>
              <div className="fxt-list">{x.tasks.map((t) => <TaskCard key={t.slot} r={x} t={t} now={now} />)}</div>
            </details>
          ))}
        </section>
      )}

      <p className="muted small fxt-foot"><Link href="/fantasy/saannot#tehtavat">Miten tehtävät ja palkinnot toimivat → Säännöt</Link></p>
    </div>
  );
}

function TaskCard({ r, t, now }: { r: Round; t: Task; now: number }) {
  const s = taskState(r, t, now);
  const light = t.kind === "participate" || t.kind === "captain";
  const pct = s.value === null ? 0 : Math.max(0, Math.min(100, (s.value / Math.max(1, t.target)) * 100));
  const prog = light ? (s.value === null ? null : `${Math.min(1, s.value)}/1`) : s.value === null ? `–/${t.target} ${UNIT[t.kind]}` : `${s.value}/${t.target} ${UNIT[t.kind]}`;
  return (
    <article className={`fxt-task st-${s.state}`} aria-label={`${t.title}: ${STATE_TEXT[s.state]}`}>
      <div className="fxt-ic" aria-hidden="true">{ICON[t.kind]}</div>
      <div className="fxt-body">
        <div className="fxt-top">
          <h3>{t.title}</h3>
          <span className="fxt-rew"><FCoins v={t.reward} size={16} sign /></span>
        </div>
        <p className="fxt-help">{t.help}</p>
        <div className="fxt-prog">
          <div className="fxt-bar sm" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
          {prog && <span className="fxt-num">{prog}</span>}
        </div>
        <p className="fxt-st"><span className={`fxt-chip st-${s.state}`}>{STATE_TEXT[s.state]}</span><small className="muted">{s.note}</small></p>
      </div>
    </article>
  );
}

const sv = (d: React.ReactNode) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const ICON: Record<Task["kind"], React.ReactNode> = {
  participate: sv(<><path d="M8 3 4 5 2 9l3 2 1-1v10h12V10l1 1 3-2-2-4-4-2c-.5 2-2 3-4 3S8.5 5 8 3Z" /></>),
  captain: sv(<><circle cx="12" cy="12" r="9" /><path d="M14.5 9.2a3.5 3.5 0 1 0 0 5.6" /></>),
  points: sv(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  goals: sv(<><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 4.5h-5L8 10z" /></>),
  assists: sv(<><path d="M4 17c4-8 10-8 16-10" /><path d="m16 5 4 2-2 4" /></>),
};
