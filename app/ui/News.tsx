"use client";
// Uutislistan osat: pääuutinen (maltillinen kuva) ja tiivis uutisrivi. Lähde näkyy jokaisessa.
import type { Article } from "@/lib/feed";
import { toLocal } from "@/lib/links";
import { useI18n } from "@/lib/i18n";
import Art from "../Art";
import { useIsRead } from "@/lib/read-news";

export function NewsLead({ a, isNew }: { a: Article; isNew?: boolean }) {
  const i = useI18n();
  const read = useIsRead(toLocal(a.link));
  return (
    <a className={`nlead${isNew ? " is-new" : ""}${read ? " is-read" : ""}`} href={toLocal(a.link)}>
      <Art image={a.image} seed={a.id} tags={a.tags} source={a.source} big />
      <div className="nlead-txt">
        <span className={`chip chip-${a.source}`}>{i.league(a.source, a.league)}</span>
        <h2>{a.title}</h2>
        {a.excerpt && <p>{a.excerpt}</p>}
        <NewsMeta a={a} read={read} />
      </div>
    </a>
  );
}

export function NewsItem({ a, isNew }: { a: Article; isNew?: boolean }) {
  const read = useIsRead(toLocal(a.link));
  return (
    <a className={`nitem${isNew ? " is-new" : ""}${read ? " is-read" : ""}`} href={toLocal(a.link)}>
      <Art image={a.image} seed={a.id} tags={a.tags} source={a.source} small />
      <div className="nitem-txt">
        <h3>{a.title}</h3>
        <NewsMeta a={a} read={read} />
      </div>
    </a>
  );
}

export function NewsMeta({ a, read }: { a: Article; read?: boolean }) {
  const i = useI18n();
  return (
    <span className="nmeta">
      {read && <span className="nm-read"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{i.t("readMark")}</span>}
      <span className={`nm-lg nm-${a.source}`}>{i.league(a.source, a.league)}</span>
      {a.type === "Siirtouutiset" && <span className="nm-type">{i.t("transfers")}</span>}
      <time dateTime={a.date} suppressHydrationWarning>{i.ago(a.date)}</time>
      <span className="nm-src">{i.t("source")}: {a.sourceName}</span>
    </span>
  );
}
