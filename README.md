# Fiberapp

Fiberapp inneholder **Fiberfinder** og **Fiber Planner**.

## Fiber Planner – prosjektoversikt

Fiber Planner har nå bare prosjektlisten. Du kan opprette et prosjekt med navn,
postnummer og valgfri beskrivelse. Prosjekter vises sortert etter opprettelsesdato.
Verktøydøren helt til høyre åpner prosjektinnstillingene for redigering og sletting.
På mobil lukkes døren automatisk etter tre sekunder.

Alt etter prosjektoversikten er fjernet fra frontend og kildekoden:
prosjektdetaljer, adresser, boenheter, bygg-/tomtekart, 2D-byggvisninger,
utstyr, kabler, rørtraséer, rom, skap, ODF og SOSI-import.

Prosjektlisten lagres i nettleserens `localStorage` under
`fiberapp.planner.projects.v1`. Ingen backend er i bruk.

**Det er ikke opprettet backup.** Eldre detaljdata som allerede finnes i
nettleserens lokale lagring slettes ikke automatisk, men blir ikke brukt
av den nye prosjektoversikten.

## Utvikling

Node.js 22.12+:
```bash
npm install
npm start
```

`npm test` kjører gjenværende tester.

Den statiske prosjektoversikten ligger på
https://halfe85.github.io/fiberapp/planner/

## Publisering

GitHub Pages publiseres fra `main`. Angular kan bygges manuelt med
`npm run build:pages`. **Ingen GitHub Actions brukes.**
