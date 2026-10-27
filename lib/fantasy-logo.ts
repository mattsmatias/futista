// Futista Fantasy: joukkueen logo. Logo on pieni kuvaus (ei kuvatiedosto), josta selain piirtää SVG:n.
// Sama tarkistus palvelimella ja selaimessa; palvelin tallentaa vain normalisoidun kuvauksen.
// Muodot, kuviot ja symbolit ovat omia yksinkertaisia geometrisia piirroksia (ei seurojen tai muiden tavaramerkkejä).

export const LOGO_SHAPES = ["shield", "circle", "square", "hex"] as const;
export const LOGO_PATTERNS = ["plain", "stripes", "halves", "sash", "hoop", "chevron"] as const;
export const LOGO_SYMBOLS = ["none", "star", "bolt", "crown", "ball", "tree"] as const;
export type LogoShape = (typeof LOGO_SHAPES)[number];
export type LogoPattern = (typeof LOGO_PATTERNS)[number];
export type LogoSymbol = (typeof LOGO_SYMBOLS)[number];
export type TeamLogoSpec = { shape: LogoShape; pattern: LogoPattern; symbol: LogoSymbol; c1: string; c2: string; c3: string; text: string };

export const SHAPE_FI: Record<LogoShape, string> = { shield: "Kilpi", circle: "Ympyrä", square: "Neliö", hex: "Kuusikulmio" };
export const PATTERN_FI: Record<LogoPattern, string> = { plain: "Yksivärinen", stripes: "Pystyraidat", halves: "Puolikkaat", sash: "Vinonauha", hoop: "Vaakanauha", chevron: "Kulma" };
export const SYMBOL_FI: Record<LogoSymbol, string> = { none: "Ei symbolia", star: "Tähti", bolt: "Salama", crown: "Kruunu", ball: "Pallo", tree: "Kuusi" };

/** Valmiit värit (vapaa valinta myös värivalitsimella) */
export const LOGO_COLORS = ["#0b1f3a", "#1d4ed8", "#0ea5e9", "#0f766e", "#16a34a", "#84cc16", "#facc15", "#f97316", "#dc2626", "#9f1239", "#7c3aed", "#111827", "#6b7280", "#ffffff"];

const HEX = /^#[0-9a-f]{6}$/;
const pick = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null);

/** Nimikirjaimet: 0–3 merkkiä, isot kirjaimet A–Z, Å, Ä, Ö ja numerot */
export function cleanLogoText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.normalize("NFC").toUpperCase().replace(/\s+/g, "");
  return /^[A-ZÅÄÖ0-9]{0,3}$/.test(t) ? t : null;
}

/** Tarkistaa ja normalisoi selaimen lähettämän logon. Virheellinen → null (ei osittaista tallennusta). */
export function normalizeLogo(x: any): TeamLogoSpec | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const shape = pick(LOGO_SHAPES, x.shape), pattern = pick(LOGO_PATTERNS, x.pattern), symbol = pick(LOGO_SYMBOLS, x.symbol);
  const col = (v: unknown) => (typeof v === "string" && HEX.test(v.toLowerCase()) ? v.toLowerCase() : null);
  const c1 = col(x.c1), c2 = col(x.c2), c3 = col(x.c3);
  const text = cleanLogoText(x.text ?? "");
  if (!shape || !pattern || !symbol || !c1 || !c2 || !c3 || text === null) return null;
  return { shape, pattern, symbol, c1, c2, c3, text };
}

/** Oletuslogo joukkueelle, joka ei ole tehnyt omaa: nimen alkukirjaimet, värit nimestä (pysyvä, ei satunnainen) */
export function defaultLogo(name: string): TeamLogoSpec {
  const words = name.normalize("NFC").toUpperCase().split(/[^A-ZÅÄÖ0-9]+/).filter(Boolean);
  const text = (words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 2)) || "FC";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const BASE = ["#0b1f3a", "#1d4ed8", "#0f766e", "#9f1239", "#7c3aed", "#111827", "#dc2626", "#16a34a"];
  return { shape: "shield", pattern: "plain", symbol: "none", c1: BASE[h % BASE.length], c2: "#ffffff", c3: "#ffffff", text };
}

/** Kontrastisuhde (WCAG) kahden värin välillä – editorin varoitusta varten */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
