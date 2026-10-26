import { oddsResponse } from "@/lib/match-api";

// Ottelun voittajakertoimet (1 / X / 2) keskiarvona vedonvälittäjien yli – ei vedonvälittäjien nimiä, logoja eikä linkkejä.
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = (req: Request) => oddsResponse(req);
