// Live-tilan yhdistäminen kahdesta lähteestä (puhdas logiikka, testataan tests/-kansiossa).
//
// LÄHTEIDEN ETUSIJA KENTITTÄIN
//  tila (status):
//    - edennein tila voittaa: tuleva < käynnissä < päättynyt. Näin viiveellä päivittyvä lähde ei palauta
//      päättynyttä ottelua käynnissä olevaksi.
//    - kun molemmat sanovat "käynnissä", käytetään ESPN:ää (reaaliaikainen kello, mitattu viive pienempi)
//    - kun molemmat sanovat "päättynyt", käytetään football-dataa (virallinen lopputulos)
//    - Siirretty / Peruttu football-datasta voittaa, jos ESPN ei kerro ottelun alkaneen
//  tilanne (hs/as): samasta lähteestä kuin valittu tila. Uudempi tilannekuva saa pienentää tulosta
//    (VAR:n hylkäämä maali); vanhempi tilannekuva hylätään jo selaimessa asOf-aikaleiman perusteella.
//  peliminuutti, jatkoaika-/pilkkuvaihe ja pilkkujen tulos: vain ESPN (football-datan ilmaisversio ei kerro)
//  ottelun tunnistus: sama sarja, alkamisaika ±3 h ja molemmat joukkueet tunnistettu; jos useampi
//    football-datan ottelu sopii yhtä hyvin, osumaa ei hyväksytä (ei arvata samankaltaisen nimen perusteella).
import type { LiveMatch, LiveStatus } from "./live-core";

const rank = (s: LiveStatus): number =>
  s === "FINISHED" || s === "AWARDED" ? 3
    : s === "IN_PLAY" || s === "PAUSED" || s === "EXTRA_TIME" || s === "PENALTY_SHOOTOUT" || s === "SUSPENDED" ? 2
      : s === "POSTPONED" || s === "CANCELLED" ? 1 : 0;

/** Kuinka hyvin kaksi sanalistaa vastaavat toisiaan: 0 = ei, muuten yhteisten selvien sanojen määrä */
function overlap(a: string[], b: string[]): number {
  const sa = new Set(a.filter((w) => w.length >= 3 || /\d/.test(w)));
  let n = 0;
  for (const w of new Set(b)) if (sa.has(w)) n++;
  return n;
}

/** Etsi ESPN-ottelua vastaava football-datan ottelu. Palauttaa indeksin tai -1 (ei osumaa / epäselvä). */
export function findMatch(fd: LiveMatch[], e: LiveMatch, windowMs = 3 * 3600_000): number {
  let best = -1, bestScore = 0, tie = false;
  fd.forEach((x, i) => {
    if (x.source !== e.source || Math.abs(x.kickoff - e.kickoff) > windowMs) return;
    const h = overlap(x.home, e.home), a = overlap(x.away, e.away);
    if (!h || !a) return; // molempien joukkueiden pitää täsmätä oikein päin
    const sc = h + a;
    if (sc > bestScore) { best = i; bestScore = sc; tie = false; }
    else if (sc === bestScore) tie = true;
  });
  return tie ? -1 : best;
}

/** Yhdistää football-datan ja ESPN:n tilannekuvat. Kumpikaan lista ei muutu. */
export function mergeLive(fdList: LiveMatch[], espn: LiveMatch[]): LiveMatch[] {
  const out: LiveMatch[] = fdList.map((m) => ({ ...m, src: "fd" as const }));
  const used = new Set<number>();
  for (const e of espn) {
    const i = findMatch(out, e);
    if (i < 0 || used.has(i)) {
      // vain ESPN:ssä oleva käynnissä oleva tai päättynyt ottelu lisätään (esim. lähde ei vielä listaa sitä)
      if (i < 0 && rank(e.status) >= 2) out.push({ ...e, src: "espn" });
      continue;
    }
    used.add(i);
    const m = out[i];
    const rf = rank(m.status), re = rank(e.status);
    if (re > rf || (re === rf && re === 2)) {
      // ESPN on edempänä tai molemmat käynnissä: ESPN:n tila ja tilanne
      out[i] = { ...m, status: e.status, hs: e.hs, as: e.as, min: e.min, phase: e.phase, pens: e.pens ?? m.pens ?? null, aet: e.aet ?? m.aet, src: "fd+espn" };
    } else if (re === rf && re === 3) {
      // molemmat päättyneet: virallinen tulos football-datasta, puuttuvat kentät ESPN:stä
      out[i] = { ...m, hs: m.hs ?? e.hs, as: m.as ?? e.as, pens: m.pens ?? e.pens ?? null, aet: m.aet ?? e.aet, src: "fd+espn" };
    }
    // muuten football-data on edempänä (esim. siirretty) → pidetään sen tila
  }
  return out;
}

/** Selain: hyväksytäänkö uusi vastaus (vanhempi tilannekuva ei saa korvata uudempaa) */
export const isNewer = (prevAsOf: number | null, nextAsOf: number | null | undefined) =>
  typeof nextAsOf === "number" && (prevAsOf === null || nextAsOf >= prevAsOf);
