# Proposals

A _proposal_ (`GLOSSARY.md`) is the set of changes to the user's set-up you recommend in this coaching session (routines, gyms, custom exercises, exercise settings), each with its reason. You write it, show its _dry run_, and apply it once the user says to. The coach command checks every change against the app's own rules, so a proposal that breaks one is refused whole, with the app's reason.

## 1. Write it

Write it to `drafts/YYYY-MM-DD-HHmm-proposal.json`, stamped like the coaching-session draft, beside it. Every change agreed before the user approves a dry run goes in that one file; a change agreed after it's applied goes in a new proposal, `…-proposal-2.json`.

```json
{
  "changes": [
    {
      "kind": "change-routine",
      "reason": "…",
      "id": "…",
      "days": [{ "id": "…", "name": "…", "slots": [] }]
    }
  ]
}
```

- **changes**: in the order they're made. A change that names a custom exercise comes after the change that makes it.
- **reason**: every change has one: a sentence or two in your voice, the mechanism and the user's numbers, as agreed in the conversation. The dry run shows it and the record in `proposals/` keeps it, so the next coaching session knows why.
- **Exercises** are named by id: a library id (the checkout's `app/js/core/seed-library.js`) or a custom exercise's id from the export. A custom exercise this same proposal makes is named `{ "custom": "<name>" }`, and nothing else is: anything already in Forge goes by its id.
- **Each change must change something**: every tick, untick and setting it names differs from how Forge has it now, and a routine change makes a new routine version or a new name.

The kinds, and nothing else:

- **`new-routine`**: `name`, not already a routine's; `days`, each `{ "name", "slots" }`, a slot `{ "exerciseId", "sets", "repMin", "repMax", "rir" }` with `rir` (0 to 4; 4 means 4 or more) optional. No ids anywhere: saving gives them. Saved at version 1.
- **`change-routine`**: the routine's `id`; `name` only to rename it; `days`, the new routine version's days in full, at least one. A day that continues names its current day `id`, so the rotation carries on from the day done last; a day with no `id` is new, and takes a name no current day has; a day left out is dropped from the new version only, and earlier versions keep it. A rename with the days unchanged adds no version.
- **`new-gym`**: `name`, not already a gym's; `exercises`, the ids ticked there.
- **`gym-exercises`**: the gym's `id`; `tick` and `untick`, lists of exercises, at least one between them. Tick only what isn't ticked there now, untick only what is.
- **`new-custom-exercise`**: `name`, in neither the library nor the custom exercises; `type`, a key of `TYPE_RULES` in the checkout's `app/js/core/exercise-types.js`; `primary` and `secondary`, lists of muscle group ids from `app/js/core/muscle-groups.js`; `body`, `upper` or `lower`.
- **`exercise-settings`**: `exerciseId`, and any of `unit` (`lb` or `kg`; a cardio exercise's distance unit is written the same way, `lb` for mi and `kg` for km), `increment` (a number in the exercise's unit after the change; cardio has none), `rest` (whole seconds, 5 to 900, or `"off"`) and `note` (the pinned note; `""` removes it).

Done when the file holds every change you recommend, each with its reason.

## 2. Show the dry run

Run it on its own (it reads and writes nothing):

```
npm --prefix C:/Projects/Health/Exercise-deployed run coach -- preview YYYY-MM-DD-HHmm-proposal.json
```

- **`Not applied: <why>`**, often with `(change <n>)`: the app refused it, and there's no fingerprint. Fix that change for the reason given and run the dry run again. When the fix changes something you agreed, say so.
- **A dry run** lists each change, numbered, with `Why:` and its old and new values, then ends `Fingerprint: <12 characters>`, which belongs to this file exactly as it stands.
- **Anything else** (`Couldn't read the data: …`, or the usage text): no dry run. A failed read is most often the Firebase CLI login: the user runs `! npx firebase login`, then you run it again.

Show the user the dry run, readable rather than pasted:

1. **Grouped**: Routines (each routine's days, with each slot's old → new targets and the slots and days added, removed or dropped), Gyms (made, ticked, unticked), then Exercises (new custom exercises, and settings old → new). Each change with its reason, in exercise and gym names as the dry run gives them.
2. **What the app will suggest differently next**, worked from FORGE.md's _Double progression_ for each exercise a change touches: a new increment (the next step up is 2.5 kg, not 5 lb), a new rep range (it moves up once every working set reaches the new top), a new slot or routine day (where its rep range now comes from). Double progression itself is unchanged (ADR-0004): it works from the new values.
3. **Ask**: apply this dry run, or change it?

When the user asks for changes, change the file, run the dry run again and show it again. The latest dry run you showed is the one they're approving, and its fingerprint is the one you apply with.

Done when the user explicitly says to apply the dry run you showed last ("apply it"), or declines the proposal.

## 3. Apply

Only on that explicit word, as the skill's _Guardrails_ say, with the file exactly as it was for that dry run. Run, as one Bash call on its own:

```
npm --prefix C:/Projects/Health/Exercise-deployed run coach -- apply YYYY-MM-DD-HHmm-proposal.json <fingerprint>
```

Read what it prints, and act on it:

- **`Applied …`**, then each change, then `Wrote proposals/… and removed the draft.`: applied. Any `Backed up … to <folder>.` line names where the documents it changed are kept as they were: tell the user.
- **`Not applied: changed since the preview.`**: the file or the data it touches changed after the dry run (an edit on the phone, say). Nothing was written. Run the dry run again, show it, and ask again.
- **Any other `Not applied: <why>`**: nothing was written. Fix the proposal for that reason, then dry run, show and ask again.
- **`Applying stopped at change <n>: <why>.`**, then `Landed:`, `Landed partly:` and `Didn't land:`: some changes are in Forge and some aren't. Tell the user exactly which landed, which landed partly (what was and wasn't written), which didn't, and why it stopped. The draft is kept, and the same proposal won't apply again: write what's left as a new proposal, `drafts/YYYY-MM-DD-HHmm-proposal-2.json`, and dry run, show and ask as before. Leave the stopped draft in `drafts/`: it holds the reasons for what landed.
- **`Applied …`, then `Couldn't write its record …` or `… couldn't remove the draft …`**: applied, but the clean-up didn't finish. The message says what to do: do it, and tell the user.
- **Anything else** (`Couldn't read the data: …`, the usage text, an error): nothing was applied. Fix the cause (a failed read: the user runs `! npx firebase login`), then run the dry run again and ask again, since the data may have changed.

Done when the output says it applied, or every change is accounted for after a stop, or the user declined.

## Declined

When the user turns the proposal down, delete the draft. Nothing reaches Firestore.

Done when the draft is gone.
