"use client";
// Kävijätilasto: yksi kevyt ilmoitus palvelimelle jokaisesta sivun latauksesta ja siirtymästä. Ei evästeitä eikä
// selaimen tallennusta. Ensimmäinen ilmoitus (välilehden avaus) kertoo saapumisen lähteen: viittaavan sivun ja
// utm_source-merkinnän; polusta lähetetään vain polku ilman kyselyosaa.
import { usePathname } from "next/navigation";
import { useEffect } from "react";

let sentEntry = false;
let last = "";

function send(body: Record<string, unknown>) {
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/k", new Blob([data], { type: "text/plain" }))) return;
  } catch { /* fallback alla */ }
  fetch("/api/k", { method: "POST", body: data, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
}

export default function StatsBeacon() {
  const path = usePathname();
  useEffect(() => {
    if (!path || path === last) return;
    last = path;
    if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return; // automaattiset selaimet eivät ole kävijöitä
    if (!sentEntry) {
      sentEntry = true;
      let utm = "";
      try { utm = new URLSearchParams(location.search).get("utm_source") ?? ""; } catch { /* ei osoitetta */ }
      const standalone = matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      send({ p: path, e: 1, r: document.referrer || "", u: utm.slice(0, 40), s: standalone ? 1 : 0 });
    } else send({ p: path, e: 0 });
  }, [path]);
  return null;
}
