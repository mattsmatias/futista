import { pressureResponse } from "@/lib/pressure";

// Ottelun paineen kuvaaja (Futistan arvio ESPN:n ottelutapahtumista, lib/pressure.ts). ?l=sarja&d=YYYY-MM-DD&p=koti--vieras
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = (req: Request) => pressureResponse(req);
