# Fiberapp

Mobile-first two-tool Angular application:

- **Fiberfinder** – converted from the original static Fiberfinder; 22 color-code sequences, tube/fiber calculations, multiple-fiber lookup, retained settings.
- **Fiber Planner (current public prototype)** – full-width project list and project creation using the + icon in the header. Project records are currently stored in localStorage. SQLite code remains in the repository but is not used yet.

## Branches

| Branch | Purpose |
|---|---|
| `Fiberfinder-backup` | Untouched original before conversion |
| `Fiberfinder-angular` | Standalone Angular conversion of original Fiberfinder |
| `Fiberplaner-angular` | Standalone Angular Fiber Planner and SQLite implementation |
| `main` | Combined Angular application with a homepage containing two tiles |

## Development

Node.js 22.12+ (or a compatible Node.js version) required.

```bash
npm install
npm start
```

Angular hash routes: `/#/`, `/#/finder`, `/#/planner`.

## GitHub Pages without GitHub Actions

1. On your development machine, run `npm install` once and then `npm run build:pages`.
2. Commit the generated `index.html`, hashed JS/CSS bundles, and `assets/` folder to `main`, along with the Angular source changes.
3. In GitHub **Settings → Pages**, choose **Deploy from a branch**, `main`, `/ (root)`.
4. Pages serves the precompiled Angular app with no GitHub Actions workflow. Repeat manual build for future releases.

There are no `.github/workflows` in any branch. `index.html` currently contains a responsive **static launch fallback**, and `finder/index.html` temporarily serves the pre-conversion Finder logic while the first manual Angular build remains unavailable. `planner/index.html` implements the project creation and listing prototype directly on GitHub Pages. The compiled Angular application will replace the root fallback on deployment.

### Important limits

- The current Planner project prototype stores data under `fiberapp.planner.projects.v1` in browser `localStorage`. It does not yet use SQLite, and data may be lost when browser site data is cleared. No backend or device sync.
- The future SQLite implementation uses OPFS SAH pool and has not been tested in production.
- Future SAH pool integration will allow only one Worker-owned active database connection.
- Angular + SQLite running in a production browser have **not been verified** here because the npm registry could not be reached in the build environment.
- Current link model assigns a single connection per port and is **not** a complete fiber path/splice/ODF front-to-back model.


## Network planning frontend (experimental)

Open a local project in Fiber Planner, then choose **Åpne stort kart** in the
project workspace. On GitHub Pages, the standalone URL is
`/fiberapp/planner/network.html?project=<project-id>`.

- This map lets you place distribution points, OTB/CommScope-style splice boxes
  and other devices inside a registered building/parcel polygon or outdoors.
- Building rooms are recorded as a single distribution-point marker for the
  FTTH-SDU design workflow. No interior cable paths are drawn.
- Racks/cabinets are linked to rooms; GPON splitters, switches and ODF panel
  variants are linked to racks/cabinets. Physical rack-height validation and
  detailed patch/splice topology are **not** implemented.
- Aerial and underground routes are user-drawn polylines. Underground tube
  types are placeholders until the tube catalog is defined.
- Cables reference a route ID rather than storing their own geometry. They
  therefore inherit the route path by design. Editing existing routes and
  physical conduit capacity validation are not yet implemented.
- The editor uses local browser storage `fiberapp.planner.network.v1`,
  scoped by project ID. No backend, collaboration, server sync or persistent
  authentication is provided. The existing address polygons and project
  metadata are read from the Planner's existing storage keys.
- Both the static project page and the Angular workspace link to the same
  standalone editor; this avoids diverging drawing logic during the frontend
  prototype phase. The standalone page is published on GitHub Pages. The
  Angular dev server may need static asset copying to serve it locally.


## Address-first SDU workflow

The new frontend is available on GitHub Pages:

- `planner/add-address.html?project=<project-id>` — text search and clickable
  Kartverket background map (nearby addresses are suggestions, not detected
  building outlines), selectable official bruksenhetsnummer from Adresse REST API.
- `planner/building.html?project=<project-id>&address=<address-id>` — a
  **logical**, automatically generated side elevation. Every selected H/K/U/L
  bruksenhetsnummer gets one selectable rectangle on its etasje.
- Select one/many units to bulk-plan cable (G2–G576), connector (SC/LC APC/UPC)
  and subscriber equipment (ONT/CPE/OTB). The metadata is stored in
  `fiberapp.planner.items.v1[*].unitConnections`; no interior fiber routes are
  rendered, no ODF port/splice matrix is inferred.
- The large geographical network map keeps outdoor equipment, aerial routes,
  underground conduit paths and cables referencing route IDs. Rooms, racks and
  cabinets are removed from its current UI. Older hidden data is **not erased**.
- No backend, no authentication, and no server synchronization. Full live browser
  and Angular build validation still needed. The Angular app links into the same
  standalone address and building tools rather than duplicating the drawing logic.


### SOSI map overlays (early support)

The standalone network map now supports importing a local `.sos` or `.sosi`
file from the **SOSI-kartlag** tab. Parsing takes place in the browser using
`planner/sosi-reader.js`. An imported layer is saved separately per project
under `fiberapp.planner.sosi.v1`, can be hidden, shown, zoomed to or deleted.

Supported **subset**: EUREF89 UTM with SOSI `...KOORDSYS` 19–26 (including
22/23/25), `...ORIGO-NØ`, `...ENHET`, SOSI `PUNKT`, `KURVE`, `LINJE`,
and simple `FLATE` objects constructed from referenced curves. Topology
variants requiring unsupported geometries (arcs, clothoids, complex nested
surface references), unknown coordinate systems and malformed geometry
are not converted. Skipped group counts are shown after import.

A SOSI layer is **only a read-only, passive geographic reference layer**,
not a routing network or an officially validated cadastral surface. It
does not change projects, addresses, cables, or conduits. Browser localStorage
limits apply (maximum 5 MB source text and a stricter 3 MB total SOSI
storage limit). Older files with `DOSN8` encoding may show incorrectly
decoded special characters.

No backend and no GitHub Actions are used.
