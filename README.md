# Gym Dashboard — Structured (No Build)

This package keeps your current app **working** while making the file structure clean and scalable.

## What changed
- **Folder structure is standardized** (`assets/css`, `assets/js`, `assets/js/modals`, `assets/js/legacy`, `assets/js/core`)
- **Deterministic boot order** via `assets/js/app.entry.js` (prevents undefined/script-order bugs)
- **Crash overlay** via `assets/js/core/guard.js` (instead of blank screens)

## Boot order
`index.html` loads:
1) `assets/js/app.js` (stable stub)
2) `assets/js/app.entry.js` (loader)
3) `assets/js/core/guard.js` (new)
4) `assets/js/legacy/app.legacy.js` (your app)
5) `assets/js/modals/*.js` (your modals)

## Next step (safe refactor path)
We can now migrate code **out of** `assets/js/legacy/app.legacy.js` gradually into:
- `assets/js/core/` (state/storage/dates/log-engine/router)
- `assets/js/views/` (home/routine/progress/weight/settings/onboarding)

This avoids “big bang” edits that break the whole app.

