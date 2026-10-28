# Rest alerts on a locked phone

Forge doesn't alert you at the end of a rest when the phone is locked or another app is in front. The rest timer vibrates only while Forge is on screen; otherwise the end of the rest passes silently. The countdown stays correct, so unlocking the phone shows the time left or `Rest over`. Forge deliberately doesn't buzz late on your return, since a buzz long after the rest would mislead.

## Why this is out of scope

The maintainer rejected both ways of closing the gap, in their words: "leave it as it is, this is not a big deal". The cost and battery drain of either fix outweighs the inconvenience of glancing at the phone.

Spec #3 had already put this outside phase 1: its Out of Scope list includes "Rest-timer notifications while the app is closed or in the background".

The two options weighed in #59:

- **Keep the screen on during each rest** (the Screen Wake Lock API). The phone wouldn't lock mid-rest, so the vibration would land while Forge was in front. It wouldn't help after switching apps, and it costs battery.
- **Notifications.** As of October 2026, a web app can't reach a locked phone at a set moment without a server. Scheduled notifications (the Notification Triggers API, `showTrigger`) finished their Chrome trial but never shipped. Push notifications need something to send them when the rest ends. Forge has no server of its own: any Firebase Cloud Function needs the paid Blaze plan, and server functions are phase 4 work (DESIGN.md § Build order). Timers in the background aren't dependable either, because Android throttles or freezes pages it isn't showing. No spike was run, since the maintainer didn't want the feature.

If Forge gains a server (for the coach's "Ask coach" button, say), push notifications for rests could be reconsidered at triage.

## Prior requests

- #59: "Rest timer: no vibration when the phone is locked"
