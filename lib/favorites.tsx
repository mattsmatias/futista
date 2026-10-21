"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { pushSyncTeams } from "./push-client";
import { parseFavs, sameTeam, toggleFav, upgradeFavs, type Fav, type TeamLike } from "./fav-core";

// Suosikkijoukkueet tallennetaan vain käyttäjän omaan selaimeen (tälle laitteelle).
// Uusi muoto: [{ n: nimi, id?: football-data-tunniste }] avaimessa STORE_V2.
// Vanha muoto (lista nimiä, avain STORE) luetaan ja siirretään; nimilista kirjoitetaan edelleen vanhaan avaimeen,
// koska ilmoitusten kielivalinta ja ilmoituspalvelu käyttävät joukkueiden nimiä.
const STORE = "futista-suosikit";
const STORE_V2 = "futista-suosikit-v2";

type Ctx = {
  favs: Fav[];
  names: string[];
  ready: boolean;
  isFav: (t: TeamLike | string) => boolean;
  toggle: (t: TeamLike | string) => void;
  /** Kerro näkyvät joukkueet: nimellä tallennettu suosikki saa vakaan tunnisteen */
  seen: (teams: TeamLike[]) => void;
};
const FavCtx = createContext<Ctx>({ favs: [], names: [], ready: false, isFav: () => false, toggle: () => {}, seen: () => {} });

function read(): Fav[] {
  try {
    const v2 = localStorage.getItem(STORE_V2);
    if (v2) return parseFavs(JSON.parse(v2));
    const old = localStorage.getItem(STORE);
    if (old) return parseFavs(JSON.parse(old));
  } catch {}
  return [];
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favs, setFavs] = useState<Fav[]>([]);
  const [ready, setReady] = useState(false);
  const cur = useRef<Fav[]>([]);

  const write = (next: Fav[], sync: boolean) => {
    cur.current = next;
    setFavs(next);
    try {
      localStorage.setItem(STORE_V2, JSON.stringify(next));
      localStorage.setItem(STORE, JSON.stringify(next.map((f) => f.n)));
    } catch {}
    if (sync) pushSyncTeams(next.map((f) => f.n)); // päivittää ilmoitustilauksen joukkueet, jos tilaus on olemassa
  };

  useEffect(() => {
    const list = read();
    cur.current = list;
    setFavs(list);
    setReady(true);
    // toinen välilehti muutti suosikkeja
    const onStorage = (e: StorageEvent) => { if (e.key === STORE_V2) { const l = read(); cur.current = l; setFavs(l); } };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isFav = useCallback((t: TeamLike | string) => favs.some((f) => sameTeam(f, t)), [favs]);
  const toggle = useCallback((t: TeamLike | string) => write(toggleFav(cur.current, t), true), []);
  const seen = useCallback((teams: TeamLike[]) => {
    const next = upgradeFavs(cur.current, teams);
    if (next !== cur.current) write(next, false);
  }, []);

  return <FavCtx.Provider value={{ favs, names: favs.map((f) => f.n), ready, isFav, toggle, seen }}>{children}</FavCtx.Provider>;
}

export const useFavorites = () => useContext(FavCtx);

/** Suosikkipainike (sydän): sama toiminta listoissa, haussa ja joukkuesivulla */
export function HeartButton({ team, label, withText }: { team: TeamLike | string; label: string; withText?: string }) {
  const { isFav, toggle } = useFavorites();
  const name = typeof team === "string" ? team : team.name;
  const on = isFav(team);
  return (
    <button
      type="button"
      className={`heart${on ? " on" : ""}${withText ? " heart-txt" : ""}`}
      aria-pressed={on}
      aria-label={withText ? undefined : `${label}: ${name}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(team); }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
          fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {withText && <span>{withText}</span>}
    </button>
  );
}
