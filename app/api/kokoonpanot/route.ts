import { lineupsResponse } from "@/lib/match-api";

// Ottelun kokoonpanot ja tapahtumat (API-Football tai ESPN, lib/match-api.ts). ?l=sarja&d=YYYY-MM-DD&p=koti--vieras
//  200 {state: ok|wait|notpublished|nodata|off}, 404 tuntematon ottelu, 503 lähde ei vastaa (ei välimuistiin)
export const dynamic = "force-dynamic";
export const GET = (req: Request) => lineupsResponse(req);
