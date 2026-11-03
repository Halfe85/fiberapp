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
