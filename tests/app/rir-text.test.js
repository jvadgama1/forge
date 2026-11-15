import { describe, expect, it } from "vitest";
import { rirSuffix, rirText } from "../../app/js/screens/screen.js";

// "RIR" and its number never split across lines (#151): a no-break space
// joins them, so a wrapping line moves the pair whole.
describe("RIR as text", () => {
  it("joins the label and its number with a no-break space", () => {
    expect(rirText(1)).toBe("RIR\u00a01");
    expect(rirText(0)).toBe("RIR\u00a00");
  });

  it("follows other text as ' · RIR 1', breaking only before the dot", () => {
    expect(rirSuffix(1)).toBe(" ·\u00a0RIR\u00a01");
  });

  it("writes 4 as 4+, since it means 4 or more", () => {
    expect(rirText(4)).toBe("RIR\u00a04+");
  });
});
