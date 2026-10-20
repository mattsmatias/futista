"use client";
// Maajoukkueet: Huuhkajat + viimeisimmät ja tulevat maaottelut kaikista kilpailuista
import { useEffect, useState } from "react";
import type { Game } from "@/lib/espn";
import { useI18n } from "@/lib/i18n";
import { useVisibleInterval } from "@/lib/fresh";
import { GameRow, compName, compClass } from "./Games";
import { SrcLine } from "./Stats";

const FIN = "458";
const isOn = (g: Game) => g.kind === "live" || g.kind === "ht";
const isFin = (g: Game) => g.home.id === FIN || g.away.id === FIN;

export type IntlData = { games: Game[]; at: number | null; partial: boolean };

export default function IntlBoard({ initial }: { initial?: IntlData | null }) {
  const i = useI18n();
  const { t } = i;
  const [data, setData] = useState<IntlData | null>(initial ?? null);
  const games = data?.games ?? null;
  const [failed, setFailed] = useState(false);
  const [comp, setComp] = useState("all");
  const [tab, setTab] = useState<"up" | "played">("up");

  // virhe: säilytetään edellinen kelvollinen tieto ja kerrotaan siitä
  const load = () =>
    fetch("/api/intl").then((r) => r.json()).then((j) => {
      if (j?.error) { setFailed(true); return; }
      setFailed(false);
      setData((prev) => (prev?.at && j.at && j.at < prev.at ? prev : { games: j.games ?? [], at: j.at ?? null, partial: !!j.partial }));
    }).catch(() => setFailed(true));
  useEffect(() => { if (!initial) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useVisibleInterval(() => load(), games?.some(isOn) ? 45_000 : 120_000);

  if (!games) return failed ? <p className="muted pad">{t("sourceDown")}</p> : <p className="muted pad loading">{t("loading")}</p>;

  const up = games.filter((g) => g.kind === "upcoming" || isOn(g) || g.kind === "postponed")
    .sort((a, b) => Number(isOn(b)) - Number(isOn(a)) || a.epoch - b.epoch);
  const played = games.filter((g) => g.kind === "ft" || g.kind === "suspended" || g.kind === "cancelled").sort((a, b) => b.epoch - a.epoch);
  const fin = [...up.filter(isFin).slice(0, 2), ...played.filter(isFin).slice(0, 2)];
  const comps = [...new Map(games.map((g) => [g.slug, g] as const)).values()];
  const list = (tab === "up" ? up : played).filter((g) => comp === "all" || g.slug === comp);
  // päivittäin, Suomen ottelut ensin
  const days: [string, Game[]][] = [];
  for (const g of list) {
    const d = days.find((x) => x[0] === g.date);
    if (d) d[1].push(g); else days.push([g.date, [g]]);
  }
  for (const d of days) d[1].sort((a, b) => Number(isFin(b)) - Number(isFin(a)));

  return (
    <div className="intl">
      <section className="panel fin-card">
        <div className="panel-head">
          <h3><img src="https://flagcdn.com/w40/fi.png" alt="" width={22} height={15} /> {t("huuhkajat")}</h3>
          <a className="see-all" href={`/maajoukkue/${FIN}`}>{t("allMatchesOf")} →</a>
        </div>
        {fin.length ? fin.map((g) => <GameRow key={g.id} g={g} nations highlight={FIN} />) : <p className="muted pad">{t("noFinGames")}</p>}
      </section>

      {comps.length > 1 && (
        <div className="comp-filter">
          <button className={comp === "all" ? "on" : ""} onClick={() => setComp("all")}>{t("allComps")}</button>
          {comps.map((g) => (
            <button key={g.slug} className={comp === g.slug ? "on" : ""} onClick={() => setComp(g.slug)}>
              <span className={`g-dot ${compClass(g.slug)}`} />{compName(g, i.lang)}
            </button>
          ))}
        </div>
      )}

      <div className="subtabs" role="tablist">
        <button className={tab === "up" ? "on" : ""} onClick={() => setTab("up")}>{t("upcoming")}</button>
        <button className={tab === "played" ? "on" : ""} onClick={() => setTab("played")}>{t("playedTab")}</button>
      </div>

      {failed && <p className="fresh-line warn" role="status">{t("sourceDown")}</p>}
      {days.length === 0 && <p className="muted pad">{tab === "up" ? t("noUpcoming") : t("noPlayed")}</p>}
      <div className="intl-days">
        {days.map(([d, gs]) => (
          <section className="panel" key={d}>
            <div className="panel-head"><h3>{i.day(d)}</h3><span className="muted">{gs.length}</span></div>
            {gs.map((g) => <GameRow key={g.id} g={g} nations highlight={FIN} hideDate />)}
          </section>
        ))}
      </div>
      <SrcLine name="ESPN" updated={data?.at} stale={failed || data?.partial} maxAgeMin={10} />
    </div>
  );
}
