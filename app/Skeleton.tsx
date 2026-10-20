import SubBar from "./SubBar";

/** Latausnäkymä: sivun muoto näkyy heti, sisältö liukuu tilalle kun se on valmis */
export function EntitySkeleton({ kind }: { kind: "team" | "match" | "player" }) {
  return (
    <>
      <SubBar />
      <main className="wrap entity skel" aria-busy="true">
        <div className={`sk sk-hero${kind === "match" ? " dark" : ""}`} />
        {kind === "team" && <div className="sk-row">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="sk sk-kpi" />)}</div>}
        <div className="sk sk-tabs" />
        <div className="sk sk-panel" />
        <div className="sk sk-panel short" />
      </main>
    </>
  );
}

export function StorySkeleton() {
  return (
    <main className="skel" aria-busy="true">
      <div className="sk sk-story" />
      <div className="wrap" style={{ maxWidth: 820, display: "grid", gap: 14, paddingTop: 24 }}>
        <div className="sk sk-line w90" /><div className="sk sk-line w70" /><div className="sk sk-line" /><div className="sk sk-line" /><div className="sk sk-line w80" />
      </div>
    </main>
  );
}
