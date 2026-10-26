import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["coverage/"] },
  js.configs.recommended,
  {
    files: ["app/**/*.js"],
    languageOptions: { globals: globals.browser },
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
