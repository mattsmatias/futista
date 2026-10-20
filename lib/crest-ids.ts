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
  tottenham: 73, "tottenham hotspur": 73,
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
  // Mestarien liiga (muut sarjat)
  "bayern munchen": 5, bayern: 5, "bayern munich": 5,
  "borussia dortmund": 4, dortmund: 4,
  "bayer leverkusen": 3, "bayer 04 leverkusen": 3, leverkusen: 3,
  stuttgart: 10,
  "eintracht frankfurt": 19,
  "rb leipzig": 721, leipzig: 721,
  "paris saint germain": 524, psg: 524, "paris sg": 524,
  "olympique marseille": 516, "olympique de marseille": 516, marseille: 516,
  monaco: 548,
  lille: 521,
  "olympique lyonnais": 523, lyon: 523,
  inter: 108, internazionale: 108, "internazionale milano": 108, "inter milano": 108, "inter milan": 108,
  milan: 98,
  juventus: 109,
  napoli: 113,
  atalanta: 102,
  roma: 100,
  lazio: 110,
  bologna: 103,
  fiorentina: 99,
  benfica: 1903,
  porto: 503,
  sporting: 498, "sporting lisbon": 498,
  "psv eindhoven": 674, psv: 674,
  ajax: 678,
  feyenoord: 675,
  galatasaray: 610,
};

// Etu- ja jälkiliitteet, jotka eivät kuulu seuran tunnistenimeen (esim. "AS Roma", "Liverpool FC", "Real Betis Balompie")
const FILLER = new Set(["fc", "cf", "afc", "ac", "as", "sk", "vfb", "losc", "sc", "ssc", "sl", "cp", "rc", "rcd", "club", "balompie", "ss", "bc", "us", "acf", "1907", "1909", "1913"]);
const strip = (n: string) => n.split(" ").filter((w) => !FILLER.has(w)).join(" ");

// Seurat, joita ei löydy football-data.orgin julkisesta palvelusta: logo TheSportsDB:stä
const URLS: Record<string, string> = {
  "hull city": "https://r2.thesportsdb.com/images/media/team/badge/fbqqda1601726113.png/small",
  hull: "https://r2.thesportsdb.com/images/media/team/badge/fbqqda1601726113.png/small",
  "coventry city": "https://r2.thesportsdb.com/images/media/team/badge/uxyqys1424033798.png/small",
  coventry: "https://r2.thesportsdb.com/images/media/team/badge/uxyqys1424033798.png/small",
  "racing santander": "https://r2.thesportsdb.com/images/media/team/badge/97kkiq1536575158.png/small",
  "racing de santander": "https://r2.thesportsdb.com/images/media/team/badge/97kkiq1536575158.png/small",
  racing: "https://r2.thesportsdb.com/images/media/team/badge/97kkiq1536575158.png/small",
  // Mestarien liiga
  "shakhtar donetsk": "https://r2.thesportsdb.com/images/media/team/badge/sqrxsr1421791799.png/small",
  "shakhtar": "https://r2.thesportsdb.com/images/media/team/badge/sqrxsr1421791799.png/small",
  "fenerbahce": "https://r2.thesportsdb.com/images/media/team/badge/twxxvs1448199691.png/small",
  "como": "https://r2.thesportsdb.com/images/media/team/badge/02x81t1627405841.png/small",
  "brugge": "https://r2.thesportsdb.com/images/media/team/badge/mz8y0q1771129880.png/small",
  "club brugge": "https://r2.thesportsdb.com/images/media/team/badge/mz8y0q1771129880.png/small",
  "lens": "https://r2.thesportsdb.com/images/media/team/badge/3pxoum1598797195.png/small",
  "aek": "https://r2.thesportsdb.com/images/media/team/badge/4nogst1602773624.png/small",
  "aek athens": "https://r2.thesportsdb.com/images/media/team/badge/4nogst1602773624.png/small",
  "sabah masazir": "https://r2.thesportsdb.com/images/media/team/badge/o2ttq41614284640.png/small",
  "sabah": "https://r2.thesportsdb.com/images/media/team/badge/o2ttq41614284640.png/small",
  "bodo glimt": "https://r2.thesportsdb.com/images/media/team/badge/uqpwwx1449165943.png/small",
  "viking": "https://r2.thesportsdb.com/images/media/team/badge/9mzq961590148192.png/small",
  "slavia praha": "https://r2.thesportsdb.com/images/media/team/badge/l7kl4n1759252139.png/small",
  "slavia prague": "https://r2.thesportsdb.com/images/media/team/badge/l7kl4n1759252139.png/small",
  "lask linz": "https://r2.thesportsdb.com/images/media/team/badge/oox26l1683556395.png/small",
  "lask": "https://r2.thesportsdb.com/images/media/team/badge/oox26l1683556395.png/small",
  "slovan bratislava": "https://r2.thesportsdb.com/images/media/team/badge/uzkg701781199823.png/small",
};

export function staticCrest(name: string): string | undefined {
  const n = norm(name);
  if (URLS[n] ?? URLS[strip(n)]) return URLS[n] ?? URLS[strip(n)];
  const id = IDS[n] ?? IDS[strip(n)];
  return id ? `https://crests.football-data.org/${id}.png` : undefined;
}
