"use client";
import { country } from "@/lib/flags";
import { useI18n } from "@/lib/i18n";

/** Maan lippu ja (halutessa) nimi valitulla kielellä */
export default function Flag({ nation, label }: { nation: string | null | undefined; label?: boolean }) {
  const { lang } = useI18n();
  const c = country(nation, lang);
  if (!c) return null;
  return (
    <span className="flag" title={c.name}>
      {c.code
        ? <img src={`https://flagcdn.com/w40/${c.code}.png`} alt="" width={20} height={14} loading="lazy" decoding="async" />
        : <i className="flag-none" />}
      {label && <span>{c.name}</span>}
    </span>
  );
}
