# The coach runs on Claude Code, not the Claude API

The coach is a Claude Code skill (`/coach`) plus a scheduled Claude Code cloud routine for the weekly review, running on the user's Claude subscription. The app never calls an LLM itself and holds no API key. The user preferred no per-use API cost, and expects to use the coach about once a week.

## Consequences

- The coach reads and writes Firestore from outside the app (a service account held by the routine's environment, never in the repo).
- Coach output appears in the app only as stored documents (weekly reviews, debriefs, proposals).
- On-demand coaching from the phone goes through Claude (claude.ai/code), not an in-app button; an in-app "Ask coach" trigger is deferred to phase 4.
