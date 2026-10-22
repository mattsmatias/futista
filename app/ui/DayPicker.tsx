"use client";
// Päivämäärävalitsin: edellinen · valittu päivä · seuraava · kalenteri · paluu tähän päivään
import { useI18n, LOCALE } from "@/lib/i18n";
import { addDays } from "@/lib/day";
import { Icon } from "./Icons";

export function dayLabel(date: string, today: string, lang: "fi" | "sv" | "en", t: (k: any) => string) {
  const d = new Date(date + "T12:00:00Z");
  const wd = new Intl.DateTimeFormat(LOCALE[lang], { weekday: "short", timeZone: "UTC" }).format(d).replace(/\.$/, "");
  const dm = lang === "en" ? `${d.getUTCDate()}/${d.getUTCMonth() + 1}` : `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
  const rel = date === today ? t("today") : date === addDays(today, -1) ? t("yesterday") : date === addDays(today, 1) ? t("tomorrow") : null;
  return { rel, main: `${wd} ${dm}` };
}

export default function DayPicker({ date, today, onChange, min, max }: { date: string; today: string; onChange: (d: string) => void; min?: string; max?: string }) {
  const i = useI18n();
  const { t } = i;
  const l = dayLabel(date, today, i.lang, t);
  return (
    <div className={"daypick" + (date !== today ? " dp-stack" : "")} role="group" aria-label={t("pickDate")}>
      <button type="button" className="icon-btn" onClick={() => onChange(addDays(date, -1))} aria-label={t("prevDay")} disabled={!!min && date <= min}>{Icon.prev}</button>
      <div className="dp-mid">
        <span className="dp-label" aria-live="polite"><b>{l.rel ?? l.main}</b>{l.rel && <span className="dp-date"><span className="dp-sep"> · </span>{l.main}</span>}</span>
      </div>
      <button type="button" className="icon-btn" onClick={() => onChange(addDays(date, 1))} aria-label={t("nextDay")} disabled={!!max && date >= max}>{Icon.next}</button>
      {/* Kalenteri: oikea päivämääräkenttä on näkymättömänä kuvakkeen päällä, joten napautus osuu suoraan siihen.
          iPhonen Safari avaa valitsimen vain, kun käyttäjä napauttaa kenttää itse (piilotetun kentän avaaminen
          koodista ei toimi). Chromessa showPicker avaa valitsimen samalla napautuksella. */}
      <span className="dp-cal">
        <span className="icon-btn" aria-hidden="true">{Icon.calendar}</span>
        <input type="date" className="dp-input" value={date} min={min} max={max} aria-label={t("pickDate")}
          onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
          onChange={(e) => { if (e.target.value) onChange(e.target.value); }} />
      </span>
      {date !== today && <button type="button" className="chip-btn dp-today" onClick={() => onChange(today)} aria-label={t("backToToday")}><span className="dp-today-long">{t("backToToday")}</span><span className="dp-today-short" aria-hidden="true">{t("today")}</span></button>}
    </div>
  );
}
