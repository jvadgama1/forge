// `npm run feedback` (#124): reads the maintainer's unfiled feedback from the
// live project and prints it; `npm run feedback -- --filed <itemId>
// <issueNumber>` marks one item filed. It signs in with the Firebase CLI's
// login, as `npm run deploy:rules` does, so no service-account key exists
// anywhere (ADR-0005). What it does is in run.js.
import { token } from "../firebase-login.js";
import { runFeedback } from "./run.js";

try {
  process.exitCode = await runFeedback(process.argv.slice(2), {
    token,
    fetch,
    print: (text) => console.log(text),
  });
} catch (error) {
  console.error(/** @type {Error} */ (error).message);
  process.exitCode = 1;
}
