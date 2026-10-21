"use client";
// Haku: joukkueet, sarjat ja maajoukkueet valmiiksi ladatusta hakemistosta (/api/haku, CDN-välimuisti).
// Dialogi: kohdistus hakukenttään avattaessa, nuolinäppäimet tuloksissa, Enter avaa, Escape sulkee ja
// palauttaa kohdistuksen avanneeseen painikkeeseen.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n, type Key } from "@/lib/i18n";
import { search, type SearchComp, type SearchIndex, type SearchNation, type SearchTeam } from "@/lib/search-core";
import { SOURCES } from "@/lib/sources";
import { COMP_META, COMP_ORDER } from "@/lib/comps";
import { country } from "@/lib/flags";
import { HeartButton, useFavorites } from "@/lib/favorites";
import { norm } from "@/lib/teams";
import { Badge } from "../Stats";
import { CompMark } from "./CompMark";
import { Icon } from "./Icons";

let cache: Promise<SearchIndex | null> | null = null;
export const loadIndex = () => {
  if (!cache) cache = fetch("/api/haku").then((r) => r.json().catch(() => null).then((d) => (r.ok ? d : null))).catch(() => null)
    .then((j) => { if (!j) cache = null; return j; }); // epäonnistunut lataus yritetään uudelleen seuraavalla avauksella
  return cache;
};

export default function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const i = useI18n();
  const { t } = i;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const { favs } = useFavorites();

  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 0);
    if (!index) {
      setState("loading");
      loadIndex().then((j) => { if (j) { setIndex(j); setState("idle"); } else setState("failed"); });
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, index]);

  const comps: SearchComp[] = useMemo(() => [
    ...COMP_ORDER.map((id) => {
      const s = SOURCES.find((x) => x.id === id)!;
      return { kind: "comp" as const, id, name: i.league(id, s.league), country: t(`c_${COMP_META[id].country}` as Key), href: `/sarjat/${id}` };
    }),
    { kind: "comp", id: "intl", name: t("nationalTeams"), country: t("intlGroup"), href: "/maajoukkueet" },
  ], [i.lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const nations: SearchNation[] = useMemo(() => (index?.nations ?? []).map((n) => {
    const names = (["fi", "sv", "en"] as const).map((l) => country(n.name, l)?.name ?? n.name);
    const local = country(n.name, i.lang as "fi" | "sv" | "en");
    return { ...n, name: local?.name ?? n.name, names: [...new Set([n.name, ...names])], flag: local?.code ?? null };
  }), [index, i.lang]);

  const res = useMemo(() => search({ teams: index?.teams ?? [], comps, nations }, q), [index, comps, nations, q]);
  const flat: (SearchTeam | SearchComp | SearchNation)[] = [...res.teams, ...res.comps, ...res.nations];
  useEffect(() => { setActive(0); }, [q]);

  const close = () => { setQ(""); onClose(); };
  const go = (href: string) => { close(); router.push(href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && flat[active]) { e.preventDefault(); go(flat[active].href); }
  };
  // kohdistus pysyy dialogissa (Tab kiertää)
  const trap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const els = [...e.currentTarget.querySelectorAll<HTMLElement>("input, button, a[href]")].filter((x) => !x.hasAttribute("disabled"));
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  if (!open) return null;
  const optId = (n: number) => `${listId}-o${n}`;
  let n = -1;
  const group = <T extends SearchTeam | SearchComp | SearchNation>(label: Key, items: T[], render: (x: T) => JSX.Element) =>
    items.length > 0 && (
      <section className="s-group" aria-label={t(label)}>
        <h3>{t(label)}</h3>
        <ul role="presentation">
          {items.map((x) => {
            n++;
            const idx = n;
            return (
              <li key={x.href} role="presentation" className={`s-row${active === idx ? " on" : ""}`} onMouseEnter={() => setActive(idx)}>
                <a id={optId(idx)} role="option" aria-selected={active === idx} href={x.href} onClick={(e) => { e.preventDefault(); go(x.href); }}>{render(x)}</a>
                {x.kind === "team" && <HeartButton team={{ name: x.name, id: x.id }} label={t("favToggle")} />}
              </li>
            );
          })}
        </ul>
      </section>
    );

  return (
    <div className="s-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="s-dialog" role="dialog" aria-modal="true" aria-label={t("search")} onKeyDown={trap}>
        <div className="s-bar">
          <span className="s-ico">{Icon.search}</span>
          <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder={t("searchPh")} aria-label={t("searchPh")} role="combobox" aria-expanded={flat.length > 0}
            aria-controls={listId} aria-activedescendant={flat.length ? optId(active) : undefined} autoComplete="off" spellCheck={false} />
          <button type="button" className="icon-btn" onClick={close} aria-label={t("close")}>{Icon.close}</button>
        </div>
        <div className="s-body" id={listId} role="listbox" aria-label={t("search")}>
          {state === "failed" && <p className="muted pad" role="alert">{t("searchFailed")}</p>}
          {state === "loading" && q.trim().length >= 2 && <p className="muted pad">{t("loading")}</p>}
          {q.trim().length < 2 && favs.length > 0 && (
            // tyhjällä haulla näkyvät nykyiset suosikit: sydämestä voi poistaa, kirjoittamalla lisätä uusia
            <section className="s-group" aria-label={t("followedTeams")}>
              <h3>{t("followedTeams")}</h3>
              <ul role="presentation">
                {favs.map((f) => {
                  const hit = index?.teams.find((x) => (f.id !== undefined && x.id === f.id) || norm(x.name) === norm(f.n));
                  return (
                    <li key={f.n + (f.id ?? "")} role="presentation" className="s-row">
                      {hit ? <a href={hit.href} onClick={(e) => { e.preventDefault(); go(hit.href); }}><Badge t={{ name: hit.name, code: hit.code, crest: hit.crest }} size={24} /><span className="s-name">{hit.name}</span></a>
                        : <span className="s-fav-only"><Badge t={{ name: f.n, code: f.n.slice(0, 3).toUpperCase() }} size={24} /><span className="s-name">{f.n}</span></span>}
                      <HeartButton team={{ name: f.n, id: f.id }} label={t("favToggle")} />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {q.trim().length < 2 && <p className="muted pad">{t("searchMin")} {t("searchHint")}</p>}
          {group("searchTeams", res.teams, (x) => (
            <><Badge t={{ name: x.name, code: x.code, crest: x.crest }} size={24} /><span className="s-name">{x.name}</span>
              <span className="s-sub">{x.comps.map((c) => i.league(c, SOURCES.find((s) => s.id === c)?.league ?? c)).join(" · ")}</span></>
          ))}
          {group("searchComps", res.comps, (x) => (
            <><CompMark id={x.id} /><span className="s-name">{x.name}</span><span className="s-sub">{x.country}</span></>
          ))}
          {group("searchNations", res.nations, (x) => (
            <>{x.flag ? <img className="s-flag" src={`https://flagcdn.com/w40/${x.flag}.png`} alt="" width={24} height={16} /> : <span className="s-flag" />}
              <span className="s-name">{x.name}</span><span className="s-sub">{t("nationalTeamMen")}</span></>
          ))}
          {q.trim().length >= 2 && state !== "loading" && flat.length === 0 && (
            <div className="pad"><p><b>{t("searchNone")}</b></p><p className="muted">{t("searchHint")}</p></div>
          )}
          {index?.partial && q.trim().length >= 2 && <p className="muted pad">{t("searchPartial")}</p>}
        </div>
      </div>
    </div>
  );
}
