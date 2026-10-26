import { oddsListResponse } from "@/lib/match-api";

// Ottelulistojen voittajakertoimet (1 / X / 2, keskiarvo). Ei vedonvälittäjien nimiä.
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = (req: Request) => oddsListResponse(req);
