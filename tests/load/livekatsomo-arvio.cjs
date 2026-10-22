// Livekatsomon LASKENNALLINEN kuormitusarvio (ei mittaus). Välitysvälit ovat koodin arvoja (lib/lk-client.ts,
// LK_TIMING), ja selaimen pyyntömäärät lukijaa kohden on mitattu paikallisesti (tests/integration/livekatsomo.cjs,
// "mittaus"). Muut oletukset alla. Tuloste: Markdown-taulukot docs/livekatsomo.md:hen.
//   node tests/load/livekatsomo-arvio.cjs
const H = 3600;
// Aukioloaika: 30 min ennen + ottelu 115 min (2×45 + tauko 15 + lisäajat ~10) + 60 min vahvistetun lopun jälkeen.
// Jatkoaika + rangaistuspotkut: +40 min ottelujaksoon.
const PHASES = (et) => [
  { name: "ennen", h: 0.5, readers: 0.4, chat: 0.3 },
  { name: "ottelu", h: (115 + (et ? 40 : 0)) / 60, readers: 1.0, chat: 1.0 },
  { name: "jälkeen", h: 1.0, readers: 0.3, chat: 0.3 },
];
const SCEN = { hiljainen: 0.03, tavallinen: 0.25, vilkas: 1.5 }; // viestiä / s ottelun aikana (koko keskustelu)
const MSG_B = 330, EMPTY_B = 90, HDR_B = 350;                   // tavua: viesti JSONina, tyhjä vastaus, otsakkeet

function est(N, rate, mode, et = false) {
  let cdn = 0, fn = 0, dbPresence = 0, dbRead = 0, sends = 0, rtMsgs = 0, rtPeak = 0, flushes = 0, vercelBytes = 0, rtBytes = 0;
  for (const p of PHASES(et)) {
    const n = N * p.readers, r = rate * p.chat, secs = p.h * H;
    const msgs = r * secs; sends += msgs;
    const presence = n * secs / 30;                                   // syke 30 s
    if (mode === "A") {
      const polls = n * secs / 6, room = n * secs / 60;                // kysely 6 s, huone 60 s
      cdn += polls + room + presence + msgs;
      const keysPerSec = Math.min(n / 6, 1 + r * 6);                   // eri after-tunnisteet sekunnissa (CDN s-maxage=1)
      const pollFn = Math.min(polls, keysPerSec * secs), roomFn = Math.min(room, secs / 5);
      fn += pollFn + roomFn + presence + msgs;
      dbRead += pollFn + roomFn;
      vercelBytes += (polls + room + presence) * (HDR_B + EMPTY_B) + n * msgs * MSG_B;
    } else {
      const safety = n * secs / 120, room = n * secs / 300;            // varmistushaku 120 s, huone 300 s
      cdn += safety + room + presence + msgs + n * 3;                  // + liittyminen (huone, historia, täydennys)
      fn += safety + Math.min(room, secs / 5) + presence + msgs + n * 3;
      dbRead += safety + Math.min(room, secs / 5) + n * 3;
      const f = (secs / 2) * (1 - Math.exp(-2 * r));                   // koosteita: vähintään 1 viesti 2 s ikkunassa
      flushes += f; rtMsgs += f * (1 + n);
      rtPeak = Math.max(rtPeak, r > 0 ? Math.min(1, 1 - Math.exp(-2 * r)) * (1 + n) / 2 : 0);
      rtBytes += n * (msgs * MSG_B + f * 120);
      vercelBytes += (safety + room + presence) * (HDR_B + EMPTY_B);
    }
    dbPresence += presence;
  }
  return { cdn, fn, dbPresence, dbRead, sends, rtMsgs, rtPeak, flushes, conns: mode === "B" ? N : 0, vercelMB: vercelBytes / 1e6, rtMB: rtBytes / 1e6 };
}
const k = (x) => (x >= 1e6 ? (x / 1e6).toFixed(2) + " M" : x >= 1e4 ? Math.round(x / 1e3) + " k" : x >= 1e3 ? (x / 1e3).toFixed(1) + " k" : Math.round(x).toString());

for (const mode of ["A", "B"]) {
  console.log(`\n#### ${mode === "A" ? "A. Kysely (6 s)" : "B. Realtime-kooste (valittu)"} – yksi ottelu, normaali kesto (3 h 25 min)\n`);
  console.log(mode === "A"
    ? "| Lukijoita | Keskustelu | Viestejä | CDN-pyyntöjä | Funktiokutsuja | DB-luvut | Paikallaolokirjoitukset | Vercel-siirto |\n|---|---|---|---|---|---|---|---|"
    : "| Lukijoita | Keskustelu | Viestejä | CDN-pyyntöjä | Funktiokutsuja | DB-luvut | Paikallaolokirjoitukset | Realtime-yhteydet | Realtime-viestit | Realtime huippu / s | Realtime-siirto |\n|---|---|---|---|---|---|---|---|---|---|---|");
  for (const N of [20, 100, 500]) for (const [s, r] of Object.entries(SCEN)) {
    const e = est(N, r, mode);
    console.log(mode === "A"
      ? `| ${N} | ${s} | ${k(e.sends)} | ${k(e.cdn)} | ${k(e.fn)} | ${k(e.dbRead)} | ${k(e.dbPresence)} | ${e.vercelMB.toFixed(0)} Mt |`
      : `| ${N} | ${s} | ${k(e.sends)} | ${k(e.cdn)} | ${k(e.fn)} | ${k(e.dbRead)} | ${k(e.dbPresence)} | ${e.conns} | ${k(e.rtMsgs)} | ${Math.round(e.rtPeak)} | ${e.rtMB.toFixed(0)} Mt |`);
  }
}
console.log("\n#### Jatkoaika (+40 min), tavallinen keskustelu\n");
console.log("| Lukijoita | A: CDN-pyyntöjä | B: CDN-pyyntöjä | B: Realtime-viestit |\n|---|---|---|---|");
for (const N of [20, 100, 500]) { const a = est(N, SCEN.tavallinen, "A", true), b = est(N, SCEN.tavallinen, "B", true); console.log(`| ${N} | ${k(a.cdn)} | ${k(b.cdn)} | ${k(b.rtMsgs)} |`); }
