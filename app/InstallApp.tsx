"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Mode = "hidden" | "prompt" | "ios" | "ios-other";
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const KEY = "futista-asennus-piilotettu";
const INSTALLED = "futista-asennettu";
const read = () => { try { return Number(localStorage.getItem(KEY) || 0); } catch { return 0; } };
const hideFor = (days: number) => { try { localStorage.setItem(KEY, String(Date.now() + days * 86400_000)); } catch {} };
const markInstalled = () => { try { localStorage.setItem(INSTALLED, "1"); } catch {} };
const knownInstalled = () => { try { return localStorage.getItem(INSTALLED) === "1"; } catch { return false; } };

/** Onko sivu auki kotivalikosta (sovelluksena)? */
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  window.matchMedia("(display-mode: minimal-ui)").matches ||
  (navigator as any).standalone === true;

/** Chrome / Edge / Samsung (Android ja tietokone): kysyy selaimelta, onko Futista jo asennettu */
async function installedViaBrowser(): Promise<boolean> {
  const fn = (navigator as any).getInstalledRelatedApps;
  if (typeof fn !== "function") return false;
  try {
    const apps = await fn.call(navigator);
    return Array.isArray(apps) && apps.length > 0;
  } catch {
    return false;
  }
}

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
);

/**
 * Asenna-kortti:
 * - Android / Chrome / Edge / Samsung Internet: oikea Asenna-nappi (selaimen oma ikkuna)
 * - iPhone ja iPad Safarissa: ohje "Jaa → Lisää Koti-valikkoon" (Apple ei salli nappia)
 * - iPhonen muut selaimet: kehotus avata Safarissa
 * Ei näy koskaan, jos Futista on jo kotivalikossa. Tunnistus:
 * 1. Sivu on auki kotivalikosta → ei korttia, ja laite muistetaan asennetuksi
 * 2. Chrome/Edge/Samsung: selain kertoo itse (getInstalledRelatedApps), ja Asenna-tapahtuma
 *    ei edes laukea jo asennetulle sovellukselle
 * 3. Asennus tehtiin tästä kortista → muistetaan pysyvästi
 * 4. iPhone: Apple ei kerro Safarille kotivalikon sisältöä, joten kortissa on "Lisäsin jo" -nappi
 */
export default function InstallApp() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [steps, setSteps] = useState(false);
  const { t, lang } = useI18n();

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    if (isStandalone()) { markInstalled(); return; }
    if (knownInstalled() || read() > Date.now()) return;

    let cancelled = false;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (ios) {
      const safari = !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV/.test(ua);
      t = setTimeout(() => !cancelled && setMode(safari ? "ios" : "ios-other"), 2500);
    }

    // Jos selain tietää sovelluksen olevan asennettu, kortti ei näy
    installedViaBrowser().then((yes) => {
      if (yes && !cancelled) { cancelled = true; markInstalled(); setMode("hidden"); }
    });

    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (cancelled) return;
      setEvt(e as BIPEvent);
      setMode("prompt");
    };
    const onInstalled = () => { setMode("hidden"); markInstalled(); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "hidden") return null;

  const close = () => { setMode("hidden"); hideFor(14); };
  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    setEvt(null);
    if (outcome === "accepted") { setMode("hidden"); markInstalled(); }
  };
  const already = () => { setMode("hidden"); markInstalled(); };

  return (
    <div className="install" role="dialog" aria-label={t("appTitle")}>
      <img className="install-icon" src="/icons/icon-192.png" alt="" width={48} height={48} />
      <div className="install-txt">
        <strong>{t("appTitle")}</strong>
        {mode === "prompt" && <span>{t("appPrompt")}</span>}
        {mode === "ios" && !steps && <span>{t("appIos")}</span>}
        {mode === "ios" && steps && (
          <ol className="install-steps">
            <li>{t("step1a")} <b className="ib"><ShareIcon />{t("share")}</b>{lang === "en" ? " " : ""}{t("step1b")}</li>
            <li>{t("step2")} <b className="ib"><PlusIcon />{t("addHome")}</b></li>
            <li>{t("step3")} <b>{t("add")}</b></li>
          </ol>
        )}
        {mode === "ios-other" && <span>{t("appIosOther")}</span>}
      </div>
      <div className="install-actions">
        {mode === "prompt" && <button className="install-btn" onClick={install}>{t("install")}</button>}
        {mode === "ios" && !steps && <button className="install-btn" onClick={() => setSteps(true)}>{t("howTo")}</button>}
        {(mode === "ios" || mode === "ios-other") && <button className="install-done" onClick={already}>{t("alreadyAdded")}</button>}
        <button className="install-x" onClick={close} aria-label={t("close")}>✕</button>
      </div>
    </div>
  );
}
