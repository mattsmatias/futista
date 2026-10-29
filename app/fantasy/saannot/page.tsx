import { RULES, POINTS, PRICE } from "@/lib/fantasy-core";
import { DEFAULT_COMP, compLeagues } from "@/lib/fantasy-sync";
import { rpc } from "@/lib/fantasy-db";
import { bandText, type PackType } from "@/lib/fantasy-packs-core";

type PackV = PackType & { base_version?: string; elite_permille?: number };
type CoinRules = { start: number; participation: number; per_point: number; cap: number; invite: number; invite_daily: number };
/** Kolikkosäännöt ja pakat tietokannasta (sama lähde kuin palkinnoilla); migraatio puuttuu tai häiriö → osio piiloon */
const pct = (pm: number) => `${(pm / 10).toLocaleString("fi-FI")} %`;
async function coinInfo(): Promise<{ rules: CoinRules; packs: PackV[] } | null> {
  try {
    const [w, packs] = await Promise.all([rpc<{ rules: CoinRules | null }>("f_wallet", { p_user: 0 }), rpc<PackType[]>("f_pack_types_v2", { p_comp: DEFAULT_COMP.id })]);
    return w?.rules ? { rules: w.rules, packs: packs ?? [] } : null;
  } catch { return null; }
}

// kilpailu ympäristön mukaan (FANTASY_COMP) → renderöidään pyynnöstä, ei käännösvaiheessa
export const dynamic = "force-dynamic";

// Säännöt suoraan pelin vakioista (sama lähde kuin palvelimen tarkistuksilla ja pisteytyksellä)
const m = (n: number) => `${n.toFixed(1).replace(".", ",")} M kolikkoa`;

export default async function Page() {
  const coins = await coinInfo();
  const weekly = !!DEFAULT_COMP.anchor;
  const leagues = compLeagues(DEFAULT_COMP).map((l) => l.name);
  return (
    <article className="panel fx-rules">
      <div className="panel-head"><h2>Säännöt – {DEFAULT_COMP.name}</h2></div>
      <div className="pad legal">
        <section>
          <h3>Joukkue</h3>
          <ul>
            {weekly && <li>Pelaajia voi valita näistä sarjoista: {leagues.join(", ")}. Kaikki pelaavat samaa peliä ja ovat samassa Futista-liigassa.</li>}
            <li>{RULES.squadSize} pelaajaa: {RULES.quota.GK} maalivahtia, {RULES.quota.DEF} puolustajaa, {RULES.quota.MID} keskikenttäpelaajaa ja {RULES.quota.FWD} hyökkääjää.</li>
            <li>Budjetti {m(RULES.budget)} pelin sisäistä valuuttaa. Oikeat rahasummat eivät liity peliin.</li>
            <li>Enintään {RULES.clubMax} pelaajaa samasta seurasta.</li>
            <li>Avauskokoonpanossa 11 pelaajaa: 1 maalivahti, vähintään {RULES.xiMin.DEF} puolustajaa, {RULES.xiMin.MID} keskikenttäpelaajaa ja {RULES.xiMin.FWD} hyökkääjä. Penkillä 4 pelaajaa järjestyksessä; ensimmäinen on vaihtomaalivahti.</li>
            <li>Valitse kapteeni ja varakapteeni avauskokoonpanosta.</li>
            <li>Paina pelaajaa: tiedot, kapteeni, vaihto penkin ja avauksen välillä tai siirto.</li>
            <li>Pidä pelaajakorttia pohjassa ja vedä se toisen kortin päälle: saman pelipaikan pelaajat vaihtavat paikkaa avauksen ja penkin välillä tai avauksen sisällä (maalivahti maalivahdin, puolustaja puolustajan jne.). Penkin järjestystä voi muuttaa vetämällä; ensimmäinen vaihtopaikka on aina vaihtomaalivahdin.</li>
            <li>Pelaajien pelipaikat perustuvat otteluiden kokoonpanotietoihin ja pysyvät joukkueessa samana koko kierroksen.</li>
            <li>Kentän korteissa näkyy valinnan mukaan kierroksen pisteet, seuraavan kierroksen vastustaja – (k) kotiottelu, (v) vierasottelu – tai pelaajan hinta.</li>
            <li>Loukkaantumis- ja pelikieltotietoja ei vielä näytetä.</li>
            <li>Joukkueen logo kootaan valmiista osista (muoto, kuvio, värit, symboli ja teksti). Kuvia ei ladata, eikä seurojen logoja voi käyttää. Logo näkyy joukkueen sivulla ja liigojen taulukoissa.</li>
          </ul>
        </section>
        <section>
          <h3>Kierrokset ja määräajat</h3>
          <ul>
            {weekly
              ? <li>Kierros on viikko perjantaista torstaihin (Suomen aikaa): kierrokseen kuuluvat kaikkien sarjojen viikonlopun ottelut ja niitä seuraavat viikon keskiviikko-ottelut. Jos pelaajan joukkue pelaa viikolla kahdesti, molemmat ottelut lasketaan. Viikot, joilla ei pelata (maaotteluviikot), eivät ole kierroksia. Muutokset sulkeutuvat {RULES.deadlineMinutes} minuuttia ennen viikon ensimmäistä ottelua missä tahansa sarjassa (määräaika näkyy omassa aikavyöhykkeessäsi).</li>
              : <li>Kierrokset ovat sarjan omat kierrokset. Muutokset sulkeutuvat {RULES.deadlineMinutes} minuuttia ennen kierroksen ensimmäistä ottelua (määräaika näkyy omassa aikavyöhykkeessäsi).</li>}
            <li>Määräajan tarkistaa palvelin. Määräajalla joukkueesta tallennetaan muuttumaton tilannekuva, jonka perusteella kierros pisteytetään.</li>
            <li>Määräajan jälkeen tehdyt muutokset koskevat seuraavaa kierrosta.</li>
            <li>Siirretty ottelu kuuluu edelleen alkuperäiseen kierrokseensa: sen pisteet lasketaan kyseisen kierroksen tilannekuvalla, kun ottelu pelataan. Kierroksen pisteet ovat alustavia siihen asti. Peruttu ottelu ei anna pisteitä.</li>
            <li>Kesken kauden liittyvä aloittaa kierroksesta, jonka määräaikaan ehtii. Aiemmilta kierroksilta ei saa pisteitä.</li>
            <li>Pisteet lasketaan palvelimella otteluiden tilastoista. Jos ottelun tiedot korjautuvat jälkikäteen (4 vuorokauden ajan ottelusta), pisteet ja sijoitukset lasketaan uudelleen.</li>
          </ul>
        </section>
        <section>
          <h3>Pisteet</h3>
          <ul>
            <li>Pelasi alle 60 minuuttia: {POINTS.appearance} p. Vähintään 60 minuuttia: {POINTS.appearance60} p.</li>
            <li>Maali: hyökkääjä {POINTS.goal.FWD} p, keskikenttäpelaaja {POINTS.goal.MID} p, puolustaja tai maalivahti {POINTS.goal.DEF} p. Oma maali ei ole maali.</li>
            <li>Maalisyöttö: {POINTS.assist} p.</li>
            <li>Nollapeli (maalivahti ja puolustaja): {POINTS.cleanSheet} p, kun pelaaja pelasi vähintään 60 minuuttia eikä joukkue päästänyt maalia hänen kentälläoloaikanaan. Jos lähteen tiedoista ei voida varmistaa tätä (esim. tapahtumat eivät täsmää lopputulokseen tai maali ja vaihto samalla minuutilla), nollapelipisteitä ei anneta.</li>
            <li>Maalivahdin torjunnat: {POINTS.saves} p jokaisesta {POINTS.savesPer} torjunnasta.</li>
            <li>Keltainen kortti {POINTS.yellow} p. Punainen kortti {POINTS.red} p – myös toisesta keltaisesta. Kun pelaaja saa punaisen, saman ottelun keltaisia ei lasketa erikseen (enintään {POINTS.red} p korteista).</li>
            <li>Kapteenin pisteet kaksinkertaistetaan. Jos kapteeni ei pelaa minuuttiakaan, kerroin siirtyy varakapteenille; jos kumpikaan ei pelaa, kerrointa ei saa kukaan.</li>
          </ul>
        </section>
        <section>
          <h3>Automaattiset vaihdot</h3>
          <ul>
            <li>Kun kierroksen kaikki ottelut ovat valmiit, avauspelaaja ilman peliminuutteja korvataan penkiltä järjestyksessä ensimmäisellä pelanneella pelaajalla, jonka vaihto pitää muodostelman sääntöjen mukaisena.</li>
            <li>Maalivahdin voi korvata vain vaihtomaalivahti. Jos sopivaa vaihtopelaajaa ei ole, paikka jää pisteittä.</li>
            <li>Ennen sitä pisteet näytetään alustavina ilman automaattisia vaihtoja.</li>
          </ul>
        </section>
        <section>
          <h3>Siirrot</h3>
          <ul>
            <li>Ennen joukkueen ensimmäistä lukitusta joukkueen voi rakentaa vapaasti.</li>
            <li>Sen jälkeen saat 1 ilmaisen siirron kierrosta kohden. Käyttämätön ilmainen siirto siirtyy seuraavalle kierrokselle; enintään {RULES.freeTransfersMax} ilmaista siirtoa voi olla käytettävissä.</li>
            <li>Jokainen ylimääräinen siirto vähentää {RULES.hitCost} pistettä kyseisen kierroksen pisteistä. Siirto = pelaaja, joka ei ollut edellisen kierroksen joukkueessa; saman kierroksen aikana peruttu muutos ei ole siirto.</li>
            <li>Siirrot eivät saa rikkoa budjettia, pelipaikkajakoa tai seurarajaa. Näet siirrot, pistevähennyksen ja budjetin ennen vahvistusta.</li>
            <li>Siirrot-näkymässä paina pelaajaa: kapteeni, varakapteeni, vaihto penkin ja avauksen välillä, penkkijärjestys tai poisto.</li>
          </ul>
        </section>
        <section>
          <h3>Hinnat</h3>
          <ul>
            <li>Hinnat eivät ole pelaajien markkina-arvoja. Uuden pelaajan hinta lasketaan kerran kuluvan kauden sarjatilastoista samalla pisteytyksellä (pisteet joukkueen pelattua kierrosta kohden), 0,5 M€ portain pelipaikan rajoissa: maalivahti {m(PRICE.min.GK)}–{m(PRICE.max.GK)}, puolustaja {m(PRICE.min.DEF)}–{m(PRICE.max.DEF)}, keskikenttäpelaaja {m(PRICE.min.MID)}–{m(PRICE.max.MID)}, hyökkääjä {m(PRICE.min.FWD)}–{m(PRICE.max.FWD)}. Pelaaja ilman sarjaotteluita saa alarajan hinnan.</li>
            <li>Hinnat pysyvät samoina koko kauden, ellei ylläpito tee perusteltua korjausta.</li>
          </ul>
        </section>
        <section>
          <h3>Futista-liiga</h3>
          <ul>
            <li>Liiga on avoin ja sama kaikille: jokainen tallennettu joukkue on mukana automaattisesti. Sijoitus lasketaan kauden kokonaispisteistä.</li>
            <li>Tasapisteissä joukkueet jakavat saman sijan (1, 2, 2, 4). Tasapisteissä aiemmin perustettu joukkue näytetään ensin.</li>
            <li>Kaveriliigaan liitytään koodilla tai kutsulinkillä. Koodi näkyy vain liigan jäsenille. Perustaja voi vaihtaa koodin, jolloin vanha koodi ja linkki lakkaavat toimimasta. Kun perustaja poistuu, oikeudet siirtyvät pisimpään mukana olleelle jäsenelle; ainoan jäsenen poistuessa liiga poistetaan.</li>
            <li>Kutsulinkillä kaveri pääsee suoraan luomaan joukkueen, ja näette toistenne pisteet Futista-liigassa.</li>
          </ul>
        </section>
        {coins && (
          <section>
            <h3>Futista-kolikot ja pakat</h3>
            <ul>
              <li>Futista-kolikot ovat pelin sisäistä valuuttaa pelaajapakkojen avaamiseen. Niitä ansaitaan vain pelaamalla: niitä ei voi ostaa eikä vaihtaa rahaksi. Ne ovat eri asia kuin joukkueen budjetti ja fantasy-pisteet.</li>
              <li>Ensimmäisen joukkueen tallentamisesta saa {coins.rules.start} kolikkoa (kerran).</li>
              <li>Jokaisesta päättyneestä kierroksesta, jolle joukkue oli tallennettu ajoissa (määräajalla otettu tilannekuva), saa {coins.rules.participation} kolikkoa ja lisäksi {coins.rules.per_point} kolikon jokaisesta kierroksen fantasy-pisteestä siirtovähennysten jälkeen, enintään {coins.rules.cap} kolikkoa. Miinuspisteet eivät vähennä palkintoa.</li>
              <li>Kierrospalkinto maksetaan, kun kierroksen pisteet ovat lopulliset. Jos pisteitä korjataan myöhemmin, erotus lisätään tai peritään takaisin. Takaisin peritään enintään saldon verran; jo käytettyjä kolikoita ei peritä.</li>
              <li>Kun kaveri luo tilin kutsulinkilläsi, saat {coins.rules.invite} kolikkoa (enintään {coins.rules.invite_daily} palkittua kutsua vuorokaudessa).</li>
              {coins.packs.map((p) => <li key={p.id}>{p.name}: {p.price} kolikkoa, {p.cards} pelaajakorttia, pelaajat joiden fantasyhinta on {bandText(p)}. Jokainen kortti on {p.base_version === "gold" ? "Gold" : "Silver"}-versio{p.elite_permille ? ` (${pct(1000 - p.elite_permille)}) tai Elite-versio (${pct(p.elite_permille)})` : ""}.</li>)}
              <li>Pakan jokainen kortti arvotaan palvelimella erikseen hintaluokan kaikista aktiivisista pelaajista. Kaikilla hintaluokan pelaajilla on sama todennäköisyys, joten samaan pakkaan voi tulla sama pelaaja useammin kuin kerran tai pelaaja, joka sinulla jo on (kaksoiskappale). Tarkat todennäköisyydet näkyvät ennen avausta.</li>
              <li>Korttiversiot: Perus (kaikille pelaajille ilman pakkaa), Silver, Gold ja harvinainen Elite. Pelaajan ja korttiversion arvonta ovat toisistaan erillään, joten myös edullisemmasta pelaajasta voi saada Elite-kortin. Saman pelaajan sama versio kasvattaa kappalemäärää; eri versio tallentuu omana korttinaan.</li>
              <li>Oman joukkueen pelaajalle voi valita kentälle peruskortin tai minkä tahansa omistamansa korttiversion: paina pelaajaa ja valitse Vaihda korttityyliä. Korttityyli ei muuta pelaajan hintaa, pisteitä, budjettia, siirtoja eikä sijoitusta. Kortit säilyvät kokoelmassa, vaikka pelaaja poistuisi joukkueesta.</li>
              <li>Kortit ovat keräilyä varten. Ne eivät anna etua fantasy-pisteissä tai rankingissa, ja joukkueeseen voi valita kenet tahansa omistamatta hänen korttiaan.</li>
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}
