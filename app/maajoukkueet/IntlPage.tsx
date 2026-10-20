"use client";
import type { Game } from "@/lib/espn";
import { useI18n } from "@/lib/i18n";
import SubBar from "../SubBar";
import Footer from "../Footer";
import IntlBoard from "../IntlBoard";

export default function IntlPage({ games }: { games: Game[] | null }) {
  const { t } = useI18n();
  return (
    <>
      <SubBar />
      <main className="wrap entity">
        <div className="sec-head page-head"><h2>{t("nationalTeams")}</h2></div>
        <p className="muted intl-intro">{t("intlIntro")}</p>
        <IntlBoard initial={games} />
      </main>
      <Footer />
    </>
  );
}
