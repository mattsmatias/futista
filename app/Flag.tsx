"use client";
import { useState } from "react";
import { country } from "@/lib/flags";
import { useBrokenImage } from "@/lib/img";
import { useI18n } from "@/lib/i18n";

/** Maan lippu ja (halutessa) nimi valitulla kielellä */
export default function Flag({ nation, label }: { nation: string | null | undefined; label?: boolean }) {
  const { lang } = useI18n();
  const [broken, setBroken] = useState(false);
  const ref = useBrokenImage(() => setBroken(true));
  const c = country(nation, lang);
  if (!c) return null;
  return (
    <span className="flag" title={c.name}>
      {c.code && !broken
        ? <img src={`https://flagcdn.com/w40/${c.code}.png`} alt="" width={20} height={14} loading="lazy" decoding="async" ref={ref} onError={() => setBroken(true)} />
        : <i className="flag-none" />}
      {label && <span>{c.name}</span>}
    </span>
  );
}
