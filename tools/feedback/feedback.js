// `npm run feedback` (#124): reads the maintainer's unfiled feedback from the
// live project and prints it; `npm run feedback -- --filed <itemId>
// <issueNumber>` marks one item filed. It signs in with the Firebase CLI's
// login, as `npm run deploy:rules` does, so no service-account key exists
// anywhere (ADR-0005). What it does is in run.js.
import { createRequire } from "node:module";
import { runFeedback } from "./run.js";

// The Firebase CLI's own sign-in, from the firebase-tools dev dependency.
const require = createRequire(import.meta.url);
/**
 * @type {{
 *   getGlobalDefaultAccount: () => { tokens: { access_token?: string, refresh_token?: string, expires_at?: number } } | undefined,
 *   getAccessToken: (refreshToken: string, scopes: string[]) => Promise<{ access_token: string }>,
 * }}
 */
const cliAuth = require("firebase-tools/lib/auth.js");
/** @type {{ CLOUD_PLATFORM: string }} */
const scopes = require("firebase-tools/lib/scopes.js");

/** @type {string | undefined} */
let accessToken;

/** The login's access token, refreshed if it has expired; never printed. */
async function token() {
  if (accessToken) return accessToken;
  const tokens = cliAuth.getGlobalDefaultAccount()?.tokens;
  if (!tokens?.refresh_token)
    throw new Error("The Firebase CLI isn't logged in: run npx firebase login");
  const fresh =
    tokens.access_token && (tokens.expires_at ?? 0) > Date.now() + 60_000;
  accessToken = fresh
    ? tokens.access_token
    : (
        await cliAuth.getAccessToken(tokens.refresh_token, [
          scopes.CLOUD_PLATFORM,
        ])
      ).access_token;
  return /** @type {string} */ (accessToken);
}

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
