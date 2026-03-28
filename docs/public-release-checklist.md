# Public release checklist

Use this checklist before the first public push.

## What should stay local

Do not commit:

- `.env` and any `.env.*` file except `.env.example`
- local helper scripts such as `.codex-run-*`
- logs, caches, build output, coverage output, and editor settings
- uploaded media or runtime data directories such as `uploads-data/`
- private certificates, keys, and local credentials

## What is safe to publish

These are normally safe to stage and push:

- `src/`
- `plugins/`
- `examples/`
- `docs/`
- `.github/`
- `assets/`
- `README.md`
- `LICENSE`
- `SECURITY.md`
- `.gitignore`
- `.dockerignore`
- `.env.example`
- `Dockerfile`
- `docker-compose.yml`
- `package.json`
- `package-lock.json`
- `tsconfig.json`

## Safer first push flow

Prefer explicit staging over `git add -A`.

Example:

```bash
git add README.md LICENSE SECURITY.md .gitignore .dockerignore .env.example
git add package.json package-lock.json tsconfig.json Dockerfile docker-compose.yml
git add src plugins examples docs .github assets
```

Then verify exactly what is going out:

```bash
git status --short
git diff --cached --stat
git diff --cached
```

## Final checks

- Run `npm run check`
- Confirm no real credentials appear in the staged diff
- Confirm only `main` and `feature/<slug>` will be used once branch rulesets are active
- Rotate any credentials that were ever stored in local helper scripts before publishing
