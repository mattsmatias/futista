"use client";
// Näkyvä ilmoitus, kun verkkoyhteys puuttuu: sivu voi olla tallennettu versio, eivätkä tiedot päivity.
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

export default function OfflineBanner() {
  const { t } = useI18n();
  const [off, setOff] = useState(false);
  useEffect(() => {
    const upd = () => setOff(navigator.onLine === false);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);
  if (!off) return null;
  return <div className="offline-bar" role="status">{t("offlineBanner")}</div>;
}
