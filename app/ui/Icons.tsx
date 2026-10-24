// Yhdenmukaiset kuvakkeet (2 px viiva, 24 px ruudukko). Aina tekstiselitteen kanssa tai aria-labelilla.
const P = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const Icon = {
  matches: <svg {...P}><circle cx="12" cy="12" r="9" /><path d="M12 7.5 15.5 10l-1.3 4h-4.4L8.5 10z" /><path d="M12 3v4.5M21 10.5l-5.5-.5M17.5 19.5 14.2 14M6.5 19.5 9.8 14M3 10.5l5.5-.5" /></svg>,
  favs: <svg {...P}><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" /></svg>,
  comps: <svg {...P}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></svg>,
  // Live: lähetysmerkki (piste ja aallot)
  live: <svg {...P}><circle cx="12" cy="12" r="2.2" /><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4" /></svg>,
  news: <svg {...P}><rect x="3" y="4" width="15" height="16" rx="2" /><path d="M18 8h3v10a2 2 0 0 1-2 2M7 8h7M7 12h7M7 16h4" /></svg>,
  search: <svg {...P}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  settings: <svg {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  back: <svg {...P}><path d="M15 18l-6-6 6-6" /></svg>,
  prev: <svg {...P}><path d="M15 18l-6-6 6-6" /></svg>,
  next: <svg {...P}><path d="M9 18l6-6-6-6" /></svg>,
  down: <svg {...P}><path d="M6 9l6 6 6-6" /></svg>,
  calendar: <svg {...P}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  close: <svg {...P}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  arrow: <svg {...P}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
};
