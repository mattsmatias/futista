import { lineupsResponse } from "@/lib/rapid-api";

// Ottelun kokoonpanot (Free API Live Football Data / RapidAPI). ?l=sarja&d=YYYY-MM-DD&p=koti--vieras
//  200 {state: ok|wait|notpublished|nodata|off}, 404 tuntematon ottelu, 503 lähde ei vastaa (ei välimuistiin)
export const dynamic = "force-dynamic";
export const GET = (req: Request) => lineupsResponse(req);
