import { rpc, fantasyDbOn } from "@/lib/fantasy-db";
import { DEFAULT_COMP, syncComp, recomputeRound } from "@/lib/fantasy-sync";
import { j, fail, dbFail, readJson } from "@/lib/fantasy-api";

// Fantasy-ylläpito (tunnistus: Authorization: Bearer CRON_SECRET, sama kuin ajastetuissa kutsuissa).
//  GET → päivitysten tila: viimeisin onnistunut/epäonnistunut päivitys, kierrokset (määräaika, lukitus, tila, ottelut,
//        tilastolliset ottelut, täsmäämättömät ottelut), pelaajamäärä ja ylläpidon asettamat hinnat
//  POST {action:"sync", refetch?: true} → päivitys heti (myös ajastukselle); refetch = päättyneiden (4 vrk) tilastot heti uudelleen · {action:"recompute", round} → kierroksen pisteet uudelleen
//       {action:"price", player, price} → pelaajan hinta (0,5 M€ portain 3,5–15,0), kirjataan ylläpidon hinnaksi
//  GET ?tehtavat=esikatselu → mitä aloituskierrosta edeltävistä kierroksista olisi kertynyt (budjetti, kolikot); ei maksa mitään
//  POST {action:"tasks_start", round} → tehtävien ja kausitavoitteiden laskennan aloituskierros (ylläpidon erillinen päätös)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const authed = (req: Request) => { const s = process.env.CRON_SECRET; return !!s && req.headers.get("authorization") === `Bearer ${s}`; };

export async function GET(req: Request) {
  if (!authed(req)) return fail("unauthorized", 401);
  if (!fantasyDbOn()) return fail("off", 503);
  try {
    if (new URL(req.url).searchParams.get("tehtavat") === "esikatselu") return j(await rpc("f_tasks_backfill_preview", { p_comp: DEFAULT_COMP.id }));
    return j(await rpc("f_status", { p_comp: DEFAULT_COMP.id }));
  } catch (e) { return dbFail(e); }
}

export async function POST(req: Request) {
  if (!authed(req)) return fail("unauthorized", 401);
  if (!fantasyDbOn()) return fail("off", 503);
  const b = await readJson(req);
  try {
    const action = String(b?.action ?? "");
    if (action === "sync") return j(await syncComp(DEFAULT_COMP, { force: true, refetch: b?.refetch === true }));
    if (action === "recompute") {
      const round = Number(b?.round);
      if (!Number.isInteger(round) || round <= 0) return fail("round");
      return j(await recomputeRound(DEFAULT_COMP.id, round));
    }
    if (action === "price") {
      const player = Number(b?.player), price = Number(b?.price);
      if (!Number.isInteger(player) || !(price >= 3.5 && price <= 15) || Math.round(price * 2) !== price * 2) return fail("price");
      const r = await rpc("f_price_set", { p_comp: DEFAULT_COMP.id, p_player: player, p_price: price });
      return r ? j(r) : fail("notfound", 404);
    }
    if (action === "tasks_start") {
      const round = Number(b?.round);
      if (!Number.isInteger(round) || round <= 0) return fail("round");
      const r = await rpc<{ error?: string }>("f_tasks_start_set", { p_comp: DEFAULT_COMP.id, p_round: round });
      return r?.error ? fail(r.error, 409) : j(r);
    }
    return fail("action");
  } catch (e) { return dbFail(e); }
}
