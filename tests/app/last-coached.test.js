import { describe, expect, it } from "vitest";
import { lastCoached } from "../../app/js/screens/coach.js";

// The line under the Coach heading (#176; spec #170, story 67), in words
// for the core's count of days since the latest coaching session.
describe("last coached", () => {
  it("says today and yesterday in words", () => {
    expect(lastCoached(0)).toBe("Last coached today");
    expect(lastCoached(1)).toBe("Last coached yesterday");
  });

  it("counts the days since an older one", () => {
    expect(lastCoached(2)).toBe("Last coached 2 days ago");
    expect(lastCoached(22)).toBe("Last coached 22 days ago");
  });
});
