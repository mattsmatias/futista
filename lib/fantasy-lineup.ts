// Futista Fantasy: kokoonpanon muokkaus (puhdas, sama logiikka Oma joukkue- ja Siirrot-näkymissä; testataan tests/fantasy.test.ts).
import { RULES, formationOk, autoLineup, type Picks, type Pos, type FPlayer } from "./fantasy-core";

type Draft = Picks;

/** Keskeneräinen joukkue kentälle: kaikki valitut näkyvät pelipaikkansa rivillä (penkki vasta täydessä joukkueessa) */
export function view(d: Draft, _players: Map<number, FPlayer>): Picks {
  if (d.squad.length === RULES.squadSize) return d;
  return { ...d, xi: d.squad, bench: [] };
}

/** Lisäyksen/poiston jälkeen: uusi pelaaja vapautuneelle paikalle (avaus tai penkki), muodostelma kelvolliseksi, kapteenit */
export function arrange(d: Draft, players: Map<number, FPlayer>): Draft {
  const sq = new Set(d.squad);
  let xi = d.xi.filter((id) => sq.has(id)), bench = d.bench.filter((id) => sq.has(id));
  for (const id of d.squad) {
    if (xi.includes(id) || bench.includes(id)) continue;
    const pos = players.get(id)?.pos;
    const c = (l: number[], p: Pos) => l.filter((x) => players.get(x)?.pos === p).length;
    if (pos && xi.length < RULES.xiSize && c(xi, pos) < RULES.xiMax[pos]) xi.push(id); else bench.push(id);
  }
  if (d.squad.length === RULES.squadSize) {
    const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 } as Record<Pos, number>;
    for (const id of xi) { const p = players.get(id); if (p) c[p.pos]++; }
    if (xi.length !== RULES.xiSize || !formationOk(c)) { const a = autoLineup(d.squad, players); xi = a.xi; bench = a.bench; }
    bench.sort((a, b) => (players.get(a)?.pos === "GK" ? -1 : players.get(b)?.pos === "GK" ? 1 : 0));
  }
  return fixCaps({ ...d, xi, bench }, players);
}

export function fixCaps(d: Draft, players: Map<number, FPlayer>): Draft {
  const byPrice = [...d.xi].sort((a, b) => (players.get(b)?.price ?? 0) - (players.get(a)?.price ?? 0));
  let captain = d.xi.includes(d.captain) ? d.captain : byPrice[0] ?? 0;
  let vice = d.xi.includes(d.vice) && d.vice !== captain ? d.vice : byPrice.find((x) => x !== captain) ?? 0;
  if (captain === vice) vice = byPrice.find((x) => x !== captain) ?? 0;
  return { ...d, captain, vice };
}

/** Kelvolliset vaihdot avauksen ja penkin välillä (muodostelma säilyy, maalivahti vain maalivahdin kanssa) */
export function swapOptions(d: Draft, id: number, players: Map<number, FPlayer>): number[] {
  const inXi = d.xi.includes(id);
  const others = inXi ? d.bench : d.xi;
  const pos = players.get(id)?.pos;
  return others.filter((o) => {
    const op = players.get(o)?.pos;
    if ((pos === "GK") !== (op === "GK")) return false;
    const xi = d.xi.map((x) => (x === (inXi ? id : o) ? (inXi ? o : id) : x));
    const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 } as Record<Pos, number>;
    for (const x of xi) { const p = players.get(x); if (p) c[p.pos]++; }
    return formationOk(c);
  });
}


/** Kahden pelaajan paikanvaihto avauksen ja penkin välillä; kapteenit pysyvät avauksessa */
export function swapPlayers(d: Draft, a: number, b: number, players: Map<number, FPlayer>): Draft {
  const xi = d.xi.map((y) => (y === a ? b : y === b ? a : y)), bench = d.bench.map((y) => (y === a ? b : y === b ? a : y));
  return fixCaps({ ...d, xi, bench }, players);
}
/** Kapteeni / varakapteeni (vain avauksesta); vaihtaa roolit, jos valittu oli toisessa roolissa */
export function setCaptain(d: Draft, id: number, role: "C" | "VC"): Draft {
  if (!d.xi.includes(id)) return d;
  return role === "C" ? { ...d, captain: id, vice: d.vice === id ? d.captain : d.vice } : { ...d, vice: id, captain: d.captain === id ? d.vice : d.captain };
}

/** Vetäminen kentällä: siirto vain samaan pelipaikkaan (avauksen järjestys tai vaihto penkin ja avauksen välillä);
 *  penkin järjestystä voi muuttaa kenttäpelaajien kesken (ensimmäinen vaihtopaikka on aina vaihtomaalivahdin). */
export type Move = { ok: true; kind: "order" | "swap" | "bench" } | { ok: false; why: string };
export function moveCheck(d: Draft, from: number, to: number, players: Map<number, FPlayer>): Move {
  if (from === to) return { ok: false, why: "" };
  const a = players.get(from)?.pos, b = players.get(to)?.pos;
  if (!a || !b) return { ok: false, why: "Pelaajaa ei löytynyt." };
  const ax = d.xi.includes(from), bx = d.xi.includes(to), ab = d.bench.includes(from), bb = d.bench.includes(to);
  if (!(ax || ab) || !(bx || bb)) return { ok: false, why: "" };
  if (ab && bb) {
    if (a === "GK" || b === "GK") return { ok: false, why: "Ensimmäinen vaihtopaikka on vaihtomaalivahdille." };
    return { ok: true, kind: "bench" };
  }
  if (a !== b) return { ok: false, why: `${POS_FI[a]} voi siirtyä vain toisen ${POS_GEN[a]} paikalle.` };
  return { ok: true, kind: ax && bx ? "order" : "swap" };
}
const POS_FI: Record<Pos, string> = { GK: "Maalivahti", DEF: "Puolustaja", MID: "Keskikenttäpelaaja", FWD: "Hyökkääjä" };
const POS_GEN: Record<Pos, string> = { GK: "maalivahdin", DEF: "puolustajan", MID: "keskikenttäpelaajan", FWD: "hyökkääjän" };

/** Tekee kelvollisen siirron (moveCheck); muuten palauttaa joukkueen ennallaan */
export function movePlayers(d: Draft, from: number, to: number, players: Map<number, FPlayer>): Draft {
  const m = moveCheck(d, from, to, players);
  if (!m.ok) return d;
  const sw = (l: number[]) => l.map((y) => (y === from ? to : y === to ? from : y));
  if (m.kind === "order") return { ...d, xi: sw(d.xi) };
  if (m.kind === "bench") return { ...d, bench: sw(d.bench) };
  return swapPlayers(d, from, to, players);
}
