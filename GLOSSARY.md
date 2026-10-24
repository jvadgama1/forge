# Forge

A personal strength-training log with progress charts and an AI coach. These are the words the code, issues and UI use.

## Training

**Exercise**:
A movement that is tracked over time, such as Lat Pulldown or Incline DB Press. The unit of history, progress and coaching, whichever gym it is done at.
_Avoid_: Machine, equipment, movement, lift

**Exercise type**:
How an exercise's sets are measured: weight × reps, bodyweight × reps (with optional added load), assisted (machine offset), timed hold, or cardio (time and optional distance).

**Muscle group**:
One of the 17 fixed body regions used for tagging exercises and counting hard sets (chest, front delts, side delts, rear delts, biceps, triceps, forearms, lats/upper back, traps, lower back, abs, obliques, glutes, quads, hamstrings, adductors, calves).
_Avoid_: Body part, muscle, body region

**Primary muscle** / **Secondary muscle**:
The muscle groups an exercise mainly works / also works. A hard set counts 1 for each primary and 0.5 for each secondary.

**Region**:
One of four groupings of muscle groups used for colour and summaries: Push (chest, front delts, side delts, triceps), Pull (rear delts, biceps, forearms, lats/upper back, traps), Legs (glutes, quads, hamstrings, adductors, calves), Core (abs, obliques, lower back).

**Gym**:
A named place the user trains, defined by the list of exercises available there (Work, Apartment, Home). Filters the exercise picker; does not change how weights compare.
_Avoid_: Location, facility

**Exercise library**:
All exercises the app knows: a seeded set of about 150 with muscle tags, plus the user's custom ones.

## Logging

**Workout**:
One training occasion on one date at one gym: an ordered list of exercises, each with its sets, plus an optional note.
_Avoid_: Session, training, log

**Set**:
One effort at an exercise: a load and a count (reps, seconds, or time and distance), an optional RIR, and optional flags.

**Working set**:
A set that is neither a warm-up nor a drop set; the sets that drive suggested weights and records.

**Warm-up set**:
A set flagged as preparation; excluded from hard sets, records and progression.

**Drop set**:
A set done immediately after another at reduced load, flagged so progression ignores it.

**RIR** (reps in reserve):
How many more reps the user could have done at the end of a set. Optional per set.
_Avoid_: RPE

**Hard set**:
A non-warm-up set counted toward a muscle group's weekly volume (1 for primary, 0.5 for secondary).

**Last workout** (for an exercise):
The most recent workout containing that exercise; its sets are shown while logging.
_Avoid_: Last session, previous

**Superset**:
Two or more exercises in a workout done alternately, one set of each per round, with rest only after each round. Usually a pair.
_Avoid_: Circuit, paired set, giant set

**Round**:
One set of each exercise in a superset, done back to back.

**Pinned note**:
A note attached to an exercise, shown every time it is logged (seat height, grip).

**Body weight entry**:
A dated body-weight reading.

## Routines and progression

**Routine**:
A named, versioned training plan made of routine days, such as "PPL Hypertrophy".
_Avoid_: Program, template, plan, split

**Routine day**:
One workout's worth of a routine, such as Push A: an ordered list of slots.

**Slot**:
One exercise in a routine day, with target sets, a rep range and an optional target RIR.

**Routine version**:
An immutable snapshot of a routine. Saving changes or accepting a proposal creates a new version; past workouts keep pointing at the version they followed.

**Swap**:
Replacing a slot's exercise for one workout with another available at the current gym that shares its primary muscle.

**Suggested weight**:
The load the app proposes for an exercise's next working sets, computed without AI.

**Double progression**:
The rule behind suggested weights: hold the load until every working set reaches the top of the rep range, then add the exercise's increment; two workouts below the bottom of the range suggests holding or dropping.

**Increment**:
The load step for an exercise's progression (default +5 lb upper body, +10 lb lower body).

**Comeback**:
The first workout with an exercise after 14 or more days without it; its suggested weight is about 90% of the last working weight.
_Avoid_: Deload (a deload is planned; a comeback follows a break)

**e1RM** (estimated one-rep max):
The heaviest single rep a set implies, estimated from its load and reps.

**Record**:
A best-ever result for an exercise (heaviest load, best e1RM, most reps at a load).
_Avoid_: PR (collides with "pull request" in this project's process vocabulary)

## Coaching

**Coach**:
The AI persona (Goggins intensity, Huberman explanations) that reviews training and proposes changes. The only AI feature.

**Coach profile**:
What the coach always knows about the user: goals, age, body weight, experience, injuries and movements to avoid, target days per week.

**Weekly review**:
The coach's scheduled report on a week of training; skipped for a week with no workouts.

**Debrief**:
An on-demand coach report on recent workouts.

**Proposal**:
A routine change written by the coach, with a change list and reasons, that does nothing until the user accepts it.
