import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    // No app code exists yet; an empty suite must not fail the check.
    // Remove with the first real test, so an emptied suite fails loudly again.
    passWithNoTests: true,
  },
});
