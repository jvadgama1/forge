// Coach proposals through `npm run coach` (#193; spec #191): `preview` runs
// a proposal through the Forge core over a copy of the data, and `apply`
// makes it once the fingerprint the preview printed still matches. Times
// read in one time zone, whatever the machine's, since the record of an
// applied proposal is dated in local time. Vitest runs each test file in its
// own process, so this reaches no other file.
process.env.TZ = "America/New_York";

import { afterEach, describe, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCoach } from "../../tools/coach/run.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";

/** @import { Doc, Store } from "../../app/js/core/types.js" */

/** @type {string[]} */
const folders = [];
afterEach(async () => {
  for (const folder of folders.splice(0))
    await rm(folder, { recursive: true, force: true });
});

async function privateFolder() {
  const folder = await mkdtemp(join(tmpdir(), "forge-coach-"));
  folders.push(folder);
  return folder;
}

/**
 * Runs the command over a stand-in store, with a fixed clock (14 Nov 2026,
 * 20:00 UTC: 3:00 pm in New York) and a temporary private folder.
 * @param {string[]} args
 * @param {{ store: Store, folder: string }} options
 */
async function run(args, { store, folder }) {
  /** @type {string[]} */
  const printed = [];
  const code = await runCoach(args, {
    store,
    now: () => new Date("2026-11-14T20:00:00.000Z"),
    folder,
    print: (text) => printed.push(text),
  });
  return { code, output: printed.join("\n") };
}

const NAME = "2026-11-14-1500-proposal.json";

/**
 * Writes a proposal into the private folder's drafts/, as the /coach skill
 * does.
 * @param {string} folder
 * @param {unknown} proposal
 * @param {string} [name]
 */
async function writeProposal(folder, proposal, name = NAME) {
  await mkdir(join(folder, "drafts"), { recursive: true });
  const path = join(folder, "drafts", name);
  await writeFile(path, JSON.stringify(proposal, null, 2));
  return path;
}

/** @param {string} path */
const exists = (path) =>
  readFile(path).then(
    () => true,
    () => false,
  );

/** A made-up custom exercise the proposal uses. */
const SLED_PUSH = {
  id: "custom-sled-push",
  name: "Sled Push",
  type: "weight-reps",
  primary: ["quads"],
  secondary: ["glutes"],
  body: "lower",
  custom: true,
};

/** A made-up routine already in Forge. */
const FULL_BODY = {
  id: "r-full-body",
  name: "Full Body",
  versions: [
    {
      number: 1,
      savedAt: "2026-10-01T12:00:00.000Z",
      days: [
        {
          id: "d-full",
          name: "Full",
          slots: [
            { exerciseId: "barbell-back-squat", sets: 3, repMin: 5, repMax: 8 },
          ],
        },
      ],
    },
  ],
};

/** The set-up already in Forge, by collection. */
const SET_UP = {
  customExercises: [SLED_PUSH],
  routines: [FULL_BODY],
  gyms: [{ id: "g-1", name: "Made-up Gym", exerciseIds: ["barbell-row"] }],
};

/** A made-up proposal for a new routine, as the /coach skill writes it. */
const NEW_ROUTINE = {
  kind: "new-routine",
  reason:
    "Four days a week fits your schedule better than three full-body days.",
  name: "Upper Lower",
  days: [
    {
      name: "Upper A",
      slots: [
        {
          exerciseId: "barbell-bench-press",
          sets: 3,
          repMin: 6,
          repMax: 8,
          rir: 2,
        },
        { exerciseId: "barbell-row", sets: 3, repMin: 8, repMax: 12 },
      ],
    },
    {
      name: "Lower A",
      slots: [
        {
          exerciseId: "barbell-back-squat",
          sets: 3,
          repMin: 5,
          repMax: 8,
          rir: 4,
        },
        { exerciseId: "custom-sled-push", sets: 4, repMin: 10, repMax: 15 },
      ],
    },
  ],
};

const PROPOSAL = { changes: [NEW_ROUTINE] };

/** What `preview` prints for PROPOSAL, before its fingerprint. */
const PREVIEW = [
  `Proposal ${NAME}, 1 change. Nothing is applied yet.`,
  "",
  "1. New routine: Upper Lower, version 1",
  "   Why: Four days a week fits your schedule better than three full-body days.",
  "   Upper A",
  "   - Barbell Bench Press: 3 × 6–8 · RIR 2",
  "   - Barbell Row: 3 × 8–12",
  "   Lower A",
  "   - Barbell Back Squat: 3 × 5–8 · RIR 4+",
  "   - Sled Push: 4 × 10–15",
  "",
].join("\n");

/** @param {Store} store */
async function setUpIn(store) {
  return {
    customExercises: await store.list("customExercises"),
    routines: await store.list("routines"),
    gyms: await store.list("gyms"),
  };
}

/**
 * Previews a proposal and returns the fingerprint it ends with.
 * @param {string} output
 */
function fingerprintOf(output) {
  const match = output.match(/\nFingerprint: ([0-9a-f]{12})$/);
  if (!match) throw new Error(`No fingerprint in:\n${output}`);
  return match[1];
}

describe("npm run coach -- preview (#193)", () => {
  it("prints a new routine's days and slots in exercise names, with its reason, then a fingerprint, and changes nothing", async () => {
    const folder = await privateFolder();
    const path = await writeProposal(folder, PROPOSAL);
    const store = createMemoryStore(SET_UP);

    const { code, output } = await run(["preview", NAME], { store, folder });

    expect(code).toBe(0);
    expect(output).toBe(`${PREVIEW}\nFingerprint: ${fingerprintOf(output)}`);
    expect(await setUpIn(store)).toEqual(SET_UP);
    expect(await exists(path)).toBe(true);
    expect(await readdir(folder)).toEqual(["drafts"]);
  });

  /**
   * NEW_ROUTINE with its first slot changed.
   * @param {object} slot
   */
  const withFirstSlot = (slot) => ({
    ...NEW_ROUTINE,
    days: [
      {
        ...NEW_ROUTINE.days[0],
        slots: [{ ...NEW_ROUTINE.days[0].slots[0], ...slot }],
      },
    ],
  });

  it.each([
    [
      "an unknown exercise",
      [withFirstSlot({ exerciseId: "made-up-press" })],
      "Upper A: unknown exercise (change 1)",
    ],
    [
      "a bad rep range",
      [withFirstSlot({ repMin: 10, repMax: 6 })],
      "Upper A, Barbell Bench Press: the rep range runs from low to high, 1 to 100 (change 1)",
    ],
    [
      "an exercise twice in a routine day",
      [
        {
          ...NEW_ROUTINE,
          days: [
            {
              name: "Upper A",
              slots: [
                NEW_ROUTINE.days[0].slots[1],
                NEW_ROUTINE.days[0].slots[1],
              ],
            },
          ],
        },
      ],
      "Upper A: Barbell Row appears twice (change 1)",
    ],
    [
      "a good change, then a bad one",
      [NEW_ROUTINE, { ...withFirstSlot({ sets: 0 }), name: "Push Pull" }],
      "Upper A, Barbell Bench Press: target sets are 1 to 20 (change 2)",
    ],
  ])(
    "refuses the whole proposal for %s, with the core's reason and no fingerprint",
    async (_, changes, why) => {
      const folder = await privateFolder();
      const path = await writeProposal(folder, { changes });
      const store = createMemoryStore(SET_UP);

      const { code, output } = await run(["preview", NAME], { store, folder });

      expect(code).toBe(1);
      expect(output).toBe(`Not applied: ${why}.`);
      expect(await setUpIn(store)).toEqual(SET_UP);
      expect(await exists(path)).toBe(true);
    },
  );

  it.each([
    [
      "a routine already in Forge",
      [{ ...NEW_ROUTINE, name: "  full body " }],
      "Full Body is already a routine (change 1)",
    ],
    [
      "an earlier change in the same proposal",
      [NEW_ROUTINE, { ...NEW_ROUTINE, name: "UPPER LOWER" }],
      "Upper Lower is already a routine (change 2)",
    ],
  ])("refuses a new routine named like %s", async (_, changes, why) => {
    const folder = await privateFolder();
    await writeProposal(folder, { changes });
    const store = createMemoryStore(SET_UP);

    const { code, output } = await run(["preview", NAME], { store, folder });

    expect(code).toBe(1);
    expect(output).toBe(`Not applied: ${why}.`);
    expect(await setUpIn(store)).toEqual(SET_UP);
  });
});

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** PROPOSAL's routine as the core saves it, at 3:00 pm on 14 Nov in New York. */
const UPPER_LOWER = {
  id: expect.stringMatching(UUID),
  name: "Upper Lower",
  versions: [
    {
      number: 1,
      savedAt: "2026-11-14T20:00:00.000Z",
      days: [
        {
          id: expect.stringMatching(UUID),
          name: "Upper A",
          slots: [
            {
              exerciseId: "barbell-bench-press",
              sets: 3,
              repMin: 6,
              repMax: 8,
              rir: 2,
            },
            { exerciseId: "barbell-row", sets: 3, repMin: 8, repMax: 12 },
          ],
        },
        {
          id: expect.stringMatching(UUID),
          name: "Lower A",
          slots: [
            {
              exerciseId: "barbell-back-squat",
              sets: 3,
              repMin: 5,
              repMax: 8,
              rir: 4,
            },
            { exerciseId: "custom-sled-push", sets: 4, repMin: 10, repMax: 15 },
          ],
        },
      ],
    },
  ],
};

/** PROPOSAL's record in proposals/, once applied. */
const RECORD = [
  "# Proposal applied · Nov 14, 2026 · 3:00 pm",
  "",
  `From drafts/${NAME}.`,
  "",
  "## New routine: Upper Lower, version 1",
  "",
  "Four days a week fits your schedule better than three full-body days.",
  "",
  "### Upper A",
  "",
  "- Barbell Bench Press: 3 × 6–8 · RIR 2",
  "- Barbell Row: 3 × 8–12",
  "",
  "### Lower A",
  "",
  "- Barbell Back Squat: 3 × 5–8 · RIR 4+",
  "- Sled Push: 4 × 10–15",
  "",
].join("\n");

describe("npm run coach -- apply (#193)", () => {
  /**
   * Writes PROPOSAL, previews it and returns what applying needs.
   * @param {Record<string, Doc[]>} [seed]
   */
  async function previewed(seed = SET_UP) {
    const folder = await privateFolder();
    const path = await writeProposal(folder, PROPOSAL);
    const store = createMemoryStore(seed);
    const { output } = await run(["preview", NAME], { store, folder });
    return { folder, path, store, fingerprint: fingerprintOf(output) };
  }

  it("adds the routine at version 1 with the printed fingerprint, writes its record and removes the draft", async () => {
    const { folder, path, store, fingerprint } = await previewed();

    const { code, output } = await run(["apply", NAME, fingerprint], {
      store,
      folder,
    });

    expect(code).toBe(0);
    expect(output).toBe(
      [
        `Applied ${NAME}, 1 change:`,
        "1. New routine: Upper Lower, version 1",
        "Wrote proposals/2026-11-14-1500-proposal.md and removed the draft.",
      ].join("\n"),
    );
    expect(await setUpIn(store)).toEqual({
      ...SET_UP,
      routines: expect.arrayContaining([FULL_BODY, UPPER_LOWER]),
    });
    expect(await store.list("routines")).toHaveLength(2);
    expect(await readdir(join(folder, "proposals"))).toEqual([
      "2026-11-14-1500-proposal.md",
    ]);
    expect(
      await readFile(
        join(folder, "proposals", "2026-11-14-1500-proposal.md"),
        "utf8",
      ),
    ).toBe(RECORD);
    expect(await exists(path)).toBe(false);
  });

  it("refuses when the proposal file changed after the preview, writing nothing", async () => {
    const { folder, path, store, fingerprint } = await previewed();
    const changed = {
      changes: [{ ...NEW_ROUTINE, name: "Upper Lower Heavy" }],
    };
    await writeProposal(folder, changed);

    const { code, output } = await run(["apply", NAME, fingerprint], {
      store,
      folder,
    });

    expect(code).toBe(1);
    expect(output).toBe("Not applied: changed since the preview.");
    expect(await setUpIn(store)).toEqual(SET_UP);
    expect(await readdir(folder)).toEqual(["drafts"]);
    expect(await readFile(path, "utf8")).toBe(JSON.stringify(changed, null, 2));
  });

  it("refuses when a custom exercise the proposal uses changed after the preview", async () => {
    const { folder, store, fingerprint } = await previewed();
    await store.put("customExercises", { ...SLED_PUSH, name: "Prowler Push" });

    const { code, output } = await run(["apply", NAME, fingerprint], {
      store,
      folder,
    });

    expect(code).toBe(1);
    expect(output).toBe("Not applied: changed since the preview.");
    expect(await store.list("routines")).toEqual([FULL_BODY]);
  });

  it("refuses the whole proposal when its routine's name was taken after the preview", async () => {
    const { folder, path, store, fingerprint } = await previewed();
    const taken = { ...FULL_BODY, id: "r-phone", name: "Upper Lower" };
    await store.put("routines", taken);

    const { code, output } = await run(["apply", NAME, fingerprint], {
      store,
      folder,
    });

    expect(code).toBe(1);
    expect(output).toBe(
      "Not applied: Upper Lower is already a routine (change 1).",
    );
    expect(await store.list("routines")).toEqual([FULL_BODY, taken]);
    expect(await exists(path)).toBe(true);
    expect(await readdir(folder)).toEqual(["drafts"]);
  });

  it.each([["0123456789ab"], ["not-a-fingerprint"]])(
    "refuses a fingerprint the preview didn't print (%s)",
    async (given) => {
      const { folder, store } = await previewed();

      const { code, output } = await run(["apply", NAME, given], {
        store,
        folder,
      });

      expect(code).toBe(1);
      expect(output).toBe("Not applied: changed since the preview.");
      expect(await store.list("routines")).toEqual([FULL_BODY]);
    },
  );

  it("takes the same fingerprint whatever order the stored documents' keys are in", async () => {
    /**
     * A document with its keys, at every depth, in reverse order.
     * @param {any} value
     * @returns {any}
     */
    const reversed = (value) =>
      Array.isArray(value)
        ? value.map(reversed)
        : typeof value === "object" && value !== null
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, field]) => [key, reversed(field)]),
            )
          : value;
    const shuffled = {
      customExercises: [reversed(SLED_PUSH)],
      routines: [reversed(FULL_BODY)],
      gyms: SET_UP.gyms.map(reversed),
    };
    expect(Object.keys(shuffled.customExercises[0])[0]).toBe("custom");

    const asStored = await previewed();
    const reordered = await previewed(shuffled);

    expect(reordered.fingerprint).toBe(asStored.fingerprint);
    // And the reordered data's own preview applies with the first one's.
    const { code } = await run(["apply", NAME, asStored.fingerprint], {
      store: reordered.store,
      folder: reordered.folder,
    });
    expect(code).toBe(0);
  });

  it("never overwrites an earlier record of the same name", async () => {
    const { folder, store, fingerprint } = await previewed();
    await mkdir(join(folder, "proposals"));
    await writeFile(
      join(folder, "proposals", "2026-11-14-1500-proposal.md"),
      "An earlier record",
    );

    const { code, output } = await run(["apply", NAME, fingerprint], {
      store,
      folder,
    });

    expect(code).toBe(0);
    expect(output.split("\n").at(-1)).toBe(
      "Wrote proposals/2026-11-14-1500-proposal-2.md and removed the draft.",
    );
    expect(
      await readFile(
        join(folder, "proposals", "2026-11-14-1500-proposal.md"),
        "utf8",
      ),
    ).toBe("An earlier record");
    expect(
      await readFile(
        join(folder, "proposals", "2026-11-14-1500-proposal-2.md"),
        "utf8",
      ),
    ).toBe(RECORD);
  });

  it("keeps the draft for its reasons when the record can't be written", async () => {
    const { folder, path, store, fingerprint } = await previewed();
    // A file where proposals/ should be, so no record can be written.
    await writeFile(join(folder, "proposals"), "");

    const { code, output } = await run(["apply", NAME, fingerprint], {
      store,
      folder,
    });

    expect(code).toBe(1);
    expect(await store.list("routines")).toHaveLength(2);
    expect(await exists(path)).toBe(true);
    const lines = output.split("\n");
    expect(lines.slice(0, 2)).toEqual([
      `Applied ${NAME}, 1 change:`,
      "1. New routine: Upper Lower, version 1",
    ]);
    expect(lines[2]).toMatch(
      /^Couldn't write its record to proposals\/ \(.+\), so the draft is kept for its reasons: .+2026-11-14-1500-proposal\.json\. It's applied: don't apply it again\.$/,
    );
  });

  it("stops and keeps the draft when the store refuses a write", async () => {
    const { folder, path, store, fingerprint } = await previewed();
    /** @type {Store} */
    const refusing = {
      ...store,
      put: async () => {
        throw new Error("Firestore answered 503 UNAVAILABLE");
      },
    };

    const { code, output } = await run(["apply", NAME, fingerprint], {
      store: refusing,
      folder,
    });

    expect(code).toBe(1);
    expect(output).toBe(
      `Applying stopped: Firestore answered 503 UNAVAILABLE (change 1). The draft is kept: ${path}`,
    );
    expect(await exists(path)).toBe(true);
    expect(await readdir(folder)).toEqual(["drafts"]);
  });
});

describe("a proposal coach can't use (#193)", () => {
  it.each([
    [
      "a list rather than an object",
      [NEW_ROUTINE],
      "A proposal is a JSON object with a list of changes",
    ],
    [
      "no changes",
      { changes: [] },
      "A proposal is a JSON object with a list of changes",
    ],
    [
      "a change with no reason",
      { changes: [{ ...NEW_ROUTINE, reason: " " }] },
      "Each change has a reason (change 1)",
    ],
    [
      "a kind of change it can't make",
      { changes: [NEW_ROUTINE, { kind: "delete-routine", reason: "Unused" }] },
      '"delete-routine" isn\'t a kind of change a proposal can make (change 2)',
    ],
    [
      "a kind named like an object's own property",
      { changes: [{ kind: "constructor", reason: "Sneaky" }] },
      '"constructor" isn\'t a kind of change a proposal can make (change 1)',
    ],
    [
      "a new routine naming an id",
      { changes: [{ ...NEW_ROUTINE, id: "r-full-body" }] },
      "A new routine has no id: saving gives it its own (change 1)",
    ],
    [
      "a new routine's day naming an id",
      {
        changes: [
          {
            ...NEW_ROUTINE,
            days: [{ ...NEW_ROUTINE.days[0], id: "d-full" }],
          },
        ],
      },
      "A new routine's days have no ids: saving gives them their own (change 1)",
    ],
    [
      "a new routine with no days",
      { changes: [{ ...NEW_ROUTINE, days: undefined }] },
      "A new routine has a name and a list of days (change 1)",
    ],
    [
      "a routine day with no slots",
      { changes: [{ ...NEW_ROUTINE, days: [{ name: "Upper A" }] }] },
      "Each routine day has a name and a list of slots (change 1)",
    ],
  ])("is refused when it's %s", async (_, proposal, why) => {
    for (const command of ["preview", "apply"]) {
      const folder = await privateFolder();
      const path = await writeProposal(folder, proposal);
      const store = createMemoryStore(SET_UP);
      const args =
        command === "preview"
          ? ["preview", NAME]
          : ["apply", NAME, "0a1b2c3d4e5f"];

      const { code, output } = await run(args, { store, folder });

      expect(code).toBe(1);
      expect(output).toBe(`Not applied: ${why}.`);
      expect(await setUpIn(store)).toEqual(SET_UP);
      expect(await readFile(path, "utf8")).toBe(
        JSON.stringify(proposal, null, 2),
      );
    }
  });

  it("says so when the proposal isn't JSON or isn't there", async () => {
    const folder = await privateFolder();
    await mkdir(join(folder, "drafts"));
    await writeFile(join(folder, "drafts", "half.json"), '{"changes": [');
    const store = createMemoryStore(SET_UP);

    const broken = await run(["preview", "half.json"], { store, folder });
    const missing = await run(["apply", "gone.json", "0a1b2c3d4e5f"], {
      store,
      folder,
    });

    expect(broken.code).toBe(1);
    expect(broken.output).toMatch(
      /^Not applied: the proposal isn't JSON \(.+\)\.$/,
    );
    expect(missing.code).toBe(1);
    expect(missing.output).toBe(
      `Not applied: there's no proposal at ${join(folder, "drafts", "gone.json")}.`,
    );
  });

  it("reports a store that can't be read", async () => {
    const folder = await privateFolder();
    await writeProposal(folder, PROPOSAL);
    /** @type {Store} */
    const store = {
      ...createMemoryStore(),
      list: async () => {
        throw new Error("Firestore answered 401 UNAUTHENTICATED: Bad token");
      },
    };

    const { code, output } = await run(["preview", NAME], { store, folder });

    expect(code).toBe(1);
    expect(output).toBe(
      "Couldn't read the data: Firestore answered 401 UNAUTHENTICATED: Bad token. Is the Firebase CLI logged in (npx firebase login)?",
    );
  });

  // Auto mode's grant for apply and save is a prefix match, so it passes
  // extra arguments (#192): the command itself refuses them.
  it.each([
    [["preview"]],
    [["preview", NAME, "extra"]],
    [["apply", NAME]],
    [["apply", NAME, ""]],
    [["apply", NAME, "0a1b2c3d4e5f", "--skip-fingerprint"]],
    [["save", "2026-11-14-1500.json", "--force"]],
  ])("refuses %j with the usage, writing nothing", async (args) => {
    const folder = await privateFolder();
    const path = await writeProposal(folder, PROPOSAL);
    const store = createMemoryStore(SET_UP);

    const { code, output } = await run(args, { store, folder });

    expect(code).toBe(1);
    expect(output).toMatch(/^Usage: npm run coach -- read /);
    expect(output).toContain("npm run coach -- apply <proposal> <fingerprint>");
    expect(await setUpIn(store)).toEqual(SET_UP);
    expect(await exists(path)).toBe(true);
  });
});
