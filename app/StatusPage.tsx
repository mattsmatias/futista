"use client";
// Yhteinen "ei löytynyt" / "tietoja ei saada" -näkymä. Teksti asiayhteyden mukaan (fi/sv/en),
// toimiva paluulinkki ja tilapäisessä häiriössä uudelleenyritys ilman koko sivun latausta.
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n, type Key } from "@/lib/i18n";

export type StatusContext = "page" | "article" | "team" | "match" | "player" | "nation";

export default function StatusPage({ kind, ctx = "page", reset }: {
  kind: "notfound" | "error"; ctx?: StatusContext; reset?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const title = (kind === "notfound" ? `nf_${ctx}` : `err_${ctx}`) as Key;
  const text = (kind === "notfound" ? `nfTxt_${ctx}` : "errTxt") as Key;
  const retry = () => {
    if (busy) return; // ei rinnakkaisia yrityksiä
    setBusy(true);
    startTransition(() => { router.refresh(); reset?.(); });
    setTimeout(() => setBusy(false), 3000);
  };
  // Tilapäinen häiriö (yleensä hakurajoitus, joka vapautuu alle minuutissa): yritetään itse uudelleen
  // 10, 20 ja 40 s kuluttua, kun sivu on näkyvissä. Enintään kolme kertaa, ettei lähdettä kuormiteta.
  const [tries, setTries] = useState(0);
  const auto = kind === "error" && !!reset && tries < 3;
  useEffect(() => {
    if (!auto) return;
    let done = false, due = false;
    const go = () => { if (done || !due || document.hidden) return; done = true; setTries((n) => n + 1); retry(); };
    const id = setTimeout(() => { due = true; go(); }, 10_000 * 2 ** tries);
    document.addEventListener("visibilitychange", go); // piilossa erääntynyt yritys tehdään näkyviin palattaessa
    return () => { done = true; clearTimeout(id); document.removeEventListener("visibilitychange", go); };
  }, [auto, tries]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <main className="wrap status-page" role={kind === "error" ? "alert" : undefined}>
        <h1>{t(title)}</h1>
        <p className="muted">{t(text)}</p>
        {auto && <p className="muted small" aria-live="polite">{t("autoRetry")}</p>}
        <div className="status-actions">
          {kind === "error" && <button className="btn" onClick={retry} disabled={busy}>{busy ? t("loading") : t("retry")}</button>}
          <a className="btn ghost" href="/">{t("toHome")}</a>
        </div>
      </main>
    </>
  );
}
