# Changing live data

A recipe for any write to the owner's real Firestore data (the project in `FIREBASE_CONFIG`), as #107 and #142 did: fixing a gym's ticks, renaming an exercise inside a past workout. Each fix differs, so this is a method rather than a shared script: write a one-off script for the fix in the scratchpad, where it stays.

Every live write needs the maintainer's go-ahead for that write (CLAUDE.md § How we work, Agent-decided choices: "any write to the live Firestore"). The one standing exception is `npm run feedback -- --filed` (`issue-tracker.md`).

The coach's writes (saving a coaching session, applying a proposal) don't follow this recipe: see [Coach writes](#coach-writes) at the end.

## 1. Plan, and say who runs the write

Before any code, tell the maintainer, and put in the ticket: which documents change, which fields in each, the dry run, and that **they run the write**. Auto mode doesn't reliably block or allow production writes (#192), so the agent runs every step up to the write, and the maintainer types the write command with the `!` prefix.

Done when: the maintainer has said yes to the plan, including running the write.

## 2. Sign in with the Firebase CLI login

Sign in with `tools/firebase-login.js`, as `npm run feedback` and `npm run coach` do: it reads the maintainer's Firebase CLI login through the `firebase-tools` dev dependency and refreshes the access token when it has expired. That keeps service-account keys out of the picture entirely (ADR-0005 keeps them out of the repo). The token stays in memory: the script never prints, logs or saves it.

Done when: a read with the token returns the documents you mean to change.

## 3. Find the paths from the code

Every collection lives under `users/{OWNER_UID}/<collection>` (`OWNER_UID` in `app/js/firebase-config.js`). The collection names are the first argument of the core's `store.get`, `store.put`, `store.list` and `store.remove` calls in `app/js/core/forge.js`; take them from there. The REST base URL is the one `tools/feedback/run.js` builds.

Done when: every document in the plan has its full REST path.

## 4. Use the deployed code

When the fix depends on app code (the exercise library, an id), import it from what's deployed: `origin/main`, never the working tree, which may be on another branch. In #142 that made a dry run report new library ids as missing. After `git fetch`, check out `origin/main` in a detached worktree outside the repo (`git worktree add --detach <scratchpad>/deployed origin/main`), import from there, and remove the worktree when done.

Done when: the script imports app code only from that worktree.

## 5. Back up, outside the repo

Before the dry run, save each document to be changed, exactly as Firestore returns it (REST values and `updateTime` included), in `<home>/forge-backups/<issue>/`. In Node, build that path from `os.homedir()`: `~` isn't expanded on Windows. Live data is personal (ADR-0005), so the backup folder is the only place it is written.

Done when: every document the plan names has a backup file.

## 6. Dry run

Run the script in a mode that writes nothing and prints, for each document, each field it will change, with the old value next to the new.

Done when: the dry run lists exactly the planned documents and fields.

## 7. Write: masked fields, a precondition, REST values

Each write is a REST `PATCH` that changes only the planned fields and fails if the document changed since the backup:

- **Mask:** `updateMask.fieldPaths=<field>` for each field the plan changes; every other field is left alone. A mask addresses whole fields: to change one element of an array (an entry in a workout), send the whole array. A masked field left out of the body is deleted, so the body carries every masked field.
- **Precondition:** `currentDocument.updateTime=<the backup's updateTime>`, so a document edited since the backup is refused rather than overwritten.
- **Values:** Firestore's REST form throughout. Unchanged elements are copied raw from the backup (`integerValue`, `doubleValue`, `stringValue`, …), so a number keeps its type: converting to plain JavaScript and back turns integers into doubles. New values are written in the type the app stores for that field (an exercise id as a `stringValue`).

The maintainer runs this step (step 1).

Done when: every `PATCH` returned 200, and none was refused on its precondition. A refusal means the document changed: back up again and redo the dry run.

## 8. Read back against the backup

Read every changed document again and compare it with its backup, one acceptance criterion at a time: the planned fields hold the new values, and every other field is identical, types included. Then check what else the criteria name (the other gyms unchanged, no workout still naming an old id).

Done when: each criterion is checked and reported in the issue, criterion by criterion, without personal data.

## Coach writes

The coach command writes to the live Firestore in two ways, each from a draft the `/coach` skill wrote in the coach notes' `drafts/` folder, and each through the Forge core:

- `npm run coach -- save <draft>` (#174) adds one coaching session.
- `npm run coach -- apply <proposal> <fingerprint>` (#193) makes a proposal's changes to the user's set-up (routines, gyms, custom exercises, exercise settings), once `npm run coach -- preview <proposal>` has shown its dry run.

### Who runs them

- **The coach runs each write once the user approves it in the conversation** (ADR-0009): for a proposal, the user saying to apply its final dry run; for a coaching session, the user approving its final draft. That approval is the go-ahead for that one write; there's no standing one, and agreement in passing isn't approval.
- **In auto mode**, the `/coach` skill's grant (from #198; until then the skill hands the user the `!` command) lets exactly these two commands run with no prompt, spelled as `npm --prefix C:/Projects/Health/Exercise-deployed run coach -- apply …` and `… -- save …`, each one Bash call on its own, never chained. If auto mode refuses one anyway, the coach gives the user the command to run with the `!` prefix.
- **Outside `/coach`** they're live writes like any other: an agent runs one only with the maintainer's go-ahead for that write. The grant doesn't stop another Claude Code session in auto mode running them (an accepted risk, #199); the guards below are what contain it.
- **Step 4 applies to both:** run them from the checkout of `origin/main` at `C:\Projects\Health\Exercise-deployed`, never this folder's working tree (ADR-0008). `npm run coach:ready` (#175) brings that checkout to `origin/main`, making it the first time, and runs `npm ci` there only when the lockfile changed; the `/coach` skill runs it at the start of every coaching session. Both sign in as step 2 says and take their paths from the core (step 3).

### Saving a coaching session

- **It only ever adds:** each save is a new coaching session with a new random id, and the command has no way to change or delete one.
- **The backup, dry-run and precondition steps don't apply.** A save changes nothing that exists, so there's nothing to back up (step 5), no old value for a dry run to show (step 6), and no document for step 7's precondition to guard: the save makes a new one. The draft the user approved is the plan (step 1).
- **The read-back (step 8) is the command's own:** it prints the coaching session it saved, and the next `npm run coach -- read` shows it in the export and on the Coach page.
- **A refused draft saves nothing** and is kept, with the reason printed: fix the draft and run the save again. Once saved, the draft is removed, so it can't be saved twice; if the Markdown copy in `insights/` couldn't be written, the next `npm run coach -- read` writes it.

### Applying a proposal

Each step of the recipe has its counterpart in the command:

- **Step 1** is the proposal: it says what changes, each change with its reason. It never deletes anything (unticking an exercise at a gym is the only removal, and it's reversible), and never touches workouts, body weights, coaching sessions or app settings.
- **The dry run (step 6)** is `preview`. It makes every change through the core over an in-memory copy of the user's set-up and writes nothing; it prints each change with its reason and its old and new values, in exercise and gym names, then the fingerprint. A proposal the core refuses prints `Not applied: <why>` and no fingerprint, and none of it is applied. A new routine, gym or custom exercise whose name is already in use is refused.
- **The precondition (step 7)** is the fingerprint: of the proposal file and the current state of every document its changes depend on, with map keys sorted, since Firestore's REST API returns them in no stable order. `apply` recomputes it and refuses (`Not applied: changed since the preview.`) unless it matches. Then show a new dry run and ask again. Never edit a proposal between the preview the user approved and `apply`. The core and the REST store make the writes, so there's no hand-built `PATCH`.
- **The backup (step 5):** before writing, `apply` saves every existing document it will change, as the store returned it for the fingerprint, in `<home>/forge-backups/coach/<proposal name>/<collection>/<id>.json`, outside the repo and the coach notes, and prints the folder. An earlier backup of the same proposal (an apply that stopped partway) is never overwritten: the next goes in `<proposal name>-2/`. If the backup can't be written, nothing is. Each change kind names the documents it writes over (`writes` in `tools/coach/change-kinds.js`), so a new routine, which changes no existing document, has no backup; a routine change (#195) backs up its routine, and gyms and exercise settings (#197) theirs.- **The read-back (step 8)** is the command's own: it prints each change it made, and the next `npm run coach -- read` shows them.
- **Once applied**, a record of the proposal with each change and its reason goes in the coach notes' `proposals/`, and the draft is removed, so it can't be applied twice.
- **If a write fails partway**, it prints `Applying stopped: <why> (change <n>)` and keeps the draft: the changes before change `<n>` landed. Applying it again is refused for any new routine, gym or custom exercise that landed, since its name is now in use, so the coach writes a fresh proposal for what's left.
