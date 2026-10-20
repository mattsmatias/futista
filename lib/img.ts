"use client";
import { useEffect, useRef } from "react";

/** Palvelimella renderöity kuva voi epäonnistua ennen kuin React on ottanut sivun hallintaansa, jolloin
 *  onError-käsittelijä ei koskaan aja. Tarkistetaan tila kerran heti kiinnityksen jälkeen. */
export function useBrokenImage(onBroken: () => void, deps: unknown[] = []) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0 && el.getAttribute("src")) onBroken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
