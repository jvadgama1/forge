// `npm run coach` (#174): what the /coach skill reads and saves with. `read`
// prints all the data as JSON and refreshes the insight files; `save
// <draft>` adds one coaching session. It runs the Forge core over the REST
// store, signed in with the maintainer's Firebase CLI login, so no
// service-account key exists anywhere (ADR-0008). Each save is a live write
// the maintainer runs with the ! prefix (docs/agents/live-data.md). What it
// does is in run.js.
import { FIREBASE_CONFIG, OWNER_UID } from "../../app/js/firebase-config.js";
import { token } from "../firebase-login.js";
import { createRestStore } from "../store/rest-store.js";
import { COACH_NOTES_FOLDER } from "./coach-notes.js";
import { runCoach } from "./run.js";

try {
  process.exitCode = await runCoach(process.argv.slice(2), {
    store: createRestStore({
      baseUrl: `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`,
      uid: OWNER_UID,
      token,
    }),
    now: () => new Date(),
    folder: COACH_NOTES_FOLDER,
    print: (text) => console.log(text),
  });
} catch (error) {
  console.error(/** @type {Error} */ (error).message);
  process.exitCode = 1;
}
