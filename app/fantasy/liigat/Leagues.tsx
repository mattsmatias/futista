"use client";
// Futista-liiga: yksi avoin liiga, jossa ovat kaikki joukkueet (ei omia/yksityisiä liigoja – käyttäjän valinta 27.10.2026).
import Link from "next/link";
import { useLoad, type FState } from "@/lib/fantasy-client";
import { AuthBox, ErrorBox, Loading, Notice } from "../ui";
import { Ranking } from "../pisteet/Ranking";

export function Leagues() {
  const st = useLoad<FState>("/api/fantasy/tila");
  if (st.loading && !st.data) return <Loading />;
  if (st.err) return st.err.error === "login" ? <AuthBox onDone={st.reload} /> : <ErrorBox err={st.err} retry={st.reload} />;
  const s = st.data!;
  if (!s.user) return <AuthBox onDone={st.reload} />;
  return (
    <>
      <Notice>Futista-liiga on avoin ja sama kaikille: jokainen joukkue on mukana automaattisesti, eikä omia liigoja tarvita. Sijoitus lasketaan kauden kokonaispisteistä.</Notice>
      {!s.team?.first_round && <Notice>Joukkueesi tulee liigaan, kun olet tallentanut sen. <Link href={s.team ? "/fantasy/siirrot" : "/fantasy"}>{s.team ? "Valitse pelaajat" : "Luo joukkue"}</Link></Notice>}
      <section className="panel" aria-labelledby="fx-lg-h">
        <div className="panel-head"><h2 id="fx-lg-h">Futista-liiga · {s.comp.name}</h2>{s.team?.rank && <span className="muted small">Sijasi {s.team.rank.rank} / {s.team.rank.of}</span>}</div>
        <Ranking />
      </section>
    </>
  );
}
