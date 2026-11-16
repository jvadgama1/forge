# The coach runs on the laptop, only when invoked

**Amended by [ADR-0009](0009-coach-writes-after-approval-in-conversation.md):** the coach runs its own writes (applying a proposal, saving a coaching session) once the user approves them in the conversation, instead of the maintainer running each save; proposals let it change the user's set-up.

The coach is a Claude Code skill, `/coach`, that the user runs on the laptop on their Claude subscription, signed in with the maintainer's Firebase CLI login, with two layers of memory: coaching sessions in Firestore, shown in the app, and private coach notes in a folder outside the repo. There's no scheduled cloud routine, no service account and no coaching from the phone. This replaces ADR-0003 (a cloud routine writing weekly reviews with a service account, and on-demand coaching from the phone through claude.ai/code) because the user chose laptop-only coaching in the grilling of 2026-11-14 (spec #170).

## Consequences

- No new credential exists anywhere: the coach command signs in with the Firebase CLI login the maintainer already has, and nothing needs a service-account key.
- The coach command runs from a checkout of `origin/main` kept beside the repo, never from whatever branch this folder has checked out, so only reviewed code reads or saves coaching.
- Coaching sessions live in Firestore under the user's account and appear on the Coach page. Saving one is a write to the live Firestore that the maintainer approves for that write, and it only ever adds a new coaching session: none is changed or deleted afterwards.
- Coach notes (the coach profile, the notebook, a summary of each conversation and a Markdown copy of each saved coaching session) live in `C:\Projects\Health\coach\`, outside the repo, and are never committed or uploaded. This narrows ADR-0005, which put the coach profile in Firestore. The folder has no backup yet (#169).
- Nothing reminds the user to run `/coach` and nothing runs while they are away; the Coach page shows how long ago they were last coached instead.
- ADR-0004 holds unchanged: the app stays fully usable if the coach never runs, and coaching doesn't change suggested weights.
- During a coaching session the user's data and coach profile are sent to Claude, as they were under ADR-0003.
- An in-app "Ask coach" button (phase 4) needs something to run the coach without the laptop, so it depends on revisiting this ADR.
