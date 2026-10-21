"use client";
// Kilpailun tunnus: sarjan oma logo. Tummassa teemassa käytetään lähteen tummalle pohjalle tehtyä versiota;
// jos sellaista ei ole, logo näytetään vaalealla laatalla. Jos kuva ei lataudu, näytetään lyhenne kilpailun värissä.
import { useState } from "react";
import { COMP_META, COMP_EMBLEM } from "@/lib/comps";
import { useBrokenImage } from "@/lib/img";

export function CompMark({ id }: { id: string }) {
  const m = COMP_META[id as keyof typeof COMP_META];
  const e = COMP_EMBLEM[id as keyof typeof COMP_EMBLEM];
  const [failed, setFailed] = useState(false);
  const ref = useBrokenImage(() => setFailed(true), [failed, e?.light]);
  const darkRef = useBrokenImage(() => setFailed(true), [failed, e?.dark]);
  if (e && !failed) {
    return (
      <span className={`cmark cmark-logo cm-${id}${e.dark ? " has-dark" : ""}`} aria-hidden="true">
        <img className="cl-light" src={e.light} alt="" width={22} height={22} loading="lazy" decoding="async" ref={ref} onError={() => setFailed(true)} />
        {e.dark && <img className="cl-dark" src={e.dark} alt="" width={22} height={22} loading="lazy" decoding="async" ref={darkRef} onError={() => setFailed(true)} />}
      </span>
    );
  }
  return <span className={`cmark cm-${id}`} aria-hidden="true">{m?.mark ?? (id === "intl" ? "MJ" : id.slice(0, 2).toUpperCase())}</span>;
}
