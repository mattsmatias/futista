// Futista-kolikko: pakkojen avaamiseen ansaittava pelivaluutta (ei oikeaa rahaa, ei ostettavissa). Erottuu joukkueen
// budjetin kultaisesta kolikosta omalla turkoosilla värillään ja F-merkillä. Oma piirros.
export function FCoin({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`fx-fcoin ${className}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12.6" r="10.6" fill="#0b6f73" />
      <circle cx="12" cy="11.6" r="10.2" fill="#18b7bd" />
      <circle cx="12" cy="11.6" r="8.4" fill="#2de2e6" />
      <path d="M9.3 6.8h6.4v2.2h-4v2h3.4v2.1h-3.4v3.6H9.3z" fill="#06464a" />
      <ellipse cx="8.4" cy="6.9" rx="3" ry="1.4" fill="#fff" opacity=".5" transform="rotate(-28 8.4 6.9)" />
    </svg>
  );
}

export const fcText = (n: number) => `${n.toLocaleString("fi-FI")} Futista-kolikkoa`;

/** Futista-kolikkomäärä kuvakkeineen; ruudunlukija kuulee "250 Futista-kolikkoa" */
export function FCoins({ v, size = 16, sign = false }: { v: number; size?: number; sign?: boolean }) {
  const s = sign && v > 0 ? "+" : sign && v < 0 ? "−" : "";
  return (
    <span className="fx-fcoins" aria-label={`${s ? (v > 0 ? "plus " : "miinus ") : ""}${fcText(Math.abs(v))}`}>
      <FCoin size={size} /><span aria-hidden="true">{s}{Math.abs(v).toLocaleString("fi-FI")}</span>
    </span>
  );
}
