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
- **Hard sets**: warm-up sets excluded; a set counts 1 for each primary muscle and 0.5 for each secondary.
- **Routine → routine day → slot**: a slot has target sets, a rep range and an optional target RIR. Routines are versioned; a new version is created when a coach proposal is accepted or the user saves changes.
- **Workout**: a date, gym, optional routine day, optional note, and ordered exercises each with sets. Editable and deletable after the fact; can be back-dated.
- **Set**: weight (or added/assist load), reps (or seconds, or time + distance), optional RIR, flags: warm-up, drop set.
- **Body weight log**: date + weight. Used for bodyweight-exercise volume and e1RM, and by the coach.
- **Coach profile**: goals, age, body weight, experience, injuries / movements to avoid, target days per week.

## Logging

- Start a workout from a routine day or freestyle. The exercise picker shows the current gym's exercises, with a toggle for all.
- If a slot's exercise isn't at this gym, one-tap swaps offer exercises sharing its primary muscle at this gym. The logged exercise is what was actually done.
- Add, skip or reorder exercises in a workout; changes apply to that workout unless saved to the routine.
- Each exercise shows its **last workout** in one line (`Oct 14 · 135×10, 135×9, 135×8 · RIR 1`); tap for full history: every workout, a mini e1RM chart, records.
- New sets prefill from the previous set; the first set from the last workout (or the suggestion), or a dash when there's neither. Big +/− steppers, tap a number to type, one tap on `LOG SET n →` to log.
- While logging, the header names the gym as a plain label (`AT WORK`), and each exercise shows its region tag (`■ PUSH · CHEST`), as in the exercise list.
- Rest timer starts when a set is logged (optional, vibrates). New records get a small celebration.
- **Supersets** (most exercises are done this way when the gym allows): pair exercises in one or two taps, or start from a routine day's planned pairs; pair, unpair and re-pair at any point. Logging a set jumps to the partner's next set with no rest; rest comes once per round, using the longer of the two rest defaults. Each set records its superset membership, so history stays truthful when a pair is broken. Screens are designed for single exercises and pairs; three or more is allowed.

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

- Runs on the user's Claude subscription through **Claude Code**, not an API key.
- **Weekly review**: a scheduled Claude Code cloud routine (Sunday evening) reads Firestore and writes a review to the Coach tab: neglected muscle groups, progressive overload, frequency and recovery, concrete changes. Skipped when the week had no workouts; the first review after a break covers the gap and the rebuild.
- **On demand**: `/coach` in Claude Code, from the computer or from the phone via claude.ai/code. Debriefs are also written to the Coach tab.
- **Proposals**: the coach may write or change routines, but changes arrive as proposals with a change list and reasons; nothing changes until accepted. Accepting creates a new routine version.
- **Persona**: David Goggins' intensity (blunt, mild profanity, "stay hard") with Andrew Huberman's mechanism-and-protocol explanations behind every recommendation.
- Reads exercise and workout notes, the profile and body weight.

## Look: "Slab" (chosen 2026-10-21)

Bold editorial, from the style prototype (direction C): https://claude.ai/artifact/5NAGs3dJNCtG1kbNZ2Ncbd. Its two Slab boards, with a picture of each, are kept in [`docs/design/prototype/`](docs/design/prototype/).

- Ground `#121212`, raised surface `#1c1c1c`, rules `#2a2a2a` / `#333333`, square corners (2–4 px).
- Type: Big Shoulders Display (headings, big numerals, uppercase) + JetBrains Mono (labels, tables, body).
- Accent: acid lime `#e6ff3a` (primary action, hero numbers); secondary: coral `#ff7a6e`. Text `#f2f2f2`, muted `#9a9a9a` (6.7:1).
- Chart series, validated for the dark surface (adjacent pairs, CVD and normal-vision floors): Push `#b88c00`, Pull `#3d8bff`, Legs `#f04d42`, Core `#12a383`, in that fixed order.
- Heat-map ramp (ordinal, validated): empty `#242424`, then `#5b6a0b`, `#8aa114`, `#bcd923`, `#e6ff3a`.

## Build order

0. Style prototype: 2–3 visual directions, picked on the phone.
1. Logging: gyms, library, routines, logging, last workout + history, suggested weights, body weight, rest timer.
2. Dashboard: all charts, phone and desktop layouts.
3. Coach: `/coach`, the weekly routine, the Coach tab, proposals.
4. Later: in-app "Ask coach" button (Firestore → server function → GitHub event → routine), history import, per-gym equipment.

## To verify before building

- Firebase Spark (free) plan limits and that it has no inactivity pausing.
- Which GitHub events can start a Claude Code routine (phase 4).
