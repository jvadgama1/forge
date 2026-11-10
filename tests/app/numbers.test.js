import { describe, expect, it } from "vitest";
import { thousands, tonnageText } from "../../app/js/screens/screen.js";

// The board's numbers read as they did with toLocaleString("en-US"),
// written with one formatter so a card of them draws fast (#131).
describe("numbers with thousands marked", () => {
  it("marks thousands and keeps a fraction", () => {
    expect(thousands(0)).toBe("0");
    expect(thousands(15000)).toBe("15,000");
    expect(thousands(1234567)).toBe("1,234,567");
    expect(thousands(2.5)).toBe("2.5");
  });

  it("writes a tonnage whole, with its unit", () => {
    expect(tonnageText(8450.4, "lb")).toBe("8,450 lb");
    expect(tonnageText(999.5, "kg")).toBe("1,000 kg");
  });
});
