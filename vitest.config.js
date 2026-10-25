import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    // Emulator tests run separately: `npm run test:emulator`.
    exclude: ["tests/**/*.emulator.test.js", "node_modules/**"],
  },
});
