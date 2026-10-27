import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/** The core on 25 Oct 2026, with a clock tests can move. */
function setup() {
  let clock = new Date(2026, 9, 25, 8, 0);
  const f = createForge({
    store: createMemoryStore(),
    library,
    now: () => clock,
  });
  return {
    f,
    /** @param {number} minutes */
    later: (minutes) => {
      clock = new Date(clock.getTime() + minutes * 60_000);
    },
  };
}

describe("body weight entries (#18)", () => {
  it("are added with a date, load and unit, and listed newest first", async () => {
    const { f, later } = setup();
    await f.addBodyWeight({ date: "2026-10-20", load: 183, unit: "lb" });
    later(1);
    await f.addBodyWeight({ date: "2026-10-25", load: 181.5, unit: "lb" });
    later(1);
    await f.addBodyWeight({ date: "2026-10-22", load: 82.5, unit: "kg" });
    expect(
      (await f.listBodyWeights()).map(({ date, load, unit }) => [
        date,
        load,
        unit,
      ]),
    ).toEqual([
      ["2026-10-25", 181.5, "lb"],
      ["2026-10-22", 82.5, "kg"],
      ["2026-10-20", 183, "lb"],
    ]);
  });

  it("list two on one date with the later one first", async () => {
    const { f, later } = setup();
    await f.addBodyWeight({ date: "2026-10-25", load: 182, unit: "lb" });
    later(600);
    await f.addBodyWeight({ date: "2026-10-25", load: 184, unit: "lb" });
    expect((await f.listBodyWeights()).map((e) => e.load)).toEqual([184, 182]);
  });

  it("can be edited and deleted", async () => {
    const { f } = setup();
    const entry = await f.addBodyWeight({
      date: "2026-10-25",
      load: 812,
      unit: "lb",
    });
    const fixed = await f.updateBodyWeight(entry.id, {
      date: "2026-10-24",
      load: 181.2,
      unit: "lb",
    });
    expect(fixed).toMatchObject({ date: "2026-10-24", load: 181.2 });
    expect((await f.listBodyWeights()).map((e) => e.load)).toEqual([181.2]);
    await f.deleteBodyWeight(entry.id);
    expect(await f.listBodyWeights()).toEqual([]);
  });

  it("refuse an impossible date or load", async () => {
    const { f } = setup();
    await expect(
      f.addBodyWeight({ date: "2026-02-30", load: 180, unit: "lb" }),
    ).rejects.toThrow("Pick a date");
    await expect(
      f.addBodyWeight({ date: "2026-10-26", load: 180, unit: "lb" }),
    ).rejects.toThrow("That date hasn't happened yet");
    await expect(
      f.addBodyWeight({ date: "2026-10-25", load: 0, unit: "lb" }),
    ).rejects.toThrow("Body weight is more than 0 and under 1,000");
    await expect(
      f.addBodyWeight({ date: "2026-10-25", load: Number.NaN, unit: "kg" }),
    ).rejects.toThrow("Body weight is more than 0 and under 1,000");
  });
});

describe("body weight on a date (#18)", () => {
  it("is the latest entry on or before the date", async () => {
    const { f, later } = setup();
    await f.addBodyWeight({ date: "2026-10-01", load: 185, unit: "lb" });
    later(1);
    await f.addBodyWeight({ date: "2026-10-15", load: 183, unit: "lb" });
    later(1);
    await f.addBodyWeight({ date: "2026-10-15", load: 182, unit: "lb" });
    expect((await f.bodyWeightOn("2026-10-15"))?.load).toBe(182);
    expect((await f.bodyWeightOn("2026-10-14"))?.load).toBe(185);
    expect((await f.bodyWeightOn("2026-10-25"))?.load).toBe(182);
  });

  it("is none before the first entry", async () => {
    const { f } = setup();
    await f.addBodyWeight({ date: "2026-10-15", load: 183, unit: "lb" });
    expect(await f.bodyWeightOn("2026-10-14")).toBeUndefined();
  });
});
