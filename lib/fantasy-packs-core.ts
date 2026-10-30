// Futista Fantasy: pakkojen arvonta- ja todennäköisyyssääntö (puhdas logiikka; käytetään palvelimella ja näytössä).
// Sääntö: pakan jokainen kortti arvotaan toisistaan riippumatta tasajakaumasta pakan hintaluokan aktiivisista pelaajista
// (palautuksellinen otanta). Jokaisen kortin kohdalla jokaisella hintaluokan pelaajalla on sama todennäköisyys 1 / N.
// Sama pelaaja voi siis tulla samaan pakkaan useammin kuin kerran.

export type PackType = { id: string; name: string; price: number; cards: number; min_price: number | null; max_price: number | null; eligible: number; by_pos: Record<string, number> };

/** Arpoo `cards` pelaajatunnistetta joukosta `pool`. `rnd(n)` palauttaa kokonaisluvun väliltä [0, n) – palvelimella crypto.randomInt. */
export function drawCards(pool: readonly number[], cards: number, rnd: (n: number) => number): number[] {
  if (!pool.length) return [];
  const out: number[] = [];
  for (let i = 0; i < cards; i++) {
    const k = rnd(pool.length);
    if (!Number.isInteger(k) || k < 0 || k >= pool.length) throw new Error("rnd out of range");
    out.push(pool[k]);
  }
  return out;
}

export type Odds = {
  perCard: number;        // tietty pelaaja yhdessä kortissa: 1/N
  atLeastOnce: number;    // tietty pelaaja vähintään kerran pakassa: 1 - (1 - 1/N)^k
  anyRepeat: number;      // pakassa vähintään kaksi samaa pelaajaa: 1 - N(N-1)…(N-k+1)/N^k
  pos: { pos: string; n: number; perCard: number }[]; // pelipaikan todennäköisyys yhdessä kortissa
};

export function packOdds(eligible: number, cards: number, byPos: Record<string, number> = {}): Odds | null {
  if (eligible <= 0 || cards <= 0) return null;
  const N = eligible;
  let distinct = 1;
  for (let i = 0; i < cards; i++) distinct *= (N - i) / N;
  const order = ["GK", "DEF", "MID", "FWD"];
  return {
    perCard: 1 / N,
    atLeastOnce: 1 - Math.pow(1 - 1 / N, cards),
    anyRepeat: N < cards ? 1 : 1 - distinct,
    pos: order.filter((p) => (byPos[p] ?? 0) > 0).map((p) => ({ pos: p, n: byPos[p], perCard: byPos[p] / N })),
  };
}

/** Prosentti suomalaisittain riittävällä tarkkuudella (pienet luvut useammalla merkitsevällä numerolla). */
export function fmtPct(x: number): string {
  const p = x * 100;
  if (p === 0) return "0 %";
  if (p >= 10) return `${p.toFixed(1).replace(".", ",")} %`;
  if (p >= 1) return `${p.toFixed(2).replace(".", ",")} %`;
  const digits = Math.min(6, Math.max(2, 1 - Math.floor(Math.log10(p)) + 1));
  return `${p.toFixed(digits).replace(".", ",")} %`;
}

/** Hintarajan teksti: "alle 9,0 M" / "vähintään 9,0 M" */
export function bandText(t: Pick<PackType, "min_price" | "max_price">): string {
  const m = (n: number) => `${Number(n).toFixed(1).replace(".", ",")} M`;
  if (t.min_price != null && t.max_price != null) return `${m(t.min_price)} – alle ${m(t.max_price)}`;
  if (t.max_price != null) return `alle ${m(t.max_price)}`;
  if (t.min_price != null) return `vähintään ${m(t.min_price)}`;
  return "kaikki pelaajat";
}

export const REQUEST_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Kolikkokirjauksen selite käyttäjälle */
export function ledgerText(kind: string, info: Record<string, any> = {}): string {
  switch (kind) {
    case "start": return "Ensimmäinen joukkue luotu";
    case "invite": return "Kaveri liittyi kutsulinkilläsi";
    case "round": return `Kierros ${info.round}: osallistuminen ${info.participation} + pisteet ${info.from_points}`;
    case "round_fix": return `Kierroksen ${info.round} pisteitä korjattiin (${info.points_before} → ${info.points} p)`;
    case "round_waived": return `Kierroksen ${info.round} korjaus: ${info.uncollected} kolikkoa jäi perimättä, koska ne oli jo käytetty`;
    case "task": return `Tehtävä suoritettu: ${info.title ?? "kierrostehtävä"}${info.label ? ` (${info.label})` : ""}`;
    case "rename": return "Joukkueen nimi vaihdettu";
    case "pack": return info.pack === "gold" ? "Gold-pakka avattu" : info.pack === "silver" ? "Silver-pakka avattu" : "Pakka avattu";
    default: return "Kolikkotapahtuma";
  }
}

// ---- Korttiversiot (Perus / Silver / Gold / Elite) ----
// Versio vaikuttaa vain ulkoasuun ja kokoelmaan. Pakan jokaisen kortin versio arvotaan pelaajasta erillään:
// Elite todennäköisyydellä elite_permille / 1000, muuten pakan perusversio (Silver-pakka → Silver, Gold-pakka → Gold).
export type Version = "silver" | "gold" | "elite";
export type Style = Version | "base";
export const VERSION_NAME: Record<Style, string> = { base: "Perus", silver: "Silver", gold: "Gold", elite: "Elite" };
export const VERSION_ORDER: Style[] = ["base", "silver", "gold", "elite"];
export const isVersion = (v: unknown): v is Version => v === "silver" || v === "gold" || v === "elite";

/** Arpoo `cards` korttiversiota. `rnd(1000)` palauttaa kokonaisluvun 0–999 (palvelimella crypto.randomInt). */
export function drawVersions(cards: number, base: Version, elitePermille: number, rnd: (n: number) => number): Version[] {
  const out: Version[] = [];
  for (let i = 0; i < cards; i++) {
    const k = rnd(1000);
    if (!Number.isInteger(k) || k < 0 || k >= 1000) throw new Error("rnd out of range");
    out.push(k < elitePermille ? "elite" : base);
  }
  return out;
}

/** Version todennäköisyydet yhdessä kortissa sekä vähintään yksi Elite pakassa */
export function versionOdds(base: Version, elitePermille: number, cards: number) {
  const elite = Math.max(0, Math.min(1000, elitePermille)) / 1000;
  return { base, perCard: { [base]: 1 - elite, elite } as Partial<Record<Version, number>>, eliteAtLeastOne: 1 - Math.pow(1 - elite, cards) };
}
