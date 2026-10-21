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
  if (id === "intl") {
    // Maajoukkueet: oma yksinkertainen jalkapallomerkki (ei minkään järjestön logo)
    return (
      <span className="cmark cmark-ball cm-intl" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <defs><clipPath id="cm-ball-clip"><circle cx="12" cy="12" r="10.4" /></clipPath></defs>
          <circle cx="12" cy="12" r="10.4" fill="#fff" />
          <g clipPath="url(#cm-ball-clip)" fill="#14181f" stroke="#14181f" strokeWidth="1" strokeLinejoin="round">
            <path d="M12.00 8.40 15.42 10.89 14.12 14.91 9.88 14.91 8.58 10.89z" />
            <path d="M12.00 4.40 9.15 2.33 10.24 -1.03 13.76 -1.03 14.85 2.33zM19.23 9.65 20.32 6.30 23.84 6.30 24.93 9.65 22.08 11.72zM16.47 18.15 19.99 18.15 21.08 21.50 18.23 23.58 15.38 21.50zM7.53 18.15 8.62 21.50 5.77 23.58 2.92 21.50 4.01 18.15zM4.77 9.65 1.92 11.72 -0.93 9.65 0.16 6.30 3.68 6.30z" />
            <path d="M12.00 8.40L12.00 4.40M14.85 2.33L20.32 6.30M15.42 10.89L19.23 9.65M22.08 11.72L19.99 18.15M14.12 14.91L16.47 18.15M15.38 21.50L8.62 21.50M9.88 14.91L7.53 18.15M4.01 18.15L1.92 11.72M8.58 10.89L4.77 9.65M3.68 6.30L9.15 2.33" fill="none" />
          </g>
          <circle cx="12" cy="12" r="10.4" fill="none" stroke="#14181f" strokeWidth="1" />
        </svg>
      </span>
    );
  }
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
