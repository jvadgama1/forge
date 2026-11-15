import { describe, expect, it } from "vitest";
import { rirText } from "../../app/js/screens/screen.js";

// "RIR" and its number never split across lines (#151): a no-break space
// joins them, so a wrapping line moves the pair whole.
describe("RIR as text", () => {
  it("joins the label and its number with a no-break space", () => {
    expect(rirText(1)).toBe("RIR 1");
    expect(rirText(0)).toBe("RIR 0");
  });

  it("writes 4 as 4+, since it means 4 or more", () => {
    expect(rirText(4)).toBe("RIR 4+");
  });
});
