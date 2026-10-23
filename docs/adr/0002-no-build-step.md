# No build step: the repo's files are the files served

The app is plain HTML, CSS and JavaScript ES modules served as-is from GitHub Pages; there is no bundler, transpiler or framework. npm exists only for development tooling (Vitest, ESLint, Prettier, and `tsc --checkJs` over JSDoc types). This keeps deploys trivial and debugging direct, and the user's earlier project (Orbit) works the same way.

## Consequences

- Types are JSDoc comments checked by `tsc`, never `.ts` files.
- Third-party code (Firebase SDK, charting) loads as ES modules from a pinned CDN URL or a vendored copy, never via `npm install` into the served app.
- A future need for a build step (e.g. a framework) means superseding this ADR, not quietly adding one.
