# Fiberapp

Mobile-first two-tool Angular application:

- **Fiberfinder** – converted from the original static Fiberfinder; 22 color-code sequences, tube/fiber calculations, multiple-fiber lookup, retained settings.
- **Fiber Planner** – projects, buildings, entrances, apartments, network equipment/ports/connections, local SQLite WASM/OPFS, database import/export.

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

There are no `.github/workflows` in any branch. `index.html` currently contains a responsive **static launch fallback**, and `finder/index.html` temporarily serves the pre-conversion Finder logic while the first manual Angular build remains unavailable. `planner/index.html` explains why Planner is not live yet. The compiled Angular application will replace the root fallback on deployment.

### Important limits

- SQLite uses OPFS SAH pool; browser/device local. No backend or cross-device sync. Backup before clearing browser storage.
- SAH pool is limited to one active database connection; one Worker owns it.
- Angular + SQLite running in a production browser have **not been verified** here because the npm registry could not be reached in the build environment.
- Current link model assigns a single connection per port and is **not** a complete fiber path/splice/ODF front-to-back model.
