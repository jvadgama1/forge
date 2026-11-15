# How the Forge data works

Reference for reading the export. The field-by-field shapes are the JSDoc types in the checkout's `app/js/core/types.js`; the words, and what a working set, hard set, e1RM and record are, are `GLOSSARY.md`'s. This file holds what those don't say.

## Query scripts

The data reaches you only through a pipe: `npm --prefix C:/Projects/Health/Exercise-deployed run --silent coach -- read | node <scratchpad>/<script>.mjs`. Count with code, not by eye, and use the app's own rules, so your numbers match what the user sees in the app.

Save this once as `<scratchpad>/load.mjs`. It reads the pipe and runs the checkout's Forge core over an in-memory copy:

```js
import { readFileSync } from "node:fs";
const CHECKOUT = "file:///C:/Projects/Health/Exercise-deployed/";
const { createForge } = await import(CHECKOUT + "app/js/core/forge.js");
const { SEED_LIBRARY } = await import(CHECKOUT + "app/js/core/seed-library.js");
const { createMemoryStore } = await import(
  CHECKOUT + "app/js/store/memory-store.js"
);

const text = readFileSync(0, "utf8");
const end = text.lastIndexOf("\nInsight files:");
if (end < 0) {
  console.error(text.trim()); // the read failed: this says why
  process.exit(1);
}
export const data = JSON.parse(text.slice(0, end));
export const insightFiles = text.slice(end + 1).trim();
const { app, exportedAt, settings, ...collections } = data;
export const forge = createForge({
  store: createMemoryStore({ ...collections, settings: [settings] }),
  library: SEED_LIBRARY,
});
```

Each query script starts `import { data, forge } from "./load.mjs";` and prints only what it needs: Claude Code cuts tool output at about 30,000 characters, so page through long lists. `forge` answers as the app does, for example `await forge.records(exerciseId)`, `await forge.history(exerciseId)` and `await forge.dashboard()` (the Stats board for the range last chosen); its methods are documented in the checkout's `app/js/core/forge.js`.

## The export

`gyms`, `customExercises`, `exerciseSettings`, `routines`, `workouts`, `bodyWeights`, `settings` and `coachingSessions`, as `exportJson()` in `forge.js` builds them. Workouts and coaching sessions come newest first.

- **Exercises**: a workout names exercises by id. The seeded ones, with their type, primary and secondary muscle groups and body half, are in the checkout's `app/js/core/seed-library.js`; the user's own are in `customExercises`. Muscle groups and regions are in `app/js/core/muscle-groups.js`.
- **Exercise settings**: per exercise, only what the user changed from the defaults (unit, increment, rest default, pinned note). No entry means lb, the default increment and a 90 s rest.
- **Workouts**: `date` is the local date; `startedAt`, `finishedAt` and each set's `loggedAt` are UTC timestamps. A workout without `finishedAt` is in progress. `routine` names the routine, its version and the routine day it followed; none means freestyle. An entry with `swappedFor` replaced that slot's exercise for the workout. A set's `load` is the added load for bodyweight × reps, the assist for assisted (less is harder), and 0 for cardio. `rir` 4 means "4 or more".
- **Routines**: each keeps every version; workouts point at the version they followed.
- **Coaching sessions**: `savedAt` is UTC. `followUps` record how earlier commitments went.

## Supersets

The user does supersets but doesn't record them: the app took supersets out (#167). So:

- Exercises done alternately look like ordinary consecutive exercises. A missing pairing isn't a gap in the routine.
- Time between sets, from `loggedAt`, includes the other exercise's sets: it isn't rest, and it says little about density.
- Older workouts and routine versions still carry `supersets`, a set's `superset` and a slot's `superset` from before #167. Read them as history; expect none on anything newer.

## The app's numbers

What the glossary leaves out:

- **Hard sets**: drop sets count; the Stats board divides by training weeks.
- **e1RM**: Epley, load × (1 + reps / 30), for working sets of 1 to 12 reps with a load above 0. A bodyweight set counts the body weight on or before its workout's date plus the added load.

## Double progression

How the app sets the suggested weight for an exercise's next working sets (`progression` in `forge.js`). It's what the user sees at the gym, so weigh your advice against it.

1. It starts from the load of the last working set of the last finished workout with working sets of the exercise.
2. The rep range is the slot's in the routine day the workout follows; otherwise the slot's in the most recently saved routine that has the exercise.
3. In order, the first that applies:
   - **Comeback**: 14 or more days since the exercise was last done (a warm-up-only workout counts): about 90% of the last working load, rounded down to the increment (assisted: one increment more assist). This needs no rep range.
   - **Up**: every working set of the last workout reached the top of the range: add one increment.
   - **Down**: the last two workouts each had a working set below the bottom of the range, at the same load: drop one increment.
   - **Hold** otherwise, and also with no rep range, or with no room to move (no added load to drop, no assist left to take).
4. **Increment**: the exercise's setting, else +5 lb upper body and +10 lb lower body (2.5 kg and 5 kg). For assisted, "add" means less assist.
5. RIR plays no part. Timed holds and cardio get no suggestion.
