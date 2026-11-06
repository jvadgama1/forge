# Reads come from a live copy, not the server

The Firestore store answers every read from an in-memory copy of each collection, kept current by a Firestore listener, instead of asking the server. Firestore's one-off reads (`getDoc`, `getDocs`) wait for the server whenever the phone is online, and one screen makes ten or more reads in a row, so every tap waited for that many round trips: 1–2 s on a gym connection (#102). With the copy, a read costs no round trip, so the core can read as often as it likes.

## Considered options

- **Read Firestore's local cache** (`getDocFromCache`, `getDocsFromCache`): rejected because the cache can be missing documents it has never fetched, and each read still goes through IndexedDB, which is slow on a phone when many happen in a row.
- **Fewer, parallel reads in the core and screens**: rejected as the fix because every tap would still wait for at least one round trip, and each new screen would have to be written around it.

## Consequences

- Just after the app opens, a collection's first snapshot can come from the device's cache, so a screen may briefly show what this device last saw until the server's snapshot arrives, normally within a second. Changes made on another device show up as soon as the server sends them.
- A write lands in the copy at once. Until the server answers it, snapshots don't overwrite that document, since a snapshot may predate the write. Once it's answered, the document takes the server's version.
- When the phone and the desktop edit the same document, the edit that reaches the server last wins, as with any Firestore write. Each device shows its own edit until the server answers it, then the winner. With no signal, the phone keeps its own until it reconnects.
- A listener that fails (signing out ends them all) is started again by the next read of that collection, which reports the failure; the copy's documents are kept.
- The listeners replace a full collection read on every screen, so the store also makes far fewer billed reads.
