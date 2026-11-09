import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { SEED_LIBRARY } from "../../app/js/core/seed-library.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { sixtyWorkouts } from "../../tools/timing/sixty-workouts.js";

/** @import { RangeId } from "../../app/js/core/dashboard.js" */

// The Stats board's numbers over the sixty workouts `npm run timing:stats`
// times (#131), pinned as the board drew them before it was made faster, so
// a change for speed can't change what any card shows.

/**
 * The core over the sixty workouts, at noon on Sunday 25 Oct 2026, the
 * board on `range`.
 * @param {RangeId} range
 */
function forgeOn(range) {
  const seed = sixtyWorkouts("2026-10-25");
  const store = createMemoryStore({
    ...seed,
    settings: [{ ...seed.settings[0], dashboardRange: range }],
  });
  const now = () => new Date(2026, 9, 25, 12, 0);
  return createForge({ store, library: SEED_LIBRARY, now });
}

describe("the Stats board over sixty workouts (#131)", () => {
  it.each(/** @type {RangeId[]} */ (["4w", "12w", "1y"]))(
    "shows the numbers it always has, over %s",
    async (range) => {
      expect(await forgeOn(range).dashboard()).toMatchSnapshot();
    },
  );
});

describe("the board in two parts (#131)", () => {
  it.each(/** @type {RangeId[]} */ (["4w", "12w", "1y"]))(
    "gives the e1RM card first and the other cards after, as the whole board has them, over %s",
    async (range) => {
      const forge = forgeOn(range);
      const { range: shown, e1rm, ...rest } = await forge.dashboard();
      expect(await forge.dashboardFirst()).toEqual({ range: shown, e1rm });
      expect(await forge.dashboardRest()).toEqual({ range: shown, ...rest });
    },
  );
});
