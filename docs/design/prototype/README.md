# Slab style prototype

The two boards of the style prototype's direction C, "Slab", which the app's look copies (`DESIGN.md` § Look). Kept here so the design survives (#46); the full prototype, with the rejected Ember and Pulse directions, is the artifact linked from `DESIGN.md`.

These are design reference, not app code: nothing here is served or cached by the app.

| Board                            | Picture            | What copies it                                                                                 |
| -------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `SlabLog.dc.html`: log a set     | `SlabLog.png`      | The Log tab's workout screen; the last-workout card and target rep range (#13, #15)            |
| `SlabProgress.dc.html`: progress | `SlabProgress.png` | The Stats tab: estimated 1-rep max chart (#13), hard sets per week, workout heat map (phase 2) |

The `.dc.html` files are copied unchanged from the design canvas. They load the canvas's `support.js`, which wasn't saved, so a browser shows them without it: everything renders except the heat map on the progress board, which the runtime builds from the board's script. The pictures, at 390 × 844, show both boards complete. The workout data in them is made up.
