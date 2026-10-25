import { defineConfig } from "vitest/config";

// Tests that need the Firebase emulators. Run via `npm run test:emulator`,
// which starts the emulators around them.
export default defineConfig({
  test: {
    include: ["tests/**/*.emulator.test.js"],
    // One shared emulator: run files one at a time so they can't clear each other's data.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
