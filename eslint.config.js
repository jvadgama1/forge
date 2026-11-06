import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["coverage/"] },
  js.configs.recommended,
  {
    files: ["app/**/*.js"],
    languageOptions: { globals: globals.browser },
    rules: {
      // Reads come from the store's live copy; a one-off read waits on the
      // server (or a slow cache) and brings back the lag of #102 (#108).
      "no-restricted-properties": [
        "error",
        ...[
          "getDoc",
          "getDocs",
          "getDocFromServer",
          "getDocsFromServer",
          "getDocFromCache",
          "getDocsFromCache",
        ].map((property) => ({
          property,
          message:
            "Read from the store's live copy, not with a one-off read (ADR-0007).",
        })),
      ],
    },
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
