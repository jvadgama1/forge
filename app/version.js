// The app version (#129): the deploy rewrites this file with its commit
// and date (tools/stamp-version.js); the repo's copy reads "dev".
Object.assign(globalThis, {
  forgeAppVersion: { commit: "dev", date: "" },
});
