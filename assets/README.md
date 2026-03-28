# Assets

This directory is the user-managed static asset area for LoomPress.

Everything inside here is served at:

```text
/assets/*
```

Examples:

- `assets/images/logo.png` -> `/assets/images/logo.png`
- `assets/js/site.js` -> `/assets/js/site.js`
- `assets/ts/demo.ts` -> `/assets/ts/demo.ts`
- `assets/default/hero.jpg` -> `/assets/default/hero.jpg`

Suggested structure:

```text
assets/
├── default/
├── images/
├── js/
└── ts/
```

LoomPress core fallback files now live under `/core-assets/*` so your own assets do not collide with bundled framework assets.
