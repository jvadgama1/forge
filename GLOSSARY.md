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

**In progress** (of a workout):
Started and not yet finished. It finishes when the user taps Finish, or by itself once abandoned: 3 hours after its last set (or its start, with no sets), timed at its last set. One with no sets is discarded instead.
_Avoid_: Open, active

**Set**:
One effort at an exercise: a load and a count (reps, seconds, or time and distance), together its measure, plus an optional RIR and optional flags.

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
A set taken close to failure, counted toward a muscle group's weekly volume (1 for primary, 0.5 for secondary): not a warm-up, and not logged at RIR 4+ (a set with no RIR recorded counts). Strength sets and timed holds count; cardio never does, even though cardio exercises are tagged with the muscles they work. A day's or a workout's hard sets count each set once.

**Training week**:
A Monday-to-Sunday week with at least one finished workout. Weekly averages on the Stats board divide by training weeks, so a week off doesn't lower them.

**Last workout** (for an exercise):
The most recent workout containing that exercise; its sets are shown while logging.
_Avoid_: Last session, previous

**Superset**:
Two or more exercises in a workout done alternately, one set of each per round, with rest only after each round. Usually a pair. The app doesn't record supersets for now (#167): the user still does them, and workouts logged before then keep theirs.
_Avoid_: Circuit, paired set, giant set

**Round**:
One set of each exercise in a superset, done back to back. Not recorded by the app for now (#167), like supersets.

**Rest default**:
How long to rest after a set of an exercise, which the rest timer counts down: 90 s unless set for the exercise. It can be Off: no rest timer for that exercise.

**Pinned note**:
A note attached to an exercise, shown every time it is logged (seat height, grip).

**Body weight entry**:
A dated body-weight reading. Set text writes body weight as BW ("BW + 25 lb × 8").

## Routines and progression

**Routine**:
A named, versioned training plan made of routine days, such as "PPL Hypertrophy".
_Avoid_: Program, template, plan, split

**Routine day**:
One workout's worth of a routine, such as Push A: an ordered list of slots.

**Slot**:
One exercise in a routine day, with target sets, a rep range and an optional target RIR.

**Routine version**:
An immutable snapshot of a routine. Saving changes or applying a proposal creates a new version; past workouts keep pointing at the version they followed.

**Swap**:
Replacing a slot's exercise for one workout with another available at the current gym that shares its primary muscle and is the same kind of exercise: strength for strength, timed hold for timed hold, cardio for cardio.

**Suggested weight**:
The load the app proposes for an exercise's next working sets, computed without AI.

**Double progression**:
The rule behind suggested weights: hold the load until every working set reaches the top of the rep range, then add the exercise's increment; two workouts below the bottom of the range suggests holding or dropping.

**Increment**:
The load step for an exercise's progression. By default it follows the exercise's body half: +5 lb upper body, +10 lb lower body (2.5 kg and 5 kg for an exercise in kg).

**Tonnage**:
Load × reps over a workout's sets that aren't warm-ups: a bodyweight set counts the body weight on the day plus the added load, an assisted set the body weight less the assist. Timed holds and cardio have none. Shown in one unit, that of the most recently logged set with a load.
_Avoid_: Volume (hard sets are the volume a muscle group gets)

**Comeback**:
The first workout with an exercise after 14 or more days without it; its suggested weight is about 90% of the last working weight.
_Avoid_: Deload (a deload is planned; a comeback follows a break)

**e1RM** (estimated one-rep max):
The heaviest single rep a set implies, estimated from its load and reps.

**Record**:
A best-ever result for an exercise (heaviest load, best e1RM, most reps at a load). For a bodyweight exercise the heaviest load and e1RM count the body weight on the day; for an assisted one the load record is the least assist and there is no e1RM. Timed holds and cardio have none.
_Avoid_: PR (collides with "pull request" in this project's process vocabulary)

## The app

**App version**:
The copy of Forge a device is running, named by its commit. Each deploy makes a new one. The screen calls it "Version"; it has nothing to do with a routine version.
_Avoid_: Build, release

**Feedback item**:
A note about the app itself that the user sends from the Feedback screen, saved with when it was sent, the app version and any workout in progress. It is filed once an issue has been opened from it.
_Avoid_: Bug report, comment (a comment belongs to an issue or pull request)

## Coaching

**Coach**:
The AI persona (Goggins intensity, mechanism-first explanations) that leads coaching sessions. The only AI feature.

**Coaching session**:
One conversation with the coach and, once the user approves it, its saved entry: a date, a one-line verdict, insights, commitments, follow-ups and any corrections to earlier insights.
_Avoid_: Weekly review, debrief, review, report, session (a session alone is ambiguous with a workout)

**Insight**:
One point the coach makes in a coaching session: a title and the reasoning behind it, at one of two levels. **Training** covers the training itself (sets, loads, exercise choice, progress, volume, frequency); **Strategy** covers the bigger picture (goals, the plan's structure, recovery, sleep, food, cardio, mobility, lifestyle).
_Avoid_: Tip, finding, recommendation

**Commitment**:
An action the user agrees in a coaching session to take before the next one, about training or, when agreed, lifestyle.
_Avoid_: Goal (goals belong to the coach profile), task, homework

**Follow-up**:
The result of an earlier commitment, recorded in the next coaching session, saying whether it was checked against logged data or comes from the user's own account.
_Avoid_: Check-in

**Coach notes**:
The coach's private files outside the repo: the coach profile, the notebook (its running memory), a summary of each conversation, a Markdown copy of each saved coaching session, and a record of each applied proposal.
_Avoid_: Memory, coach log

**Coach profile**:
What the coach always knows about the user (goals, age, experience, injuries and movements to avoid, target days per week, life constraints), kept as a private file in the coach notes.

**Proposal**:
A set of changes to the user's set-up (routines, gyms, custom exercises, exercise settings), each with a reason, written by the coach, that does nothing until the user approves its dry run. Part of phase 3.
_Avoid_: Plan, build sheet, change list
