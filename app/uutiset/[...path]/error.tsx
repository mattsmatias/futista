"use client";
// Lähdesivu ei vastaa: hallittu virhe ja uudelleenyritys, ei "juttua ei löytynyt".
import StatusPage from "../../StatusPage";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <StatusPage kind="error" ctx="article" reset={reset} />;
}
