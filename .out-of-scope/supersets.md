# Supersets

Forge doesn't record supersets for now. The maintainer still supersets at the gym, but logs each exercise on its own: every set starts that exercise's rest timer, the Log tab stays on the exercise until they move on with ← / →, and undo takes back that exercise's last set. Nothing offers "Superset with", plans a pair in a routine, or marks a superset on any screen.

Workouts and routine versions saved before then keep their superset fields in the stored data, untouched. Nothing reads them except the CSV export, whose `superset`, `round` and `superset_with` columns stay filled for those sets and empty for every set since. The words _Superset_ and _Round_ stay in `GLOSSARY.md`, since old data and the coach still use them.

## Why this is out of scope

The maintainer took supersets out (#167, decided 2026-11-14): the design built in #17 didn't fit how they actually superset. It paired exercises in a fixed member order, rotated the Log tab through them and rested once per round, and using it at the gym turned up a rotation bug (#119) and requests for a different way of making and seeing pairs (#120, #121). Rather than build on that design, they chose to drop it until a better one exists. They accepted skipping the rest timer and moving with ← / → in the meantime (triage, 2026-11-15).

Any return of supersets starts with a design round (mock-ups, or a prototype on the phone) about how the maintainer supersets, not with the #17 design. The stored fields were left in place so that option stays open.

## Prior requests

- #120: "Log tab: show which exercises are in a superset"
- #121: "Log tab: make a superset by dragging one exercise onto another"

#119 ("Superset: logging the second exercise doesn't go back to the first"), a bug in the removed rotation, was closed with them.
