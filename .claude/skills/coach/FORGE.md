# How the Forge data works

Reference for reading the export in `forge-data.txt`. The field-by-field shapes are the JSDoc types in the checkout's `app/js/core/types.js`; the words are `GLOSSARY.md`'s. This file holds what those don't say.

## The export

`gyms`, `customExercises`, `exerciseSettings`, `routines`, `workouts`, `bodyWeights`, `settings` and `coachingSessions`, as `exportJson()` in the checkout's `app/js/core/forge.js` builds them. Workouts and coaching sessions come newest first.

- **Exercises**: a workout names exercises by id. The seeded ones, with their type, primary and secondary muscle groups and body half, are in the checkout's `app/js/core/seed-library.js`; the user's own are in `customExercises`. Muscle groups and regions are in `app/js/core/muscle-groups.js`.
- **Exercise settings**: per exercise, only what the user changed from the defaults (unit, increment, rest default, pinned note). No entry means lb, the default increment and a 90 s rest.
- **Workouts**: `date` is the local date; `startedAt`, `finishedAt` and each set's `loggedAt` are UTC timestamps. A workout without `finishedAt` is in progress. `routine` names the routine, its version and the routine day it followed; none means freestyle. An entry with `swappedFor` replaced that slot's exercise for the workout. A set's `load` is the added load for bodyweight × reps, the assist for assisted (less is harder), and 0 for cardio. `rir` 4 means "4 or more".
- **Routines**: each keeps every version; workouts point at the version they followed.
- **Coaching sessions**: `savedAt` is UTC. `followUps` record how the previous session's commitments went.

## Supersets

The user does supersets but doesn't record them: the app took supersets out (#167). So:

- Exercises done alternately look like ordinary consecutive exercises. A missing pairing isn't a gap in the plan.
- Time between sets, from `loggedAt`, includes the other exercise's sets: it isn't rest, and it says little about density.
- Older workouts and routine versions still carry `supersets`, a set's `superset` and a slot's `superset` from before #167. Read them as history; expect none on anything newer.

## The app's numbers

- **Working set**: neither a warm-up nor a drop set. Working sets drive suggested weights and records.
- **Hard set**: not a warm-up, not logged at RIR 4+ (no RIR counts), not cardio; drop sets count. Each counts 1 for each primary muscle group and 0.5 for each secondary. The Stats board shows hard sets per training week, so a week off doesn't lower the average.
- **e1RM**: Epley, load × (1 + reps / 30), for working sets of 1 to 12 reps with a load. A bodyweight set counts the body weight on or before its workout's date plus the added load; assisted, timed holds and cardio have none.
- **Records**: heaviest load (least assist for assisted), best e1RM, and most reps at each load.

## Double progression

How the app sets the suggested weight for an exercise's next working sets (`progression` in the checkout's `app/js/core/forge.js`). It's what the user sees at the gym, so weigh your advice against it.

1. It starts from the load of the last working set of the last finished workout with working sets of the exercise.
2. The rep range is the slot's in the routine day the workout follows; otherwise the slot's in the most recently saved routine that has the exercise. With no rep range, it holds.
3. In order, the first that applies:
   - **Comeback**: 14 or more days since the exercise was last done: about 90% of the last working load, rounded down to the increment (assisted: one increment more assist).
   - **Up**: every working set of the last workout reached the top of the range: add one increment.
   - **Down**: the last two workouts each had a working set below the bottom of the range, at the same load: drop one increment.
   - **Hold** otherwise.
4. **Increment**: the exercise's setting, else +5 lb upper body and +10 lb lower body (2.5 kg and 5 kg). For assisted, "add" means less assist.
5. RIR plays no part. Timed holds and cardio get no suggestion.

## Computing

Count with code, not by eye: write throwaway scripts in the scratchpad, and use the app's own rules where you can, so your numbers match what the user sees in the app. The core runs over an in-memory store filled from the export:

```js
import { readFileSync } from "node:fs";
import { createForge } from "file:///C:/Projects/Health/Exercise-deployed/app/js/core/forge.js";
import { SEED_LIBRARY } from "file:///C:/Projects/Health/Exercise-deployed/app/js/core/seed-library.js";
import { createMemoryStore } from "file:///C:/Projects/Health/Exercise-deployed/app/js/store/memory-store.js";

const text = readFileSync(process.argv[2], "utf8");
const data = JSON.parse(text.slice(0, text.lastIndexOf("\nInsight files:")));
const { app, exportedAt, settings, ...collections } = data;
const store = createMemoryStore({ ...collections, settings: [settings] });
const forge = createForge({ store, library: SEED_LIBRARY });
```

`forge` then answers as the app does, for example `await forge.records(exerciseId)`, `await forge.history(exerciseId)` and `await forge.dashboard()` (the Stats board for the range last chosen). Its methods are documented in `forge.js`. Save scripts as `.mjs` and pass the data file's path as the argument.
