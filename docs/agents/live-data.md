# Changing live data

A recipe for any write to the owner's real Firestore data (the project in `FIREBASE_CONFIG`), as #107 and #142 did: fixing a gym's ticks, renaming an exercise inside a past workout. Each fix differs, so this is a method rather than a shared script: write a one-off script for the fix in the scratchpad, where it stays.

Every live write needs the maintainer's go-ahead for that write (CLAUDE.md § How we work, Agent-decided choices: "any write to the live Firestore"). The one standing exception is `npm run feedback -- --filed` (`issue-tracker.md`).

## 1. Plan, and say who runs the write

Before any code, tell the maintainer, and put in the ticket: which documents change, which fields in each, the dry run, and that **they run the write**. Auto mode blocks production writes, so the agent runs every step up to the write, and the maintainer types the write command with the `!` prefix.

Done when: the maintainer has said yes to the plan, including running the write.

## 2. Sign in with the Firebase CLI login

Sign in as `tools/feedback/feedback.js` does: it reads the maintainer's Firebase CLI login through the `firebase-tools` dev dependency and refreshes the access token when it has expired. That keeps service-account keys out of the picture entirely (ADR-0005 keeps them out of the repo). The token stays in memory: the script never prints, logs or saves it.

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
