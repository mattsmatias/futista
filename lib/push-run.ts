// Ilmoitusten lähetyskierros (puhdas logiikka; varasto ja lähettäjä annetaan → testattavissa simuloiduilla).
//  - Kaksoislähetyksen esto: jokainen asia VARATAAN ensin (push_sent, ON CONFLICT DO NOTHING RETURNING).
//    Vain tämän ajon varaamat asiat lähetetään, joten rinnakkaiset tai uudelleenajetut ajastukset eivät
//    lähetä samaa ilmoitusta uudelleen. Jos varaus epäonnistuu, mitään ei lähetetä.
//  - Ensimmäisellä ajolla nykyiset asiat vain merkitään nähdyiksi (ei vanhoja ilmoituksia).
//  - Enintään `max` ilmoitusta per tilaus ja ajo; loput merkitään nähdyiksi (ei ryöppyä myöhemmin).
//  - Vanhentunut tilaus (404/410 Push-palvelulta) poistetaan.

export type StoredSub = { endpoint: string; p256dh: string; auth: string; teams: string[]; lang: string };
export type Payload = { title: string; body: string; url: string; tag: string; lang?: string };
export type Lang = "fi" | "sv" | "en";
export type PushItem = { key: string; teamsMatch: (team: string) => boolean; payload: (lang: Lang, team: string) => Payload };
export type SendResult = "ok" | "gone" | "error";

export interface PushStore {
  anythingSentEver(): Promise<boolean>;
  /** Varaa avaimet; palauttaa ne, jotka TÄMÄ kutsu varasi (eivät olleet ennestään varattuja) */
  claim(keys: string[]): Promise<Set<string>>;
  subscriptions(): Promise<StoredSub[]>;
  remove(endpoint: string): Promise<void>;
}

export async function runPushCheck(items: PushItem[], store: PushStore, send: (s: StoredSub, p: Payload) => Promise<SendResult>, max = 5) {
  if (!items.length) return { firstRun: false, claimed: 0, delivered: 0, removed: 0, failed: 0 };
  if (!(await store.anythingSentEver())) {
    const c = await store.claim(items.map((i) => i.key));
    return { firstRun: true, claimed: c.size, delivered: 0, removed: 0, failed: 0 };
  }
  const claimed = await store.claim(items.map((i) => i.key));
  const fresh = items.filter((i) => claimed.has(i.key));
  if (!fresh.length) return { firstRun: false, claimed: 0, delivered: 0, removed: 0, failed: 0 };
  const subs = await store.subscriptions();
  const dead = new Set<string>();
  let delivered = 0, failed = 0;
  await Promise.all(subs.map(async (sub) => {
    const lang = (["fi", "sv", "en"].includes(sub.lang) ? sub.lang : "fi") as Lang;
    const mine = fresh
      .map((item) => ({ item, team: sub.teams.find((t) => item.teamsMatch(t)) }))
      .filter((x): x is { item: PushItem; team: string } => !!x.team)
      .slice(0, max);
    for (const { item, team } of mine) {
      const r = await send(sub, { ...item.payload(lang, team), lang });
      if (r === "gone") { dead.add(sub.endpoint); break; }
      if (r === "ok") delivered++; else failed++;
    }
  }));
  await Promise.all([...dead].map((e) => store.remove(e)));
  return { firstRun: false, claimed: fresh.length, delivered, removed: dead.size, failed };
}
