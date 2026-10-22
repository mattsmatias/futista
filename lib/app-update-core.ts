// Sovelluksen automaattinen päivitys (puhdas päätöslogiikka, testataan tests/app-update.test.ts).
// Uusi julkaisu otetaan käyttöön vain turvallisella hetkellä: kun käyttäjä palaa sovellukseen (näkyviin) tai
// siirtyy sivulta toiselle. Ei kesken lukemisen. Silmukan esto: enintään yksi päivityslataus / 10 min.
export const RELOAD_GAP_MS = 10 * 60_000;

export function needsUpdate(current: string, latest: unknown): boolean {
  return typeof latest === "string" && latest !== "" && latest !== "dev" && current !== "dev" && latest !== current;
}

export function mayReload(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || !Number.isFinite(lastReloadAt) || now - lastReloadAt >= RELOAD_GAP_MS;
}
