# Repository hardening for a public `loompress` repository

## What changes when the repository becomes public

- The code becomes visible to everyone.
- Anyone can fork the repository.
- Random visitors still cannot push to the repository. Only collaborators or users with repository write/admin access can push.
- GitHub Actions logs become visible to everyone, so remove secrets from workflows, logs, and committed history before changing visibility.

## Important permission model constraint

If this repository is owned by a personal account, GitHub only provides two permission levels: owner and collaborator. Collaborators can push, merge pull requests, submit reviews that affect mergeability, and act as code owners.

If you need contributors to work inside the same repository but you do not want them to have merge authority, transfer the repository to an organization and keep yourself as the only repository admin or the only member of a dedicated maintainer team.

## Required GitHub rulesets

Do not rely on push rulesets for this repository after it becomes public. GitHub disables push rulesets when a repository changes from private to public, so use branch rulesets for `main` protection and branch naming.

### 1. `main` protection ruleset

Create a branch ruleset targeting only `main` and make it `Active`.

Use these settings:

- Bypass list:
  - Personal account repository: `Repository admins` only.
  - Organization repository: a dedicated team containing only you, or keep yourself as the only repository admin.
- Rules:
  - `Restrict updates`
  - `Restrict deletions`
  - `Require a pull request before merging`
  - `Require status checks to pass before merging`
  - `Block force pushes`
  - `Require linear history`

Recommended pull request settings:

- Require at least `1` approval
- Dismiss stale approvals
- Require approval of the most recent reviewable push
- Require conversation resolution
- Require review from code owners once `CODEOWNERS` is configured

Suggested `CODEOWNERS` file:

```text
* @your-github-username
```

If this is an organization repository and only you should control merge approval, use a dedicated one-person team instead:

```text
* @your-org/maintainers
```

Recommended required status checks:

- `verify`
- `branch-name`
- `dependency-review`
- `analyze (javascript-typescript)`

### 2. Branch naming ruleset

Create a second branch ruleset targeting all branches and make it `Evaluate` first, then `Active` after testing.

Target patterns:

- Include `*`
- Include `**/*`

Metadata restriction:

- Restrict branch names
- Must match this regex:

```text
^(main|feature\/[a-z0-9._-]+)\n?$
```

That allows only:

- `main`
- `feature/<slug>`

Examples:

- Allowed: `feature/plugin-loader`
- Allowed: `feature/seo-hardening`
- Blocked: `bugfix/login`
- Blocked: `release/v1`
- Blocked: `codex/experiment`

## Repository settings to review before going public

### Security & analysis

Enable or verify:

- Dependency graph
- Dependabot alerts
- Dependabot security updates, if you want automated dependency PRs
- Code scanning
- Secret scanning and push protection where available
- Private vulnerability reporting

Note: if you enable Dependabot security updates, either allow an explicit bot exception in your ruleset bypass or accept that Dependabot branches will not follow the `feature/<slug>` pattern.

### Pull request and merge settings

- Disable direct work on `main`
- Prefer squash merge or rebase merge
- Disable merge commits if you want a cleaner protected history
- Consider automatic branch deletion after merge

### GitHub Actions

- Restrict Actions to GitHub-authored actions and actions already used by this repository
- Review repository and organization secrets before making the repository public
- Remove old workflow logs if they contain sensitive information

## Repository files added in this repository

This repository now includes:

- A branch-name workflow to fail CI when a branch is not `main` or `feature/<slug>`
- A dependency review workflow for pull requests
- A CodeQL workflow for JavaScript/TypeScript analysis
- A `SECURITY.md` policy
- A pull request template with a branch and security checklist

## One local issue already found

The local helper script `.codex-run-loompress.ps1` currently contains a real PostgreSQL connection string. It is now ignored by Git, but the database password should still be rotated before the repository becomes public.
