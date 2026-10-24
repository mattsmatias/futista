"use client";
// Sarjat-hakemisto: suositut, muut tuetut sarjat ja maajoukkueet; rajaus nimellä tai maalla.
// Suositut-listan kilpailu voi näkyä myös omassa ryhmässään (esim. Veikkausliiga myös Suomi-ryhmässä).
import { useState } from "react";
import { SOURCES } from "@/lib/sources";
import { COMP_META, COMP_ORDER, POPULAR, DIR_HIDDEN } from "@/lib/comps";
import { activeAfComps, AF_GROUP_ORDER, type AfGroup } from "@/lib/af-registry";
import { useI18n, type Key } from "@/lib/i18n";
import { fold } from "@/lib/search-core";
import Footer from "../Footer";
import { CompMark } from "./CompMark";
import { Icon } from "./Icons";

export default function CompsDirectory() {
  const i = useI18n();
  const { t } = i;
  const [q, setQ] = useState("");
  const item = (id: string) => {
    const s = SOURCES.find((x) => x.id === id)!;
    const country = t(`c_${COMP_META[id as keyof typeof COMP_META].country}` as Key);
    return { id, name: i.league(id, s.league), country: s.women ? `${country} · ${t("womenComp")}` : country, href: `/sarjat/${id}` };
  };
  // API-Football-kilpailut ryhmittäin (sama kilpailu voi näkyä useassa ryhmässä; linkki ja sivu ovat yksi)
  const af = activeAfComps().filter((c) => !DIR_HIDDEN.includes(c.id));
  const afGroup = (g: AfGroup) => af.filter((c) => (c.groups as readonly string[]).includes(g)).map((c) => item(c.id)).filter(match);
  const match = (x: { name: string; country: string }) => !q.trim() || fold(`${x.name} ${x.country}`).includes(fold(q));
  const popular = POPULAR.map(item).filter(match);
  const other = COMP_ORDER.filter((id) => !POPULAR.includes(id)).map(item).filter(match);
  const nations = [
    { id: "intl", name: t("nationalTeams"), country: t("intlGroup"), href: "/maajoukkueet" },
    { id: "fin", name: t("huuhkajat"), country: t("nationalTeamMen"), href: "/maajoukkue/458" },
    ...afGroup("nt"),
  ].filter(match);
  const GROUP_TITLE: Record<Exclude<AfGroup, "nt">, Key> = { fi: "grp_fi", cups: "grp_cups", nordic: "grp_nordic", women: "grp_women" };
  const list = (title: Key, items: { id: string; name: string; country: string; href: string }[]) => items.length > 0 && (
    <section className="dir-sec" aria-labelledby={`d-${title}`}>
      <h2 id={`d-${title}`} className="sub-h">{t(title)}</h2>
      <ul className="dir-list">
        {items.map((x) => (
          <li key={x.id}>
            <a href={x.href}>
              {x.id === "fin" ? <span className="cmark cmark-logo cmark-crest" aria-hidden="true"><img src="/icons/huuhkajat.png" alt="" width={22} height={28} /></span> : <CompMark id={x.id} />}
              <span className="dir-name">{x.name}</span><span className="dir-sub">{x.country}</span>{Icon.next}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <>
      <main className="wrap dirpage">
        <div className="page-title"><h1>{t("nav_comps")}</h1></div>
        <label className="dir-filter">
          <span className="sr-only">{t("filterComps")}</span>
          {Icon.search}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("filterComps")} />
        </label>
        {list("popularComps", popular)}
        {afGroup("fi").length > 0 && list("grp_fi", afGroup("fi"))}
        {list("otherComps", other)}
        {list("nationalTeams", nations)}
        {AF_GROUP_ORDER.filter((g): g is Exclude<AfGroup, "nt" | "fi"> => g !== "nt" && g !== "fi").map((g) => <div key={g}>{list(GROUP_TITLE[g], afGroup(g))}</div>)}
        {!popular.length && !other.length && !nations.length && !af.some((c) => match(item(c.id))) && <p className="empty-state">{t("noComps")}</p>}
      </main>
      <Footer />
    </>
  );
}
