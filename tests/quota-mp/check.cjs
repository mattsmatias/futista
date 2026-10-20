// Arvioi simuloidun lähteen lokin: liukuvan ikkunan maksimi, 429:t, tauon aikaiset haut.
const log = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
const WIN = Number(process.env.WINDOW_MS || 2000);
const out = {};
for (const key of [...new Set(log.map((e) => e.key))]) {
  const L = log.filter((e) => e.key === key).sort((a, b) => a.t - b.t);
  let maxWin = 0, maxLow = 0;
  for (let i = 0; i < L.length; i++) {
    const w = L.filter((e) => e.t >= L[i].t && e.t < L[i].t + WIN);
    maxWin = Math.max(maxWin, w.length);
    maxLow = Math.max(maxLow, w.filter((e) => /^\/(persons|teams)\/\d+|\/head2head/.test(e.path)).length);
  }
  out[key] = { requests: L.length, maxInAnyWindow: maxWin, maxLowInAnyWindow: maxLow, http429: L.filter((e) => e.status === 429).length,
    workers: [...new Set(L.map((e) => e.worker))].length, targets: [...new Set(L.map((e) => e.path))].length };
}
console.log(JSON.stringify(out));
