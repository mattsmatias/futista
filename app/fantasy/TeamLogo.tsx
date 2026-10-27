// Joukkueen logo SVG:nä kuvauksesta (lib/fantasy-logo.ts). Kaikki muodot ovat omia geometrisia piirroksia.
import { useId } from "react";
import { defaultLogo, normalizeLogo, type LogoShape, type LogoSymbol, type TeamLogoSpec } from "@/lib/fantasy-logo";

const SHAPE: Record<LogoShape, JSX.Element> = {
  shield: <path d="M50 4 L92 15 V47 C92 73 74 89 50 97 C26 89 8 73 8 47 V15 Z" />,
  circle: <circle cx="50" cy="50" r="46" />,
  square: <rect x="6" y="6" width="88" height="88" rx="18" />,
  hex: <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" />,
};

// symbolit 100×100-ruudussa keskipisteen (50,50) ympärillä
const star = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 15 : 34, a = -Math.PI / 2 + (i * Math.PI) / 5;
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`;
}).join(" ");
const SYMBOL: Record<Exclude<LogoSymbol, "none">, (bg: string) => JSX.Element> = {
  star: () => <polygon points={star} />,
  bolt: () => <path d="M58 14 L28 56 H48 L40 88 L74 42 H54 Z" />,
  crown: () => <path d="M22 72 L18 32 L36 48 L50 22 L64 48 L82 32 L78 72 Z M22 78 H78 V86 H22 Z" />,
  ball: (bg) => (
    <g>
      <circle cx="50" cy="50" r="34" />
      <polygon points="50,36 63,46 58,61 42,61 37,46" fill={bg} />
      <path d="M50 36 V18 M63 46 L80 40 M58 61 L68 76 M42 61 L32 76 M37 46 L20 40" stroke={bg} strokeWidth="4" fill="none" />
    </g>
  ),
  tree: () => <path d="M50 12 L70 40 H60 L76 62 H24 L40 40 H30 Z M45 62 H55 V86 H45 Z" />,
};

function Pattern({ s }: { s: TeamLogoSpec }) {
  switch (s.pattern) {
    case "stripes": return <g fill={s.c2}>{[1, 3, 5].map((i) => <rect key={i} x={(i * 100) / 7} y="0" width={100 / 7} height="100" />)}</g>;
    case "halves": return <rect x="50" y="0" width="50" height="100" fill={s.c2} />;
    case "sash": return <polygon points="0,14 14,0 100,86 86,100" fill={s.c2} />;
    case "hoop": return <rect x="0" y="38" width="100" height="24" fill={s.c2} />;
    case "chevron": return <polygon points="0,30 50,58 100,30 100,52 50,80 0,52" fill={s.c2} />;
    default: return null;
  }
}

/** decorative: nimi näkyy vieressä → ruudunlukija ohittaa logon */
export function TeamLogo({ logo, name, size = 40, className, decorative }: { logo?: unknown; name: string; size?: number; className?: string; decorative?: boolean }) {
  const s = normalizeLogo(logo) ?? defaultLogo(name);
  const clip = `fxl${useId().replace(/:/g, "")}`;
  const sym = s.symbol !== "none" ? SYMBOL[s.symbol] : null;
  const both = !!sym && !!s.text;
  const cy = s.shape === "shield" ? 47 : 50;
  const symScale = both ? 0.5 : 0.9, symY = both ? cy - 14 : cy;
  const textY = both ? cy + 22 : cy + 1;
  const fs = s.text.length >= 3 ? (both ? 20 : 30) : both ? 24 : 38;
  return (
    <svg className={`fx-logo${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="0 0 100 100" {...(decorative ? { "aria-hidden": true, focusable: "false" } : { role: "img", "aria-label": `${name} – logo` })}>
      <defs><clipPath id={clip}>{SHAPE[s.shape]}</clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill={s.c1} />
        <Pattern s={s} />
      </g>
      <g fill="none" stroke={s.c3} strokeWidth="4">{SHAPE[s.shape]}</g>
      {sym && (
        <g transform={`translate(50 ${symY}) scale(${symScale}) translate(-50 -50)`} fill={s.c3} stroke={s.c1} strokeWidth={both ? 4 : 3} strokeLinejoin="round" paintOrder="stroke">
          {sym(s.c1)}
        </g>
      )}
      {s.text && (
        <text x="50" y={textY} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight={800} letterSpacing="0.5"
          fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" fill={s.c3} stroke={s.c1} strokeWidth="3" paintOrder="stroke">
          {s.text}
        </text>
      )}
    </svg>
  );
}
