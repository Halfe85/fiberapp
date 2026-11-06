# Fiberapp

Fiberapp inneholder **Fiberfinder** og **Fiber Planner**.

## Fiber Planner

Prosjektlisten lar deg opprette og redigere prosjekter med navn og valgfri
beskrivelse. **Postnummer er ikke påkrevd og er fjernet fra prosjektformen**.
Eksisterende prosjekter fungerer fortsatt; det tidligere postnummerfeltet
fjernes fra det aktuelle prosjektet når du redigerer og lagrer.

Når du velger et prosjekt, åpnes et **fullskjerms prosjektkart**:
`planner/map.html?project=<project-id>`. Kartet bruker Kartverkets WMTS,
med et flytende søkefelt øverst til høyre. Søkefunksjonen bruker Kartverkets
åpne Adresse REST-API, med opptil 40 treff og en resultatliste der maksimalt
seks rader vises samtidig. Ved valg av adresse zoomes kartet til det
offisielle adressepunktet og viser en rød kartnål med popup.

Prosjektinnstillingene åpnes fra verktøydøren på høyre side av
prosjektraden. På mobil lukkes døren automatisk etter tre sekunder.
Du kan fremdeles slette prosjekter med bekreftelse.

Prosjekter lagres under `fiberapp.planner.projects.v1` i lokal
`localStorage`. Søkeresultater og kartnålen lagres **ikke** som
prosjektadresser i denne første versjonen; de er kun navigasjon på kartet.
Ingen backend eller brukerkonto er opprettet.

Kartet er en felles statisk frontend-modul for GitHub Pages og Angular.
`angular.json` kopierer kartfilene som assets ved lokal Angular-kjøring
og manuell produksjonsbygging.

## Utvikling

Node.js 22.12+:

```bash
npm install
npm start
```

`npm test` kjører tilgjengelige tester.

Offentlig Planner: https://halfe85.github.io/fiberapp/planner/

## Publisering uten GitHub Actions

Prosjektet bruker GitHub Pages fra `main`.
Angular kan bygges manuelt med `npm run build:pages`.
Ingen GitHub Actions-workflows benyttes.


## Kartklikk og søk etter bruksenheter

På prosjektkartet kan du klikke på et punkt. Kartverkets `/adresser/v1/punktsok`
returnerer nærmeste offisielle adresse innen 55 meter, som vises i en liten
Leaflet-popup. `+` øverst til høyre åpner den **skrivebeskyttede**
modalkomponenten i `src/components/modals/searchaddressunits-modal/`.

Modalen forsøker først `/eiendom/v1/punkt` med koordinatene fra
kartklikket for å identifisere matrikkelenheter. Deretter spørres
`/adresser/v1/sok` med kommunenummer, gårdsnummer og bruksnummer.
Treffene grupperes etter adresse, nummer og bokstav og sorteres. Når en
adresse har flere registrerte bruksenhetsnumre, åpner `+` en innrykket
liste med leilighetsnummer og etasje.

Dersom eiendomsoppslaget ikke kan bekrefte hvilken matrikkelenhet punktet
tilhører, vises kun **nærliggende** adresser, med en tydelig merknad om at
tomtetilknytningen ikke er bekreftet. Adresse-API-et oppgir
bruksenhetsnummer, men ikke godkjenningsstatus eller bruksenhetstype.
Ingen eierdata hentes. Ingen adresser eller boenheter lagres i dette steget.

Kartnålen fra tekstsøket er et symmetrisk rødt SVG-symbol, ikke den
tidligere CSS-roterte figuren.
