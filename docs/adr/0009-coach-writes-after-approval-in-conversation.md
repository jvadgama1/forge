# The coach writes to Forge once the user approves in conversation

**Amends [ADR-0008](0008-coach-runs-on-the-laptop-only.md).**

The coach now runs its own writes to the live Firestore: it applies a proposal (`npm run coach -- apply`) once the user explicitly says to apply its final dry run, and saves a coaching session (`npm run coach -- save`) once they approve its final draft, where under ADR-0008 the maintainer ran each save with the `!` prefix and made every routine change in the app themselves. The maintainer chose this convenience over the `!` gate (spec #191, 2026-11-16) because they always run Claude Code in auto mode and want a coaching session to finish without pasting a command. The approval in the conversation replaces the user typing the command, and a fingerprint replaces it as the guard.

## Considered options

- **The maintainer runs each write with the `!` prefix** (ADR-0008 as it stood): kept only as the fallback for when auto mode refuses the write.
- **Leave it to auto mode's classifier, with no rule**: rejected. The probe (#192) found the classifier allowed and denied the same write in identical runs.
- **A settings `ask` rule on the writes**, to stop other Claude Code sessions running them: rejected. An `ask` rule in settings beats a skill's allow rule, so it would prompt inside `/coach` too (#192).
- **A hook that lets the writes through only while `/coach` runs**: not built. It would be new machinery needing its own probe, for a risk the guards below already contain (#199).

## Consequences

- **The grant.** The `/coach` skill's `allowed-tools` gains two Bash rules beside the coach notes grant (#198): `Bash(npm --prefix C:/Projects/Health/Exercise-deployed run coach -- apply *)` and `Bash(npm --prefix C:/Projects/Health/Exercise-deployed run coach -- save *)`. The probe (#192) found that a skill's rule is checked before auto mode's classifier, so a matching command runs with no prompt, the same every time.
- **The rules are prefix matches** on the whole command string. A chained command (`&&`, `;`, `$(…)`) never matches, and by the same prefix matching nor will another spelling of the command (backslashes, `cd … &&`); either falls through to the classifier. Extra arguments do match, so `apply` and `save` themselves refuse anything but `<proposal> <fingerprint>` and `<draft>`.
- **The fallback.** If the rule ever stops matching, the coach gives the user the `!` command to run, as before.
- **Accepted risk: other Claude Code sessions.** The grant adds a permission inside `/coach` but takes none away elsewhere. Another Claude Code session in auto mode can still run these writes whenever the classifier judges the user asked for them, and in the probe it did in 5 of 6 runs. The maintainer accepted this rather than build a guard (#199, 2026-11-16; `.out-of-scope/guarding-coach-writes-from-other-sessions.md`). What contains it: `apply` refuses without the fingerprint from a fresh `preview` of that exact proposal, `save` only ever adds a coaching session, and `apply` backs up every existing document it changes.
- **The fingerprint.** `preview` is the dry run: it makes every change through the Forge core over an in-memory copy of the user's set-up, writes nothing, and ends with a fingerprint of the proposal file and the current state of every document the proposal depends on. `apply` refuses (`Not applied: changed since the preview.`) unless the fingerprint still matches, so what lands is what the user approved, on the data they approved it against. The coach never edits a proposal between the preview the user approved and `apply`.
- **What a proposal can change**: routines, gyms, custom exercises and exercise settings, through the core's own methods, so a changed routine becomes a new routine version and past workouts keep theirs. No change kind deletes anything (unticking an exercise at a gym is the only removal, and it's reversible), and none touches workouts, body weights, coaching sessions or app settings. Names are unique per kind, so applying again after a partial failure can't make a duplicate.
- **Backups.** Before writing, `apply` must back up every existing document it will change to `<home>/forge-backups/coach/<proposal name>/`, outside the repo and the coach notes. A new routine changes no existing document, so it needs none; each change kind that does change one brings its backup with it.
- **Saving a coaching session stays additive**: each save adds a new one, and none is changed or deleted. It needs no fingerprint, since there's nothing existing for it to overwrite.
- **Records.** Each applied proposal is written to the coach notes' `proposals/` with its changes and reasons, and its draft is removed, so it can't be applied twice.
- **ADR-0008 otherwise holds**: the writes run only from the deployed checkout of `origin/main`, signed in with the maintainer's Firebase CLI login.
- **ADR-0004 holds unchanged.** Proposals leave double progression alone; a new increment or rep range only changes what it works from, and the coach says in the conversation how a proposal changes what the app will suggest next.
