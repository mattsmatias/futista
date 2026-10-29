"use client";
// Futistan oma pelaajakortti- ja pakkagrafiikka (kokoelma, pakat, avaus). Ei arvosanoja tai taitolukuja: kortissa vain
// lähteen tiedot (nimi, seura, sarja, pelipaikka) ja pelin sisäinen fantasyhinta.
//
// Pelaajakuvat: korteissa näytetään oletuksena geneerinen pelipaita. API-Footballin pelaajakuvien käyttöoikeutta
// keräilykorteissa ei ole selvitetty, joten kuvat kytketään päälle vasta, kun oikeus on varmistettu (CARD_PHOTOS).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { POS_LONG, POS_SHORT, type Pos } from "@/lib/fantasy-client";
import { Money } from "./Coin";
import { Shirt } from "./ui";

export const CARD_PHOTOS = false;

export type CardPlayer = {
  player_id: number; name: string | null; team: string | null; league_name?: string | null; pos: Pos | string | null;
  price: number | null; photo?: string | null;
};
export type Tier = "silver" | "gold";
export const TIER_NAME: Record<Tier, string> = { silver: "Silver", gold: "Gold" };

const posKey = (p: string | null | undefined): Pos | null => (p === "GK" || p === "DEF" || p === "MID" || p === "FWD" ? p : null);

/** Pelaajakortti. tier = mistä pakasta kortti on (kehyksen väri). */
export function PlayerTile({ p, tier, count, dup, compact, className = "" }: { p: CardPlayer; tier: Tier; count?: number; dup?: boolean; compact?: boolean; className?: string }) {
  const pos = posKey(p.pos);
  const label = [p.name ?? "Tuntematon pelaaja", pos ? POS_LONG[pos] : null, p.team, p.league_name, `${TIER_NAME[tier]}-kortti`,
    count && count > 1 ? `${count} kappaletta` : null, dup ? "kaksoiskappale" : null].filter(Boolean).join(", ");
  return (
    <div className={`fxk fxk-${tier}${compact ? " sm" : ""} ${className}`} role="img" aria-label={label}>
      <div className="fxk-in" aria-hidden="true">
        <div className="fxk-top">
          <span className={`fxk-pos fxk-pos-${(pos ?? "mid").toLowerCase()}`}>{pos ? POS_SHORT[pos] : "?"}</span>
          {p.price != null && <span className="fxk-price"><Money v={p.price} size={12} /></span>}
        </div>
        <div className="fxk-pic"><Shirt gk={pos === "GK"} /></div>
        <b className="fxk-name">{p.name ?? "Tuntematon"}</b>
        <span className="fxk-club">{p.team ?? "–"}</span>
        {!compact && <span className="fxk-league">{p.league_name ?? ""}</span>}
        <span className="fxk-tier">{TIER_NAME[tier]}</span>
      </div>
      {count && count > 1 ? <span className="fxk-count" aria-hidden="true">×{count}</span> : null}
      {dup ? <span className="fxk-dup" aria-hidden="true">Kaksoiskappale</span> : null}
    </div>
  );
}

/** Pakan kuva (oma muotoilu: vinoraidat ja F-merkki) */
export function PackArt({ tier, size = 1, className = "" }: { tier: Tier; size?: number; className?: string }) {
  return (
    <div className={`fxp fxp-${tier} ${className}`} style={{ ["--s" as string]: size }} aria-hidden="true">
      <span className="fxp-rip" />
      <span className="fxp-mark">F</span>
      <span className="fxp-name">{tier === "gold" ? "GOLD" : "SILVER"}</span>
      <span className="fxp-sub">3 korttia</span>
    </div>
  );
}

/** Pakat / Kokoelma -välilehdet */
export function PackNav() {
  const path = usePathname() ?? "";
  const tabs = [{ href: "/fantasy/pakat", label: "Pakat" }, { href: "/fantasy/kokoelma", label: "Kokoelma" }];
  return (
    <nav className="seg fx-modes fxk-nav" aria-label="Pakat ja kokoelma">
      {tabs.map((t) => {
        const on = path.startsWith(t.href);
        return <Link key={t.href} href={t.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>{t.label}</Link>;
      })}
    </nav>
  );
}
