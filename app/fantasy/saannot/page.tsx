import { RULES, POINTS, PRICE } from "@/lib/fantasy-core";
import { DEFAULT_COMP } from "@/lib/fantasy-sync";

// Säännöt suoraan pelin vakioista (sama lähde kuin palvelimen tarkistuksilla ja pisteytyksellä)
const m = (n: number) => `${n.toFixed(1).replace(".", ",")} M€`;

export default function Page() {
  return (
    <article className="panel fx-rules">
      <div className="panel-head"><h2>Säännöt – {DEFAULT_COMP.name}</h2></div>
      <div className="pad legal">
        <section>
          <h3>Joukkue</h3>
          <ul>
            <li>{RULES.squadSize} pelaajaa: {RULES.quota.GK} maalivahtia, {RULES.quota.DEF} puolustajaa, {RULES.quota.MID} keskikenttäpelaajaa ja {RULES.quota.FWD} hyökkääjää.</li>
            <li>Budjetti {m(RULES.budget)} pelin sisäistä valuuttaa. Oikeat rahasummat eivät liity peliin.</li>
            <li>Enintään {RULES.clubMax} pelaajaa samasta seurasta.</li>
            <li>Avauskokoonpanossa 11 pelaajaa: 1 maalivahti, vähintään {RULES.xiMin.DEF} puolustajaa, {RULES.xiMin.MID} keskikenttäpelaajaa ja {RULES.xiMin.FWD} hyökkääjä. Penkillä 4 pelaajaa järjestyksessä; ensimmäinen on vaihtomaalivahti.</li>
            <li>Valitse kapteeni ja varakapteeni avauskokoonpanosta.</li>
            <li>Pelipaikat tulevat lähteen (API-Football) kokoonpanotiedoista ja pysyvät joukkueessa samana koko kierroksen.</li>
          </ul>
        </section>
        <section>
          <h3>Kierrokset ja määräajat</h3>
          <ul>
            <li>Kierrokset ovat sarjan omat kierrokset. Muutokset sulkeutuvat {RULES.deadlineMinutes} minuuttia ennen kierroksen ensimmäistä ottelua (määräaika näkyy omassa aikavyöhykkeessäsi).</li>
            <li>Määräajan tarkistaa palvelin. Määräajalla joukkueesta tallennetaan muuttumaton tilannekuva, jonka perusteella kierros pisteytetään.</li>
            <li>Määräajan jälkeen tehdyt muutokset koskevat seuraavaa kierrosta.</li>
            <li>Siirretty ottelu kuuluu edelleen alkuperäiseen kierrokseensa: sen pisteet lasketaan kyseisen kierroksen tilannekuvalla, kun ottelu pelataan. Kierroksen pisteet ovat alustavia siihen asti. Peruttu ottelu ei anna pisteitä.</li>
            <li>Kesken kauden liittyvä aloittaa kierroksesta, jonka määräaikaan ehtii. Aiemmilta kierroksilta ei saa pisteitä.</li>
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
          </ul>
        </section>
        <section>
          <h3>Data</h3>
          <p>Ottelut, pelaajat ja tapahtumat: API-Football. Pisteet lasketaan palvelimella tallennetusta otteludatasta. Jos lähde korjaa tietoja jälkikäteen (4 vuorokauden ajan ottelusta), pisteet ja sijoitukset lasketaan uudelleen. Saatavuustietoja (loukkaantumiset, pelikiellot) ei vielä näytetä.</p>
        </section>
      </div>
    </article>
  );
}
