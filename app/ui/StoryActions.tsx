"use client";
// Jutun loppuun: "Piditkö tästä uutisesta?" (peukku ylös/alas) ja jakaminen.
//  - Reaktiot: palvelimelle tallentuvat vain jutun yhteissummat; oma vastaus muistetaan tällä laitteella,
//    joten sen voi vaihtaa tai perua. Jos toiminto ei ole käytössä (enabled:false), kysymystä ei näytetä.
//  - Jakaminen: puhelimen oma jakovalikko (jos selain tukee), WhatsApp, Facebook, X, Telegram, sähköposti
//    ja linkin kopiointi. Ulkoisia skriptejä ei ladata; palvelu avautuu vasta painettaessa.
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { applyVote, type Counts, type Vote } from "@/lib/reactions-core";

const STORE = "futista-reaktiot";
const readVotes = (): Record<string, Vote> => { try { return JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch { return {}; } };
const saveVote = (k: string, v: Vote) => {
  try {
    const all = readVotes();
    if (v === 0) delete all[k]; else all[k] = v;
    const keys = Object.keys(all);
    if (keys.length > 500) for (const x of keys.slice(0, keys.length - 500)) delete all[x]; // muisti ei kasva rajatta
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {}
};

const Thumb = ({ down }: { down?: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={down ? { transform: "scaleY(-1)" } : undefined}>
    <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3z" /><path d="M7 10l4-7a2.5 2.5 0 0 1 3 2.6L13.5 9H19a2 2 0 0 1 2 2.3l-1.2 7.6A2.5 2.5 0 0 1 17.3 21H7" />
  </svg>
);

function Reactions({ article }: { article: string }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Counts>({ up: 0, down: 0 });
  const [mine, setMine] = useState<Vote>(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const own = readVotes()[article] ?? 0;
    setMine(own);
    let alive = true;
    fetch(`/api/reactions?a=${encodeURIComponent(article)}`).then((r) => r.json()).then((d) => {
      if (!alive) return;
      setEnabled(!!d?.enabled);
      // välimuistissa oleva summa voi olla hetken vanha: oma ääni näkyy silti mukana
      if (d?.enabled) setCounts({ up: Math.max(Number(d.up) || 0, own === 1 ? 1 : 0), down: Math.max(Number(d.down) || 0, own === -1 ? 1 : 0) });
    }).catch(() => alive && setEnabled(false));
    return () => { alive = false; };
  }, [article]);

  if (!enabled) return null;

  const vote = async (v: Vote) => {
    if (busy) return;
    const prev = mine, next: Vote = mine === v ? 0 : v; // sama painike uudelleen = peru
    setBusy(true); setFailed(false);
    setMine(next); setCounts((c) => applyVote(c, prev, next)); // näytetään heti
    try {
      const r = await fetch("/api/reactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: article, prev, next }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.enabled) throw new Error("save");
      setCounts({ up: Number(d.up) || 0, down: Number(d.down) || 0 });
      saveVote(article, next);
    } catch {
      setMine(prev); setCounts((c) => applyVote(c, next, prev)); setFailed(true); // palautetaan ennalleen
    } finally { setBusy(false); }
  };

  return (
    <section className="react-box" aria-labelledby="react-q">
      <h2 id="react-q" className="react-q">{t("likeQ")}</h2>
      <div className="react-btns">
        <button type="button" className={`react-btn${mine === 1 ? " on" : ""}`} aria-pressed={mine === 1} disabled={busy} onClick={() => vote(1)}>
          <Thumb /><span>{t("likeYes")}</span><b className="react-n">{counts.up}</b>
        </button>
        <button type="button" className={`react-btn${mine === -1 ? " on" : ""}`} aria-pressed={mine === -1} disabled={busy} onClick={() => vote(-1)}>
          <Thumb down /><span>{t("likeNo")}</span><b className="react-n">{counts.down}</b>
        </button>
      </div>
      <p className="react-note muted" role="status">{failed ? t("likeFailed") : mine !== 0 ? `${t("likeThanks")} ${t("likeChange")}` : ""}</p>
    </section>
  );
}

function Share({ title }: { title: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [canNative, setCanNative] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setUrl(location.origin + location.pathname);
    setCanNative(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);
  if (!url) return null;
  const u = encodeURIComponent(url), tt = encodeURIComponent(title);
  const targets = [
    { id: "whatsapp", name: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { id: "facebook", name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { id: "x", name: "X", href: `https://x.com/intent/post?text=${tt}&url=${u}` },
    { id: "telegram", name: "Telegram", href: `https://t.me/share/url?url=${u}&text=${tt}` },
  ];
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); }
    catch {
      const ta = document.createElement("textarea"); ta.value = url; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };
  return (
    <section className="share-box" aria-labelledby="share-h">
      <h2 id="share-h" className="react-q">{t("shareTitle")}</h2>
      <div className="share-btns">
        {canNative && <button type="button" className="share-btn sh-native" onClick={() => navigator.share({ title, url }).catch(() => {})}>{t("shareMore")}</button>}
        {targets.map((x) => <a key={x.id} className={`share-btn sh-${x.id}`} href={x.href} target="_blank" rel="noopener noreferrer">{x.name}</a>)}
        <a className="share-btn sh-email" href={`mailto:?subject=${tt}&body=${encodeURIComponent(`${title}\n\n${url}`)}`}>{t("shareEmail")}</a>
        <button type="button" className="share-btn sh-copy" onClick={copy}>{copied ? t("linkCopied") : t("copyLink")}</button>
      </div>
      <span className="sr-only" role="status">{copied ? t("linkCopied") : ""}</span>
    </section>
  );
}

export default function StoryActions({ article, title }: { article: string; title: string }) {
  return (
    <div className="story-actions">
      <Reactions article={article} />
      <Share title={title} />
    </div>
  );
}
