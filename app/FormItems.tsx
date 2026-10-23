"use client";
// Kunto kaikista virallisista kilpailuista V/T/H-merkkeinä (uusin oikealla). Tiedot: lib/team-form.ts teamForm().last
import { useI18n } from "@/lib/i18n";
import type { FormItem } from "@/lib/team-form";
import { compName } from "./Games";

export default function FormItems({ items }: { items: FormItem[] }) {
  const i = useI18n();
  const { t } = i;
  if (!items.length) return <span className="muted">–</span>;
  const label = (x: FormItem) => {
    const res = t(x.k === "w" ? "formWin" : x.k === "d" ? "formDraw" : "formLoss");
    const pens = x.pens ? ` (${t("pensShort")} ${x.pens[0]}–${x.pens[1]})` : "";
    return `${res}: ${i.day(x.date)} · ${compName(x, i.lang)} · ${x.home} ${x.hs}–${x.as} ${x.away}${pens}`;
  };
  return (
    <span className="form" role="list">
      {items.map((x) => (
        <a key={x.id} role="listitem" className={`fp fp-${x.k}`} href={x.href} title={label(x)} aria-label={label(x)}>
          {t(x.k === "w" ? "colW" : x.k === "d" ? "colD" : "colL")}
        </a>
      ))}
    </span>
  );
}
