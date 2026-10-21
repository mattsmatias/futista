"use client";
// Kilpailun tunnus: sarjan oma logo vaalealla laatalla (logot on suunniteltu vaalealle pohjalle, joten laatta
// pysyy vaaleana myös tummassa teemassa). Jos kuva ei lataudu, näytetään lyhenne kilpailun värissä.
import { useState } from "react";
import { COMP_META, COMP_EMBLEM } from "@/lib/comps";
import { useBrokenImage } from "@/lib/img";

export function CompMark({ id }: { id: string }) {
  const m = COMP_META[id as keyof typeof COMP_META];
  const src = COMP_EMBLEM[id as keyof typeof COMP_EMBLEM];
  const [failed, setFailed] = useState(false);
  const ref = useBrokenImage(() => setFailed(true), [failed, src]);
  if (src && !failed) {
    return (
      <span className={`cmark cmark-logo cm-${id}`} aria-hidden="true">
        <img src={src} alt="" width={20} height={20} loading="lazy" decoding="async" ref={ref} onError={() => setFailed(true)} />
      </span>
    );
  }
  return <span className={`cmark cm-${id}`} aria-hidden="true">{m?.mark ?? (id === "intl" ? "MJ" : id.slice(0, 2).toUpperCase())}</span>;
}
