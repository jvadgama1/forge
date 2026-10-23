# Everything except coaching works without AI

Logging, history, suggested weights, comebacks, charts and routines are plain deterministic code. AI is used only by the coach, and the app must stay fully usable if the coach never runs. A reader might expect AI to set suggested weights; it deliberately doesn't (double progression does), so the core is predictable, testable and free.
