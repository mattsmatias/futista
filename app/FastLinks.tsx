"use client";
// Välitön sivunvaihto koko sivustolle: sisäiset linkit avataan sovelluksen sisällä (ei koko sivun
// uudelleenlatausta), ja näkyvissä olevat linkit ladataan valmiiksi ennen kuin niitä painetaan.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
      router.push(href);
    };

    const done = new Set<string>();
    const prefetch = (href: string | null) => {
      if (!href || done.has(href)) return;
      done.add(href);
      try { router.prefetch(href); } catch {}
    };
    const onIntent = (e: Event) => prefetch(internal(e.target as Element));

    const io = "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
          for (const en of entries) if (en.isIntersecting) { prefetch(internal(en.target)); io?.unobserve(en.target); }
        }, { rootMargin: "300px" })
      : null;
    const seen = new WeakSet<Element>();
    let queued = false;
    const scan = () => {
      queued = false;
      document.querySelectorAll('a[href^="/"]').forEach((a) => { if (!seen.has(a)) { seen.add(a); io?.observe(a); } });
    };
    const mo = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(scan); } });
    scan();
    mo.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onIntent, { passive: true });
    document.addEventListener("mouseover", onIntent, { passive: true });
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onIntent);
      document.removeEventListener("mouseover", onIntent);
      mo.disconnect();
      io?.disconnect();
    };
  }, [router]);
  return null;
}
