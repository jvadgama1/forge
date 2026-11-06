import js from "@eslint/js";
import globals from "globals";

// Reads come from the store's live copy; a one-off read waits on the server
// (or a slow cache) and brings back the lag of #102 (#108).
const ONE_OFF_READS = [
  "getDoc",
  "getDocs",
  "getDocFromServer",
  "getDocsFromServer",
  "getDocFromCache",
  "getDocsFromCache",
];
const LIVE_COPY =
  "Read from the store's live copy, not with a one-off read (ADR-0007).";

export default [
  { ignores: ["coverage/"] },
  js.configs.recommended,
  {
    files: ["app/**/*.js"],
    languageOptions: { globals: globals.browser },
    rules: {
      "no-restricted-properties": [
        "error",
        ...ONE_OFF_READS.map((property) => ({ property, message: LIVE_COPY })),
      ],
      // The SDK from its CDN URL (app/js/firebase-sdk.js) or its package.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(firebase-firestore\\.js|^firebase/firestore)$",
              importNames: ONE_OFF_READS,
              message: LIVE_COPY,
            },
          ],
        },
      ],
    },
  },
  {
    // Loads the whole SDK for the rest of the app, where a one-off read off
    // it is still a restricted property.
    files: ["app/js/firebase-sdk.js"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["app/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["*.config.js", "tests/**/*.js", "tools/**/*.js"],
    ignores: ["tools/shots/stubs/**"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["tools/shots/stubs/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
];
