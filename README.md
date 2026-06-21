# Parkering Bergen – ledige plasser i sanntid

Web-app (ren HTML/CSS/JS) som viser ledige parkeringsplasser i Bergen via Bergen
Parkering sitt API.

## Funksjoner
- Visuelle kort per parkeringshus
- Fargekoding: grønn (god plass) / gul (få plasser) / rød (fullt)
- Sirkulær progress-ring som viser hvor fullt huset er
- Ledige ladepunkter med ikon
- Pris per time og maks døgnpris
- Auto-oppdatering hvert 60. sekund med synlig nedtellingsring
- Sist oppdatert-tidspunkt
- Responsivt (mobil + desktop), Bergen Parkering-palett (blå/hvit)

## Kom i gang (med ekte sanntidsdata)
Appen kjøres via en liten innebygd proxy (`server.py`) som løser CORS og holder
tokenene server-side. Du trenger kun Python 3 – ingen installasjon av pakker.

1. Legg tokenene dine i `secrets.json`:
   ```json
   { "token": "ditt_13_tegns_token", "tokenKey": "din_22_tegns_tokenkey" }
   ```
   (Alternativt: sett miljøvariablene `PARKING_TOKEN` og `PARKING_TOKENKEY`.)
2. Start serveren:
   ```bash
   python3 server.py
   ```
3. Åpne **http://localhost:4321** i nettleseren.

`config.js` peker allerede på proxyen (`baseUrl: "/api"`), så ingenting mer
trengs. Vil du bruke en annen port: `PORT=8080 python3 server.py`.

## Hvorfor en proxy? (CORS)
API-et bruker HTTP Basic Auth, og **CORS kan du ikke skru av selv** – det styres
av Bergen Parkering sin server. To problemer oppstår hvis nettleseren kaller
API-et direkte:

1. **CORS** – API-et tillater ikke kall direkte fra en nettleser.
2. **Sikkerhet** – tokenene ville ligget synlig i frontend-koden.

`server.py` løser begge: nettleseren kaller `/api/freespaces` på *din egen*
server (samme opphav = ingen CORS), og serveren snakker med Bergen Parkering med
tokenene fra `secrets.json`.

> ⚠️ **Hold `secrets.json` privat** – ikke del/commit den. Legg den gjerne i
> `.gitignore`.

Hvis proxyen ikke er tilgjengelig (f.eks. om du åpner `index.html` som ren fil),
faller appen tilbake til **demo-data** (kan skrus av med `useDemoFallback: false`
i `config.js`).

## Sist kjente tall (cache ved degradert feed)
API-ets ledig-plass-feed er tidvis nede: da kommer `status` tilbake som `""`
(ikke `"OK"`) og alle hus rapporterer `NumFreeSpaces: 0`, mens ladepunkt- og
prisdata fortsatt er live. For å unngå villedende «0 ledige» gjør appen som den
offisielle nettsiden:

- Når feeden leverer **ekte tall**, lagres de per hus i `localStorage`
  (`pbergen_freecache_v1`) – disse overlever omlasting.
- Når feeden er **nede**, viser appen de **sist kjente gode tallene**, tydelig
  merket med «Sist kjent kl. HH:MM», stiplet kant og dempet progress-ring, og et
  banner som forklarer situasjonen.
- Et hus-tall regnes som pålitelig når hele svaret er `"OK"`, eller når huset
  rapporterer et tall > 0 (lekker gjennom selv ved degradert feed).

Merk: før feeden har levert ekte tall minst én gang finnes ingen historikk å
vise – da står ledige plasser på 0 med en forklarende melding.

## Om API-svaret
API-et returnerer husene som et objekt under `data`, nøklet på id:
```json
{ "updated": 1781277279848, "status": "",
  "data": { "bygarasjen": { "Name": "ByGarasjen, Bergen", "NumFreeSpaces": 0, ... } } }
```
`app.js` plukker ut `Object.values(data.data)` og bruker `updated` som
«sist oppdatert»-tidspunkt.

## Merk om kapasitet/progress
API-feltene inneholder antall ledige plasser, men ikke total kapasitet. Progress-
ringen beregnes derfor mot en kjent kapasitet hvis tilgjengelig (`_capacity`),
ellers anslås fyllingsgraden ut fra antall ledige plasser. Har du kapasitetstall
kan du mate dem inn for mer nøyaktig visning.
