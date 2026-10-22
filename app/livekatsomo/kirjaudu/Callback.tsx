"use client";
import { useEffect, useState } from "react";
import { saveSession } from "@/lib/lk-client";
import { safeNext } from "@/lib/lk-core";

/** Lukee Supabase Authin palauttaman istunnon osoitteen #-osasta, tallentaa sen ja palaa otteluun */
export default function Callback() {
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const h = new URLSearchParams(location.hash.slice(1));
    const q = new URLSearchParams(location.search);
    const next = safeNext(q.get("next")); // vain ottelusivu tai ylläpito (ei avointa uudelleenohjausta)
    // tunnisteet pois osoiteriviltä ja historiasta heti
    history.replaceState(null, "", location.pathname + location.search);
    const at = h.get("access_token"), rt = h.get("refresh_token");
    if (at && rt) {
      const exp = Number(h.get("expires_at")) ? Number(h.get("expires_at")) * 1000 : Date.now() + Number(h.get("expires_in") || 3600) * 1000;
      saveSession({ access_token: at, refresh_token: rt, expires_at: exp });
      location.replace(next);
      return;
    }
    setErr(h.get("error_description") || q.get("error_description") ? "Kirjautumislinkki on vanhentunut tai jo käytetty. Pyydä uusi linkki." : "Kirjautumistietoja ei löytynyt. Pyydä uusi kirjautumislinkki.");
  }, []);
  return (
    <main className="wrap" style={{ paddingBlock: 40 }}>
      <h1 className="sr-only">Kirjautuminen</h1>
      <div className="panel"><p className="pad" role="status">{err ?? "Kirjaudutaan…"}</p>
        {err && <p className="pad"><a className="btn" href="/">Etusivulle</a></p>}
      </div>
    </main>
  );
}
