"use client";
// Sarjat-hakemisto: suositut, muut tuetut sarjat ja maajoukkueet. Ei näkyvää otsikkoa eikä rajauskenttää (käyttäjän valinta 25.10.2026;
// kilpailut löytyvät myös yläpalkin hausta).
// Suositut-listan kilpailu voi näkyä myös omassa ryhmässään (esim. Veikkausliiga myös Suomi-ryhmässä).
import { SOURCES } from "@/lib/sources";
import { COMP_META, COMP_ORDER, POPULAR, DIR_HIDDEN } from "@/lib/comps";
import { activeAfComps, AF_GROUP_ORDER, type AfGroup } from "@/lib/af-registry";
import { useI18n, type Key } from "@/lib/i18n";
import Footer from "../Footer";
import { CompMark } from "./CompMark";
import { Icon } from "./Icons";
import { useState } from "react";
import type { CompCountry } from "@/lib/comps";

// Sarjan maa lippuna (käyttäjän valinta 28.10.2026). Sama lippulähde kuin pelaajien kansallisuuksissa (flagcdn).
// Maan nimi säilyy ruudunlukijalle; jos kuva ei lataudu, näytetään nimi tekstinä.
// UEFA-kilpailuilla (eu) ei lippua: UEFA ei ole EU, ja kilpailun oma tunnus kertoo sen (käyttäjän valinta 28.10.2026)
const FLAG: Partial<Record<CompCountry, string>> = { es: "es", en: "gb-eng", de: "de", it: "it", fr: "fr", nl: "nl", pt: "pt", tr: "tr", us: "us", fi: "fi", se: "se", no: "no", dk: "dk" };
function DirCountry({ cc, name }: { cc?: CompCountry; name: string }) {
  const [broken, setBroken] = useState(false);
  const code = cc ? FLAG[cc] : undefined;
  if (cc === "world") return <span className="dir-sub dir-cc" title={name}><span className="dir-globe" aria-hidden="true">🌍</span><span className="sr-only">{name}</span></span>;
  if (cc === "eu") return <span className="dir-sub dir-cc"><span className="sr-only">{name}</span></span>;
  if (!code || broken) return <span className="dir-sub">{name}</span>;
  return (
    <span className="dir-sub dir-cc" title={name}>
      <img className="dir-flag" src={`https://flagcdn.com/w40/${code}.png`} alt="" width={24} height={16} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      <span className="sr-only">{name}</span>
    </span>
  );
}

export default function CompsDirectory() {
  const i = useI18n();
  const { t } = i;
  const item = (id: string) => {
    const s = SOURCES.find((x) => x.id === id)!;
    const cc = COMP_META[id as keyof typeof COMP_META].country;
    const country = t(`c_${cc}` as Key);
    // naisten kilpailut ovat omassa Naisten jalkapallo -ryhmässään → maan viereen ei "Naiset"-merkintää (käyttäjän valinta 24.10.2026)
    return { id, name: i.league(id, s.league), country, cc, href: `/sarjat/${id}` };
  };
  // API-Football-kilpailut ryhmittäin (sama kilpailu voi näkyä useassa ryhmässä; linkki ja sivu ovat yksi)
  const af = activeAfComps().filter((c) => !DIR_HIDDEN.includes(c.id));
  const afGroup = (g: AfGroup) => af.filter((c) => (c.groups as readonly string[]).includes(g)).map((c) => item(c.id));
  const popular = POPULAR.map(item);
  // Suomi- ja Pohjoismaat-ryhmiä ei näytetä (käyttäjän valinta 24.10.2026): niiden kilpailut, joilla ei ole muuta ryhmää
  // eikä paikkaa Suositut-listalla (Ykkösliiga, Allsvenskan, Eliteserien, Superliga), näytetään Muut sarjat -ryhmässä.
  // Suomen Cup on Cupit-, Kansallinen Liiga Naisten jalkapallo -ryhmässä.
  const MERGED: readonly AfGroup[] = ["fi", "nordic"];
  const inOther = af.filter((c) => c.groups.every((g) => MERGED.includes(g as AfGroup)) && !POPULAR.includes(c.id as never)).map((c) => c.id);
  const other = [...COMP_ORDER.filter((id) => !POPULAR.includes(id)), ...inOther].map(item);
  const nations = [
    { id: "intl", name: t("nationalTeams"), country: t("intlGroup"), href: "/maajoukkueet" },
    { id: "fin", name: t("huuhkajat"), country: t("nationalTeamMen"), href: "/maajoukkue/458" },
    ...afGroup("nt"),
  ];
  const GROUP_TITLE: Record<Exclude<AfGroup, "nt">, Key> = { fi: "grp_fi", cups: "grp_cups", nordic: "grp_nordic", women: "grp_women" };
  const list = (title: Key, items: { id: string; name: string; country: string; cc?: CompCountry; href: string }[]) => items.length > 0 && (
    <section className="dir-sec" aria-labelledby={`d-${title}`}>
      <h2 id={`d-${title}`} className="sub-h">{t(title)}</h2>
      <ul className="dir-list">
        {items.map((x) => (
          <li key={x.id}>
            <a href={x.href}>
              {x.id === "fin" ? <span className="cmark cmark-logo cmark-crest" aria-hidden="true"><img src="/icons/huuhkajat.png" alt="" width={22} height={28} /></span> : <CompMark id={x.id} />}
              <span className="dir-name">{x.name}</span><DirCountry cc={x.cc} name={x.country} />{Icon.next}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <>
      <main className="wrap dirpage">
        {/* sivun otsikko vain ruudunlukijalle ja hakukoneille (näkyvä "Sarjat"-otsikko poistettu) */}
        <h1 className="sr-only">{t("nav_comps")}</h1>
        {list("popularComps", popular)}
        {list("otherComps", other)}
        {list("nationalTeams", nations)}
        {AF_GROUP_ORDER.filter((g): g is Exclude<AfGroup, "nt" | "fi" | "nordic"> => g !== "nt" && !MERGED.includes(g)).map((g) => <div key={g}>{list(GROUP_TITLE[g], afGroup(g))}</div>)}
      </main>
      <Footer />
    </>
  );
}
