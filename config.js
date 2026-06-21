// ============================================================
//  Konfigurasjon for Bergen Parkering API
//  Fyll inn token og tokenkey du har fått fra Bergen Parkering.
// ============================================================
window.PARKING_CONFIG = {
  // Base-URL: peker på din egen proxy (server.py), ikke direkte på API-et.
  // Da unngår du CORS, og tokenene ligger trygt server-side i secrets.json.
  baseUrl: "/api",

  // Tokenene er flyttet til secrets.json (leses av server.py).
  // De er ikke lenger nødvendige i frontend, men feltene beholdes tomme
  // slik at app.js fungerer uendret.
  token: "",
  tokenKey: "",

  // Oppdateringsintervall i sekunder
  refreshInterval: 60,

  // Terskler for fargekoding (andel ledige plasser)
  //   >= greenThreshold  -> grønn (god plass)
  //   >  redThreshold    -> gul   (få plasser)
  //   <= redThreshold    -> rød   (fullt / nesten fullt)
  greenThreshold: 0.30, // 30 % eller mer ledig
  redThreshold: 0.05,   // 5 % eller mindre ledig

  // Hvis API-et ikke kan nås (f.eks. manglende nøkler eller CORS),
  // vis demo-data slik at du kan se hvordan appen ser ut.
  useDemoFallback: true,

  // Overstyr visningsnavn på enkelthus. Nøkkel = navnet API-et bruker,
  // verdi = navnet som skal vises på kortet.
  nameOverrides: {
    "EdvardGarasjen, Bergen": "GriegGarasjen",
  },

  // Total kapasitet per hus (API-et oppgir ikke dette selv). Brukes til å
  // regne korrekt fyllingsgrad i progress-ringen. Nøkkel = navnet API-et bruker.
  capacities: {
    "ByGarasjen, Bergen": 2205,
    "KlosterGarasjen, Bergen": 940,
    "EdvardGarasjen, Bergen": 413, // vises som GriegGarasjen
  },

  // Veibeskrivelse-lenker per hus (valgfritt). Hvis et hus ikke står her,
  // genereres en Google Maps-rute automatisk fra navnet. For mer presis
  // navigering kan du lime inn en egen lenke, f.eks. med koordinater:
  //   "https://www.google.com/maps/dir/?api=1&destination=60.3895,5.3320"
  directions: {
    // Fjøsangerveien 4, 5008 Bergen
    "ByGarasjen, Bergen": "https://www.google.com/maps/dir/?api=1&destination=Fj%C3%B8sangerveien%204%2C%205008%20Bergen",
    // Vestre Murallmenningen 14, 5011 Bergen
    "KlosterGarasjen, Bergen": "https://www.google.com/maps/dir/?api=1&destination=Vestre%20Murallmenningen%2014%2C%205011%20Bergen",
    // Lars Hilles gate 3, 5015 Bergen (vises som GriegGarasjen)
    "EdvardGarasjen, Bergen": "https://www.google.com/maps/dir/?api=1&destination=Lars%20Hilles%20gate%203%2C%205015%20Bergen",
  },
};
