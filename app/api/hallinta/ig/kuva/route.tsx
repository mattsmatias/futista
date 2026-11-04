import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fantasyDbOn } from "@/lib/fantasy-db";
import { currentUser } from "@/lib/fantasy-auth";
import { isAdmin } from "@/lib/site-stats";
import { getArticles } from "@/lib/feed";
import { igTitle, igTitleSize } from "@/lib/ig-core";

// Instagram-luonnoksen kuva (1080 × 1350, 4:5): uutisen oma kuva taustalla (käyttäjän valinta 5.11.2026), tummennus
// tekstin luettavuuden vuoksi. Jos uutisella ei ole kuvaa tai sitä ei saada (muoto, koko, aikakatkaisu), Futistan pohja.
// Vain FUTISTA_ADMINS-tileille (selain lähettää kirjautumisevästeen kuvapyynnön mukana).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const W = 1080, H = 1350;
const Y = "#f5c518", G1 = "#123a20", G2 = "#0f331c";
let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700; style: "normal" }[]> | null = null;
const loadFonts = () => (fonts ??= Promise.all([
  readFile(path.join(process.cwd(), "assets/fonts/Poppins-Bold.ttf")).then((data) => ({ name: "Poppins", data, weight: 700 as const, style: "normal" as const })),
  readFile(path.join(process.cwd(), "assets/fonts/Poppins-Medium.ttf")).then((data) => ({ name: "Poppins", data, weight: 500 as const, style: "normal" as const })),
]));

/** Uutisen kuva data-osoitteeksi: vain JPEG/PNG, enintään 6 Mt, 8 s. Tuotannossa vain https. Virhe → null (pohja). */
async function newsImage(src: string | null): Promise<string | null> {
  if (!src) return null;
  let u: URL;
  try { u = new URL(src); } catch { return null; }
  if (u.protocol !== "https:" && !(process.env.VERCEL_ENV !== "production" && u.protocol === "http:")) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(u, { signal: ctl.signal, headers: { accept: "image/jpeg,image/png" }, cache: "no-store" });
    const type = (r.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!r.ok || !/^image\/(jpeg|png)$/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > 6_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch { return null; } finally { clearTimeout(t); }
}

export async function GET(req: Request) {
  const no = (s: number) => new Response(null, { status: s, headers: { "Cache-Control": "private, no-store" } });
  if (!fantasyDbOn()) return no(503);
  const u = await currentUser(req);
  if (!u) return no(401);
  if (!isAdmin(u.username)) return no(404);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const a = (await getArticles().catch(() => [])).find((x) => x.id === id);
  if (!a) return no(404);
  const title = igTitle(a), size = igTitleSize(title);
  const photo = await newsImage(a.image);
  const date = new Date(a.date).toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Helsinki" });
  const res = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", position: "relative", background: G2, color: "#fff", fontFamily: "Poppins" }}>
        {photo ? (
          <>
            {/* uutisen kuva koko alalle, tummennus ylä- ja alareunaan tekstiä varten */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} width={W} height={H} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, objectFit: "cover" }} />
            <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.78) 62%, rgba(0,0,0,0.92) 100%)" }} />
          </>
        ) : (
          <>
            {/* nurmen leikkuuraidat ja keskiympyrä */}
            {Array.from({ length: 13 }, (_, i) => <div key={i} style={{ position: "absolute", left: 0, top: i * 112, width: W, height: 112, background: i % 2 ? G2 : G1 }} />)}
            <div style={{ position: "absolute", left: 160, top: 300, width: 760, height: 760, borderRadius: 380, border: "3px solid rgba(255,255,255,0.08)" }} />
            <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, background: "linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0) 28%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.55))" }} />
          </>
        )}
        {/* ylärivi */}
        <div style={{ position: "absolute", top: 60, left: 64, right: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 }}>
            <div style={{ width: 58, height: 58, borderRadius: 14, background: "#0b0b0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, fontWeight: 700 }}>F</div>
            Futista
          </div>
          <div style={{ display: "flex", background: Y, color: "#10240f", fontSize: 24, fontWeight: 700, letterSpacing: 3, padding: "8px 18px", borderRadius: 8 }}>{a.league.toUpperCase()}</div>
        </div>
        {/* otsikko */}
        <div style={{ position: "absolute", left: 64, right: 64, bottom: 250, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: Y, fontSize: 30, fontWeight: 700, letterSpacing: 5, marginBottom: 26 }}>{a.type.toUpperCase()}</div>
          <div style={{ display: "flex", fontSize: size, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1 }}>{title}</div>
        </div>
        {/* alarivi */}
        <div style={{ position: "absolute", left: 64, right: 64, bottom: 64, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 28, fontWeight: 500, color: "rgba(255,255,255,0.82)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", background: "#fff", color: "#10240f", fontWeight: 700, padding: "16px 30px", borderRadius: 999 }}>Lue koko juttu: futista.fi</div>
          </div>
          <div style={{ display: "flex" }}>{date}</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: await loadFonts() },
  );
  res.headers.set("Cache-Control", "private, max-age=600");
  res.headers.set("X-Futista-Kuva", photo ? "uutinen" : "pohja");
  return res;
}
