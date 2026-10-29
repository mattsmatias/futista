// Näkyvät lähdemerkinnät: tietopalveluiden (rajapintojen) nimiä ei näytetä sivuilla (käyttäjän päätös 29.10.2026).
// Sisältölähteet (LaLiiga.com, Valioliiga.com) näytetään edelleen. Pakollinen football-data.org-maininta on alatunnisteessa
// ja Tietoa-sivulla (football-data.org:n ehdot, kohta 7.1).
const API_SOURCES = /^(api-football|football-data\.org|espn|thesportsdb|wikidata)$/i;
export const isApiSource = (name: string | null | undefined) => !name || API_SOURCES.test(name.trim());
/** Näytettävä lähteen nimi tai null (rajapinta → ei nimeä) */
export const visibleSource = (name: string | null | undefined) => (isApiSource(name) ? null : name!.trim());
