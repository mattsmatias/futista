// Puhdas logiikka (selain ja palvelin), testataan tests/scorer-rank.test.ts.
/** Maalintekijöiden järjestys ja sijoitus: ensin maalit, sitten maalisyötöt (kuten tulospalveluissa).
 *  Sama sijoitus vain, kun sekä maalit että syötöt ovat samat (esim. 7+0 ja 7+0 → molemmat 5.).
 *  Puuttuva syöttötieto järjestetään kuin 0, mutta näytetään edelleen "–". */
export function rankScorers<T extends { goals: number | null; assists: number | null }>(list: T[]): { p: T; rank: number }[] {
  const g = (x: T) => x.goals ?? -1, a = (x: T) => x.assists ?? 0;
  const sorted = list.map((p, i) => ({ p, i })).sort((x, y) => g(y.p) - g(x.p) || a(y.p) - a(x.p) || x.i - y.i).map((x) => x.p);
  return sorted.map((p) => ({ p, rank: 1 + sorted.filter((q) => g(q) > g(p) || (g(q) === g(p) && a(q) > a(p))).length }));
}
