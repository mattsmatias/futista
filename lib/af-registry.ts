// API-Footballista tulevien kilpailujen rekisteri (yksi tietue / kilpailu). Ks. docs/af-kilpailut.md.
//  - id: Futistan pysyvä tunniste (osoite /sarjat/<id>); af: API-Footballin league-id (varmennettu oikeasta API:sta 24.10.2026)
//  - Kausi EI ole tässä: se valitaan API:n omasta kausitiedosta (current), koska kalenterivuoden sarjat, syksy–kevät-sarjat
//    ja turnaukset vaihtavat kautta eri aikaan.
//  - data: mitä näytetään. Perustuu oikeisiin vastauksiin, ei pelkkään API:n coverage-tietoon (esim. Ykkösliigan
//    maalintekijälista on puutteellinen, vaikka API ilmoittaa sen tuetuksi → scorers: false).
//  - Pois käytöstä: AF_COMPS_OFF=id,id (rakennusaikainen, ks. next.config.js) tai koko lähde APIFOOTBALL_OFF=1.
// Tätä tiedostoa käytetään myös selaimessa: ei salaisuuksia eikä palvelinkoodia.

export type AfGroup = "fi" | "nt" | "cups" | "nordic" | "women";
export type AfKind = "league" | "cup" | "tournament";
export type AfCountry = "fi" | "en" | "es" | "de" | "it" | "fr" | "se" | "no" | "dk" | "eu" | "world";

export type AfComp = {
  id: string; af: number;
  name: readonly [string, string, string]; // fi, sv, en
  country: AfCountry; gender: "m" | "w"; kind: AfKind;
  groups: readonly AfGroup[]; // Kaikki kilpailut -näkymän ryhmät (sama kilpailu voi näkyä useassa ryhmässä, tietue on yksi)
  data: { standings: boolean; scorers: boolean };
  mark: string;
};

export const AF_COMPS = [
  // Vaihe A – Suomi
  { id: "veikkausliiga", af: 244, name: ["Veikkausliiga", "Veikkausliiga", "Veikkausliiga"], country: "fi", gender: "m", kind: "league", groups: ["fi"], data: { standings: true, scorers: true }, mark: "VL" },
  { id: "ykkosliiga", af: 1087, name: ["Ykkösliiga", "Ykkösliiga", "Ykkösliiga"], country: "fi", gender: "m", kind: "league", groups: ["fi"], data: { standings: true, scorers: false }, mark: "YL" },
  { id: "suomencup", af: 246, name: ["Suomen Cup", "Finska cupen", "Finnish Cup"], country: "fi", gender: "m", kind: "cup", groups: ["fi", "cups"], data: { standings: false, scorers: false }, mark: "SC" },
  { id: "kansallinenliiga", af: 640, name: ["Kansallinen Liiga", "Kansallinen Liiga (dam)", "Kansallinen Liiga (women)"], country: "fi", gender: "w", kind: "league", groups: ["fi", "women"], data: { standings: true, scorers: false }, mark: "KL" },
  // Vaihe B – maajoukkueet
  { id: "mmkisat", af: 1, name: ["MM-kisat", "VM", "World Cup"], country: "world", gender: "m", kind: "tournament", groups: ["nt"], data: { standings: true, scorers: true }, mark: "MM" },
  { id: "emkisat", af: 4, name: ["EM-kisat", "EM", "Euro"], country: "eu", gender: "m", kind: "tournament", groups: ["nt"], data: { standings: true, scorers: true }, mark: "EM" },
  { id: "kansojenliiga", af: 5, name: ["Kansojen liiga", "Nations League", "Nations League"], country: "eu", gender: "m", kind: "tournament", groups: ["nt"], data: { standings: true, scorers: true }, mark: "NL" },
  { id: "mmkarsinnat", af: 32, name: ["MM-karsinnat (Eurooppa)", "VM-kval (Europa)", "World Cup qualifiers (Europe)"], country: "eu", gender: "m", kind: "tournament", groups: ["nt"], data: { standings: true, scorers: true }, mark: "MMK" },
  // Vaihe C – Euroopan cupit (Eurooppa-liiga ja Konferenssiliiga ovat jo käytössä ESPN:stä: ei kaksoiskappaleita)
  { id: "facup", af: 45, name: ["FA Cup", "FA-cupen", "FA Cup"], country: "en", gender: "m", kind: "cup", groups: ["cups"], data: { standings: false, scorers: false }, mark: "FA" },
  { id: "liigacup", af: 48, name: ["Liigacup (Englanti)", "Ligacupen (England)", "EFL Cup"], country: "en", gender: "m", kind: "cup", groups: ["cups"], data: { standings: false, scorers: true }, mark: "LC" },
  { id: "copadelrey", af: 143, name: ["Copa del Rey", "Copa del Rey", "Copa del Rey"], country: "es", gender: "m", kind: "cup", groups: ["cups"], data: { standings: false, scorers: false }, mark: "CdR" },
  { id: "dfbpokal", af: 81, name: ["DFB-Pokal", "DFB-Pokal", "DFB-Pokal"], country: "de", gender: "m", kind: "cup", groups: ["cups"], data: { standings: false, scorers: true }, mark: "DFB" },
  { id: "coppaitalia", af: 137, name: ["Coppa Italia", "Coppa Italia", "Coppa Italia"], country: "it", gender: "m", kind: "cup", groups: ["cups"], data: { standings: false, scorers: true }, mark: "CI" },
  { id: "coupedefrance", af: 66, name: ["Coupe de France", "Coupe de France", "Coupe de France"], country: "fr", gender: "m", kind: "cup", groups: ["cups"], data: { standings: false, scorers: true }, mark: "CdF" },
  // Vaihe D – naiset
  { id: "wsl", af: 44, name: ["Women's Super League", "Women's Super League", "Women's Super League"], country: "en", gender: "w", kind: "league", groups: ["women"], data: { standings: true, scorers: true }, mark: "WSL" },
  { id: "naistenmli", af: 525, name: ["Naisten Mestarien liiga", "Champions League (dam)", "Women's Champions League"], country: "eu", gender: "w", kind: "tournament", groups: ["women"], data: { standings: true, scorers: false }, mark: "NMLI" },
  // Vaihe E – Pohjoismaat
  { id: "allsvenskan", af: 113, name: ["Allsvenskan", "Allsvenskan", "Allsvenskan"], country: "se", gender: "m", kind: "league", groups: ["nordic"], data: { standings: true, scorers: true }, mark: "AS" },
  { id: "eliteserien", af: 103, name: ["Eliteserien", "Eliteserien", "Eliteserien"], country: "no", gender: "m", kind: "league", groups: ["nordic"], data: { standings: true, scorers: true }, mark: "ES" },
  { id: "superligadk", af: 119, name: ["Superliga", "Superligaen", "Danish Superliga"], country: "dk", gender: "m", kind: "league", groups: ["nordic"], data: { standings: true, scorers: true }, mark: "SL" },
] as const satisfies readonly AfComp[];

export type AfId = (typeof AF_COMPS)[number]["id"];

/** Pois kytketyt kilpailut (rakennusaikaiset arvot, sama palvelimella ja selaimessa; next.config.js env) */
const offList = () => (process.env.NEXT_PUBLIC_AF_COMPS_OFF ?? "").split(",").map((x) => x.trim()).filter(Boolean);
export const afSourceOn = () => process.env.NEXT_PUBLIC_AF_ON === "1";
export const afCompOn = (id: string) => afSourceOn() && !offList().includes(id);
export const afComp = (id: string): AfComp | undefined => AF_COMPS.find((c) => c.id === id);
/** Käytössä olevat kilpailut rekisterin järjestyksessä */
export const activeAfComps = (): AfComp[] => AF_COMPS.filter((c) => afCompOn(c.id));
export const AF_GROUP_ORDER: AfGroup[] = ["fi", "nt", "cups", "nordic", "women"];
