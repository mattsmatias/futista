"use client";
// Ilmoitukset suosikeista: päälle / pois (vain kun palvelin on valmis; ks. docs/ilmoitukset.md)
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useFavorites } from "@/lib/favorites";
import { pushState, pushEnable, pushDisable, type PushState } from "@/lib/push-client";

const Bell = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    {!on && <path d="M3 3l18 18" />}
  </svg>
);

/** Ilmoitukset päälle / pois */
export default function NotifyCard({ inMenu }: { inMenu?: boolean } = {}) {
  const { t } = useI18n();
  const { names: favs } = useFavorites();
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => { pushState().then(setState).catch(() => setState("unsupported")); }, []);
  if (state === "loading" || state === "unconfigured") return null;

  const on = state === "on";
  const toggle = async () => {
    setBusy(true); setErr(false);
    try { setState(on ? await pushDisable() : await pushEnable(favs)); }
    catch { setErr(true); }
    finally { setBusy(false); }
  };

  const msg =
    state === "ios-install" ? t("notifIosInstall")
    : state === "unsupported" ? t("notifUnsupported")
    : state === "denied" ? t("notifDenied")
    : state === "unavailable" ? t("notifUnavailable")
    : on ? (favs.length ? t("notifOn") : t("notifOnNoFavs"))
    : t("notifOff");

  return (
    <>{inMenu && <hr />}
    <div className={`notify${inMenu ? " in-menu" : ""}${on ? " is-on" : ""}${state === "unavailable" ? " is-off" : ""}`}>
      <span className="notify-ico"><Bell on={on} /></span>
      <div className="notify-txt">
        <strong>{t("notifTitle")}</strong>
        <span>{msg}</span>
        {err && <span className="notify-err">{t("notifError")}</span>}
        {state !== "unavailable" && <span className="notify-scope">{t("notifScope")}</span>}
      </div>
      {(state === "on" || state === "off") && (
        <button className={`switch${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label={t("notifTitle")} disabled={busy} onClick={toggle}>
          <i />
        </button>
      )}
    </div></>
  );
}

