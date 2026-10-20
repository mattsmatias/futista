// Hallittu testilähde viivemittaukseen (ESPN-scoreboardin muotoinen). Kotitekoiset joukkueet, ei oikeaa dataa.
// Tilanne (kotijoukkueen maalit = muutoksen järjestysnumero) vaihtuu tunnettuina hetkinä; jokainen muutos ja
// jokainen Futistan palvelimen haku kirjataan. GET /__log palauttaa lokin.
const http = require("node:http");
const EVERY = Number(process.env.EVERY_MS || 100_000), JITTER = Number(process.env.JITTER_MS || 37_000);
const N = Number(process.env.CHANGES || 8);
const kickoff = new Date(Date.now() - 30 * 60_000).toISOString().replace(/\.\d+Z$/, "Z");
let k = 0; const changes = [{ k: 0, t: Date.now() }]; const hits = [];
function schedule() {
  if (k >= N) return;
  setTimeout(() => { k++; changes.push({ k, t: Date.now() }); console.log("change", k, Date.now()); schedule(); }, EVERY + Math.floor(Math.random() * JITTER));
}
schedule();
const team = (id, name, abbr, ha, score) => ({ homeAway: ha, score: String(score), team: { id, displayName: name, shortDisplayName: name, abbreviation: abbr, location: name, name } });
http.createServer((req, res) => {
  if (req.url.startsWith("/__log")) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ changes, hits })); return; }
  if (req.url.startsWith("/scoreboard")) {
    hits.push({ t: Date.now(), k, ua: String(req.headers["user-agent"] || "").slice(0, 40) });
    const ev = { id: "990001", date: kickoff, competitions: [{ status: { type: { name: "STATUS_SECOND_HALF", state: "in" }, period: 2, displayClock: "60'" },
      competitors: [team("990011", "Testiseura Kotka", "TSK", "home", k), team("990012", "Mittaus United", "MIU", "away", 0)] }] };
    res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify({ events: [ev] })); return;
  }
  res.statusCode = 404; res.end("{}");
}).listen(3000, () => console.log("mock-source ready", kickoff));
