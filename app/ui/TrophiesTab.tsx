"use client";
// Joukkueen pokaalit (Wikidata): voitot kilpailuittain, kaudet ja pokaalin valokuva Wikimedia Commonsista.
// Kuvan tekijä ja lisenssi näytetään kuvan alla. Ilman vapaasti lisensoitua kuvaa näytetään yleinen pokaalikuvake.
// Puuttuva tieto ei ole nolla: jos seuraa ei tunnisteta tai lähde ei vastaa, sanotaan se eikä näytetä tyhjää listaa.
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Trophy } from "@/lib/trophies-core";

type Resp = { state: "ok"; q: string; trophies: Trophy[] } | { state: "off" | "nomatch" | "notfound" | "error" };
const SHOW = 8;

export function TrophyIcon({ size = 56 }: { size?: number }) {
  return (
    <svg className="tp-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M20 8h24v14c0 8-5 14-12 14s-12-6-12-14V8z" fill="currentColor" opacity=".9" />
      <path d="M20 12h-8v4c0 6 4 10 9 11M44 12h8v4c0 6-4 10-9 11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M29 36h6v10h-6z" fill="currentColor" opacity=".75" />
      <rect x="20" y="46" width="24" height="6" rx="2" fill="currentColor" />
      <rect x="16" y="52" width="32" height="5" rx="2" fill="currentColor" opacity=".75" />
    </svg>
  );
}


function Item({ x }: { x: Trophy }) {
  const { t, lang } = useI18n();
  const [all, setAll] = useState(false);
  const [bad, setBad] = useState(false); // kuva ei latautunut → kuvake, eikä kuvan tekijätietoa
  const img = bad ? undefined : x.img;
  const name = lang === "fi" ? x.fi : x.en;
  const shown = all ? x.seasons : x.seasons.slice(0, SHOW);
  const noYear = x.count - x.seasons.length;
  return (
    <li className="tp-item">
      {img ? <div className="tp-pic"><img src={img.thumb} alt="" width={76} height={96} loading="lazy" decoding="async" onError={() => setBad(true)} /></div>
        : <div className="tp-pic tp-none"><TrophyIcon /></div>}
      <div className="tp-main">
        <div className="tp-head">
          <b className="tp-count" aria-label={`${x.count} ${t("tp_wins")}`}>{x.count}×</b>
          <h3 className="tp-name">{name}</h3>
        </div>
        {x.seasons.length > 0 && <p className="tp-seasons small">{shown.join(" · ")}</p>}
        {noYear > 0 && <p className="muted small">{t("tp_noYear").replace("{n}", String(noYear))}</p>}
        {x.seasons.length > SHOW && <button className="linkbtn small" onClick={() => setAll(!all)} aria-expanded={all}>{all ? t("tp_less") : t("tp_more").replace("{n}", String(x.seasons.length))}</button>}
        {img && (
          <p className="tp-credit muted">
            {t("tp_photo")}: <a href={img.page} target="_blank" rel="noopener noreferrer">{img.author || "Wikimedia Commons"}</a>
            {" · "}{img.licenseUrl ? <a href={img.licenseUrl} target="_blank" rel="noopener noreferrer license">{img.license}</a> : img.license}
          </p>
        )}
      </div>
    </li>
  );
}

export default function TrophiesTab({ source, slug }: { source: string; slug: string }) {
  const { t } = useI18n();
  const [r, setR] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/pokaalit?l=${encodeURIComponent(source)}&t=${encodeURIComponent(slug)}`);
      setR(await res.json().catch(() => ({ state: "error" })));
    } catch { setR({ state: "error" }); }
    setBusy(false);
  }, [source, slug]);
  useEffect(() => { load(); }, [load]);

  if (!r) return <section className="panel"><p className="muted pad loading">{t("loading")}</p></section>;
  if (r.state === "error") return (
    <section className="panel"><div className="pad load-err" role="alert">
      <p className="muted">{t("tp_error")}</p>
      <button className="btn" onClick={load} disabled={busy}>{busy ? t("loading") : t("retry")}</button>
    </div></section>
  );
  if (r.state !== "ok") return <section className="panel"><p className="muted pad">{t("tp_nomatch")}</p></section>;
  const src = <a href={`https://www.wikidata.org/wiki/${r.q}`} target="_blank" rel="noopener noreferrer">Wikidata</a>;
  const [pre, post] = t("tp_source").split("{src}");
  return (
    <div className="tp-wrap">
      <section className="panel">
        <div className="panel-head"><h3>{t("trophies")}</h3><span className="muted">{r.trophies.reduce((a, x) => a + x.count, 0) || ""}</span></div>
        {r.trophies.length ? <ul className="tp-list">{r.trophies.map((x) => <Item key={x.key} x={x} />)}</ul>
          : <p className="muted pad">{t("tp_none")}</p>}
      </section>
      <p className="muted small tr-src">{pre}{src}{post}</p>
    </div>
  );
}
