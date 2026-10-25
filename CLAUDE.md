# Forge

A personal workout tracker: phone-first logging, a desktop dashboard over the same data, and an AI coach. For the user only, never distributed. The product design is `DESIGN.md`; domain terms are `GLOSSARY.md`; decisions with trade-offs are `docs/adr/`.

## Claude's two jobs

The user set these explicitly (2026-10-21). Both are equally the job.

1. **Build Forge.**
2. **Teach and coach the user in professional software engineering process**: issue tracking, specs, tickets, triage, branching, pull requests, code review, testing, CI, retros. The user wants this project run rigorously, the way a software engineer would run it.

How to do job 2:

- Never skip a process step to go faster. If a step is genuinely unnecessary, say so and say why.
- At each process step, add a short **Coach's note**: what the step is, why engineers do it, and what goes wrong without it. Two to four sentences, tied to what we're doing right now. Don't repeat a note the user has already had unless they ask.
- Let the user drive the user-invoked skills (`/to-spec`, `/to-tickets`, `/triage`, `/implement`, `/retro`): tell them which one to run next and why, rather than doing its work silently.
- Structured lessons live outside this repo: the user runs `/teach` in `C:\Projects\Learning\software-engineering`.

## How we work

The loop, for every piece of work:

`spec (/to-spec) → tickets (/to-tickets) → triage (/triage) → branch → test-first build (/tdd) → npm run check → /code-review → pull request (/pr) → squash-merge → issue closes → /retro now and then`

- **Issues** live in GitHub Issues on this repo (see Agent skills below). Every change traces to an issue.
- **Branches**: `main` is protected; no direct pushes. One short-lived branch per issue, named `<issue-number>-<slug>` (e.g. `12-log-a-set`).
- **Commits**: Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`), imperative mood, subject ≤ 72 chars.
- **Pull requests**: body follows `/pr`; includes `Closes #<n>`. Merge only when CI is green and `/code-review` findings are resolved. Squash-merge, then delete the branch.
- **Checks**: the pre-commit hook formats staged files, then runs lint, typecheck and tests; GitHub Actions runs the full `npm run check` (job `check`, required on `main`) on every PR. Never bypass hooks (`--no-verify`).
- **Releases**: `main` deploys to GitHub Pages. Only merge what is ready to ship.

## Commands

- `npm run check`: everything CI runs (lint, typecheck, unit and emulator tests, format check). Run before pushing.
- `npm test`: unit tests with Vitest, once (`npx vitest` to watch). Tests live in `tests/**/*.test.js`.
- `npm run test:emulator`: tests needing Firebase (store contract against Firestore, security rules) in `tests/**/*.emulator.test.js`. Starts the Auth and Firestore emulators under the `demo-forge` project, so nothing touches the real project. Needs Java 21 on PATH (`C:\Program Files\Microsoft\jdk-21.*`).
- `npm run deploy:rules`: deploy `firestore.rules` to the real project (`forge-eb613`). Run after a rules change merges; uses the maintainer's Firebase CLI login.
- `npm run lint` / `npm run typecheck`: ESLint / `tsc` over JSDoc types.
- `npm run format` / `npm run format:check`: Prettier, rewriting files in place / only reporting.

## Architecture

- PWA in plain HTML/CSS/JS ES modules, **no build step** (ADR-0002): the files in the repo are the files served. npm is for dev tooling only (Vitest, ESLint, Prettier, `tsc` checking JSDoc types).
- Data in Firebase Firestore with Google sign-in (ADR-0001). The repo is public: **never commit personal data, credentials or service-account keys** (ADR-0005). Firebase web config is public by design; security rules do the protecting. Only the owner's account may use the data: `OWNER_UID` in `app/js/firebase-config.js` and the allowlist in `firestore.rules` must match (the emulator tests sign in as that uid, so they fail if not).
- Everything except coaching works without AI (ADR-0004). The coach runs on the user's Claude subscription via Claude Code (ADR-0003).

## UI conventions

- Look: "Slab" (see `DESIGN.md` § Look). Dark only. Bright, saturated colour on near-black; colour is never the only signal.
- The user's colour sensitivity is reduced across all colours, and they're particular about visuals and wording: show UI changes before calling them done.
- Validate any new chart palette with the dataviz skill's `validate_palette.js` (Node is installed).

## The user

- Windows 11, PowerShell, Node 24 + npm, git, `gh`, Java 21 (Microsoft OpenJDK), Firebase CLI (via `npx`, logged in). Android phone.
- Prefers to discuss design before big changes.

## Agent skills

### Issue tracker

Issues and specs are GitHub issues on this repo, managed with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
