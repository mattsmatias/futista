"use client";
// Ottelun kohokohtavideo (Yhteenveto-välilehti, päättynyt ottelu). Pikkukuva tulee omalta palvelimelta;
// YouTube-soitin (youtube-nocookie.com) ladataan vasta, kun käyttäjä painaa toistoa.
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Hl = { state: string; video?: { id: string; title: string; channel: string } };

export function HighlightCard({ l, d, p }: { l: string; d: string; p: string }) {
  const { t } = useI18n();
  const [hl, setHl] = useState<Hl["video"] | null>(null);
  const [play, setPlay] = useState(false);
  const [thumbOk, setThumbOk] = useState(true);
  useEffect(() => {
    let on = true;
    fetch(`/api/kohokohdat?l=${encodeURIComponent(l)}&d=${encodeURIComponent(d)}&p=${encodeURIComponent(p)}`)
      .then((r) => (r.ok ? r.json() : null)).then((j: Hl | null) => { if (on && j?.state === "ok" && j.video && /^[\w-]{11}$/.test(j.video.id)) setHl(j.video); })
      .catch(() => {});
    return () => { on = false; };
  }, [l, d, p]);
  if (!hl) return null;
  const watch = `https://www.youtube.com/watch?v=${hl.id}`;
  return (
    <section className="panel hl-card" aria-label={t("hl_title")}>
      {play ? (
        <div className="hl-frame">
          <iframe src={`https://www.youtube-nocookie.com/embed/${hl.id}?autoplay=1&rel=0`} title={hl.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      ) : (
        <button type="button" className="hl-open" onClick={() => setPlay(true)} aria-label={t("hl_play").replace("{t}", hl.title)}>
          <span className="hl-thumb">
            {thumbOk && <img src={`/api/kohokohdat/kuva?v=${hl.id}`} alt="" width={480} height={360} loading="lazy" decoding="async" onError={() => setThumbOk(false)} />}
            <span className="hl-playbtn" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
          </span>
          <span className="hl-text"><b>{t("hl_title")}</b><small>{hl.channel} · YouTube</small></span>
        </button>
      )}
      {play && <p className="hl-meta muted small"><span>{hl.title}</span> <a href={watch} target="_blank" rel="noopener noreferrer">{t("hl_open")}</a></p>}
    </section>
  );
}
