"use client";
// Uutisvirran mainoskortti. Sisältö lib/ad-slot.ts:stä. Ei animaatioita, ei ponnahduksia, ei seurantaa.
// Renderöidään palvelimella samanlaisena kuin selaimessa, joten kortti ei siirrä sivua latauksen jälkeen.
import { useI18n } from "@/lib/i18n";
import { NEWS_AD_SLOT, validPaid, type AdSlot as Slot } from "@/lib/ad-slot";

export default function AdSlot({ slot = NEWS_AD_SLOT }: { slot?: Slot }) {
  const { t } = useI18n();
  if (slot.kind === "off") return null;
  if (slot.kind === "paid") {
    if (!validPaid(slot)) return null;
    return (
      <aside className="adcard adcard-paid" aria-label={t("adSlot_paidLabel")}>
        <a className="adcard-link" href={slot.href} target="_blank" rel="sponsored noopener">
          {slot.image && (
            <img className="adcard-img" src={slot.image.src} alt={slot.image.alt} width={slot.image.width} height={slot.image.height}
              style={{ aspectRatio: `${slot.image.width} / ${slot.image.height}` }} loading="lazy" decoding="async" />
          )}
          <span className="adcard-body">
            <span className="adcard-tag">{t("adSlot_paidLabel")} · {slot.advertiser}</span>
            <span className="adcard-title">{slot.title}</span>
            {slot.text && <span className="adcard-text">{slot.text}</span>}
            {slot.cta && <span className="btn sm adcard-btn">{slot.cta}</span>}
          </span>
        </a>
      </aside>
    );
  }
  return (
    <aside className="adcard" aria-labelledby="adcard-h">
      <div className="adcard-body">
        <span className="adcard-tag">{t("adSlot_tag")}</span>
        <h2 id="adcard-h" className="adcard-title">{t("adSlot_title")}</h2>
        <p className="adcard-text">{t("adSlot_text")}</p>
      </div>
      <a className="btn adcard-btn" href="/mainosta">{t("adSlot_cta")}</a>
    </aside>
  );
}
