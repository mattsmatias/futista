"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { pushSyncTeams } from "./push-client";

// Suosikkijoukkueet tallennetaan vain käyttäjän omaan selaimeen.
// Jos ilmoitukset ovat päällä, lista lähetetään myös ilmoituspalvelulle.
const STORE = "futista-suosikit";

type Ctx = { favs: string[]; isFav: (t: string) => boolean; toggle: (t: string) => void };
const FavCtx = createContext<Ctx>({ favs: [], isFav: () => false, toggle: () => {} });

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favs, setFavs] = useState<string[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setFavs(JSON.parse(raw));
    } catch {}
    loaded.current = true;
  }, []);

  const save = (next: string[]) => {
    setFavs(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch {}
    pushSyncTeams(next); // päivittää ilmoitustilauksen joukkueet, jos tilaus on olemassa
  };

  const value: Ctx = {
    favs,
    isFav: (t) => favs.includes(t),
    toggle: (t) => save(favs.includes(t) ? favs.filter((x) => x !== t) : [...favs, t]),
  };
  return <FavCtx.Provider value={value}>{children}</FavCtx.Provider>;
}

export const useFavorites = () => useContext(FavCtx);

/** Sydän-nappi joukkueen tykkäämiseen */
export function HeartButton({ team, label }: { team: string; label: string }) {
  const { isFav, toggle } = useFavorites();
  const on = isFav(team);
  return (
    <button
      className={`heart${on ? " on" : ""}`}
      aria-pressed={on}
      aria-label={`${label}: ${team}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(team); }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
          fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
