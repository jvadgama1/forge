# Coding standards

The judgement calls a reviewer checks. Anything ESLint, Prettier, `tsc` (strict, over JSDoc) or the tests enforce is left to `npm run check`. Each rule points to its source of truth where one exists.

## Domain language

- `docs/agents/domain.md` § Use the glossary's vocabulary covers identifiers, comments, docs, commit messages and UI copy too. A word from a `GLOSSARY.md` entry's _Avoid_ list, used in that entry's meaning, is a finding: name the term to use ("workout", not "session"; "record", not "PR").

## Code

- **Match the surrounding module**: its comment density, naming and idiom. Here that means factory functions returning plain objects (`createForge`, `createFirestoreStore`), `h()` for DOM, and small modules with one job.
- **Comments say why**, in a line or two, citing the issue or spec story a rule comes from: `(#9)`, `(spec #3, story 5)`. What the code does reads from the code.
- **Layering**: CLAUDE.md § Architecture keeps `app/js/core/` free of DOM and Firestore. Domain rules belong there too; screens render what the core returns. A rule written in a screen, or the core reaching for the DOM or Firestore, is a finding.

## Tests

- Tests sit at the seams the spec agreed (its Testing Decisions) and check behaviour through the public interface.
- Expected values come from an independent source: a literal, a worked example, the spec. An assertion that recomputes the answer the way the code does proves nothing.

## UI

- UI changes follow CLAUDE.md § UI conventions and `DESIGN.md` § Look. The pull request shows a 390 px phone screenshot of every changed screen, taken with made-up data (pull requests are public: ADR-0005), and quotes old and new wording for any copy change.

## Security and data

- ADR-0005 applies to the diff and the pull request; the owner's uid is its accepted exception (#28).
- A `firestore.rules` change comes with rules tests that try to break it, and its pull request lists the post-merge `npm run deploy:rules`.
