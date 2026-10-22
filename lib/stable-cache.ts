// Next.js 14:n unstable_cache muodostaa välimuistiavaimen funktion lähdekoodista (cb.toString()) + avainosista.
// Tuotantokäännös nimeää muuttujat uudelleen (esim. "()=>M(e)" → "()=>w(e)"), joten JOKAINEN julkaisu vaihtoi
// avaimet ja tyhjensi käytännössä koko datavälimuistin: julkaisun jälkeen kaikki lähteet haettiin uudelleen, ja
// football-datan 10 hakua/min raja täyttyi ("Näiden sarjojen tietoja ei saatu").
// Sidottu funktio (fn.bind) tulostaa aina "function () { [native code] }", joten avain riippuu vain avainosista.
// HUOM: avainosien on siksi oltava yksilölliset jokaisessa kutsupaikassa (etuliite + versio).
import { unstable_cache } from "next/cache";

export function stableCache<A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyParts: string[], options: { revalidate?: number | false; tags?: string[] }): (...args: A) => Promise<R> {
  return unstable_cache(fn.bind(null) as (...args: A) => Promise<R>, keyParts, options);
}
