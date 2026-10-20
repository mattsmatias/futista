"use client";
// Ottelurivit ESPN:n otteluille (joukkueen kaikki kilpailut ja maaottelut)
import type { Game, GameTeam } from "@/lib/espn";
import { useI18n } from "@/lib/i18n";
import { StatusPill } from "@/lib/live";
import { Num } from "@/lib/fresh";
import { country } from "@/lib/flags";
import { Badge } from "./Stats";

/** Kilpailujen nimet suomeksi / ruotsiksi / englanniksi (ESPN:n tunnuksen mukaan) */
const COMP: Record<string, [string, string, string]> = {
  "esp.1": ["LaLiga", "LaLiga", "LaLiga"],
  "eng.1": ["Valioliiga", "Premier League", "Premier League"],
  "ger.1": ["Bundesliga", "Bundesliga", "Bundesliga"],
  "ita.1": ["Serie A", "Serie A", "Serie A"],
  "fra.1": ["Ligue 1", "Ligue 1", "Ligue 1"],
  "ned.1": ["Eredivisie", "Eredivisie", "Eredivisie"],
  "por.1": ["Liga Portugal", "Liga Portugal", "Liga Portugal"],
  "eng.2": ["Championship", "Championship", "Championship"],
  "uefa.champions": ["Mestarien liiga", "Champions League", "Champions League"],
  "uefa.europa": ["Eurooppa-liiga", "Europa League", "Europa League"],
  "uefa.europa.conf": ["Konferenssiliiga", "Conference League", "Conference League"],
  "uefa.super_cup": ["UEFA Super Cup", "UEFA Super Cup", "UEFA Super Cup"],
  "uefa.champions_qual": ["Mestarien liigan karsinta", "CL-kval", "CL qualifying"],
  "uefa.europa_qual": ["Eurooppa-liigan karsinta", "EL-kval", "EL qualifying"],
  "uefa.europa.conf_qual": ["Konferenssiliigan karsinta", "ECL-kval", "ECL qualifying"],
  "esp.copa_del_rey": ["Copa del Rey", "Copa del Rey", "Copa del Rey"],
  "esp.super_cup": ["Espanjan Supercup", "Spanska supercupen", "Spanish Super Cup"],
  "eng.fa": ["FA Cup", "FA-cupen", "FA Cup"],
  "eng.league_cup": ["Liigacup", "Ligacupen", "League Cup"],
  "eng.charity": ["Community Shield", "Community Shield", "Community Shield"],
  "ger.dfb_pokal": ["DFB-Pokal", "DFB-Pokal", "DFB-Pokal"],
  "ger.super_cup": ["Saksan Supercup", "Tyska supercupen", "German Super Cup"],
  "ita.coppa_italia": ["Coppa Italia", "Coppa Italia", "Coppa Italia"],
  "ita.super_cup": ["Italian Supercup", "Italienska supercupen", "Italian Super Cup"],
  "fra.coupe_de_france": ["Ranskan cup", "Franska cupen", "Coupe de France"],
  "fra.super_cup": ["Ranskan Supercup", "Franska supercupen", "Trophée des Champions"],
  "ned.cup": ["KNVB Beker", "KNVB Beker", "KNVB Cup"],
  "por.taca.portugal": ["Portugalin cup", "Portugisiska cupen", "Taça de Portugal"],
  "por.league_cup": ["Portugalin liigacup", "Portugisiska ligacupen", "Taça da Liga"],
  "fifa.cwc": ["Seurajoukkueiden MM", "Klubb-VM", "Club World Cup"],
  "club.friendly": ["Harjoitusottelu", "Träningsmatch", "Friendly"],
  // maajoukkueet
  "uefa.nations": ["Kansojen liiga", "Nations League", "Nations League"],
  "fifa.friendly": ["Maaottelu (ystävyys)", "Landskamp (vänskap)", "International friendly"],
  "uefa.euroq": ["EM-karsinta", "EM-kval", "Euro qualifying"],
  "uefa.euro": ["EM-kisat", "EM", "European Championship"],
  "fifa.world": ["MM-kisat", "VM", "World Cup"],
  "fifa.worldq.uefa": ["MM-karsinta", "VM-kval", "World Cup qualifying"],
  "concacaf.nations.league": ["CONCACAF Kansojen liiga", "CONCACAF Nations League", "CONCACAF Nations League"],
  "caf.nations_qual": ["Afrikan mestaruuskarsinta", "Afrikanska mästerskapet, kval", "AFCON qualifying"],
};
const LANG_IDX: Record<string, number> = { fi: 0, sv: 1, en: 2 };
export const compName = (g: { slug: string; comp: string }, lang: string) => COMP[g.slug]?.[LANG_IDX[lang] ?? 0] ?? g.comp;
export const compClass = (slug: string) =>
  slug.startsWith("uefa.champions") ? "c-ucl" : slug.startsWith("uefa.europa.conf") ? "c-uecl" : slug.startsWith("uefa.europa") ? "c-uel"
    : slug === "club.friendly" || slug === "fifa.friendly" ? "c-fr" : slug.startsWith("uefa.nations") || slug.startsWith("uefa.euro") || slug.startsWith("fifa.") ? "c-nt"
      : /\.(1|2)$/.test(slug) ? "c-lg" : "c-cup";

export function GBadge({ t, size = 26 }: { t: GameTeam; size?: number }) {
  return <Badge t={{ name: t.name, code: t.code, crest: t.logo }} size={size} />;
}

/** Maajoukkueen nimi valitulla kielellä */
export function useTeamName(nations?: boolean) {
  const { lang } = useI18n();
  return (t: GameTeam) => (nations ? country(t.name, lang as "fi" | "sv" | "en")?.name ?? t.name : t.name);
}

/** Yksi ottelu mistä tahansa kilpailusta. nations = maaottelu (nimet suomeksi, linkit maajoukkueen sivulle) */
export function GameRow({ g, nations, highlight, hideDate }: { g: Game; nations?: boolean; highlight?: string; hideDate?: boolean }) {
  const i = useI18n();
  const nm = useTeamName(nations);
  const played = g.kind === "ft";
  const on = g.kind === "live" || g.kind === "ht";
  const hw = played && g.hs! > g.as!, aw = played && g.as! > g.hs!;
  const side = (t: GameTeam, home: boolean, win: boolean) => {
    const cls = `side ${home ? "home" : "away"}${win ? " win" : ""}${played ? "" : " upcoming"}${highlight && t.id === highlight ? " hl" : ""}`;
    const inner = home ? <>{nm(t)}<GBadge t={t} /></> : <><GBadge t={t} />{nm(t)}</>;
    return nations && t.id ? <a className={cls} href={`/maajoukkue/${t.id}`}>{inner}</a> : <span className={cls}>{inner}</span>;
  };
  const body = (
    <>
      {side(g.home, true, hw)}
      {g.kind === "upcoming"
        ? <span className="score ko">{g.time}</span>
        : <span className={`mid mid-${g.kind}`}>
            {g.hs !== null && g.as !== null && <span className="score"><Num v={g.hs} /><i>–</i><Num v={g.as} /></span>}
            {g.kind === "live" && g.clock
              ? <span className="st st-live"><i />{g.clock}</span>
              : !played && <StatusPill s={{ kind: g.kind }} />}
          </span>}
      {side(g.away, false, aw)}
    </>
  );
  return (
    <div className="day">
      <div className="day-label g-label">
        <span className={`g-comp ${compClass(g.slug)}`}>{compName(g, i.lang)}</span>
        {!hideDate && <span>{i.day(g.date)}{g.kind === "upcoming" ? "" : ` · ${g.time}`}</span>}
        {hideDate && g.kind !== "upcoming" && <span>{g.time}</span>}
      </div>
      {g.href
        ? <a className={`match${on ? " is-live" : ""}`} href={g.href}>{body}</a>
        : <div className={`match${on ? " is-live" : ""}`}>{body}</div>}
    </div>
  );
}
