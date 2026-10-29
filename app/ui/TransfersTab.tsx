"use client";
// Joukkueen siirrot (API-Football): tulleet ja lähteneet tältä kaudelta. Haetaan, kun välilehti avataan.
// Summa näytetään vain, jos lähde kertoo sen; muuten pelkkä siirtotyyppi tai ei mitään (ei arvata).
import { useCallback, useEffect, useState } from "react";
import { useI18n, type Key } from "@/lib/i18n";
import { Badge } from "../Stats";
import type { Transfer, TeamTransfers } from "@/lib/apifootball-core";

type Resp = { state: "ok"; data: TeamTransfers } | { state: "off" | "nomatch" | "notfound" | "error" };

const fiDate = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return `${dd}.${m}.${y}`; };
const KIND: Record<string, Key | null> = { loan: "tr_loan", loanEnd: "tr_loanEnd", free: "tr_free", fee: null, unknown: null };

function PhotoOrInitial({ src, name }: { src: string | null; name: string }) {
  const [bad, setBad] = useState(false);
  return (
    <span className="tr-photo" aria-hidden="true">
      {src && !bad ? <img src={src} alt="" width={40} height={40} loading="lazy" decoding="async" onError={() => setBad(true)} /> : <b>{name.trim().charAt(0).toUpperCase()}</b>}
    </span>
  );
}

function Row({ x, dir }: { x: Transfer; dir: "in" | "out" }) {
  const { t } = useI18n();
  const kind = KIND[x.kind];
  const what = x.kind === "fee" && x.fee ? x.fee : kind ? t(kind) : null;
  return (
    <li className="tr-row">
      <PhotoOrInitial src={x.photo} name={x.player} />
      <div className="tr-main">
        <b className="tr-name">{x.player}</b>
        <span className="tr-other muted small">
          <span className="sr-only">{t(dir === "in" ? "tr_fromLabel" : "tr_toLabel")}: </span>
          <span aria-hidden="true">{dir === "in" ? "←" : "→"}</span>
          {x.other ? <><Badge t={{ name: x.other.name, code: "", crest: x.other.logo ?? undefined }} size={16} /> {x.other.name}</> : "–"}
        </span>
      </div>
      <div className="tr-meta">
        <span className="tr-date small">{fiDate(x.date)}</span>
        {what && <span className={`tr-kind tr-${x.kind}`}>{what}</span>}
      </div>
    </li>
  );
}

export default function TransfersTab({ source, slug }: { source: string; slug: string }) {
  const { t } = useI18n();
  const [r, setR] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/siirrot?l=${encodeURIComponent(source)}&t=${encodeURIComponent(slug)}`);
      setR(await res.json().catch(() => ({ state: "error" })));
    } catch { setR({ state: "error" }); }
    setBusy(false);
  }, [source, slug]);
  useEffect(() => { load(); }, [load]);

  if (!r) return <section className="panel"><p className="muted pad loading">{t("loading")}</p></section>;
  if (r.state === "error") return (
    <section className="panel"><div className="pad load-err" role="alert">
      <p className="muted">{t("tr_error")}</p>
      <button className="btn" onClick={load} disabled={busy}>{busy ? t("loading") : t("retry")}</button>
    </div></section>
  );
  if (r.state !== "ok") return <section className="panel"><p className="muted pad">{t(r.state === "nomatch" ? "tr_nomatch" : "tr_unavailable")}</p></section>;
  const d = r.data;
  const list = (dir: "in" | "out", items: Transfer[]) => (
    <section className="panel tr-panel">
      <div className="panel-head"><h3>{t(dir === "in" ? "tr_in" : "tr_out")}</h3><span className="muted">{items.length}</span></div>
      {items.length ? <ul className="tr-list">{items.map((x, k) => <Row key={`${x.playerId ?? x.player}-${x.date}-${k}`} x={x} dir={dir} />)}</ul>
        : <p className="muted pad">{t(dir === "in" ? "tr_noneIn" : "tr_noneOut")}</p>}
    </section>
  );
  return (
    <div className="tr-wrap">
      <div className="duo">
        {list("in", d.in)}
        {list("out", d.out)}
      </div>
      <p className="muted small tr-src">{t("tr_since").replace("{d}", fiDate(d.from))}</p>
    </div>
  );
}
