# Rest alerts on a locked phone

Forge's rest timer vibrates when a rest ends only while Forge is on screen. If the phone has locked, or another app is in front, the end of the rest passes silently. The countdown stays correct, so unlocking the phone shows the time left or `Rest over`.

## Why this is out of scope

A web app can't reach a locked phone at a set moment without a server:

- **Scheduled notifications** (the Notification Triggers API, `showTrigger`) finished their Chrome trial but never shipped.
- **Push notifications** need something to send them when the rest ends. Forge has no server of its own. Firebase's scheduled functions need the paid plan, and server functions are later-phase work (DESIGN.md § Build order).
- **Timers in the background** aren't dependable, because Android throttles or freezes pages it isn't showing, especially with the screen locked.

The cheap partial fix was to keep the screen on during each rest (the Screen Wake Lock API), so Forge stays in front and the vibration lands. The maintainer decided against it: a silent end to a rest isn't a big deal, and checking the phone is enough.

If Forge gains a server (for the coach's "Ask coach" button, say), push notifications for rests could be reconsidered. Delete this file then.

## Prior requests

- #59: "Rest timer: no vibration when the phone is locked"
