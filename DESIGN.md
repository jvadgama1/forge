# Forge: design

A personal workout tracker: phone-first logging, a desktop dashboard over the same data, and an AI coach. For the user only, never distributed. Settled in a design interview on 2026-10-21. Terms follow `GLOSSARY.md`; trade-offs are recorded in `docs/adr/`; how we work is in `CLAUDE.md`.

## Principles

- **Everything works without AI** except coaching. Suggested weights, history, charts: plain code.
- **Picking back up after a break costs nothing.** Breaks of a week or more are normal (vacations). No service may pause, expire or need attention while the user is away.
- **Beautiful, and readable with reduced colour sensitivity.** The user's colour sensitivity is reduced across all colours: saturated, bright, high-luminance colour on near-black; bold numerals; colour is never the only signal (labels, shapes, position too). Every palette is checked with the dataviz skill's validator.
- **A set takes one tap on a good day.**

## Platform

- **PWA**, plain HTML/CSS/JS, no build step, no Node at runtime (npm is dev tooling only). Installed to the Android home screen.
- **Hosting:** GitHub Pages from a public repo (code only; nothing personal lives in the repo).
- **Data:** Firebase Firestore, Google sign-in, security rules restrict all data to the user's account. Chosen over Supabase because Supabase's free tier pauses after 7 idle days. Firestore offline persistence gives offline logging for free (a nice-to-have: the gyms have good signal).
- **One app, two layouts:** the phone opens on logging; a wide screen opens on the dashboard. Charts are shared code.
- **Export all data** (JSON + CSV) from Settings. No other local copy.

## Domain

- **Exercise**: the unit of tracking, progress and coaching (e.g. Lat pulldown). Has primary and secondary muscle groups, a type, a default unit and an increment.
  - Types: weight × reps; bodyweight × reps (optional added load); assisted (machine-offset weight); timed hold; cardio (time + optional distance).
  - Units: lb or kg per exercise.
  - A pinned note shown whenever it's logged (seat height, grip...).
- **Gym**: a named list of available exercises (Work, Apartment, Home). The gym does **not** affect comparability of weights (may revisit: then each gym gets its own equipment per exercise). Each workout records its gym anyway.
- **Exercise library**: about 150 common exercises seeded with muscle tags; custom exercises can be added (the coach can suggest tags).
- **Muscle groups (17)**: chest, front delts, side delts, rear delts, biceps, triceps, forearms, lats/upper back, traps, lower back, abs, obliques, glutes, quads, hamstrings, adductors, calves.
- **Hard sets**: warm-up sets and sets logged at RIR 4+ excluded (no RIR recorded still counts); a set counts 1 for each primary muscle and 0.5 for each secondary.
- **Routine → routine day → slot**: a slot has target sets, a rep range and an optional target RIR. Routines are versioned; a new version is created when a coach proposal is accepted or the user saves changes.
- **Workout**: a date, gym, optional routine day, optional note, and ordered exercises each with sets. Editable and deletable after the fact; can be back-dated.
- **Set**: weight (or added/assist load), reps (or seconds, or time + distance), optional RIR, flags: warm-up, drop set.
- **Body weight log**: date + weight. Used for bodyweight-exercise volume and e1RM, and by the coach.
- **Coach profile**: goals, age, experience, injuries / movements to avoid, target days per week, life constraints. A private file in the coach notes on the laptop, never in the app or the repo.

## Logging

- Start a workout from a routine day or freestyle. The exercise picker shows the current gym's exercises, with a toggle for all.
- If a slot's exercise isn't at this gym, one-tap swaps offer exercises sharing its primary muscle at this gym. The logged exercise is what was actually done.
- Add, skip or reorder exercises in a workout; changes apply to that workout unless saved to the routine.
- Each exercise shows its **last workout** in one line (`Oct 14 · 135×10, 135×9, 135×8 · RIR 1`); tap for full history: every workout, a mini e1RM chart, records.
- New sets prefill from the previous set; the first set from the last workout (or the suggestion), or a dash when there's neither. Big +/− steppers, tap a number to type, one tap on `LOG SET n →` to log.
- While logging, the header names the gym as a plain label (`AT WORK`), and each exercise shows its region tag (`■ PUSH · CHEST`), as in the exercise list.
- Rest timer starts when a set is logged (optional, vibrates). New records get a small celebration.
- **Supersets**: the app doesn't record supersets for now (#167). The user still does them at the gym, logging each exercise's sets as single exercises and moving between them with ← / →. The design built in #17 didn't fit how they superset, so any return starts with a new design (`.out-of-scope/supersets.md`). Workouts logged with supersets keep them in their stored data, which only the CSV export reads.

## Suggested weights (no AI)

- **Double progression**: when every working set reaches the top of the rep range, suggest the next increment (default +5 lb upper body, +10 lb lower body; per-exercise override). Missing the bottom of the range in two workouts in a row with that exercise → suggest hold or drop.
- **After a break**: an exercise not done for 14+ days suggests about 90% of the last working weight for the first workout back, then normal progression resumes.
- The coach's accepted proposals can override targets.

## Dashboard

- Estimated 1RM trend per exercise.
- Record timeline.
- Hard sets per muscle per week against a 10–20 target band.
- Front/back body heat map of weekly volume per muscle.
- Calendar heat map of training days.
- Volume (tonnage) per workout and per week.
- Muscle-group split over time.
- Every chart: hover shows the details behind each mark; click drills into the workouts.

## Coach

Specified in #170; the architecture is ADR-0008.

- **`/coach` in Claude Code on the laptop**, on the user's Claude subscription, not an API key. It runs only when invoked: nothing scheduled, no cloud routine, no service account, no coaching from the phone. It signs in with the maintainer's Firebase CLI login and runs against the deployed code (a checkout of `origin/main` beside the repo), reading and saving through the Forge core.
- **What it reads, every coaching session**: all Forge data (gyms, the exercise library, exercise settings, routines with every version, every workout with its sets and notes, body weight, settings), every coaching session saved so far, the coach profile, the notebook and the summaries of the last few conversations.
- **A coaching session**: the coach opens with its own fresh-eyes read (what changed since last time, how each open commitment went, its top challenges at both levels), then the conversation follows. `/coach <topic>` lets the user lead on a topic; the coach still raises anything urgent. A coaching session runs even with nothing logged since the last one, and several can run on one day. The first one starts with a short intake that writes the coach profile, then goes straight on to a look at the whole history.
- **What it looks at**: the training level (workouts, sets, reps, loads, RIR, exercise choice, e1RM trends and records, hard sets by muscle group and region, frequency and breaks, body weight, notes) and the strategy level (the goals themselves, the plan's structure, recovery and sleep, general well-supported nutrition, cardio, conditioning and mobility, lifestyle). It knows supersets are done but not recorded, and how double progression sets suggested weights; it may tell the user to ignore a suggestion, always saying why and that the app will keep suggesting as before.
- **Its boundary**: it stops at diagnosis (pain or an injury: what to avoid, and see a professional), and gives no specific diet plans or supplement doses beyond general, well-supported guidance.
- **Persona**: David Goggins' intensity (blunt, mild profanity, "stay hard"), a mechanism-first explanation behind every recommendation, and honesty in conversation about how strong the evidence is (strong, mixed, or a guess). No fringe protocols.
- **Saving**: at the end the coach drafts the coaching session entry: a one-line verdict in its voice, 1 to 6 insights, aiming for 3 to 6 (each Training or Strategy, with a title and a body giving the reasoning, no evidence grades), any commitments agreed (none if none were), follow-ups of the previous commitments (checked against logged data, or from the user's own account), and any corrections to earlier insights. "Save that as an insight" adds to the draft mid-conversation. The user sees and can change the whole draft; nothing reaches Firestore until they approve it by running the save themselves, and turning it down saves nothing there. A save only adds a new coaching session; none is ever changed or deleted.
- **Coach notes**, in a private folder on the laptop outside the repo (ADR-0008), never committed or uploaded: the coach profile (changes suggested by the coach, made only once approved), the notebook, which the coach rewrites at the end of each coaching session and keeps short (long-running threads, patterns, how the user responds to being pushed), a private summary of each conversation (written even when the entry isn't saved), and a Markdown copy of each saved coaching session, which every run rewrites when missing or out of date. "Off the record" means nothing about that conversation is written anywhere. At the end the coach says what it changed in its notes. No backup yet (#169).
- **The Coach page**: read-only. The latest coaching session in full at the top (verdict, commitments, then insights grouped by Training and Strategy, labelled in text as well as colour), "Last coached N days ago", and earlier coaching sessions below by date and verdict, newest first, each opening in full. Before the first coaching session it says to run `/coach` on the laptop. On a wide screen, the latest coaching session is on the left and the earlier ones on the right. Works offline once loaded; coaching sessions are part of the data export.
- **Not in phase 3**: proposals (the coach writing or changing routines; routine changes stay the user's, made in the app), and coaching changing suggested weights or double progression (ADR-0004).

## Look: "Slab" (chosen 2026-10-21)

Bold editorial, from the style prototype (direction C): https://claude.ai/artifact/5NAGs3dJNCtG1kbNZ2Ncbd. Its two Slab boards, with a picture of each, are kept in [`docs/design/prototype/`](docs/design/prototype/).

- Ground `#121212`, raised surface `#1c1c1c`, rules `#2a2a2a` / `#333333`, square corners (2–4 px).
- Type: Big Shoulders Display (headings, big numerals, uppercase) + JetBrains Mono (labels, tables, body).
- Accent: acid lime `#e6ff3a` (primary action, hero numbers); secondary: coral `#ff7a6e`. Text `#f2f2f2`, muted `#9a9a9a` (6.7:1).
- Chart series, validated for the dark surface (adjacent pairs, CVD and normal-vision floors): Push `#b88c00`, Pull `#3d8bff`, Legs `#f04d42`, Core `#12a383`, in that fixed order.
- Heat-map ramp (calendar) (ordinal, validated): empty `#242424`, then `#5b6a0b`, `#8aa114`, `#bcd923`, `#e6ff3a`.
- Body heat map (chosen in #156, validated on `#121212` over all pairs, none included: CVD ΔE ≥ 16.6, normal vision ≥ 24.6; every shaded level ≥ 3:1): none `#333333`, then cold to hot as hard sets per week climb, four steps of a rainbow scale: blue `#2a4bff` (under 5), cyan `#19c8e6` (5 to under 10), orange-yellow `#ffb000` (10–20), red `#ff2a1a` (over 20). Hue carries the order, not lightness: the orange-yellow is the brightest step, brighter than the red above it. The legend's numbers and each muscle group's reading keep colour from being the only signal. Figures are curved shapes on a soft silhouette.

## Build order

0. Style prototype: 2–3 visual directions, picked on the phone.
1. Logging: gyms, library, routines, logging, last workout + history, suggested weights, body weight, rest timer.
2. Dashboard: all charts, phone and desktop layouts.
3. Coach (#170): coaching sessions in the core, a REST store for Node tools, the coach command (`npm run coach`), the `/coach` skill and its coach notes, and the Coach page.
4. Later: in-app "Ask coach" button (Firestore → server function → GitHub event → routine), which depends on revisiting ADR-0008 since the coach now runs only on the laptop; history import; per-gym equipment.

## To verify before building

- Firebase Spark (free) plan limits and that it has no inactivity pausing.
- Which GitHub events can start a Claude Code routine (phase 4).
