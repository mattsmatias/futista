// Joukkueiden nimien vertailu: sarjataulukon nimi ↔ uutisten tunnisteet.
// Käytetään sekä selaimessa (suosikit) että palvelimella (ilmoitukset).

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Sarjataulukon nimi → muut nimet, joilla sama seura voi esiintyä uutisissa
const ALIASES: Record<string, string[]> = {
  "atletico madrid": ["atletico", "atleti"],
  "deportivo alaves": ["alaves"],
  deportivo: ["deportivo la coruna", "deportivo coruna"],
  athletic: ["athletic club", "athletic bilbao"],
  celta: ["celta vigo"],
  "racing santander": ["racing"],
  "rayo vallecano": ["rayo"],
  malaga: ["malaga cf"],
  "manchester united": ["man united", "man utd"],
  "manchester city": ["man city"],
  tottenham: ["tottenham hotspur", "spurs"],
  brighton: ["brighton and hove albion"],
  nottingham: ["nottingham forest"],
  newcastle: ["newcastle united"],
  leeds: ["leeds united"],
  "hull city": ["hull"],
  "ipswich town": ["ipswich"],
  "coventry city": ["coventry"],
  "aston villa": ["villa"],
};

/** Kaikki nimet, joilla joukkue voi esiintyä (normalisoituna) */
export function namesFor(team: string): string[] {
  const n = norm(team);
  return [n, ...(ALIASES[n] ?? [])];
}

/** Koskeeko uutinen (tunnisteet) suosikkijoukkuetta? */
export function storyIsAbout(team: string, tags: string[]): boolean {
  const names = namesFor(team);
  return tags.some((t) => names.includes(norm(t)));
}

/** Pelasiko suosikkijoukkue tässä ottelussa? */
export function playedIn(team: string, home: string, away: string): boolean {
  const n = norm(team);
  return norm(home) === n || norm(away) === n;
}
