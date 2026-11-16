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
import { createForge } from "../../app/js/core/forge.js";
import { SEED_LIBRARY } from "../../app/js/core/seed-library.js";

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
 * 20:00 UTC: 3:00 pm in New York), a temporary private folder and a
 * temporary home folder for backups, never the real one.
 * @param {string[]} args
 * @param {{ store: Store, folder: string, home?: string }} options
 */
async function run(args, { store, folder, home }) {
  home ??= await privateFolder();
  /** @type {string[]} */
  const printed = [];
  const code = await runCoach(args, {
    store,
    now: () => new Date("2026-11-14T20:00:00.000Z"),
    folder,
    home,
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
      [
        "Applying stopped at change 1: Firestore answered 503 UNAVAILABLE.",
        "Landed: nothing.",
        "Didn't land:",
        "1. New routine: Upper Lower, version 1",
        `The draft is kept, and no record is written to proposals/: ${path}`,
      ].join("\n"),
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

  it.each([["../notes.json"], ["sub/proposal.json"]])(
    "takes only a file name in drafts/, refusing %s",
    async (draft) => {
      const folder = await privateFolder();
      await mkdir(join(folder, "drafts", "sub"), { recursive: true });
      await writeFile(join(folder, "notes.json"), JSON.stringify(PROPOSAL));
      await writeProposal(folder, PROPOSAL, join("sub", "proposal.json"));
      const store = createMemoryStore(SET_UP);

      for (const args of [
        ["preview", draft],
        ["apply", draft, "0a1b2c3d4e5f"],
      ]) {
        const { code, output } = await run(args, { store, folder });
        expect(code).toBe(1);
        expect(output).toBe(
          `Not applied: name a proposal by its file name in drafts/, not ${draft}.`,
        );
      }
      expect(await exists(join(folder, "notes.json"))).toBe(true);
      expect(await setUpIn(store)).toEqual(SET_UP);
    },
  );

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

/** A made-up routine in Forge at version 2, to change (#195). */
const STRENGTH = {
  id: "r-strength",
  name: "Strength",
  versions: [
    {
      number: 1,
      savedAt: "2026-09-01T12:00:00.000Z",
      days: [
        {
          id: "d-push",
          name: "Push",
          slots: [
            {
              exerciseId: "barbell-bench-press",
              sets: 3,
              repMin: 6,
              repMax: 8,
            },
          ],
        },
        {
          id: "d-legs",
          name: "Legs",
          slots: [
            { exerciseId: "barbell-back-squat", sets: 3, repMin: 5, repMax: 8 },
          ],
        },
      ],
    },
    {
      number: 2,
      savedAt: "2026-10-01T12:00:00.000Z",
      days: [
        {
          id: "d-push",
          name: "Push",
          slots: [
            {
              exerciseId: "barbell-bench-press",
              sets: 3,
              repMin: 6,
              repMax: 8,
              rir: 2,
            },
            {
              exerciseId: "barbell-overhead-press",
              sets: 3,
              repMin: 6,
              repMax: 10,
            },
            { exerciseId: "triceps-pushdown", sets: 3, repMin: 10, repMax: 15 },
          ],
        },
        {
          id: "d-pull",
          name: "Pull",
          slots: [
            { exerciseId: "barbell-row", sets: 3, repMin: 8, repMax: 12 },
            { exerciseId: "lat-pulldown", sets: 3, repMin: 8, repMax: 12 },
          ],
        },
        {
          id: "d-legs",
          name: "Legs",
          slots: [
            {
              exerciseId: "barbell-back-squat",
              sets: 3,
              repMin: 5,
              repMax: 8,
              rir: 3,
            },
            { exerciseId: "custom-sled-push", sets: 4, repMin: 10, repMax: 15 },
          ],
        },
      ],
    },
  ],
};

/** The last workout done on STRENGTH: its Push day, at version 2. */
const LAST_PUSH = {
  id: "w-1",
  date: "2026-11-12",
  startedAt: "2026-11-12T22:00:00.000Z",
  finishedAt: "2026-11-12T23:00:00.000Z",
  gymId: "g-1",
  routine: { routineId: "r-strength", version: 2, dayId: "d-push" },
  entries: [],
};

/** The set-up with STRENGTH in it, and a workout done on it. */
const WITH_STRENGTH = {
  ...SET_UP,
  routines: [FULL_BODY, STRENGTH],
  workouts: [LAST_PUSH],
};

/**
 * A made-up routine change, as the /coach skill writes it: Push kept and
 * changed, Legs kept and renamed, Arms new, Pull left out.
 */
const CHANGE_STRENGTH = {
  kind: "change-routine",
  reason: "Pull work moves to its own routine; arms get a day of their own.",
  id: "r-strength",
  name: "Strength Plus",
  days: [
    {
      id: "d-push",
      name: "Push",
      slots: [
        {
          exerciseId: "barbell-bench-press",
          sets: 4,
          repMin: 6,
          repMax: 8,
          rir: 1,
        },
        { exerciseId: "incline-db-press", sets: 3, repMin: 8, repMax: 12 },
        { exerciseId: "triceps-pushdown", sets: 3, repMin: 10, repMax: 15 },
      ],
    },
    {
      id: "d-legs",
      name: "Lower",
      slots: [
        {
          exerciseId: "barbell-back-squat",
          sets: 3,
          repMin: 5,
          repMax: 8,
          rir: 3,
        },
        { exerciseId: "custom-sled-push", sets: 4, repMin: 10, repMax: 15 },
      ],
    },
    {
      name: "Arms",
      slots: [
        { exerciseId: "db-curl", sets: 3, repMin: 10, repMax: 15 },
        { exerciseId: "hammer-curl", sets: 3, repMin: 10, repMax: 15 },
      ],
    },
  ],
};

/** What `preview` prints for CHANGE_STRENGTH, before its fingerprint. */
const CHANGE_PREVIEW = [
  `Proposal ${NAME}, 1 change. Nothing is applied yet.`,
  "",
  "1. Change routine: Strength → Strength Plus, version 2 → 3",
  "   Why: Pull work moves to its own routine; arms get a day of their own.",
  "   Push",
  "   - Barbell Bench Press: 3 × 6–8 · RIR 2 → 4 × 6–8 · RIR 1",
  "   - Incline DB Press: 3 × 8–12 (added)",
  "   - Triceps Pushdown: 3 × 10–15",
  "   - Barbell Overhead Press: 3 × 6–10 (removed)",
  "   Lower (was Legs)",
  "   - Barbell Back Squat: 3 × 5–8 · RIR 3",
  "   - Sled Push: 4 × 10–15",
  "   Arms (new day)",
  "   - DB Curl: 3 × 10–15",
  "   - Hammer Curl: 3 × 10–15",
  "   Pull (dropped)",
  "   - Barbell Row: 3 × 8–12",
  "   - Lat Pulldown: 3 × 8–12",
  "",
].join("\n");

/** @param {Store} store */
async function everythingIn(store) {
  return {
    ...(await setUpIn(store)),
    workouts: await store.list("workouts"),
    bodyWeights: await store.list("bodyWeights"),
    coachingSessions: await store.list("coachingSessions"),
  };
}

describe("a routine change (#195)", () => {
  it("shows a dry run of the new version against the current one, in exercise names, and changes nothing", async () => {
    const folder = await privateFolder();
    const home = await privateFolder();
    await writeProposal(folder, { changes: [CHANGE_STRENGTH] });
    const store = createMemoryStore(WITH_STRENGTH);

    const { code, output } = await run(["preview", NAME], {
      store,
      folder,
      home,
    });

    expect(code).toBe(0);
    expect(output).toBe(
      `${CHANGE_PREVIEW}\nFingerprint: ${fingerprintOf(output)}`,
    );
    expect(await everythingIn(store)).toEqual({
      ...WITH_STRENGTH,
      bodyWeights: [],
      coachingSessions: [],
    });
    expect(await readdir(home)).toEqual([]);
  });
});

/** STRENGTH once CHANGE_STRENGTH is applied at 3:00 pm on 14 Nov. */
const STRENGTH_PLUS = {
  id: "r-strength",
  name: "Strength Plus",
  versions: [
    STRENGTH.versions[0],
    STRENGTH.versions[1],
    {
      number: 3,
      savedAt: "2026-11-14T20:00:00.000Z",
      days: [
        {
          id: "d-push",
          name: "Push",
          slots: [
            {
              exerciseId: "barbell-bench-press",
              sets: 4,
              repMin: 6,
              repMax: 8,
              rir: 1,
            },
            { exerciseId: "incline-db-press", sets: 3, repMin: 8, repMax: 12 },
            { exerciseId: "triceps-pushdown", sets: 3, repMin: 10, repMax: 15 },
          ],
        },
        {
          id: "d-legs",
          name: "Lower",
          slots: [
            {
              exerciseId: "barbell-back-squat",
              sets: 3,
              repMin: 5,
              repMax: 8,
              rir: 3,
            },
            { exerciseId: "custom-sled-push", sets: 4, repMin: 10, repMax: 15 },
          ],
        },
        {
          id: expect.stringMatching(UUID),
          name: "Arms",
          slots: [
            { exerciseId: "db-curl", sets: 3, repMin: 10, repMax: 15 },
            { exerciseId: "hammer-curl", sets: 3, repMin: 10, repMax: 15 },
          ],
        },
      ],
    },
  ],
};

/** CHANGE_STRENGTH's record in proposals/, once applied. */
const CHANGE_RECORD = [
  "# Proposal applied · Nov 14, 2026 · 3:00 pm",
  "",
  `From drafts/${NAME}.`,
  "",
  "## Change routine: Strength → Strength Plus, version 2 → 3",
  "",
  "Pull work moves to its own routine; arms get a day of their own.",
  "",
  "### Push",
  "",
  "- Barbell Bench Press: 3 × 6–8 · RIR 2 → 4 × 6–8 · RIR 1",
  "- Incline DB Press: 3 × 8–12 (added)",
  "- Triceps Pushdown: 3 × 10–15",
  "- Barbell Overhead Press: 3 × 6–10 (removed)",
  "",
  "### Lower (was Legs)",
  "",
  "- Barbell Back Squat: 3 × 5–8 · RIR 3",
  "- Sled Push: 4 × 10–15",
  "",
  "### Arms (new day)",
  "",
  "- DB Curl: 3 × 10–15",
  "- Hammer Curl: 3 × 10–15",
  "",
  "### Pull (dropped)",
  "",
  "- Barbell Row: 3 × 8–12",
  "- Lat Pulldown: 3 × 8–12",
  "",
].join("\n");

/** Where apply backs up the documents NAME changes, under a home folder. */
const backups = (/** @type {string} */ home) =>
  join(home, "forge-backups", "coach", "2026-11-14-1500-proposal");

describe("applying a routine change (#195)", () => {
  /**
   * Writes a proposal of the given changes, previews it over a store
   * seeded with WITH_STRENGTH and returns what applying needs.
   * @param {unknown[]} [changes]
   * @param {Record<string, Doc[]>} [seed]
   */
  async function previewed(changes = [CHANGE_STRENGTH], seed = WITH_STRENGTH) {
    const folder = await privateFolder();
    const home = await privateFolder();
    const path = await writeProposal(folder, { changes });
    const store = createMemoryStore(seed);
    const { output } = await run(["preview", NAME], { store, folder, home });
    return { folder, home, path, store, output };
  }

  it("saves the next version, keeping every earlier one and the rotation, after backing up the routine as it was", async () => {
    const { folder, home, path, store, output } = await previewed();

    const applied = await run(["apply", NAME, fingerprintOf(output)], {
      store,
      folder,
      home,
    });

    expect(applied.code).toBe(0);
    expect(applied.output).toBe(
      [
        `Backed up 1 document to ${backups(home)}.`,
        `Applied ${NAME}, 1 change:`,
        "1. Change routine: Strength → Strength Plus, version 2 → 3",
        "Wrote proposals/2026-11-14-1500-proposal.md and removed the draft.",
      ].join("\n"),
    );
    expect(await everythingIn(store)).toEqual({
      ...WITH_STRENGTH,
      routines: [FULL_BODY, STRENGTH_PLUS],
      bodyWeights: [],
      coachingSessions: [],
    });
    // Push was done last, so the rotation carries on to the day after it.
    const forge = createForge({ store, library: SEED_LIBRARY });
    expect(await forge.nextRoutineDay("r-strength")).toEqual({
      id: "d-legs",
      name: "Lower",
      slots: STRENGTH_PLUS.versions[2].days[1].slots,
    });
    expect(await readdir(backups(home), { recursive: true })).toEqual([
      "routines",
      join("routines", "r-strength.json"),
    ]);
    expect(
      JSON.parse(
        await readFile(
          join(backups(home), "routines", "r-strength.json"),
          "utf8",
        ),
      ),
    ).toEqual(STRENGTH);
    expect(
      await readFile(
        join(folder, "proposals", "2026-11-14-1500-proposal.md"),
        "utf8",
      ),
    ).toBe(CHANGE_RECORD);
    expect(await exists(path)).toBe(false);
  });
});

/**
 * A document with its keys, at every depth, in reverse order, as
 * Firestore's REST API may return them.
 * @param {any} value
 * @returns {any}
 */
const keysReversed = (value) =>
  Array.isArray(value)
    ? value.map(keysReversed)
    : typeof value === "object" && value !== null
      ? Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, field]) => [key, keysReversed(field)]),
        )
      : value;

/** A routine change renaming STRENGTH alone, its days as they stand. */
const RENAME_STRENGTH = {
  kind: "change-routine",
  reason: "The name says what the routine is for.",
  id: "r-strength",
  name: "Strength Plus",
  days: STRENGTH.versions[1].days,
};

describe("a routine change: renames, moves, drift, backups and refusals (#195)", () => {
  /**
   * Writes a proposal of the given changes and previews it.
   * @param {unknown[]} changes
   * @param {Record<string, Doc[]>} [seed]
   */
  async function previewed(changes, seed = WITH_STRENGTH) {
    const folder = await privateFolder();
    const home = await privateFolder();
    const path = await writeProposal(folder, { changes });
    const store = createMemoryStore(seed);
    const preview = await run(["preview", NAME], { store, folder, home });
    return { folder, home, path, store, ...preview };
  }

  it.each([
    ["as stored", WITH_STRENGTH],
    [
      "with its keys in another order",
      { ...WITH_STRENGTH, routines: [FULL_BODY, keysReversed(STRENGTH)] },
    ],
  ])(
    "renames alone without adding a version, the routine %s",
    async (_, seed) => {
      const { folder, home, store, code, output } = await previewed(
        [RENAME_STRENGTH],
        seed,
      );
      expect(code).toBe(0);
      expect(output).toBe(
        [
          `Proposal ${NAME}, 1 change. Nothing is applied yet.`,
          "",
          "1. Rename routine: Strength → Strength Plus, still version 2",
          "   Why: The name says what the routine is for.",
          "",
          `Fingerprint: ${fingerprintOf(output)}`,
        ].join("\n"),
      );

      const applied = await run(["apply", NAME, fingerprintOf(output)], {
        store,
        folder,
        home,
      });

      expect(applied.code).toBe(0);
      expect(applied.output.split("\n").slice(1, 3)).toEqual([
        `Applied ${NAME}, 1 change:`,
        "1. Rename routine: Strength → Strength Plus, still version 2",
      ]);
      expect(await store.list("routines")).toEqual([
        FULL_BODY,
        { ...STRENGTH, name: "Strength Plus" },
      ]);
      expect(
        await readFile(
          join(folder, "proposals", "2026-11-14-1500-proposal.md"),
          "utf8",
        ),
      ).toBe(
        [
          "# Proposal applied · Nov 14, 2026 · 3:00 pm",
          "",
          `From drafts/${NAME}.`,
          "",
          "## Rename routine: Strength → Strength Plus, still version 2",
          "",
          "The name says what the routine is for.",
          "",
        ].join("\n"),
      );
    },
  );

  it("shows days and slots that moved, and days left as they were", async () => {
    const [push, pull, legs] = STRENGTH.versions[1].days;
    const { code, output } = await previewed([
      {
        kind: "change-routine",
        reason: "Legs first in the week, while you're fresh.",
        id: "r-strength",
        days: [
          legs,
          { ...push, slots: [push.slots[2], push.slots[0], push.slots[1]] },
          pull,
        ],
      },
    ]);

    expect(code).toBe(0);
    expect(output).toBe(
      [
        `Proposal ${NAME}, 1 change. Nothing is applied yet.`,
        "",
        "1. Change routine: Strength, version 2 → 3",
        "   Why: Legs first in the week, while you're fresh.",
        "   - Day order: Push, Pull, Legs → Legs, Push, Pull",
        "   Legs (unchanged)",
        "   - Barbell Back Squat: 3 × 5–8 · RIR 3",
        "   - Sled Push: 4 × 10–15",
        "   Push",
        "   - Triceps Pushdown: 3 × 10–15",
        "   - Barbell Bench Press: 3 × 6–8 · RIR 2",
        "   - Barbell Overhead Press: 3 × 6–10",
        "   - Order: Barbell Bench Press, Barbell Overhead Press, Triceps Pushdown → Triceps Pushdown, Barbell Bench Press, Barbell Overhead Press",
        "   Pull (unchanged)",
        "   - Barbell Row: 3 × 8–12",
        "   - Lat Pulldown: 3 × 8–12",
        "",
        `Fingerprint: ${fingerprintOf(output)}`,
      ].join("\n"),
    );
  });

  it("refuses when the routine changed after the preview, writing and backing up nothing", async () => {
    const { folder, home, path, store, output } = await previewed([
      CHANGE_STRENGTH,
    ]);
    // An edit on the phone in between.
    const edited = { ...STRENGTH, name: "Strength (phone)" };
    await store.put("routines", edited);

    const applied = await run(["apply", NAME, fingerprintOf(output)], {
      store,
      folder,
      home,
    });

    expect(applied.code).toBe(1);
    expect(applied.output).toBe("Not applied: changed since the preview.");
    expect(await store.list("routines")).toEqual([FULL_BODY, edited]);
    expect(await readdir(home)).toEqual([]);
    expect(await readdir(folder)).toEqual(["drafts"]);
    expect(await exists(path)).toBe(true);
  });

  it("keeps the backup and the draft when the store refuses the write", async () => {
    const { folder, home, path, store, output } = await previewed([
      CHANGE_STRENGTH,
    ]);
    /** @type {Store} */
    const refusing = {
      ...store,
      put: async () => {
        throw new Error("Firestore answered 503 UNAVAILABLE");
      },
    };

    const applied = await run(["apply", NAME, fingerprintOf(output)], {
      store: refusing,
      folder,
      home,
    });

    expect(applied.code).toBe(1);
    expect(applied.output).toBe(
      [
        `Backed up 1 document to ${backups(home)}.`,
        "Applying stopped at change 1: Firestore answered 503 UNAVAILABLE.",
        "Landed: nothing.",
        "Didn't land:",
        "1. Change routine: Strength → Strength Plus, version 2 → 3",
        `The draft is kept, and no record is written to proposals/: ${path}`,
      ].join("\n"),
    );
    expect(await store.list("routines")).toEqual([FULL_BODY, STRENGTH]);
    expect(
      JSON.parse(
        await readFile(
          join(backups(home), "routines", "r-strength.json"),
          "utf8",
        ),
      ),
    ).toEqual(STRENGTH);
    expect(await exists(path)).toBe(true);
  });

  it("never overwrites an earlier backup of the same proposal", async () => {
    const { folder, home, store, output } = await previewed([CHANGE_STRENGTH]);
    await mkdir(join(backups(home), "routines"), { recursive: true });
    await writeFile(join(backups(home), "routines", "r-strength.json"), "{}");

    const applied = await run(["apply", NAME, fingerprintOf(output)], {
      store,
      folder,
      home,
    });

    expect(applied.code).toBe(0);
    expect(applied.output.split("\n")[0]).toBe(
      `Backed up 1 document to ${backups(home)}-2.`,
    );
    expect(
      await readFile(
        join(backups(home), "routines", "r-strength.json"),
        "utf8",
      ),
    ).toBe("{}");
    expect(
      JSON.parse(
        await readFile(
          join(`${backups(home)}-2`, "routines", "r-strength.json"),
          "utf8",
        ),
      ),
    ).toEqual(STRENGTH);
  });

  it("writes nothing when the backup can't be made", async () => {
    const { folder, home, path, store, output } = await previewed([
      CHANGE_STRENGTH,
    ]);
    // A file where forge-backups/ should be, so no backup can be written.
    await writeFile(join(home, "forge-backups"), "");

    const applied = await run(["apply", NAME, fingerprintOf(output)], {
      store,
      folder,
      home,
    });

    expect(applied.code).toBe(1);
    expect(applied.output).toMatch(
      /^Not applied: couldn't back up the documents it changes \(.+\), so nothing is written\.$/,
    );
    expect(await store.list("routines")).toEqual([FULL_BODY, STRENGTH]);
    expect(await readdir(folder)).toEqual(["drafts"]);
    expect(await exists(path)).toBe(true);
  });

  it.each([
    [
      "a routine that isn't in Forge",
      { ...CHANGE_STRENGTH, id: "r-gone" },
      "There's no routine r-gone in Forge (change 1)",
    ],
    [
      "a day that isn't in the routine's current version",
      {
        ...CHANGE_STRENGTH,
        days: [{ ...CHANGE_STRENGTH.days[0], id: "d-old" }],
      },
      "Strength has no day d-old in its current version (change 1)",
    ],
    [
      "another routine's name",
      { ...CHANGE_STRENGTH, name: " full body" },
      "Full Body is already a routine (change 1)",
    ],
    [
      "nothing to change",
      { ...RENAME_STRENGTH, name: undefined },
      "This changes nothing in Strength (change 1)",
    ],
    [
      "a new day with a current day's name",
      {
        ...CHANGE_STRENGTH,
        days: [
          ...CHANGE_STRENGTH.days,
          {
            name: " pull ",
            slots: [
              { exerciseId: "barbell-row", sets: 3, repMin: 8, repMax: 12 },
            ],
          },
        ],
      },
      "Pull is already a day of Strength (change 1)",
    ],
    [
      "a slot the core refuses",
      {
        ...CHANGE_STRENGTH,
        days: [
          {
            ...CHANGE_STRENGTH.days[0],
            slots: [{ ...CHANGE_STRENGTH.days[0].slots[0], repMin: 9 }],
          },
        ],
      },
      "Push, Barbell Bench Press: the rep range runs from low to high, 1 to 100 (change 1)",
    ],
  ])("refuses a change naming %s, with the reason", async (_, change, why) => {
    const { code, output, store, home } = await previewed([change]);

    expect(code).toBe(1);
    expect(output).toBe(`Not applied: ${why}.`);
    expect(await store.list("routines")).toEqual([FULL_BODY, STRENGTH]);
    expect(await readdir(home)).toEqual([]);
  });

  it.each([
    [
      "no routine id",
      { ...CHANGE_STRENGTH, id: undefined },
      "A routine change names the routine by its id",
    ],
    [
      "a new name that isn't text",
      { ...CHANGE_STRENGTH, name: 7 },
      "A routine change's new name is text",
    ],
    [
      "no days",
      { ...CHANGE_STRENGTH, days: undefined },
      "A routine change lists the new version's days in full",
    ],
    [
      "every day left out",
      { ...CHANGE_STRENGTH, days: [] },
      "A routine change keeps at least one day",
    ],
    [
      "a day with no slots",
      { ...CHANGE_STRENGTH, days: [{ id: "d-push", name: "Push" }] },
      "Each routine day has a name and a list of slots",
    ],
    [
      "a day id that isn't text",
      {
        ...CHANGE_STRENGTH,
        days: [{ ...CHANGE_STRENGTH.days[0], id: 3 }],
      },
      "A routine day that continues names its day id; a new one has none",
    ],
    [
      "two days with one id",
      {
        ...CHANGE_STRENGTH,
        days: [
          CHANGE_STRENGTH.days[0],
          { ...CHANGE_STRENGTH.days[1], id: "d-push" },
        ],
      },
      "Two routine days name the day id d-push",
    ],
  ])("is refused when it has %s", async (_, change, why) => {
    for (const command of ["preview", "apply"]) {
      const folder = await privateFolder();
      const path = await writeProposal(folder, { changes: [change] });
      const store = createMemoryStore(WITH_STRENGTH);
      const args =
        command === "preview"
          ? ["preview", NAME]
          : ["apply", NAME, "0a1b2c3d4e5f"];

      const { code, output } = await run(args, { store, folder });

      expect(code).toBe(1);
      expect(output).toBe(`Not applied: ${why} (change 1).`);
      expect(await store.list("routines")).toEqual([FULL_BODY, STRENGTH]);
      expect(await exists(path)).toBe(true);
    }
  });
});

/**
 * A store that refuses its `n`th write (a put or a remove), counting from
 * 1, as Firestore might partway through `apply`; the writes before it
 * land in `store`, and so would any after it.
 * @param {Store} store
 * @param {number} n
 * @returns {Store}
 */
function failingOnWrite(store, n) {
  let writes = 0;
  /** @param {() => Promise<void>} write */
  const counted = async (write) => {
    if (++writes === n) throw new Error("Firestore answered 503 UNAVAILABLE");
    await write();
  };
  return {
    ...store,
    put: (collection, doc) => counted(() => store.put(collection, doc)),
    remove: (collection, id) => counted(() => store.remove(collection, id)),
  };
}

/** A made-up new routine, to follow CHANGE_STRENGTH in a proposal. */
const PUSH_PULL = {
  kind: "new-routine",
  reason: "A shorter week for when you travel.",
  name: "Push Pull",
  days: [
    {
      name: "Push",
      slots: [
        { exerciseId: "barbell-bench-press", sets: 3, repMin: 6, repMax: 8 },
      ],
    },
  ],
};

describe("a partial failure (#196)", () => {
  /**
   * Writes a proposal of the given changes over WITH_STRENGTH, previews it
   * and returns what applying needs.
   * @param {unknown[]} changes
   */
  async function previewed(changes) {
    const folder = await privateFolder();
    const home = await privateFolder();
    const path = await writeProposal(folder, { changes });
    const store = createMemoryStore(WITH_STRENGTH);
    const { output } = await run(["preview", NAME], { store, folder, home });
    return { folder, home, path, store, fingerprint: fingerprintOf(output) };
  }

  it("says which changes landed and which didn't, writes nothing after the failure, and keeps the draft with no record", async () => {
    const { folder, home, path, store, fingerprint } = await previewed([
      NEW_ROUTINE,
      CHANGE_STRENGTH,
      PUSH_PULL,
    ]);

    const applied = await run(["apply", NAME, fingerprint], {
      store: failingOnWrite(store, 2),
      folder,
      home,
    });

    expect(applied.code).toBe(1);
    expect(applied.output).toBe(
      [
        `Backed up 1 document to ${backups(home)}.`,
        "Applying stopped at change 2: Firestore answered 503 UNAVAILABLE.",
        "Landed:",
        "1. New routine: Upper Lower, version 1",
        "Didn't land:",
        "2. Change routine: Strength → Strength Plus, version 2 → 3",
        "3. New routine: Push Pull, version 1",
        `The draft is kept, and no record is written to proposals/: ${path}`,
      ].join("\n"),
    );
    expect(await everythingIn(store)).toEqual({
      ...WITH_STRENGTH,
      routines: [FULL_BODY, STRENGTH, UPPER_LOWER],
      bodyWeights: [],
      coachingSessions: [],
    });
    expect(await exists(path)).toBe(true);
    expect(await readdir(folder)).toEqual(["drafts"]);
  });

  it.each([
    [
      "a new routine",
      [NEW_ROUTINE, PUSH_PULL],
      "Upper Lower is already a routine (change 1)",
    ],
    [
      "a routine change that adds a day",
      [CHANGE_STRENGTH, PUSH_PULL],
      "Arms is already a day of Strength Plus (change 1)",
    ],
    [
      "a routine change that adds no day",
      [RENAME_STRENGTH, PUSH_PULL],
      "This changes nothing in Strength Plus (change 1)",
    ],
  ])(
    "refuses a rerun of the same proposal once %s landed, rather than making it twice",
    async (_, changes, why) => {
      const { folder, home, path, store, fingerprint } =
        await previewed(changes);
      await run(["apply", NAME, fingerprint], {
        store: failingOnWrite(store, 2),
        folder,
        home,
      });
      const landed = await everythingIn(store);

      const rerun = await run(["preview", NAME], { store, folder, home });

      expect(rerun.code).toBe(1);
      expect(rerun.output).toBe(`Not applied: ${why}.`);
      expect(await everythingIn(store)).toEqual(landed);
      expect(await exists(path)).toBe(true);
    },
  );

  it("counts a change as landed once its write has, even if reading fails after it", async () => {
    const { folder, home, path, store, fingerprint } = await previewed([
      NEW_ROUTINE,
    ]);
    let written = false;
    /** @type {Store} */
    const flaky = {
      ...store,
      get: (collection, id) =>
        written
          ? Promise.reject(new Error("fetch failed"))
          : store.get(collection, id),
      list: (collection) =>
        written
          ? Promise.reject(new Error("fetch failed"))
          : store.list(collection),
      put: async (collection, doc) => {
        await store.put(collection, doc);
        written = true;
      },
    };

    const applied = await run(["apply", NAME, fingerprint], {
      store: flaky,
      folder,
      home,
    });

    expect(applied.code).toBe(0);
    expect(applied.output).toBe(
      [
        `Applied ${NAME}, 1 change:`,
        "1. New routine: Upper Lower, version 1",
        "Wrote proposals/2026-11-14-1500-proposal.md and removed the draft.",
      ].join("\n"),
    );
    expect(await store.list("routines")).toEqual([
      FULL_BODY,
      STRENGTH,
      UPPER_LOWER,
    ]);
    expect(
      await readFile(
        join(folder, "proposals", "2026-11-14-1500-proposal.md"),
        "utf8",
      ),
    ).toBe(RECORD);
    expect(await exists(path)).toBe(false);
  });
});

/**
 * Writes a proposal of the given changes, previews it over a store seeded
 * with `seed` and returns what applying needs, and what preview printed.
 * @param {unknown[]} changes
 * @param {Record<string, Doc[]>} seed
 */
async function previewOf(changes, seed) {
  const folder = await privateFolder();
  const home = await privateFolder();
  const path = await writeProposal(folder, { changes });
  const store = createMemoryStore(seed);
  const preview = await run(["preview", NAME], { store, folder, home });
  return { folder, home, path, store, ...preview };
}

/** @param {{ folder: string, home: string, store: Store, output: string }} previewed */
const applyIt = ({ folder, home, store, output }) =>
  run(["apply", NAME, fingerprintOf(output)], { store, folder, home });

/** The record `apply` wrote for NAME. */
const recordIn = (/** @type {string} */ folder) =>
  readFile(join(folder, "proposals", "2026-11-14-1500-proposal.md"), "utf8");

/** A made-up custom exercise the library lacks, for a proposal to add (#197). */
const YOKE_WALK = {
  kind: "new-custom-exercise",
  reason: "A loaded carry for your upper back; the library has none on a yoke.",
  name: "Yoke Walk",
  type: "weight-reps",
  primary: ["traps", "forearms"],
  secondary: ["abs", "traps"],
  body: "lower",
};

describe("a new custom exercise (#197)", () => {
  it("shows its details in the dry run, then saves it as the app would, with its own id", async () => {
    const previewed = await previewOf([YOKE_WALK], SET_UP);

    expect(previewed.code).toBe(0);
    expect(previewed.output).toBe(
      [
        `Proposal ${NAME}, 1 change. Nothing is applied yet.`,
        "",
        "1. New custom exercise: Yoke Walk",
        "   Why: A loaded carry for your upper back; the library has none on a yoke.",
        "   - Type: Weight × reps",
        "   - Primary: Traps, Forearms",
        "   - Secondary: Abs",
        "   - Body: Lower",
        "",
        `Fingerprint: ${fingerprintOf(previewed.output)}`,
      ].join("\n"),
    );
    expect(await setUpIn(previewed.store)).toEqual(SET_UP);

    const applied = await applyIt(previewed);

    expect(applied.code).toBe(0);
    expect(applied.output).toBe(
      [
        `Applied ${NAME}, 1 change:`,
        "1. New custom exercise: Yoke Walk",
        "Wrote proposals/2026-11-14-1500-proposal.md and removed the draft.",
      ].join("\n"),
    );
    expect(await previewed.store.list("customExercises")).toEqual([
      SLED_PUSH,
      {
        id: expect.stringMatching(/^custom-[0-9a-f-]{36}$/),
        name: "Yoke Walk",
        type: "weight-reps",
        primary: ["traps", "forearms"],
        secondary: ["abs"],
        body: "lower",
        custom: true,
      },
    ]);
    expect(await recordIn(previewed.folder)).toBe(
      [
        "# Proposal applied · Nov 14, 2026 · 3:00 pm",
        "",
        `From drafts/${NAME}.`,
        "",
        "## New custom exercise: Yoke Walk",
        "",
        "A loaded carry for your upper back; the library has none on a yoke.",
        "",
        "- Type: Weight × reps",
        "- Primary: Traps, Forearms",
        "- Secondary: Abs",
        "- Body: Lower",
        "",
      ].join("\n"),
    );
    expect(await readdir(previewed.home)).toEqual([]);
  });

  it.each([
    [
      "a library exercise's name",
      { ...YOKE_WALK, name: " farmer's carry" },
      "Farmer's Carry is already an exercise",
    ],
    [
      "a custom exercise's name",
      { ...YOKE_WALK, name: "SLED PUSH" },
      "Sled Push is already an exercise",
    ],
    [
      "no primary muscle group",
      { ...YOKE_WALK, primary: [] },
      "Pick at least one primary muscle group",
    ],
  ])("is refused with %s, with the core's reason", async (_, change, why) => {
    const { code, output, store } = await previewOf([change], SET_UP);

    expect(code).toBe(1);
    expect(output).toBe(`Not applied: ${why} (change 1).`);
    expect(await setUpIn(store)).toEqual(SET_UP);
  });

  it.each([
    [
      "an id",
      { ...YOKE_WALK, id: "custom-sled-push" },
      "A new custom exercise has no id: saving gives it its own",
    ],
    [
      "no name",
      { ...YOKE_WALK, name: undefined },
      "A new custom exercise has a name",
    ],
    [
      "a type there isn't",
      { ...YOKE_WALK, type: "plyometric" },
      "A custom exercise's type is one of weight-reps, bodyweight-reps, assisted, timed, cardio",
    ],
    [
      "a muscle group there isn't",
      { ...YOKE_WALK, secondary: ["neck"] },
      "A custom exercise's primary and secondary muscle groups are lists of chest, front-delts, side-delts, rear-delts, biceps, triceps, forearms, lats-upper-back, traps, lower-back, abs, obliques, glutes, quads, hamstrings, adductors, calves",
    ],
    [
      "a body half there isn't",
      { ...YOKE_WALK, body: "full" },
      "A custom exercise's body half is upper or lower",
    ],
  ])("is refused when it has %s", async (_, change, why) => {
    const { code, output, store } = await previewOf([change], SET_UP);

    expect(code).toBe(1);
    expect(output).toBe(`Not applied: ${why} (change 1).`);
    expect(await setUpIn(store)).toEqual(SET_UP);
  });
});

/** Barbell Row's settings already in Forge, made-up, as the app saves them. */
const ROW_SETTINGS = {
  id: "barbell-row",
  unit: "kg",
  increment: 2,
  rest: 120,
  note: "Overhand grip",
};

/** The set-up with exercise settings in it. */
const WITH_SETTINGS = { ...SET_UP, exerciseSettings: [ROW_SETTINGS] };

/** @param {Store} store */
async function setUpWithSettings(store) {
  return {
    ...(await setUpIn(store)),
    exerciseSettings: await store.list("exerciseSettings"),
  };
}

/** A made-up settings change for an exercise with none saved yet. */
const CURL_SETTINGS = {
  kind: "exercise-settings",
  reason: "You log both dumbbells combined, so kg plates step it sensibly.",
  exerciseId: "db-curl",
  unit: "kg",
  rest: 60,
  note: "  Both dumbbells combined ",
};

describe("exercise settings (#197)", () => {
  it("shows each setting before and after, defaults as defaults, then saves them as the app's exercise page would", async () => {
    const previewed = await previewOf([CURL_SETTINGS], WITH_SETTINGS);

    expect(previewed.code).toBe(0);
    expect(previewed.output).toBe(
      [
        `Proposal ${NAME}, 1 change. Nothing is applied yet.`,
        "",
        "1. Exercise settings: DB Curl",
        "   Why: You log both dumbbells combined, so kg plates step it sensibly.",
        "   - Unit: lb (default) → kg",
        "   - Increment: 5 lb (default) → 2.5 kg (default)",
        "   - Rest: 90 s (default) → 60 s",
        '   - Pinned note: none → "Both dumbbells combined"',
        "",
        `Fingerprint: ${fingerprintOf(previewed.output)}`,
      ].join("\n"),
    );
    expect(await setUpWithSettings(previewed.store)).toEqual(WITH_SETTINGS);

    const applied = await applyIt(previewed);

    expect(applied.code).toBe(0);
    // Nothing was saved for DB Curl before, so there's nothing to back up.
    expect(applied.output).toBe(
      [
        `Applied ${NAME}, 1 change:`,
        "1. Exercise settings: DB Curl",
        "Wrote proposals/2026-11-14-1500-proposal.md and removed the draft.",
      ].join("\n"),
    );
    expect(await previewed.store.list("exerciseSettings")).toEqual([
      ROW_SETTINGS,
      { id: "db-curl", unit: "kg", rest: 60, note: "Both dumbbells combined" },
    ]);
    expect(await readdir(previewed.home)).toEqual([]);
  });

  it("backs up the settings it changes, and leaves the ones it doesn't name as they were", async () => {
    const previewed = await previewOf(
      [
        {
          kind: "exercise-settings",
          reason: "Your kg gym's smallest plates step 2.5 kg.",
          exerciseId: "barbell-row",
          increment: 2.5,
          note: "",
        },
      ],
      WITH_SETTINGS,
    );
    expect(previewed.output.split("\n").slice(2, -2)).toEqual([
      "1. Exercise settings: Barbell Row",
      "   Why: Your kg gym's smallest plates step 2.5 kg.",
      "   - Increment: 2 kg → 2.5 kg (default)",
      '   - Pinned note: "Overhand grip" → none',
    ]);

    const applied = await applyIt(previewed);

    expect(applied.code).toBe(0);
    expect(applied.output.split("\n")[0]).toBe(
      `Backed up 1 document to ${backups(previewed.home)}.`,
    );
    expect(await previewed.store.list("exerciseSettings")).toEqual([
      { id: "barbell-row", unit: "kg", rest: 120 },
    ]);
    expect(
      JSON.parse(
        await readFile(
          join(backups(previewed.home), "exerciseSettings", "barbell-row.json"),
          "utf8",
        ),
      ),
    ).toEqual(ROW_SETTINGS);
  });

  it("refuses when the settings changed after the preview", async () => {
    const previewed = await previewOf(
      [{ ...CURL_SETTINGS, exerciseId: "barbell-row", unit: "lb" }],
      WITH_SETTINGS,
    );
    expect(previewed.code).toBe(0);
    const edited = { ...ROW_SETTINGS, rest: 180 };
    await previewed.store.put("exerciseSettings", edited);

    const applied = await applyIt(previewed);

    expect(applied.code).toBe(1);
    expect(applied.output).toBe("Not applied: changed since the preview.");
    expect(await previewed.store.list("exerciseSettings")).toEqual([edited]);
    expect(await readdir(previewed.home)).toEqual([]);
  });

  it("shows a cardio exercise's unit as its distance's", async () => {
    const { code, output } = await previewOf(
      [
        {
          kind: "exercise-settings",
          reason: "The treadmill at your gym reads in km.",
          exerciseId: "treadmill",
          unit: "kg",
        },
      ],
      WITH_SETTINGS,
    );

    expect(code).toBe(0);
    expect(output.split("\n").slice(2, -2)).toEqual([
      "1. Exercise settings: Treadmill",
      "   Why: The treadmill at your gym reads in km.",
      "   - Unit: mi (default) → km",
    ]);
  });

  it.each([
    [
      "an exercise that isn't in Forge",
      { ...CURL_SETTINGS, exerciseId: "made-up-press" },
      "There's no exercise made-up-press in Forge",
    ],
    ["a unit there isn't", { ...CURL_SETTINGS, unit: "st" }, "Pick lb or kg"],
    [
      "an increment of 0",
      { ...CURL_SETTINGS, increment: 0 },
      "The increment must be more than 0",
    ],
    [
      "a rest too short",
      { ...CURL_SETTINGS, rest: 3 },
      "Rest is 5 s to 15 min, or Off",
    ],
    [
      "an increment for cardio",
      { ...CURL_SETTINGS, exerciseId: "treadmill", increment: 0.5 },
      "Treadmill is cardio: it has no increment",
    ],
    [
      "a unit it already has",
      { ...CURL_SETTINGS, exerciseId: "barbell-row", rest: 90 },
      "Barbell Row's unit is already kg",
    ],
    [
      "a rest it already has",
      { ...CURL_SETTINGS, unit: undefined, rest: 90 },
      "DB Curl's rest is already 90 s",
    ],
    [
      "an increment it already has",
      { ...CURL_SETTINGS, unit: undefined, increment: 5 },
      "DB Curl's increment is already 5 lb",
    ],
    [
      "a pinned note it already has",
      {
        kind: "exercise-settings",
        reason: "Grip matters.",
        exerciseId: "barbell-row",
        note: "Overhand grip ",
      },
      'Barbell Row\'s pinned note is already "Overhand grip"',
    ],
    [
      "a pinned note to remove when there's none",
      { ...CURL_SETTINGS, note: " " },
      "DB Curl has no pinned note to remove",
    ],
  ])("refuses a change naming %s, with the reason", async (_, change, why) => {
    const { code, output, store } = await previewOf([change], WITH_SETTINGS);

    expect(code).toBe(1);
    expect(output).toBe(`Not applied: ${why} (change 1).`);
    expect(await setUpWithSettings(store)).toEqual(WITH_SETTINGS);
  });

  it.each([
    [
      "no exercise",
      { ...CURL_SETTINGS, exerciseId: undefined },
      'An exercise settings change names the exercise by its id, or a custom exercise made earlier in the proposal by { "custom": "<name>" }',
    ],
    [
      "no settings",
      { kind: "exercise-settings", reason: "Tidy.", exerciseId: "db-curl" },
      "An exercise settings change names at least one of unit, increment, rest and note",
    ],
    [
      "a field that isn't a setting",
      { ...CURL_SETTINGS, rir: 2 },
      "An exercise settings change has only unit, increment, rest and note, not rir",
    ],
    [
      "an increment that isn't a number",
      { ...CURL_SETTINGS, increment: "2.5" },
      "An increment is a number",
    ],
    [
      "a note that isn't text",
      { ...CURL_SETTINGS, note: 4 },
      "A pinned note is text; a blank one removes it",
    ],
  ])("is refused when it has %s", async (_, change, why) => {
    const { code, output } = await previewOf([change], WITH_SETTINGS);

    expect(code).toBe(1);
    expect(output).toBe(`Not applied: ${why} (change 1).`);
  });
});

/** A made-up gym already in Forge, with three exercises ticked. */
const HOME_GYM = {
  id: "g-home",
  name: "Home Gym",
  exerciseIds: ["barbell-row", "lat-pulldown", "db-curl"],
};

/** The set-up with HOME_GYM in it too. */
const WITH_HOME_GYM = { ...SET_UP, gyms: [...SET_UP.gyms, HOME_GYM] };

/** A made-up change to HOME_GYM's exercises. */
const HOME_TICKS = {
  kind: "gym-exercises",
  reason: "The pulldown went; a curl bar and a sled came in.",
  id: "g-home",
  tick: ["hammer-curl", "custom-sled-push"],
  untick: ["lat-pulldown"],
};

describe("a gym's exercises (#197)", () => {
  it("shows the ticks added and removed by exercise name, then makes them, leaving the gym's other ticks and its name as they were", async () => {
    const previewed = await previewOf([HOME_TICKS], WITH_HOME_GYM);

    expect(previewed.code).toBe(0);
    expect(previewed.output).toBe(
      [
        `Proposal ${NAME}, 1 change. Nothing is applied yet.`,
        "",
        "1. Gym exercises: Home Gym",
        "   Why: The pulldown went; a curl bar and a sled came in.",
        "   Ticked",
        "   - Hammer Curl",
        "   - Sled Push",
        "   Unticked",
        "   - Lat Pulldown",
        "",
        `Fingerprint: ${fingerprintOf(previewed.output)}`,
      ].join("\n"),
    );
    expect(await setUpIn(previewed.store)).toEqual(WITH_HOME_GYM);

    const applied = await applyIt(previewed);

    expect(applied.code).toBe(0);
    expect(applied.output).toBe(
      [
        `Backed up 1 document to ${backups(previewed.home)}.`,
        `Applied ${NAME}, 1 change:`,
        "1. Gym exercises: Home Gym",
        "Wrote proposals/2026-11-14-1500-proposal.md and removed the draft.",
      ].join("\n"),
    );
    expect(await previewed.store.list("gyms")).toEqual([
      SET_UP.gyms[0],
      {
        id: "g-home",
        name: "Home Gym",
        exerciseIds: [
          "barbell-row",
          "db-curl",
          "hammer-curl",
          "custom-sled-push",
        ],
      },
    ]);
    expect(
      JSON.parse(
        await readFile(
          join(backups(previewed.home), "gyms", "g-home.json"),
          "utf8",
        ),
      ),
    ).toEqual(HOME_GYM);
    expect(await recordIn(previewed.folder)).toBe(
      [
        "# Proposal applied · Nov 14, 2026 · 3:00 pm",
        "",
        `From drafts/${NAME}.`,
        "",
        "## Gym exercises: Home Gym",
        "",
        "The pulldown went; a curl bar and a sled came in.",
        "",
        "### Ticked",
        "",
        "- Hammer Curl",
        "- Sled Push",
        "",
        "### Unticked",
        "",
        "- Lat Pulldown",
        "",
      ].join("\n"),
    );
  });

  it("refuses when the gym changed after the preview", async () => {
    const previewed = await previewOf([HOME_TICKS], WITH_HOME_GYM);
    const edited = { ...HOME_GYM, name: "Garage" };
    await previewed.store.put("gyms", edited);

    const applied = await applyIt(previewed);

    expect(applied.code).toBe(1);
    expect(applied.output).toBe("Not applied: changed since the preview.");
    expect(await previewed.store.list("gyms")).toEqual([
      SET_UP.gyms[0],
      edited,
    ]);
    expect(await readdir(previewed.home)).toEqual([]);
  });

  it.each([
    [
      "a gym that isn't in Forge",
      { ...HOME_TICKS, id: "g-gone" },
      "There's no gym g-gone in Forge",
    ],
    [
      "an exercise that isn't in Forge",
      { ...HOME_TICKS, tick: ["made-up-press"] },
      "There's no exercise made-up-press in Forge",
    ],
    [
      "an exercise already ticked",
      { ...HOME_TICKS, tick: ["hammer-curl", "barbell-row"] },
      "Barbell Row is already ticked at Home Gym",
    ],
    [
      "an exercise to untick that isn't ticked",
      { ...HOME_TICKS, untick: ["barbell-bench-press"] },
      "Barbell Bench Press isn't ticked at Home Gym",
    ],
    [
      "an exercise twice",
      { ...HOME_TICKS, tick: ["hammer-curl", "hammer-curl"] },
      "Hammer Curl is named twice",
    ],
    [
      "an exercise both ticked and unticked",
      { ...HOME_TICKS, untick: ["hammer-curl"] },
      "Hammer Curl is named twice",
    ],
  ])("refuses a change naming %s, with the reason", async (_, change, why) => {
    const { code, output, store } = await previewOf([change], WITH_HOME_GYM);

    expect(code).toBe(1);
    expect(output).toBe(`Not applied: ${why} (change 1).`);
    expect(await setUpIn(store)).toEqual(WITH_HOME_GYM);
  });

  it.each([
    [
      "no gym id",
      { ...HOME_TICKS, id: undefined },
      "A gym exercises change names the gym by its id",
    ],
    [
      "ticks that aren't a list",
      { ...HOME_TICKS, tick: "hammer-curl" },
      "A gym exercises change lists the exercises to tick and to untick",
    ],
    [
      "nothing to tick or untick",
      { ...HOME_TICKS, tick: [], untick: undefined },
      "A gym exercises change ticks or unticks at least one exercise",
    ],
    [
      "an exercise that isn't named by id or by name",
      { ...HOME_TICKS, tick: [{ name: "Sled Push" }] },
      'Each exercise is named by its id, or a custom exercise made earlier in the proposal by { "custom": "<name>" }',
    ],
  ])("is refused when it has %s", async (_, change, why) => {
    const { code, output } = await previewOf([change], WITH_HOME_GYM);

    expect(code).toBe(1);
    expect(output).toBe(`Not applied: ${why} (change 1).`);
  });
});

/** A made-up new gym, as the /coach skill writes it. */
const RIVERSIDE = {
  kind: "new-gym",
  reason: "Your new office has a gym; these are what it has.",
  name: "Riverside",
  exercises: ["barbell-row", "custom-sled-push", "lat-pulldown"],
};

describe("a new gym (#197)", () => {
  it("shows the exercises it ticks by name, then makes the gym and ticks them in order, as the app's gym pages do", async () => {
    const previewed = await previewOf([RIVERSIDE], SET_UP);

    expect(previewed.code).toBe(0);
    expect(previewed.output).toBe(
      [
        `Proposal ${NAME}, 1 change. Nothing is applied yet.`,
        "",
        "1. New gym: Riverside",
        "   Why: Your new office has a gym; these are what it has.",
        "   Ticked",
        "   - Barbell Row",
        "   - Sled Push",
        "   - Lat Pulldown",
        "",
        `Fingerprint: ${fingerprintOf(previewed.output)}`,
      ].join("\n"),
    );
    expect(await setUpIn(previewed.store)).toEqual(SET_UP);

    const applied = await applyIt(previewed);

    expect(applied.code).toBe(0);
    expect(applied.output).toBe(
      [
        `Applied ${NAME}, 1 change:`,
        "1. New gym: Riverside",
        "Wrote proposals/2026-11-14-1500-proposal.md and removed the draft.",
      ].join("\n"),
    );
    expect(await previewed.store.list("gyms")).toEqual([
      SET_UP.gyms[0],
      {
        id: expect.stringMatching(UUID),
        name: "Riverside",
        exerciseIds: ["barbell-row", "custom-sled-push", "lat-pulldown"],
      },
    ]);
    expect(await readdir(previewed.home)).toEqual([]);
  });

  it("refuses the whole proposal when its gym's name was taken after the preview", async () => {
    const previewed = await previewOf([YOKE_WALK, RIVERSIDE], SET_UP);
    const taken = { id: "g-phone", name: "Riverside", exerciseIds: [] };
    await previewed.store.put("gyms", taken);

    const applied = await applyIt(previewed);

    expect(applied.code).toBe(1);
    expect(applied.output).toBe(
      "Not applied: Riverside is already a gym (change 2).",
    );
    expect(await setUpIn(previewed.store)).toEqual({
      ...SET_UP,
      gyms: [...SET_UP.gyms, taken],
    });
    expect(await exists(previewed.path)).toBe(true);
  });

  it("can be made with nothing ticked yet", async () => {
    const { code, output } = await previewOf(
      [{ ...RIVERSIDE, exercises: [] }],
      SET_UP,
    );

    expect(code).toBe(0);
    expect(output.split("\n").slice(2, -2)).toEqual([
      "1. New gym: Riverside",
      "   Why: Your new office has a gym; these are what it has.",
      "   - No exercises ticked yet",
    ]);
  });

  it.each([
    [
      "a gym already in Forge",
      [{ ...RIVERSIDE, name: " made-up GYM" }],
      "Made-up Gym is already a gym (change 1)",
    ],
    [
      "an earlier change in the same proposal",
      [RIVERSIDE, { ...RIVERSIDE, name: "riverside" }],
      "Riverside is already a gym (change 2)",
    ],
    [
      "nothing",
      [{ ...RIVERSIDE, name: "  " }],
      "A gym needs a name (change 1)",
    ],
  ])("refuses a new gym named like %s", async (_, changes, why) => {
    const { code, output, store } = await previewOf(changes, SET_UP);

    expect(code).toBe(1);
    expect(output).toBe(`Not applied: ${why}.`);
    expect(await setUpIn(store)).toEqual(SET_UP);
  });

  it.each([
    [
      "an exercise that isn't in Forge",
      { ...RIVERSIDE, exercises: ["barbell-row", "made-up-press"] },
      "There's no exercise made-up-press in Forge",
    ],
    [
      "an exercise twice",
      { ...RIVERSIDE, exercises: ["barbell-row", "barbell-row"] },
      "Barbell Row is named twice",
    ],
    [
      "an id",
      { ...RIVERSIDE, id: "g-1" },
      "A new gym has no id: making it gives it its own",
    ],
    [
      "no list of exercises",
      { ...RIVERSIDE, exercises: "barbell-row" },
      "A new gym has a name and a list of exercises",
    ],
  ])("is refused when it has %s", async (_, change, why) => {
    const { code, output, store } = await previewOf([change], SET_UP);

    expect(code).toBe(1);
    expect(output).toBe(`Not applied: ${why} (change 1).`);
    expect(await setUpIn(store)).toEqual(SET_UP);
  });
});

/** Refers to a custom exercise made earlier in the same proposal, by name. */
const YOKE = { custom: "yoke walk" };

/**
 * A made-up proposal that adds YOKE_WALK and uses it, by name, in every
 * kind of change that names exercises.
 */
const USING_YOKE = [
  YOKE_WALK,
  {
    ...PUSH_PULL,
    days: [
      {
        name: "Pull",
        slots: [{ exerciseId: YOKE, sets: 3, repMin: 8, repMax: 12 }],
      },
    ],
  },
  {
    ...CHANGE_STRENGTH,
    days: [
      {
        ...CHANGE_STRENGTH.days[1],
        slots: [
          ...CHANGE_STRENGTH.days[1].slots,
          {
            exerciseId: { custom: "Yoke Walk" },
            sets: 2,
            repMin: 6,
            repMax: 10,
          },
        ],
      },
    ],
  },
  { ...RIVERSIDE, exercises: ["barbell-row", YOKE] },
  { ...HOME_TICKS, tick: [YOKE], untick: [] },
  {
    kind: "exercise-settings",
    reason: "A yoke loads in big steps.",
    exerciseId: YOKE,
    increment: 20,
  },
];

describe("a custom exercise made and used in one proposal (#197)", () => {
  it("shows it by name wherever it's used, and applies in one go with every reference resolved to the id it's given", async () => {
    const previewed = await previewOf(USING_YOKE, {
      ...WITH_STRENGTH,
      gyms: WITH_HOME_GYM.gyms,
    });

    expect(previewed.code).toBe(0);
    expect(previewed.output).toBe(
      [
        `Proposal ${NAME}, 6 changes. Nothing is applied yet.`,
        "",
        "1. New custom exercise: Yoke Walk",
        "   Why: A loaded carry for your upper back; the library has none on a yoke.",
        "   - Type: Weight × reps",
        "   - Primary: Traps, Forearms",
        "   - Secondary: Abs",
        "   - Body: Lower",
        "2. New routine: Push Pull, version 1",
        "   Why: A shorter week for when you travel.",
        "   Pull",
        "   - Yoke Walk: 3 × 8–12",
        "3. Change routine: Strength → Strength Plus, version 2 → 3",
        "   Why: Pull work moves to its own routine; arms get a day of their own.",
        "   Lower (was Legs)",
        "   - Barbell Back Squat: 3 × 5–8 · RIR 3",
        "   - Sled Push: 4 × 10–15",
        "   - Yoke Walk: 2 × 6–10 (added)",
        "   Push (dropped)",
        "   - Barbell Bench Press: 3 × 6–8 · RIR 2",
        "   - Barbell Overhead Press: 3 × 6–10",
        "   - Triceps Pushdown: 3 × 10–15",
        "   Pull (dropped)",
        "   - Barbell Row: 3 × 8–12",
        "   - Lat Pulldown: 3 × 8–12",
        "4. New gym: Riverside",
        "   Why: Your new office has a gym; these are what it has.",
        "   Ticked",
        "   - Barbell Row",
        "   - Yoke Walk",
        "5. Gym exercises: Home Gym",
        "   Why: The pulldown went; a curl bar and a sled came in.",
        "   Ticked",
        "   - Yoke Walk",
        "6. Exercise settings: Yoke Walk",
        "   Why: A yoke loads in big steps.",
        "   - Increment: 10 lb (default) → 20 lb",
        "",
        `Fingerprint: ${fingerprintOf(previewed.output)}`,
      ].join("\n"),
    );

    const applied = await applyIt(previewed);

    expect(applied.code).toBe(0);
    const { store } = previewed;
    const yoke = (await store.list("customExercises")).find(
      (e) => e.name === "Yoke Walk",
    );
    const id = /** @type {string} */ (yoke?.id);
    expect(id).toMatch(/^custom-[0-9a-f-]{36}$/);
    const routines = /** @type {any[]} */ (await store.list("routines"));
    const pushPull = routines.find((r) => r.name === "Push Pull");
    expect(pushPull.versions[0].days[0].slots).toEqual([
      { exerciseId: id, sets: 3, repMin: 8, repMax: 12 },
    ]);
    const strength = routines.find((r) => r.id === "r-strength");
    expect(strength.versions[2].days[0].slots.at(-1)).toEqual({
      exerciseId: id,
      sets: 2,
      repMin: 6,
      repMax: 10,
    });
    const gyms = /** @type {any[]} */ (await store.list("gyms"));
    expect(gyms.find((g) => g.name === "Riverside").exerciseIds).toEqual([
      "barbell-row",
      id,
    ]);
    expect(gyms.find((g) => g.id === "g-home").exerciseIds).toEqual([
      ...HOME_GYM.exerciseIds,
      id,
    ]);
    expect(await store.list("exerciseSettings")).toEqual([
      { id, increment: 20 },
    ]);
  });

  it.each([
    [
      "a custom exercise neither in the proposal nor in Forge",
      [{ ...RIVERSIDE, exercises: [{ custom: "Zercher Carry" }] }],
      "There's no custom exercise Zercher Carry made earlier in the proposal (change 1)",
    ],
    [
      "a custom exercise the proposal makes later",
      [{ ...RIVERSIDE, exercises: [YOKE] }, YOKE_WALK],
      "There's no custom exercise yoke walk made earlier in the proposal (change 1)",
    ],
    [
      "a custom exercise already in Forge",
      [{ ...CURL_SETTINGS, exerciseId: { custom: "sled push" } }],
      "Sled Push is already in Forge: name it by its id, custom-sled-push (change 1)",
    ],
    [
      "a library exercise",
      [
        {
          ...NEW_ROUTINE,
          days: [
            {
              name: "Upper A",
              slots: [
                {
                  exerciseId: { custom: "Barbell Row" },
                  sets: 3,
                  repMin: 8,
                  repMax: 12,
                },
              ],
            },
          ],
        },
      ],
      "Barbell Row is already in Forge: name it by its id, barbell-row (change 1)",
    ],
  ])("refuses a reference by name to %s", async (_, changes, why) => {
    const { code, output, store } = await previewOf(changes, SET_UP);

    expect(code).toBe(1);
    expect(output).toBe(`Not applied: ${why}.`);
    expect(await setUpIn(store)).toEqual(SET_UP);
  });

  it("refuses a slot naming its exercise neither by id nor by name", async () => {
    const { code, output } = await previewOf(
      [
        {
          ...NEW_ROUTINE,
          days: [
            {
              name: "Upper A",
              slots: [
                {
                  exerciseId: { custom: "Yoke Walk", id: "x" },
                  sets: 3,
                  repMin: 8,
                  repMax: 12,
                },
              ],
            },
          ],
        },
      ],
      SET_UP,
    );

    expect(code).toBe(1);
    expect(output).toBe(
      'Not applied: Each slot names its exercise by its id, or a custom exercise made earlier in the proposal by { "custom": "<name>" } (change 1).',
    );
  });
});

describe("a change of several writes landing partly (#197)", () => {
  const SEED = {
    ...WITH_STRENGTH,
    gyms: WITH_HOME_GYM.gyms,
    exerciseSettings: [ROW_SETTINGS],
  };

  it.each([
    [
      "ticking its second exercise",
      4,
      [
        "Made the gym and ticked Barbell Row.",
        "Didn't tick: Yoke Walk, Lat Pulldown.",
      ],
      ["barbell-row"],
    ],
    [
      "ticking its first exercise",
      3,
      [
        "Made the gym, with nothing ticked.",
        "Didn't tick: Barbell Row, Yoke Walk, Lat Pulldown.",
      ],
      [],
    ],
  ])(
    "says what a new gym wrote when %s fails, and writes nothing more",
    async (_, failing, partly, ticked) => {
      const previewed = await previewOf(
        [
          YOKE_WALK,
          {
            ...RIVERSIDE,
            exercises: ["barbell-row", YOKE, "lat-pulldown"],
          },
          PUSH_PULL,
        ],
        SEED,
      );

      const applied = await run(
        ["apply", NAME, fingerprintOf(previewed.output)],
        {
          store: failingOnWrite(previewed.store, failing),
          folder: previewed.folder,
          home: previewed.home,
        },
      );

      expect(applied.code).toBe(1);
      expect(applied.output).toBe(
        [
          "Applying stopped at change 2: Firestore answered 503 UNAVAILABLE.",
          "Landed:",
          "1. New custom exercise: Yoke Walk",
          "Landed partly:",
          "2. New gym: Riverside",
          ...partly.map((line) => `   ${line}`),
          "Didn't land:",
          "3. New routine: Push Pull, version 1",
          `The draft is kept, and no record is written to proposals/: ${previewed.path}`,
        ].join("\n"),
      );
      const gyms = await previewed.store.list("gyms");
      expect(gyms).toEqual([
        ...WITH_HOME_GYM.gyms,
        {
          id: expect.stringMatching(UUID),
          name: "Riverside",
          exerciseIds: ticked,
        },
      ]);
      expect(await previewed.store.list("routines")).toEqual(SEED.routines);
      expect(await exists(previewed.path)).toBe(true);
      expect(await readdir(previewed.folder)).toEqual(["drafts"]);
    },
  );

  it("says what a gym's ticks wrote when one fails partway", async () => {
    const previewed = await previewOf([HOME_TICKS], SEED);

    const applied = await run(
      ["apply", NAME, fingerprintOf(previewed.output)],
      {
        store: failingOnWrite(previewed.store, 2),
        folder: previewed.folder,
        home: previewed.home,
      },
    );

    expect(applied.code).toBe(1);
    expect(applied.output).toBe(
      [
        `Backed up 1 document to ${backups(previewed.home)}.`,
        "Applying stopped at change 1: Firestore answered 503 UNAVAILABLE.",
        "Landed: nothing.",
        "Landed partly:",
        "1. Gym exercises: Home Gym",
        "   Ticked: Hammer Curl.",
        "   Didn't tick: Sled Push.",
        "   Didn't untick: Lat Pulldown.",
        "Didn't land: nothing.",
        `The draft is kept, and no record is written to proposals/: ${previewed.path}`,
      ].join("\n"),
    );
    expect(await previewed.store.list("gyms")).toEqual([
      SET_UP.gyms[0],
      { ...HOME_GYM, exerciseIds: [...HOME_GYM.exerciseIds, "hammer-curl"] },
    ]);
  });

  it.each([
    [
      "a new custom exercise",
      [YOKE_WALK, PUSH_PULL],
      2,
      "Yoke Walk is already an exercise (change 1)",
    ],
    [
      "a new gym",
      [RIVERSIDE, PUSH_PULL],
      2,
      "Riverside is already a gym (change 1)",
    ],
    [
      "a gym's ticks, partly",
      [HOME_TICKS, PUSH_PULL],
      2,
      "Hammer Curl is already ticked at Home Gym (change 1)",
    ],
    [
      "exercise settings",
      [CURL_SETTINGS, PUSH_PULL],
      2,
      "DB Curl's unit is already kg (change 1)",
    ],
  ])(
    "refuses a rerun of the same proposal once %s landed, rather than making it again",
    async (_, changes, failing, why) => {
      const previewed = await previewOf(changes, SEED);
      await run(["apply", NAME, fingerprintOf(previewed.output)], {
        store: failingOnWrite(previewed.store, failing),
        folder: previewed.folder,
        home: previewed.home,
      });
      const landed = await everythingIn(previewed.store);

      const rerun = await run(["preview", NAME], {
        store: previewed.store,
        folder: previewed.folder,
        home: previewed.home,
      });

      expect(rerun.code).toBe(1);
      expect(rerun.output).toBe(`Not applied: ${why}.`);
      expect(await everythingIn(previewed.store)).toEqual(landed);
    },
  );
});

/**
 * Every collection Forge keeps (each the core reads or writes), seeded with
 * made-up documents: the set-up a proposal may change, and the history and
 * settings it never may. A new collection belongs here too.
 */
const EVERYTHING = {
  ...WITH_STRENGTH,
  exerciseSettings: [
    { id: "barbell-row", unit: "kg", increment: 2.5, rest: 120 },
  ],
  bodyWeights: [
    {
      id: "bw-1",
      load: 82.5,
      unit: "kg",
      date: "2026-11-10",
      loggedAt: "2026-11-10T13:00:00.000Z",
    },
  ],
  coachingSessions: [
    {
      id: "cs-1",
      savedAt: "2026-11-07T20:00:00.000Z",
      verdict: "Steady week; pressing is moving.",
      insights: [
        {
          title: "Bench",
          body: "Up 2.5 kg in a fortnight.",
          level: "training",
        },
      ],
      commitments: [{ text: "Sleep before heavy days." }],
      followUps: [],
    },
  ],
  settings: [{ id: "user", lastGymId: "g-1", dashboardRange: "12w" }],
  feedback: [
    {
      id: "f-1",
      text: "The rest timer is hard to read.",
      sentAt: "2026-11-01T18:00:00.000Z",
      appVersion: { commit: "abc1234", date: "2026-10-30T12:00:00.000Z" },
    },
  ],
};

/**
 * One proposal using every kind of change there is. A new kind adds a
 * change to this list, and the documents it names to NAMED below; the test
 * itself needn't change.
 */
const EVERY_KIND = [
  NEW_ROUTINE,
  CHANGE_STRENGTH,
  YOKE_WALK,
  { ...RIVERSIDE, exercises: ["barbell-row", YOKE] },
  {
    kind: "gym-exercises",
    reason: "The rack moved out; a yoke moved in.",
    id: "g-1",
    tick: [YOKE],
    untick: ["barbell-row"],
  },
  {
    kind: "exercise-settings",
    reason: "Longer rests for heavier rows.",
    exerciseId: "barbell-row",
    rest: 180,
  },
];

/**
 * The documents EVERY_KIND names: an existing one by collection and id, a
 * new one by collection and "new:" its name.
 */
const NAMED = [
  "customExercises/new: Yoke Walk",
  "exerciseSettings/barbell-row",
  "gyms/g-1",
  "gyms/new: Riverside",
  "routines/new: Upper Lower",
  "routines/r-strength",
];

describe("what any proposal leaves alone (#196)", () => {
  /** @param {Store} store */
  async function snapshot(store) {
    /** @type {Record<string, Doc[]>} */
    const all = {};
    for (const collection of Object.keys(EVERYTHING))
      all[collection] = await store.list(collection);
    return all;
  }

  it("changes only the documents it names, deletes nothing, and leaves workouts, body weights, coaching sessions, app settings and feedback as they were", async () => {
    const folder = await privateFolder();
    const home = await privateFolder();
    await writeProposal(folder, { changes: EVERY_KIND });
    const store = createMemoryStore(EVERYTHING);
    const { output } = await run(["preview", NAME], { store, folder, home });

    const applied = await run(["apply", NAME, fingerprintOf(output)], {
      store,
      folder,
      home,
    });

    expect(applied.code).toBe(0);
    // Against the seed itself, so a write by preview would show too.
    /** @type {Record<string, Doc[]>} */
    const before = EVERYTHING;
    const after = await snapshot(store);
    /** @type {string[]} */
    const gone = [];
    /** @type {string[]} */
    const changed = [];
    for (const [collection, docs] of Object.entries(after)) {
      for (const was of before[collection])
        if (!docs.some((doc) => doc.id === was.id))
          gone.push(`${collection}/${was.id}`);
      for (const doc of docs) {
        const was = before[collection].find((d) => d.id === doc.id);
        if (!was) changed.push(`${collection}/new: ${doc.name ?? doc.id}`);
        else if (JSON.stringify(was) !== JSON.stringify(doc))
          changed.push(`${collection}/${doc.id}`);
      }
    }
    expect(gone).toEqual([]);
    expect(changed.sort()).toEqual(NAMED);
    const { workouts, bodyWeights, coachingSessions, settings, feedback } =
      after;
    expect({
      workouts,
      bodyWeights,
      coachingSessions,
      settings,
      feedback,
    }).toEqual({
      workouts: EVERYTHING.workouts,
      bodyWeights: EVERYTHING.bodyWeights,
      coachingSessions: EVERYTHING.coachingSessions,
      settings: EVERYTHING.settings,
      feedback: EVERYTHING.feedback,
    });
  });
});
