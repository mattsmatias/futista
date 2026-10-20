"use client";
import type { Article } from "@/lib/feed";
import { toLocal } from "@/lib/links";
import { useI18n } from "@/lib/i18n";
import Art from "./Art";

export function Chips({ a }: { a: Article }) {
  const i = useI18n();
  return (
    <div className="chips">
      <span className={`chip chip-${a.source}`}>{i.league(a.source, a.league)}</span>
      {a.type !== "Uutiset" && (
        <span className={`chip chip-${a.type.toLowerCase()}`}>
          {a.type === "Tulokset" && <i className="live" />}{i.type(a.type)}
        </span>
      )}
    </div>
  );
}

export function Meta({ a }: { a: Article }) {
  const i = useI18n();
  return (
    <div className="meta">
      <span>{a.author}</span>
      <time dateTime={a.date} suppressHydrationWarning>{i.ago(a.date)}</time>
      <span className="src">{i.t("source")}: {a.sourceName}</span>
    </div>
  );
}

export function Card({ a, wide }: { a: Article; wide?: boolean }) {
  return (
    <a className={`card${wide ? " wide" : ""}`} href={toLocal(a.link)}>
      <Art image={a.image} seed={a.id} tags={a.tags} source={a.source} big={wide} />
      <div className="card-body">
        <Chips a={a} />
        <h3>{a.title}</h3>
        <p>{a.excerpt}</p>
        <Meta a={a} />
      </div>
    </a>
  );
}

