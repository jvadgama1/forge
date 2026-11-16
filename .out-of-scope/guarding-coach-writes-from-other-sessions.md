# Guarding the coach's writes from other sessions

Nothing stops a Claude Code session other than `/coach` from running the coach command's live writes, `npm run coach -- apply` and `npm run coach -- save`. Inside `/coach`, the skill's `allowed-tools` grants exactly those two commands from the deployed checkout, so a coaching session never stops for a prompt (ADR-0009). Outside it, no rule allows or blocks them, so in auto mode its classifier decides, and it lets a write through whenever it judges the user asked for one.

```text
Bash(npm --prefix C:/Projects/Health/Exercise-deployed run coach -- apply *)
Bash(npm --prefix C:/Projects/Health/Exercise-deployed run coach -- save *)
```

The grant adds a permission inside `/coach`; it takes nothing away anywhere else.

## Why this is out of scope

The maintainer accepted the risk rather than build a guard (triage of #199, 2026-11-16). The probe in #192 reproduced it: a session that never ran the skill wrote unprompted in 5 of 6 auto-mode runs, and no setting the probe tried could guard other sessions without blocking `/coach`:

- **A settings `ask` rule on the two commands** does stop other sessions (a `deny` rule presumably would too; not tried), but it beats a skill's allow rule, so it would prompt inside `/coach` too and undo the point of the grant.
- **A hook that lets the writes through only while `/coach` runs** would be new machinery that has to tell which skill is active, and would need a probe of its own.

Neither is worth it, because the writes contain the damage themselves:

- `apply` refuses without the fingerprint from a fresh `preview` of that exact proposal, on the data as it then stood, so whatever lands is exactly what a fresh dry run showed.
- `save` only ever adds a coaching session. It can't change or delete one.
- `apply` backs up every existing document before it changes one, outside the repo (from #195 and #197), and no change kind deletes anything.

This was already true for `save` before the grant existed: the grant widens nothing outside `/coach`.

It's worth reopening if Claude Code gains a way to scope an allow rule to one skill against other sessions (an allow that also denies elsewhere, say), or a way for a hook to know which skill is running, or if a write ever gets through from another session in practice.

## Prior requests

- #199: "Auto mode lets any session run the coach's writes"
