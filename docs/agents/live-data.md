# Changing live data

A recipe for any write to the owner's real Firestore data (the project in `FIREBASE_CONFIG`), as #107 and #142 did: fixing a gym's ticks, renaming an exercise inside a past workout. Each fix differs, so this is a method, not a script: write a one-off script for the fix, in the scratchpad, never in the repo.

Every live write needs the maintainer's go-ahead for that write (CLAUDE.md § Agent-decided choices). The one standing exception is `npm run feedback -- --filed` (`issue-tracker.md`).

## 1. Plan, and say who runs the write

Before any code, tell the maintainer, and put in the ticket: which documents change, which field in each, the dry run, and that **they run the write**. Auto mode blocks production writes, so the agent runs every step up to the write, and the maintainer types the write command with the `!` prefix.

Done when: the maintainer has said yes to the plan, including running the write.

## 2. Sign in with the Firebase CLI login

Use the maintainer's Firebase CLI login, never a service-account key (ADR-0005). `tools/feedback/feedback.js` is the worked example: it reads the login through the `firebase-tools` dev dependency and refreshes its access token. Never print, log or save the token.

Done when: a read with the token returns the documents you mean to change.

## 3. Find the paths from the code

Every collection lives under `users/{OWNER_UID}/<collection>` (`app/js/firebase-config.js`; the Firestore store). Collection names are the first argument of the core's `store.get`, `store.put` and `store.list` calls in `app/js/core/forge.js`: read them there rather than from a list here. The REST base is `https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/`, as in `tools/feedback/run.js`.

## 4. Read code from what's deployed

When the fix depends on app code (the exercise library, an id), import it from `origin/main`, never the working tree. The working tree may be on another branch: in #142 that made a dry run say new library ids were missing. Read a deployed file with `git show origin/main:<path>` after `git fetch`.

## 5. Back up, outside the repo

Before the dry run, save each document to be changed, exactly as Firestore returns it, to `~/forge-backups/<issue>/`. Live data is personal (ADR-0005): it goes nowhere else, not the repo, not the scratchpad, not an issue or PR.

Done when: every document the plan names has a backup file.

## 6. Dry run

Run the script in a mode that prints, for each document, the field it will change and the new value next to the old, and writes nothing. Check that output against the plan.

Done when: the dry run lists exactly the planned documents and fields, and nothing else differs.

## 7. Write: one field, a precondition, raw values

Each write is a REST `PATCH` that changes only the planned fields and fails if the document changed since the backup:

- `updateMask.fieldPaths=<field>` for each changed field, so every other field is left alone.
- `currentDocument.updateTime=<the backup's updateTime>`, so a document edited since the backup is refused rather than overwritten.
- Values in Firestore's REST form, built from the backup's raw values (`integerValue`, `doubleValue`, `stringValue`, …), so a number keeps its type. Converting to plain JavaScript and back turns integers into doubles.

The maintainer runs this step (step 1).

## 8. Read back against the backup

Read every changed document again and compare it with its backup, one acceptance criterion at a time: the planned fields hold the new values, and every other field is identical, types included. Then check what else the criteria name (the other gyms unchanged, no workout still naming an old id).

Done when: each criterion is checked and reported in the issue, criterion by criterion, without personal data.
