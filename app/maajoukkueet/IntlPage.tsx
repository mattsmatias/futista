"use client";
import type { IntlData } from "../IntlBoard";
import { useI18n } from "@/lib/i18n";
import Footer from "../Footer";
import IntlBoard from "../IntlBoard";

export default function IntlPage({ data }: { data: IntlData | null }) {
  const { t } = useI18n();
  return (
    <>
      <main className="wrap entity">
        <div className="sec-head page-head"><h2>{t("nationalTeams")}</h2></div>
        <p className="muted intl-intro">{t("intlIntro")}</p>
        <IntlBoard initial={data} />
      </main>
      <Footer />
    </>
  );
}
