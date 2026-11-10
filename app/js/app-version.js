// The app version this copy of Forge is (#129): the stamp the deploy writes
// into version.js, or "dev" when unstamped. Read here, not off the stamp's
// global, so whatever records it (feedback, #124) has one place to ask.
import "../version.js";

/** @import { AppVersion } from "./core/types.js" */

/** @returns {AppVersion} */
export function appVersion() {
  const { forgeAppVersion } = /** @type {{ forgeAppVersion?: AppVersion }} */ (
    globalThis
  );
  return {
    commit: forgeAppVersion?.commit ?? "dev",
    date: forgeAppVersion?.date ?? "",
  };
}
