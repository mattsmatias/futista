"use client";
// Livekatsomon pienet näkymät: merkki ottelulistassa ja etusivun "Illan livekatsomo" -nosto.
// Näkyvät vain ylläpidon valitsemissa otteluissa (huone tietokannassa). Ei mitään, jos ominaisuus on pois.
import { useI18n } from "@/lib/i18n";
import { useLkRooms } from "@/lib/lk-client";
import type { LkRoom } from "@/lib/lk-core";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" }).replace(":", ".");
export const lkHref = (r: LkRoom) => `${r.path}${r.path.includes("?") ? "&" : "?"}v=livekatsomo`;

export const ChatIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </svg>
);

/** Lyhyt tilateksti: "auki · 24 paikalla", "avautuu klo 21.30", "keskeytetty", "suljettu" */
export function useLkText() {
  const { lang } = useI18n();
  const L = lang === "en" ? ["here", "open", "opens at", "paused", "closed · read only"]
    : lang === "sv" ? ["här", "öppen", "öppnar kl.", "pausad", "stängd · läsbar"]
    : ["paikalla", "auki", "avautuu klo", "keskeytetty", "suljettu · luettavissa"];
  return (r: LkRoom) => {
    switch (r.state) {
      case "open": return typeof r.present === "number" ? `${r.present} ${L[0]}` : L[1];
      case "upcoming": return `${L[2]} ${hm(r.opens_at)}`;
      case "paused": return L[3];
      case "closed": return L[4];
      default: return "";
    }
  };
}

/** Ottelurivin merkki (linkki suoraan keskusteluun) */
export function LkRowBadge({ room }: { room: LkRoom }) {
  const txt = useLkText();
  if (room.state === "purged") return null;
  return (
    <a className={`lk-badge st-${room.state}`} href={lkHref(room)}>
      <ChatIcon /><b>Livekatsomo</b><span>{txt(room)}</span>
    </a>
  );
}

/** Etusivun tiivis nosto: enintään 2 ylläpidon nostamaa (tuleva, auki tai keskeytetty) */
export function LkHomeStrip() {
  const rooms = useLkRooms();
  const { lang } = useI18n();
  const txt = useLkText();
  const list = (rooms ?? []).filter((r) => r.featured && (r.state === "upcoming" || r.state === "open" || r.state === "paused"))
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)).slice(0, 2);
  if (!list.length) return null;
  const head = lang === "en" ? "Tonight's live lounge" : lang === "sv" ? "Kvällens Livekatsomo" : "Illan livekatsomo";
  return (
    <nav className="lk-strip" aria-label={head}>
      <span className="lk-strip-h"><ChatIcon />{head}{process.env.NEXT_PUBLIC_LK_TESTDATA === "1" && <span className="lk-test">TESTIDATA</span>}</span>
      {list.map((r) => (
        <a key={r.id} href={lkHref(r)} className={`lk-strip-i st-${r.state}`}>
          <b>{r.home} – {r.away}</b><span>{r.state === "open" && <i className="lk-dot" aria-hidden="true" />}{txt(r)}</span>
        </a>
      ))}
    </nav>
  );
}
