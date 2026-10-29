// Fantasyn pelivaluutan kolikko (oma piirros; ei oikeaa rahaa). Ei gradienttitunnisteita → toimii palvelin- ja
// asiakaskomponenteissa ja monta kertaa samalla sivulla.
import { fmtM, fmtMText } from "@/lib/fantasy-client";

export function Coin({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`fx-coin ${className}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12.6" r="10.6" fill="#a86a00" />
      <circle cx="12" cy="11.6" r="10.2" fill="#f2b705" />
      <circle cx="12" cy="11.6" r="8.6" fill="#ffd23f" />
      <circle cx="12" cy="11.6" r="7" fill="none" stroke="#c98a00" strokeWidth="1.1" />
      <path d="M12 6.7l1.45 2.95 3.25.47-2.35 2.3.55 3.24L12 14.13l-2.9 1.53.55-3.24-2.35-2.3 3.25-.47z" fill="#c98a00" />
      <ellipse cx="8.4" cy="6.9" rx="3.2" ry="1.6" fill="#fff" opacity=".55" transform="rotate(-28 8.4 6.9)" />
    </svg>
  );
}

/** Summa kolikkoineen; ruudunlukija kuulee "13,5 M kolikkoa" */
export function Money({ v, size = 16 }: { v: number; size?: number }) {
  return <span className="fx-money" aria-label={fmtMText(v)}><Coin size={size} /><span aria-hidden="true">{fmtM(v)}</span></span>;
}
