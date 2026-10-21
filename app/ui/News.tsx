"use client";
// Uutislistan osat: pääuutinen (maltillinen kuva) ja tiivis uutisrivi. Lähde näkyy jokaisessa.
import type { Article } from "@/lib/feed";
import { toLocal } from "@/lib/links";
import { useI18n } from "@/lib/i18n";
import Art from "../Art";

export function NewsLead({ a, isNew }: { a: Article; isNew?: boolean }) {
  const i = useI18n();
  return (
    <a className={`nlead${isNew ? " is-new" : ""}`} href={toLocal(a.link)}>
      <Art image={a.image} seed={a.id} tags={a.tags} source={a.source} big />
      <div className="nlead-txt">
        <span className={`chip chip-${a.source}`}>{i.league(a.source, a.league)}</span>
        <h2>{a.title}</h2>
        {a.excerpt && <p>{a.excerpt}</p>}
        <NewsMeta a={a} />
      </div>
    </a>
  );
}

export function NewsItem({ a, isNew }: { a: Article; isNew?: boolean }) {
  return (
    <a className={`nitem${isNew ? " is-new" : ""}`} href={toLocal(a.link)}>
      <Art image={a.image} seed={a.id} tags={a.tags} source={a.source} small />
      <div className="nitem-txt">
        <h3>{a.title}</h3>
        <NewsMeta a={a} />
      </div>
    </a>
  );
}

export function NewsMeta({ a }: { a: Article }) {
  const i = useI18n();
  return (
    <span className="nmeta">
      <span className={`nm-lg nm-${a.source}`}>{i.league(a.source, a.league)}</span>
      {a.type === "Siirtouutiset" && <span className="nm-type">{i.t("transfers")}</span>}
      <time dateTime={a.date} suppressHydrationWarning>{i.ago(a.date)}</time>
      <span className="nm-src">{i.t("source")}: {a.sourceName}</span>
    </span>
  );
}
