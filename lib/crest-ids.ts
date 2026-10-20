// Seurojen tunnisteet football-data.orgin julkisessa logopalvelussa (crests.football-data.org).
// Toimii ilman API-avainta. Avaimella (FOOTBALL_DATA_KEY) logot haetaan suoraan rajapinnasta.
// Puuttuva seura näyttää värimerkin; lisää tänne "nimi": tunniste, kun tunniste on varmistettu.
import { norm } from "./teams";

const IDS: Record<string, number> = {
  // La Liga
  athletic: 77, "athletic club": 77,
  "atletico madrid": 78,
  osasuna: 79,
  espanyol: 80,
  barcelona: 81,
  getafe: 82,
  malaga: 84,
  "real madrid": 86,
  "rayo vallecano": 87,
  levante: 88,
  mallorca: 89,
  "real betis": 90,
  "real sociedad": 92,
  villarreal: 94,
  valencia: 95,
  "deportivo alaves": 263, alaves: 263,
  elche: 285,
  girona: 298,
  celta: 558,
  sevilla: 559,
  deportivo: 560, "deportivo la coruna": 560,
  // Valioliiga
  arsenal: 57,
  "aston villa": 58,
  chelsea: 61,
  everton: 62,
  fulham: 63,
  liverpool: 64,
  "manchester city": 65, "man city": 65,
  "manchester united": 66, "man utd": 66, "man united": 66,
  newcastle: 67, "newcastle united": 67,
  sunderland: 71,
  tottenham: 73,
  wolves: 76, wolverhampton: 76,
  burnley: 328,
  leeds: 341, "leeds united": 341,
  "ipswich town": 349, ipswich: 349,
  nottingham: 351, "nottingham forest": 351,
  "crystal palace": 354,
  brighton: 397,
  brentford: 402,
  "west ham": 563,
  bournemouth: 1044,
};

// Seurat, joita ei löydy football-data.orgin julkisesta palvelusta: logo TheSportsDB:stä
const URLS: Record<string, string> = {
  "hull city": "https://r2.thesportsdb.com/images/media/team/badge/fbqqda1601726113.png/small",
  hull: "https://r2.thesportsdb.com/images/media/team/badge/fbqqda1601726113.png/small",
  "coventry city": "https://r2.thesportsdb.com/images/media/team/badge/uxyqys1424033798.png/small",
  coventry: "https://r2.thesportsdb.com/images/media/team/badge/uxyqys1424033798.png/small",
  "racing santander": "https://r2.thesportsdb.com/images/media/team/badge/97kkiq1536575158.png/small",
  "racing de santander": "https://r2.thesportsdb.com/images/media/team/badge/97kkiq1536575158.png/small",
  racing: "https://r2.thesportsdb.com/images/media/team/badge/97kkiq1536575158.png/small",
};

export function staticCrest(name: string): string | undefined {
  const n = norm(name);
  if (URLS[n]) return URLS[n];
  const id = IDS[n];
  return id ? `https://crests.football-data.org/${id}.png` : undefined;
}
