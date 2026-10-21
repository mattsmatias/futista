"use client";
// Livekatsomo: ottelukohtainen tekstikeskustelu (vain ylläpidon valitsemat ottelut).
// - Lukeminen ilman kirjautumista, kirjoittaminen kirjautuneena (Supabase Auth -kirjautumislinkki) + nimimerkki.
// - Viestit tekstinä (React escapoi; linkit eivät ole klikattavia). Palvelin tarkistaa kaiken uudelleen.
// - Uudet viestit vierittävät alas vain, jos käyttäjä on jo alaosassa; muuten "Uusia viestejä · siirry alas".
// - Mobiilissa kirjoitettaessa keskustelu täyttää näkyvän alueen (näppäimistö ei peitä kenttää).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { cleanBody, LK_MAX, nickOk, type LkMessage, type LkRoom } from "@/lib/lk-core";
import { lkApi, saveSession, useChat, useDraft, useLkMe, useMuted, usePresence, uuid, type Pending } from "@/lib/lk-client";

const FI = {
  title: "Livekatsomo", here: "paikalla", presenceNA: "Paikallaolomäärä ei saatavilla",
  rt: "Reaaliaikainen", poll: "Päivittyy muutaman sekunnin välein", offline: "Ei yhteyttä – yritetään uudelleen",
  rules: "Keskustele asiallisesti. Ei rasismia, uhkailua, henkilötietoja tai mainontaa.",
  spoiler: "Keskustelu voi paljastaa ottelutapahtumia ennen omaa lähetystäsi.", close: "Sulje",
  opensAt: "Livekatsomo avautuu klo {t}", paused: "Keskustelu on väliaikaisesti keskeytetty.",
  closed: "Keskustelu on suljettu – vain luettavissa.", readOnly: "Keskustelu on tällä hetkellä vain luettavissa.",
  purged: "Keskustelun arkisto on poistettu.", postponed: "Ottelu on siirretty – keskustelu on suljettu.", cancelled: "Ottelu on peruttu – keskustelu on suljettu.",
  empty: "Ei vielä viestejä.", older: "Näytä vanhemmat viestit", loading: "Ladataan…", noMore: "Keskustelun alku",
  newMsgs: "Uusia viestejä · siirry alas", deletedSelf: "Viesti poistettu", deletedMod: "Ylläpito poisti viestin",
  reply: "Vastaa", delete: "Poista", report: "Ilmoita", mute: "Mykistä", reported: "Ilmoitettu ylläpidolle. Kiitos!",
  replyingTo: "Vastaus käyttäjälle", cancel: "Peru", placeholder: "Kirjoita viesti…", send: "Lähetä",
  sending: "Lähetetään…", failed: "Ei lähetetty", retry: "Yritä uudelleen", remove: "Poista",
  loginTitle: "Kirjaudu kirjoittaaksesi", loginInfo: "Lähetämme kirjautumislinkin sähköpostiisi. Sähköposti ei näy keskustelussa.",
  email: "Sähköposti", sendLink: "Lähetä kirjautumislinkki", linkSent: "Kirjautumislinkki lähetetty. Avaa se tällä laitteella.",
  linkFail: "Kirjautumislinkin lähetys ei onnistunut juuri nyt. Yritä myöhemmin.", emailBad: "Tarkista sähköpostiosoite.", rate: "Liian monta yritystä. Odota hetki.",
  nickTitle: "Valitse nimimerkki", nickInfo: "2–20 merkkiä. Näkyy viestiesi yhteydessä.", save: "Tallenna",
  nick_invalid: "Nimimerkissä voi olla 2–20 kirjainta, numeroa, välilyöntiä tai merkkejä _ . -", nick_reserved: "Tätä nimimerkkiä ei voi käyttää.", nick_taken: "Nimimerkki on jo käytössä.",
  banned: "Sinulla on kirjoituskielto", bannedUntil: "klo {t} asti", bannedForever: "toistaiseksi",
  signedAs: "Kirjautuneena", signOut: "Kirjaudu ulos", unmute: "Poista mykistykset",
  err_rate: "Odota hetki ennen seuraavaa viestiä", err_repeat: "Sama viesti lähetettiin juuri.", err_links: "Liian monta linkkiä.",
  err_long: "Viesti on liian pitkä (enintään 300 merkkiä).", err_empty: "Viesti on tyhjä.", err_state: "Keskusteluun ei voi nyt kirjoittaa.",
  err_net: "Yhteysvirhe.", err_auth: "Kirjaudu uudelleen.", err_other: "Lähetys ei onnistunut.",
  admin: "Ylläpito", modDelete: "Poista (ylläpito)", ban24: "Kielto 24 h", banForever: "Kielto toistaiseksi", done: "Tehty.",
  pinned: "Kiinnitetty",
};
const EN: typeof FI = {
  title: "Live lounge", here: "here", presenceNA: "Presence count unavailable",
  rt: "Real-time", poll: "Updates every few seconds", offline: "Offline – retrying",
  rules: "Keep it civil. No racism, threats, personal data or advertising.",
  spoiler: "The chat may reveal match events before your own broadcast does.", close: "Close",
  opensAt: "Live lounge opens at {t}", paused: "The chat is temporarily paused.",
  closed: "The chat is closed – read only.", readOnly: "The chat is read-only at the moment.",
  purged: "The chat archive has been deleted.", postponed: "The match was postponed – chat closed.", cancelled: "The match was cancelled – chat closed.",
  empty: "No messages yet.", older: "Show older messages", loading: "Loading…", noMore: "Start of the chat",
  newMsgs: "New messages · jump to latest", deletedSelf: "Message deleted", deletedMod: "Message removed by moderators",
  reply: "Reply", delete: "Delete", report: "Report", mute: "Mute", reported: "Reported to moderators. Thanks!",
  replyingTo: "Replying to", cancel: "Cancel", placeholder: "Write a message…", send: "Send",
  sending: "Sending…", failed: "Not sent", retry: "Retry", remove: "Remove",
  loginTitle: "Sign in to write", loginInfo: "We'll email you a sign-in link. Your email is never shown in the chat.",
  email: "Email", sendLink: "Send sign-in link", linkSent: "Sign-in link sent. Open it on this device.",
  linkFail: "Couldn't send the sign-in link right now. Try again later.", emailBad: "Check the email address.", rate: "Too many attempts. Wait a moment.",
  nickTitle: "Choose a nickname", nickInfo: "2–20 characters. Shown with your messages.", save: "Save",
  nick_invalid: "Use 2–20 letters, digits, spaces or _ . -", nick_reserved: "This nickname can't be used.", nick_taken: "Nickname already taken.",
  banned: "You are banned from writing", bannedUntil: "until {t}", bannedForever: "indefinitely",
  signedAs: "Signed in as", signOut: "Sign out", unmute: "Unmute all",
  err_rate: "Wait a moment before the next message", err_repeat: "You just sent the same message.", err_links: "Too many links.",
  err_long: "Message too long (max 300 characters).", err_empty: "Message is empty.", err_state: "The chat can't be written to now.",
  err_net: "Connection error.", err_auth: "Sign in again.", err_other: "Sending failed.",
  admin: "Moderation", modDelete: "Remove (mod)", ban24: "Ban 24 h", banForever: "Ban indefinitely", done: "Done.",
  pinned: "Pinned",
};
const SV: typeof FI = {
  title: "Livekatsomo", here: "här", presenceNA: "Antal närvarande inte tillgängligt",
  rt: "Realtid", poll: "Uppdateras med några sekunders mellanrum", offline: "Ingen anslutning – försöker igen",
  rules: "Håll god ton. Ingen rasism, hot, personuppgifter eller reklam.",
  spoiler: "Chatten kan avslöja händelser före din egen sändning.", close: "Stäng",
  opensAt: "Livekatsomo öppnar kl. {t}", paused: "Chatten är tillfälligt pausad.",
  closed: "Chatten är stängd – endast läsbar.", readOnly: "Chatten är för tillfället endast läsbar.",
  purged: "Chattens arkiv har raderats.", postponed: "Matchen har flyttats – chatten är stängd.", cancelled: "Matchen har ställts in – chatten är stängd.",
  empty: "Inga meddelanden ännu.", older: "Visa äldre meddelanden", loading: "Laddar…", noMore: "Chattens början",
  newMsgs: "Nya meddelanden · gå ner", deletedSelf: "Meddelandet raderat", deletedMod: "Moderator raderade meddelandet",
  reply: "Svara", delete: "Radera", report: "Anmäl", mute: "Tysta", reported: "Anmält till moderatorerna. Tack!",
  replyingTo: "Svar till", cancel: "Avbryt", placeholder: "Skriv ett meddelande…", send: "Skicka",
  sending: "Skickas…", failed: "Inte skickat", retry: "Försök igen", remove: "Ta bort",
  loginTitle: "Logga in för att skriva", loginInfo: "Vi skickar en inloggningslänk till din e-post. E-postadressen visas aldrig i chatten.",
  email: "E-post", sendLink: "Skicka inloggningslänk", linkSent: "Inloggningslänken har skickats. Öppna den på den här enheten.",
  linkFail: "Det gick inte att skicka länken just nu. Försök senare.", emailBad: "Kontrollera e-postadressen.", rate: "För många försök. Vänta en stund.",
  nickTitle: "Välj smeknamn", nickInfo: "2–20 tecken. Visas med dina meddelanden.", save: "Spara",
  nick_invalid: "Använd 2–20 bokstäver, siffror, mellanslag eller _ . -", nick_reserved: "Smeknamnet kan inte användas.", nick_taken: "Smeknamnet är upptaget.",
  banned: "Du har skrivförbud", bannedUntil: "till {t}", bannedForever: "tills vidare",
  signedAs: "Inloggad som", signOut: "Logga ut", unmute: "Häv tystningar",
  err_rate: "Vänta en stund före nästa meddelande", err_repeat: "Du skickade nyss samma meddelande.", err_links: "För många länkar.",
  err_long: "Meddelandet är för långt (högst 300 tecken).", err_empty: "Meddelandet är tomt.", err_state: "Chatten kan inte skrivas i nu.",
  err_net: "Anslutningsfel.", err_auth: "Logga in igen.", err_other: "Det gick inte att skicka.",
  admin: "Moderering", modDelete: "Radera (mod)", ban24: "Förbud 24 h", banForever: "Förbud tills vidare", done: "Klart.",
  pinned: "Fäst",
};
export type Tx = typeof FI;
export const lkText = (lang: string): Tx => (lang === "en" ? EN : lang === "sv" ? SV : FI);

const hm = (iso: string) => new Date(iso).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" }).replace(":", ".");
const dayHm = (iso: string) => new Date(iso).toLocaleString("fi-FI", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" });

export function presenceLabel(n: number | null | undefined, x: Tx) { return typeof n === "number" ? `${n} ${x.here}` : x.presenceNA; }

/** Tilan selite kirjoituskentän tilalle (null = kirjoitettavissa) */
function stateNote(r: LkRoom, x: Tx): string | null {
  if (r.state === "upcoming") return x.opensAt.replace("{t}", hm(r.opens_at));
  if (r.state === "paused") return x.paused;
  if (r.state === "purged") return x.purged;
  if (r.state === "closed") return r.match_status === "postponed" ? x.postponed : r.match_status === "cancelled" ? x.cancelled : x.closed;
  if (r.read_only) return x.readOnly;
  return null;
}

function errText(e: string | undefined, x: Tx, retry?: number) {
  if (!e) return x.err_other;
  if (e === "rate") return `${x.err_rate}${retry ? ` (${retry} s)` : ""}.`;
  if (e === "repeat") return x.err_repeat; if (e === "links") return x.err_links; if (e === "long") return x.err_long; if (e === "empty") return x.err_empty;
  if (e.startsWith("state_") || e === "read_only") return x.err_state; if (e === "net") return x.err_net; if (e === "auth") return x.err_auth;
  return x.err_other;
}

export function Login({ x, next }: { x: Tx; next: string }) {
  const [email, setEmail] = useState("");
  const [st, setSt] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSt("sending");
    const r = await lkApi<{ ok: boolean; error?: string }>("/auth/link", { method: "POST", body: { email, next }, auth: false });
    if (r.status === 200) { setSt("sent"); return; }
    setSt("error"); setMsg(r.j?.error === "email" ? x.emailBad : r.j?.error === "rate" ? x.rate : x.linkFail);
  };
  if (st === "sent") return <p className="lk-note" role="status">{x.linkSent}</p>;
  return (
    <form className="lk-form" onSubmit={submit}>
      <b>{x.loginTitle}</b>
      <span className="muted">{x.loginInfo}</span>
      <div className="lk-row">
        <input type="email" required autoComplete="email" inputMode="email" aria-label={x.email} placeholder={x.email} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        <button className="btn sm" disabled={st === "sending"}>{x.sendLink}</button>
      </div>
      {st === "error" && <span className="lk-err" role="alert">{msg}</span>}
    </form>
  );
}

function NickForm({ x, onDone }: { x: Tx; onDone: () => void }) {
  const [nick, setNick] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickOk(nick)) { setErr(x.nick_invalid); return; }
    setBusy(true);
    const r = await lkApi<{ ok: boolean; error?: keyof Tx }>("/me", { method: "POST", body: { nick: nick.trim() } });
    setBusy(false);
    if (r.j?.ok) onDone(); else setErr(r.j?.error && r.j.error in x ? (x[r.j.error] as string) : r.status === 429 ? x.rate : x.err_other);
  };
  return (
    <form className="lk-form" onSubmit={submit}>
      <b>{x.nickTitle}</b>
      <span className="muted">{x.nickInfo}</span>
      <div className="lk-row">
        <input aria-label={x.nickTitle} value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} minLength={2} autoComplete="nickname" />
        <button className="btn sm" disabled={busy}>{x.save}</button>
      </div>
      {err && <span className="lk-err" role="alert">{err}</span>}
    </form>
  );
}

function Msg({ m, x, mine, admin, open, onToggle, onReply, onDelete, onReport, onMute, onMod }: {
  m: LkMessage; x: Tx; mine: boolean; admin: boolean; open: boolean; onToggle: () => void;
  onReply: () => void; onDelete: () => void; onReport: () => void; onMute: () => void; onMod: (a: "delete" | "ban24" | "ban") => void;
}) {
  const gone = m.body === null;
  return (
    <li className={`lk-msg${mine ? " mine" : ""}${gone ? " gone" : ""}`} data-id={m.id}>
      <div className="lk-meta"><b className="lk-nick">{m.nick}</b><time dateTime={m.at}>{hm(m.at)}</time>
        {!gone && <button className="lk-more" aria-expanded={open} aria-label={`${x.reply}, ${x.report}…`} onClick={onToggle}>⋯</button>}
      </div>
      {m.reply && (
        <div className="lk-quote">
          <b>{m.reply.nick}</b> {m.reply.body === null ? <i>{m.reply.deleted === "mod" ? x.deletedMod : x.deletedSelf}</i> : m.reply.body}
        </div>
      )}
      {gone ? <p className="lk-body lk-gone">{m.deleted === "mod" ? x.deletedMod : x.deletedSelf}</p> : <p className="lk-body">{m.body}</p>}
      {open && !gone && (
        <div className="lk-acts">
          <button onClick={onReply}>{x.reply}</button>
          {mine ? <button onClick={onDelete}>{x.delete}</button> : <><button onClick={onReport}>{x.report}</button><button onClick={onMute}>{x.mute}</button></>}
          {admin && !mine && <><button className="mod" onClick={() => onMod("delete")}>{x.modDelete}</button><button className="mod" onClick={() => onMod("ban24")}>{x.ban24}</button><button className="mod" onClick={() => onMod("ban")}>{x.banForever}</button></>}
        </div>
      )}
    </li>
  );
}

/** Mobiilin näppäimistö: kirjoitettaessa keskustelu täyttää näkyvän alueen (visualViewport) */
function useTypingViewport(on: boolean, el: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const node = el.current;
    const vv = window.visualViewport;
    if (!on || !node || !vv || window.innerWidth > 900) return;
    let shrunk = false;
    const fit = () => {
      node.style.setProperty("--lk-vh", `${vv.height}px`); node.style.setProperty("--lk-top", `${vv.offsetTop}px`);
      // näppäimistö suljettiin ilman kentästä poistumista (esim. Androidin takaisin-painike) → normaali näkymä
      if (vv.height < window.innerHeight - 120) shrunk = true;
      else if (shrunk) (document.activeElement as HTMLElement | null)?.blur?.();
    };
    fit();
    document.documentElement.classList.add("lk-typing");
    vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit);
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); document.documentElement.classList.remove("lk-typing"); node.style.removeProperty("--lk-vh"); node.style.removeProperty("--lk-top"); };
  }, [on, el]);
}

// Testiympäristön käännös (NEXT_PUBLIC_LK_TESTDATA=1): keskustelu ja paikallaololuvut merkitään testidataksi
export const LK_TESTDATA = process.env.NEXT_PUBLIC_LK_TESTDATA === "1";

export default function Livekatsomo({ roomId, active = true, testData = LK_TESTDATA }: { roomId: string; active?: boolean; testData?: boolean }) {
  const { lang } = useI18n();
  const x = lkText(lang);
  const chat = useChat(roomId, active);
  const { room, messages } = chat;
  const { session, me, reload, signOut } = useLkMe();
  const [muted, setMuted] = useMuted();
  const [draft, setDraft] = useDraft(roomId);
  const [pending, setPending] = useState<Pending[]>([]);
  const [reply, setReply] = useState<LkMessage | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [inputErr, setInputErr] = useState("");
  const [typing, setTyping] = useState(false);
  const [spoilerOk, setSpoilerOk] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef(true);
  const [newCount, setNewCount] = useState(0);
  const [visible, setVisible] = useState(false);
  const myUid = useRef<Set<string>>(new Set());

  useEffect(() => { try { setSpoilerOk(localStorage.getItem("futista-lk-spoiler") === "1"); } catch { setSpoilerOk(false); } }, []);
  const dismissSpoiler = () => { setSpoilerOk(true); try { localStorage.setItem("futista-lk-spoiler", "1"); } catch {} };

  // paikallaolo lasketaan vain, kun keskustelu on oikeasti näkyvissä
  useEffect(() => {
    const node = rootRef.current;
    if (!node || !active) { setVisible(false); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(node);
    return () => io.disconnect();
  }, [active]);
  const presentLive = usePresence(room && (room.state === "open" || room.state === "paused") ? roomId : null, visible, room?.present ?? null);
  const present = room && (room.state === "open" || room.state === "paused") ? presentLive : null;
  useTypingViewport(typing, rootRef);

  // vieritys: alaosassa pysytään, muuten ilmoitus uusista; vanhojen lataus säilyttää kohdan
  const prev = useRef<{ first?: number; last?: number; height: number }>({ height: 0 });
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const first = messages[0]?.id, last = messages[messages.length - 1]?.id;
    const p = prev.current;
    if (p.first !== undefined && first !== undefined && first < p.first && last === p.last) {
      el.scrollTop += el.scrollHeight - p.height; // vanhemmat lisätty yläpuolelle
    } else if (last !== p.last) {
      if (bottom.current || p.last === undefined) el.scrollTop = el.scrollHeight;
      else if (p.last !== undefined && last! > p.last) setNewCount((n) => n + messages.filter((m) => m.id > p.last!).length);
    }
    prev.current = { first, last, height: el.scrollHeight };
  }, [messages]);
  useLayoutEffect(() => { const el = listRef.current; if (el && bottom.current) el.scrollTop = el.scrollHeight; }, [pending.length]);

  const onScroll = () => {
    const el = listRef.current!;
    const atB = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (atB && !bottom.current) { setNewCount(0); chat.atBottom(); }
    bottom.current = atB;
    prev.current.height = el.scrollHeight;
  };
  const toBottom = () => { const el = listRef.current; if (!el) return; bottom.current = true; setNewCount(0); chat.atBottom(); el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); };

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 3500); };

  const doSend = useCallback(async (p: Pending) => {
    setPending((ps) => ps.map((q) => (q.client_id === p.client_id ? { ...q, state: "sending", error: undefined } : q)));
    const r = await lkApi<{ ok: boolean; error?: string; retry_s?: number; message?: LkMessage }>(`/room/${roomId}/messages`, { method: "POST", body: { client_id: p.client_id, body: p.body, reply_to: p.reply?.id ?? null } });
    if (r.j?.ok && r.j.message) {
      myUid.current.add(r.j.message.uid);
      setPending((ps) => ps.filter((q) => q.client_id !== p.client_id));
      chat.patch(r.j.message);
      return;
    }
    const e = r.status === 0 ? "net" : r.status === 401 ? "auth" : r.j?.error ?? "other";
    setPending((ps) => ps.map((q) => (q.client_id === p.client_id ? { ...q, state: "failed", error: errText(e, x, r.j?.retry_s) } : q)));
    if (e.startsWith("state_") || e === "read_only") chat.loadRoom();
    if (e === "banned" || e === "nick_required") reload();
  }, [roomId, chat, x, reload]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const c = cleanBody(draft);
    if (c.ok === false) { setInputErr(errText(c.error, x)); return; }
    setInputErr("");
    const p: Pending = { client_id: uuid(), body: c.body, reply, state: "sending" };
    setPending((ps) => [...ps, p]);
    setDraft(""); setReply(null);
    bottom.current = true;
    doSend(p);
    taRef.current?.focus();
  };

  const act = async (m: LkMessage, a: "delete" | "report" | "mute") => {
    setOpenId(null);
    if (a === "mute") { setMuted(m.uid, true); return; }
    if (a === "delete") {
      const r = await lkApi(`/room/${roomId}/messages/${m.id}`, { method: "DELETE" });
      if (r.status === 200) chat.patch({ ...m, body: null, deleted: "self" }); else flash(x.err_other);
      return;
    }
    const r = await lkApi(`/room/${roomId}/report`, { method: "POST", body: { message: m.id } });
    flash(r.status === 200 ? x.reported : r.status === 429 ? x.rate : x.err_other);
  };
  const mod = async (m: LkMessage, a: "delete" | "ban24" | "ban") => {
    setOpenId(null);
    const r = a === "delete"
      ? await lkApi("/admin", { method: "POST", body: { action: "delete_message", args: { room: roomId, message: m.id } } })
      : await lkApi("/admin", { method: "POST", body: { action: "ban", args: { room: roomId, message: m.id, until: a === "ban24" ? new Date(Date.now() + 86400_000).toISOString() : "" } } });
    if (r.status === 200 && a === "delete") chat.patch({ ...m, body: null, deleted: "mod" });
    flash(r.status === 200 ? x.done : x.err_other);
  };

  const shown = useMemo(() => messages.filter((m) => !muted.has(m.uid)), [messages, muted]);
  const nickNow = me?.nick;
  const note = room ? stateNote(room, x) : null;
  const banned = me?.banned_until ? `${x.banned} ${me.banned_until === "infinity" ? x.bannedForever : x.bannedUntil.replace("{t}", dayHm(me.banned_until))}.` : null;
  const len = [...draft].length;
  const next = typeof location !== "undefined" ? location.pathname + location.search : "/";

  if (chat.roomError) return <section className="panel lk"><p className="muted pad">{x.purged}</p></section>;

  return (
    <section ref={rootRef} className={`panel lk${typing ? " typing" : ""}`} aria-label={x.title}>
      <header className="lk-head">
        <div className="lk-title">
          <h3>{x.title}</h3>
          {testData && <span className="lk-test">TESTIDATA</span>}
          {typing && <button type="button" className="lk-done" onMouseDown={(e) => e.preventDefault()} onClick={() => { taRef.current?.blur(); setTyping(false); }}>{x.close}</button>}
        </div>
        <div className="lk-status">
          <span className={`lk-conn ${!chat.online ? "off" : chat.live ? "rt" : "poll"}`} title={!chat.online ? x.offline : chat.live ? x.rt : x.poll}>
            <i aria-hidden="true" />{!chat.online ? x.offline : chat.live ? x.rt : x.poll}
          </span>
          {room && (room.state === "open" || room.state === "paused") && <span className={`lk-present${present === null ? " na" : ""}`} aria-live="polite">{presenceLabel(present, x)}</span>}
        </div>
      </header>
      <p className="lk-rules">{x.rules}</p>
      {!spoilerOk && (
        <div className="lk-spoiler" role="note">
          <span>{x.spoiler}</span><button className="lk-x" onClick={dismissSpoiler} aria-label={x.close}>{x.close}</button>
        </div>
      )}
      {room?.pinned && <p className="lk-pin"><b>{x.pinned}:</b> {room.pinned}</p>}

      <div className="lk-list-wrap">
        <div className="lk-list" ref={listRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" tabIndex={0}>
          {messages.length > 0 && (
            chat.olderDone
              ? <p className="lk-start muted">{x.noMore}</p>
              : <button className="lk-older" onClick={chat.loadOlder} disabled={chat.loadingOlder}>{chat.loadingOlder ? x.loading : x.older}</button>
          )}
          {messages.length === 0 && pending.length === 0 && <p className="muted pad">{room ? x.empty : x.loading}</p>}
          <ul>
            {shown.map((m) => (
              <Msg key={m.id} m={m} x={x} mine={myUid.current.has(m.uid) || m.uid === me?.uid} admin={!!me?.admin}
                open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)}
                onReply={() => { setReply(m); setOpenId(null); taRef.current?.focus(); }}
                onDelete={() => act(m, "delete")} onReport={() => act(m, "report")} onMute={() => act(m, "mute")} onMod={(a) => mod(m, a)} />
            ))}
            {pending.map((p) => (
              <li key={p.client_id} className={`lk-msg mine pending ${p.state}`}>
                <div className="lk-meta"><b className="lk-nick">{nickNow ?? ""}</b><span className="lk-pstate">{p.state === "sending" ? x.sending : x.failed}</span></div>
                <p className="lk-body">{p.body}</p>
                {p.state === "failed" && (
                  <div className="lk-acts"><span className="lk-err">{p.error}</span>
                    <button onClick={() => doSend(p)}>{x.retry}</button>
                    <button onClick={() => { setPending((ps) => ps.filter((q) => q.client_id !== p.client_id)); if (!draft) setDraft(p.body); }}>{x.remove}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        {newCount > 0 && <button className="lk-new" onClick={toBottom}>{x.newMsgs}</button>}
      </div>

      {toast && <p className="lk-toast" role="status">{toast}</p>}
      {muted.size > 0 && <button className="lk-unmute" onClick={() => [...muted].forEach((u) => setMuted(u, false))}>{x.unmute} ({muted.size})</button>}

      <footer className="lk-compose">
        {note ? <p className="lk-note">{note}</p>
          : !session ? <Login x={x} next={next} />
          : !me ? <p className="muted pad">{x.loading}</p>
          : !me.nick ? <NickForm x={x} onDone={reload} />
          : banned ? <p className="lk-note">{banned}</p>
          : (
            <form onSubmit={submit}>
              {reply && (
                <div className="lk-replying"><span>{x.replyingTo} <b>{reply.nick}</b>: {reply.body?.slice(0, 60)}</span><button type="button" onClick={() => setReply(null)}>{x.cancel}</button></div>
              )}
              <div className="lk-row">
                <textarea ref={taRef} rows={1} value={draft} placeholder={x.placeholder} aria-label={x.placeholder} maxLength={LK_MAX + 50}
                  onChange={(e) => { setDraft(e.target.value); if (inputErr) setInputErr(""); }}
                  onFocus={() => setTyping(true)} onBlur={() => setTimeout(() => { if (document.activeElement !== taRef.current) setTyping(false); }, 150)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
                <button className="btn sm lk-send" disabled={!draft.trim() || len > LK_MAX}>{x.send}</button>
              </div>
              <div className="lk-under">
                {inputErr ? <span className="lk-err" role="alert">{inputErr}</span> : <span className="muted">{x.signedAs} <b>{me.nick}</b> · <button type="button" className="lk-link" onClick={() => { signOut(); saveSession(null); }}>{x.signOut}</button></span>}
                <span className={`lk-count${len > LK_MAX ? " over" : ""}`}>{len}/{LK_MAX}</span>
              </div>
            </form>
          )}
      </footer>
    </section>
  );
}
