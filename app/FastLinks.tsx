"use client";
// Välitön sivunvaihto koko sivustolle: sisäiset linkit avataan sovelluksen sisällä (ei koko sivun
// uudelleenlatausta), ja linkki ladataan valmiiksi jo ennen kuin sitä ehditään painaa.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { URL_EVENT } from "@/lib/url-state";

export default function FastLinks() {
  const router = useRouter();
  useEffect(() => {
    const internal = (el: Element | null): string | null => {
      const a = el?.closest?.("a") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
      const raw = a.getAttribute("href");
      if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) return null;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || u.pathname.startsWith("/api/") || /\.\w{2,5}$/.test(u.pathname)) return null;
      return u.pathname + u.search + u.hash;
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = internal(e.target as Element);
      if (!href) return;
      e.preventDefault();
      const u = new URL(href, location.href);
      if (u.pathname === location.pathname) {
        // sama sivu, eri näkymän tila (esim. Ottelut "/" ↔ Live "/?n=live"): sivua ei ladata uudelleen, joten
        // osoite vaihdetaan ja näkymälle ilmoitetaan muutoksesta (useUrlParam ja alapalkin korostus lukevat sen).
        // Aiemmin router.push vaihtoi vain osoitteen, ja näkymä jäi ennalleen ("nappi ei toimi").
        if (u.pathname + u.search + u.hash !== location.pathname + location.search + location.hash) history.pushState(null, "", href);
        window.dispatchEvent(new Event(URL_EVENT));
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        return;
      }
      router.push(href);
    };

    const done = new Set<string>();
    const prefetch = (href: string | null) => {
      if (!href || done.has(href)) return;
      done.add(href);
      // vain sivun runko latausnäkymään asti (ei koko sivua), jotta palvelinta ei kuormiteta
      try { (router.prefetch as any)(href, { kind: "auto" }); } catch {}
    };
    const onIntent = (e: Event) => prefetch(internal(e.target as Element));

    // ennakkolataus vasta kun linkkiä ollaan painamassa (osoitin päällä / sormi ruudulla):
    // näkyvien linkkien massalataus kuormitti tilastorajapintaa liikaa

    document.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onIntent, { passive: true });
    document.addEventListener("mouseover", onIntent, { passive: true });
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onIntent);
      document.removeEventListener("mouseover", onIntent);
    };
  }, [router]);
  return null;
}
