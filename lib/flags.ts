// Maan nimi (football-datan englanninkielinen) → lippu (flagcdn.com) ja nimi valitulla kielellä.
const SPECIAL: Record<string, { code: string; fi: string; sv: string; en: string }> = {
  england: { code: "gb-eng", fi: "Englanti", sv: "England", en: "England" },
  scotland: { code: "gb-sct", fi: "Skotlanti", sv: "Skottland", en: "Scotland" },
  wales: { code: "gb-wls", fi: "Wales", sv: "Wales", en: "Wales" },
  "northern ireland": { code: "gb-nir", fi: "Pohjois-Irlanti", sv: "Nordirland", en: "Northern Ireland" },
  kosovo: { code: "xk", fi: "Kosovo", sv: "Kosovo", en: "Kosovo" },
};
const ALIAS: Record<string, string> = {
  "korea republic": "KR", "south korea": "KR", "korea dpr": "KP", "north korea": "KP",
  "usa": "US", "united states": "US", "czech republic": "CZ", "czechia": "CZ", "turkey": "TR", "turkiye": "TR",
  "bosnia herzegovina": "BA", "bosnia and herzegovina": "BA", "congo dr": "CD", "dr congo": "CD", "congo": "CG",
  "republic of ireland": "IE", "ireland": "IE", "cape verde islands": "CV", "cape verde": "CV", "cote d ivoire": "CI", "ivory coast": "CI",
  "curacao": "CW", "north macedonia": "MK", "macedonia": "MK", "russia": "RU", "iran": "IR", "syria": "SY", "vietnam": "VN",
  "guinea bissau": "GW", "trinidad and tobago": "TT", "st kitts and nevis": "KN", "chinese taipei": "TW", "gambia": "GM", "the gambia": "GM",
  "great britain": "GB", "united kingdom": "GB", "palestine": "PS", "eswatini": "SZ", "moldova": "MD", "brunei": "BN",
};
const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z]+/g, " ").trim();

let byName: Map<string, string> | null = null;
function table() {
  if (byName) return byName;
  byName = new Map();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    // vanhentuneet ja varatut koodit, joilla on sama nimi kuin nykyisellä maalla (esim. FX = "France", YU = "Serbia")
    const OLD = new Set(["AN", "BU", "CS", "DD", "DY", "FX", "HV", "NH", "RH", "SU", "TP", "UK", "VD", "YD", "YU", "ZR"]);
    for (const a of A) for (const b of A) {
      const code = a + b;
      if (OLD.has(code)) continue;
      const n = dn.of(code);
      if (n && n !== code) byName.set(key(n), code);
    }
  } catch {}
  return byName;
}

/** Palauttaa { lippukoodi, nimi } tai null */
export function country(name: string | null | undefined, lang: "fi" | "sv" | "en" = "fi") {
  if (!name) return null;
  const k = key(name);
  const sp = SPECIAL[k];
  if (sp) return { code: sp.code, name: sp[lang] };
  const iso = ALIAS[k] ?? table().get(k);
  if (!iso) return { code: null, name };
  let local = name;
  try { local = new Intl.DisplayNames([lang], { type: "region" }).of(iso) ?? name; } catch {}
  return { code: iso.toLowerCase(), name: local };
}
