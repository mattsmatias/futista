"use client";
// Tilapäinen häiriö (lähde ei vastaa, kiintiötauko): hallittu virhe ja uudelleenyritys, ei 404:ää.
import StatusPage from "../../StatusPage";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <StatusPage kind="error" ctx="page" reset={reset} />;
}
