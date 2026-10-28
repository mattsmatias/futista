"use client";
// Sovelluksen runko kaikille sivuille: kompakti yläpalkki (logo, haku, asetukset), päänavigaatio
// (Ottelut · Suosikit · Sarjat · Uutiset) – työpöydällä yläpalkissa, puhelimessa kiinteänä alapalkkina.
import { URL_EVENT } from "@/lib/url-state";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAppUpdate } from "@/lib/app-update";
import { usePathname, useRouter } from "next/navigation";
import { useFavorites } from "@/lib/favorites";
import NotifyCard from "./NotifyCard";
import { useBackgroundPrefetch, askServedFromCache } from "@/lib/prefetch";
import { useI18n, LANGS, type Key } from "@/lib/i18n";
import SearchDialog from "./Search";
import { AccountMenu, AccountWelcome } from "./Account";
import { Icon } from "./Icons";

type NavId = "matches" | "favs" | "live" | "fantasy" | "comps" | "news";
const NAV: { id: NavId; href: string; label: Key; icon: JSX.Element }[] = [
  { id: "matches", href: "/", label: "nav_matches", icon: Icon.matches },
  { id: "favs", href: "/suosikit", label: "nav_favs", icon: Icon.favs },
  // Live = etusivun Live-suodatin (?n=live) omana kohtanaan (käyttäjän valinta 24.10.2026)
  { id: "live", href: "/?n=live", label: "f_live", icon: Icon.live },
  // Fantasy näkyvästi päävalikossa (käyttäjän valinta 28.10.2026)
  { id: "fantasy", href: "/fantasy", label: "nav_fantasy", icon: Icon.fantasy },
  { id: "comps", href: "/sarjat", label: "nav_comps", icon: Icon.comps },
  { id: "news", href: "/uutiset", label: "nav_news", icon: Icon.news },
];

export function activeNav(path: string, live = false): NavId | null {
  if (path === "/" && live) return "live";
  if (path === "/" || path.startsWith("/ottelu")) return "matches";
  if (path.startsWith("/suosikit")) return "favs";
  if (path.startsWith("/sarjat") || path.startsWith("/maajoukkue") || path.startsWith("/joukkue") || path.startsWith("/pelaaja")) return "comps";
  if (path.startsWith("/uutiset")) return "news";
  if (path.startsWith("/fantasy")) return "fantasy";
  return null;
}

/** Alasivu (takaisin-painike näkyy) ja sen varareitti, jos sivulle tultiin suoralla linkillä */
export function backFallback(path: string): string | null {
  if (path.startsWith("/ottelu")) return "/";
  if (/^\/(joukkue|pelaaja)\//.test(path)) return "/sarjat";
  if (/^\/maajoukkue\//.test(path)) return "/maajoukkueet";
  if (path === "/maajoukkueet") return "/sarjat";
  if (/^\/uutiset\/.+/.test(path)) return "/uutiset";
  if (/^\/sarjat\/.+/.test(path)) return "/sarjat";
  if (path === "/tietoa" || path === "/tietosuoja") return "/";
  if (/^\/fantasy\/.+/.test(path)) return "/fantasy";
  if (path === "/fantasy") return "/sarjat";
  return null;
}

const SearchCtx = createContext<{ openSearch: () => void }>({ openSearch: () => {} });
export const useSearch = () => useContext(SearchCtx);

let navDepth = -1; // sovelluksen sisäiset siirtymät tällä latauskerralla (takaisin-painike)

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const router = useRouter();
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  // Live-kohta on aktiivinen, kun etusivulla on Live-suodatin (?n=live); suodatin vaihtuu ilman sivun latausta
  const [liveOn, setLiveOn] = useState(false);
  useEffect(() => {
    const read = () => setLiveOn(new URLSearchParams(location.search).get("n") === "live");
    read();
    window.addEventListener("popstate", read);
    window.addEventListener(URL_EVENT, read);
    return () => { window.removeEventListener("popstate", read); window.removeEventListener(URL_EVENT, read); };
  }, [path]);
  const active = activeNav(path, liveOn);
  const fallback = backFallback(path);

  useAppUpdate(); // uusi julkaisu käyttöön automaattisesti (myös kotivalikosta avattu sovellus)
  useEffect(() => { navDepth++; }, [path]);
  // kotivalikosta avattu sovellus: alatunniste piiloon (CSS display-mode kattaa useimmat; vanha iOS tunnistetaan tästä)
  useEffect(() => { if ((navigator as any).standalone === true) document.documentElement.classList.add("app-mode"); }, []);
  // ei nipistyszoomausta (iOS Safari ohittaa viewportin user-scalable-asetuksen, joten eleet estetään myös tässä)
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const pinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener("gesturestart", stop, { passive: false } as any);
    document.addEventListener("gesturechange", stop, { passive: false } as any);
    document.addEventListener("touchmove", pinch, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("touchmove", pinch);
    };
  }, []);
  // taustalla esihaku (suosikit ja pääsarjat) → sivut aukeavat napautuksella heti
  const { favs, ready } = useFavorites();
  useBackgroundPrefetch(favs, ready);
  // sivu avautui puhelimen muistista → palvelimen tuore versio heti perään (tulokset, taulukot)
  useEffect(() => { if (navigator.onLine === false) return; askServedFromCache().then((yes) => { if (yes && navigator.onLine !== false) router.refresh(); }).catch(() => {}); }, [path, router]);

  const openSearch = useCallback(() => { trigger.current = document.activeElement as HTMLElement | null; setSearchOpen(true); }, []);
  const closeSearch = useCallback(() => { setSearchOpen(false); setTimeout(() => trigger.current?.focus?.(), 0); }, []);
  // "/" tai Ctrl/Cmd+K avaa haun (ei kirjoituskentässä)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); openSearch(); }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [openSearch]);

  const back = () => {
    if (navDepth > 0 && history.length > 1) history.back();
    else router.push(fallback ?? "/");
  };

  return (
    <SearchCtx.Provider value={{ openSearch }}>
      <header className="appbar">
        <div className="wrap appbar-in">
          {fallback && (
            <button type="button" className="icon-btn back-btn" onClick={back} aria-label={t("back")}>{Icon.back}</button>
          )}
          <a href="/" className="logo" aria-label="Futista – Ottelut"><span>Futista</span></a>
          <nav className="topnav" aria-label={t("mainNav")}>
            {NAV.map((x) => (
              <a key={x.id} href={x.href} className={active === x.id ? "on" : ""} aria-current={active === x.id ? "page" : undefined}>
                {x.icon}<span>{t(x.label)}</span>
              </a>
            ))}
          </nav>
          <span className="grow" />
          <button type="button" className="search-btn" onClick={openSearch} aria-label={t("search")}>
            {Icon.search}<span className="search-ph">{t("searchPh")}</span>
          </button>
          <Settings />
        </div>
      </header>
      <div className="appbar-space" />
      {children}
      <nav className="bottomnav" aria-label={t("mainNav")}>
        {NAV.map((x) => (
          <a key={x.id} href={x.href} className={active === x.id ? "on" : ""} aria-current={active === x.id ? "page" : undefined}>
            {x.icon}<span>{t(x.label)}</span>
          </a>
        ))}
      </nav>
      <SearchDialog open={searchOpen} onClose={closeSearch} />
      <AccountWelcome />
    </SearchCtx.Provider>
  );
}

/** Asetukset: kieli, ilmoitukset, tili (kotivalikon sovelluksessa) + tietosivut */
function Settings() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    // tilidialogi on body-tasolla (portaali), mutta kuuluu valikkoon → sen napautukset eivät sulje valikkoa
    const off = (e: Event) => { if (!ref.current?.contains(e.target as Node) && !(e.target as Element)?.closest?.(".acc-scrim")) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = LANGS.find((l) => l.id === lang)!;
  return (
    <div className="settings" ref={ref}>
      <button ref={btn} type="button" className="icon-btn set-btn" aria-haspopup="true" aria-expanded={open}
        aria-label={`${t("settings")} · ${t("language")}: ${cur.name}`} onClick={() => setOpen(!open)}>
        {Icon.settings}<span className="set-lang" aria-hidden="true">{cur.short}</span>
      </button>
      {open && (
        <div className="set-menu" role="menu" aria-label={t("settings")}>
          <p className="set-h">{t("language")}</p>
          {LANGS.map((l) => (
            <button key={l.id} role="menuitemradio" aria-checked={l.id === lang} className={l.id === lang ? "on" : ""}
              onClick={() => { setLang(l.id); setOpen(false); btn.current?.focus(); }}>
              <b>{l.short}</b>{l.name}{l.id === lang && <i aria-hidden="true">✓</i>}
            </button>
          ))}
          <NotifyCard inMenu />
          <AccountMenu onAction={() => setOpen(false)} />
          <hr />
          <a role="menuitem" href="/tietoa" onClick={() => setOpen(false)}>{t("about")}</a>
          <a role="menuitem" href="/tietosuoja" onClick={() => setOpen(false)}>{t("privacy")}</a>
        </div>
      )}
    </div>
  );
}
