import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("välimuistiavain ei riipu käännöksen muuttujanimistä (sidottu funktio)", () => {
  const a = ((x: number) => x + 1).bind(null), b = ((y: number) => y * 2).bind(null);
  assert.equal(a.toString(), b.toString());
});

test("stableCache-avainten etuliitteet ovat yksilöllisiä (avain = vain avainosat)", () => {
  const dir = path.join(__dirname, "..", "..", "lib");
  const prefixes: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const s = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of s.matchAll(/stableCache\([\s\S]*?\[\s*(?:[^\]"]*\?\s*)?"([a-z0-9-]+)"/g)) prefixes.push(m[1]);
  }
  assert.ok(prefixes.length >= 15, String(prefixes.length));
  const dup = prefixes.filter((p, i) => prefixes.indexOf(p) !== i && p !== "photo-v2" && p !== "photo-v3"); // photo-v*: sama haku kahdesta kohdasta
  assert.deepEqual(dup, []);
});
