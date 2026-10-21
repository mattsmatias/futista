// Live-tilan yhdistäminen kahdesta lähteestä (puhdas logiikka, testataan tests/-kansiossa).
//
// AIKALEIMAT (jokaisella lähdetilannekuvalla erikseen)
//  fetchedAt        milloin Futista sai lähteeltä onnistuneen vastauksen (palvelimen kello)
//  sourceUpdatedAt  milloin lähde itse ilmoittaa päivittäneensä ottelun tiedot
//                   - football-data: match.lastUpdated (lähteen ilmoittama; ei todista sisällön tuoreutta,
//                     kertoo vain milloin lähde on viimeksi muuttanut tietuetta)
//                   - ESPN: ei vertailukelpoista päivitysaikaa → null
//  Välimuistin tarjoiluhetki ei korvaa kumpaakaan: arvot kulkevat sellaisinaan välimuistin läpi.
//
// TODISTEAIKA (evidenceAt) = sourceUpdatedAt, jos tunnetaan, muuten fetchedAt.
//  ESPN:n tilannekuvan sisällön oletetaan olevan hakuhetken mukainen, koska ESPN on reaaliaikainen
//  tulospalvelu; tämä on oletus, ei todennettu tieto (ks. docs/aikaleimat.md).
//
// YHDISTÄMINEN (sama ottelu molemmissa lähteissä)
//  - sama tilaluokka:
//      käynnissä / puoliaika → ESPN:n tila, tilanne ja kello (reaaliaikainen lähde)
//      päättynyt → tulos football-datasta (ensisijainen tuloslähde); jos ESPN:n tulos eroaa → conflict
//      tuleva / siirretty / peruttu / keskeytetty → football-data (aloitusaika ja tila)
//  - eri tilaluokka: uudempi todiste voittaa
//      football-data voittaa vain, jos sen sourceUpdatedAt on ESPN:n hakuhetkeä uudempi;
//      muuten ESPN (reaaliaikainen). Poikkeus: ESPN:n "tuleva" ei kumoa football-datan alkanutta,
//      päättynyttä, siirrettyä tai peruttua tilaa (ESPN ei aina tiedä siirroista).
//      Jos valittu tila on taaksepäin toisen lähteen tilaan nähden (esim. käynnissä vs. päättynyt),
//      ottelu merkitään ristiriitaiseksi (conflict) – näytetään valittu tila ilman keksittyä varmuutta.
//  - peliminuutti, jatkoaika-/pilkkuvaihe ja pilkkujen tulos: vain ESPN
//  - ottelun tunnistus: sama sarja, alkamisaika ±3 h ja molemmat joukkueet tunnistettu; jos useampi
//    football-datan ottelu sopii yhtä hyvin, osumaa ei hyväksytä.
//
// SELAIN (acceptMatch): ottelukohtainen hyväksyntä; myöhemmin saapunut mutta sisällöltään vanhempi
// tieto ei korvaa uudempaa, eikä tila palaa taaksepäin (esim. päättynyt → käynnissä) ilman
// tiukasti uudempaa todistetta. VAR voi pienentää tulosta, ja lopputulosta voidaan korjata.
import type { LiveMatch, LiveStatus } from "./live-core";

export type Cls = "pre" | "live" | "susp" | "ft" | "post" | "canc";

export const cls = (s: LiveStatus): Cls =>
  s === "FINISHED" || s === "AWARDED" ? "ft"
    : s === "IN_PLAY" || s === "PAUSED" || s === "EXTRA_TIME" || s === "PENALTY_SHOOTOUT" ? "live"
      : s === "SUSPENDED" ? "susp" : s === "POSTPONED" ? "post" : s === "CANCELLED" ? "canc" : "pre";

/** Etenemisjärjestys taaksepäin siirtymien tunnistamiseen. Keskeytetty on käynnissä olevan tasolla
 *  (voi jatkua), siirretty/peruttu ovat erillisiä "sivupolkuja", eivät eteenpäin eivätkä taaksepäin. */
const order: Record<Cls, number> = { pre: 0, post: 0, canc: 0, live: 1, susp: 1, ft: 2 };

/** Onko siirtymä a → b taaksepäin (korjaus): päättynyt → käynnissä/tuleva, käynnissä → tuleva */
export const isRegression = (a: LiveStatus, b: LiveStatus) => {
  const ca = cls(a), cb = cls(b);
  if (ca === cb) return false;
  if (cb === "post" || cb === "canc") return false; // siirto/peruutus on aina sallittu tieto
  return order[cb] < order[ca];
};

export const evidenceAt = (m: Pick<LiveMatch, "sourceUpdatedAt" | "fetchedAt">): number | null =>
  m.sourceUpdatedAt ?? m.fetchedAt ?? null;

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

const fromEspn = (m: LiveMatch, e: LiveMatch, conflict: boolean): LiveMatch => ({
  ...m,
  status: e.status, hs: e.hs, as: e.as, min: e.min, phase: e.phase,
  pens: e.pens ?? null, aet: e.aet,
  fetchedAt: e.fetchedAt ?? null, sourceUpdatedAt: null,
  src: "fd+espn", statusSrc: "espn", conflict: conflict || undefined, conflictKind: conflict ? "status" : undefined,
});

/** Yhdistää football-datan ja ESPN:n tilannekuvat. Kumpikaan lista ei muutu. */
export function mergeLive(fdList: LiveMatch[], espn: LiveMatch[]): LiveMatch[] {
  const out: LiveMatch[] = fdList.map((m) => ({ ...m, src: "fd" as const, statusSrc: "fd" as const }));
  const used = new Set<number>();
  for (const e of espn) {
    const i = findMatch(fdList, e);
    if (i < 0 || used.has(i)) {
      // vain ESPN:ssä oleva käynnissä oleva, keskeytetty tai päättynyt ottelu lisätään
      const c = cls(e.status);
      if (i < 0 && (c === "live" || c === "susp" || c === "ft")) out.push({ ...e, src: "espn", statusSrc: "espn", sourceUpdatedAt: null });
      continue;
    }
    used.add(i);
    const f = fdList[i];
    const m = out[i];
    const cf = cls(f.status), ce = cls(e.status);
    if (cf === ce) {
      if (cf === "live") out[i] = fromEspn(m, e, false);
      else if (cf === "ft") {
        const differs = e.hs !== null && e.as !== null && f.hs !== null && f.as !== null && (e.hs !== f.hs || e.as !== f.as);
        out[i] = {
          ...m, hs: f.hs ?? e.hs, as: f.as ?? e.as, pens: f.pens ?? e.pens ?? null, aet: f.aet ?? e.aet,
          src: "fd+espn", conflict: differs || undefined, conflictKind: differs ? "score" : undefined,
        };
      } else out[i] = { ...m, src: "fd+espn" };
      continue;
    }
    // eri tilaluokka
    if (ce === "pre") { out[i] = { ...m, src: "fd+espn" }; continue; } // ESPN:n "tuleva" ei kumoa mitään
    const fdNewer = f.sourceUpdatedAt != null && e.fetchedAt != null && f.sourceUpdatedAt > e.fetchedAt;
    if (fdNewer) { const c = isRegression(e.status, f.status); out[i] = { ...m, src: "fd+espn", conflict: c || undefined, conflictKind: c ? "status" : undefined }; }
    else out[i] = fromEspn(m, e, isRegression(f.status, e.status));
  }
  return out;
}

/** Selain: ottelukohtainen hyväksyntä. Palauttaa näytettävän tilannekuvan. */
export function acceptMatch(prev: LiveMatch | undefined, next: LiveMatch): LiveMatch {
  if (!prev) return next;
  const pe = evidenceAt(prev), ne = evidenceAt(next);
  if (ne === null) return pe === null ? next : prev;   // uudella ei todistetta → pidetään tunnettu
  if (pe !== null && ne < pe) return prev;              // sisällöltään vanhempi → hylätään
  if (isRegression(prev.status, next.status) && pe !== null && ne <= pe) return prev; // taaksepäin vain tiukasti uudemmalla
  return next;
}

/** Ottelun pysyvä tunniste (football-datan id, muuten ESPN:n id, viimeisenä joukkueet ja aloitusaika) */
export const matchKey = (m: LiveMatch) =>
  m.id ?? `${m.source}:${m.home.join("-")}:${m.away.join("-")}:${m.kickoff}`;

/** Selain: yhdistää uuden vastauksen otteluittain edelliseen. Uudesta vastauksesta puuttuvat ottelut poistuvat. */
export function acceptList(prev: LiveMatch[], next: LiveMatch[]): LiveMatch[] {
  const byKey = new Map(prev.map((m) => [matchKey(m), m]));
  return next.map((m) => acceptMatch(byKey.get(matchKey(m)), m));
}

/** Selain: hyväksytäänkö uusi vastaus (vanhempi tilannekuva ei saa korvata uudempaa) */
export const isNewer = (prevAsOf: number | null, nextAsOf: number | null | undefined) =>
  typeof nextAsOf === "number" && (prevAsOf === null || nextAsOf >= prevAsOf);
