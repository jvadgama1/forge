// Times in these tests read in one time zone, whatever the machine's, since
// insight files are named and dated in local time. Vitest runs each test
// file in its own process, so this reaches no other file.
process.env.TZ = "America/New_York";

import { afterEach, describe, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCoach } from "../../tools/coach/run.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { createRestStore } from "../../tools/store/rest-store.js";
import { createForge } from "../../app/js/core/forge.js";
import { SEED_LIBRARY } from "../../app/js/core/seed-library.js";

/** @import { CoachingSession, Store } from "../../app/js/core/types.js" */

/** @type {string[]} */
const folders = [];
afterEach(async () => {
  for (const folder of folders.splice(0))
    await rm(folder, { recursive: true, force: true });
});

/**
 * Runs the command over a stand-in store, with a fixed clock (14 Nov 2026,
 * 20:00 UTC: 3:00 pm in New York) and a temporary private folder.
 * @param {string[]} args
 * @param {{ store?: Store, folder?: string }} [options]
 */
async function run(args, { store = createMemoryStore(), folder } = {}) {
  folder ??= await privateFolder();
  /** @type {string[]} */
  const printed = [];
  const code = await runCoach(args, {
    store,
    now: () => new Date("2026-11-14T20:00:00.000Z"),
    folder,
    print: (text) => printed.push(text),
  });
  return { code, output: printed.join("\n"), folder, store };
}

async function privateFolder() {
  const folder = await mkdtemp(join(tmpdir(), "forge-coach-"));
  folders.push(folder);
  return folder;
}

/**
 * Writes a draft into the private folder's drafts/, as the /coach skill does.
 * @param {string} folder
 * @param {unknown} draft
 * @param {string} [name]
 */
async function writeDraft(folder, draft, name = "made-up.json") {
  await mkdir(join(folder, "drafts"), { recursive: true });
  const path = join(folder, "drafts", name);
  await writeFile(path, JSON.stringify(draft, null, 2));
  return path;
}

/** @param {Store} store */
const coachingSessions = (store) =>
  createForge({ store, library: SEED_LIBRARY }).listCoachingSessions();

/** @param {string} path */
const exists = (path) =>
  readFile(path).then(
    () => true,
    () => false,
  );

/**
 * A made-up earlier coaching session: 7 Nov 2026 at 9:00 pm in New York,
 * already 8 Nov in UTC.
 * @type {CoachingSession}
 */
const EARLIER = {
  id: "cs-earlier",
  savedAt: "2026-11-08T02:00:00.000Z",
  verdict: "Decent week. Don't get comfortable.",
  insights: [
    {
      title: "Deadlift form",
      body: "Your back rounds on the last rep.",
      level: "training",
    },
  ],
  commitments: [{ text: "Squat twice a week" }, { text: "Sleep 7 hours" }],
  followUps: [],
};

/** A made-up draft, as the /coach skill writes it. */
const DRAFT = {
  verdict: "Your legs are on holiday. Stay hard.",
  insights: [
    {
      title: "Squat stalled",
      body: "Three weeks at 225 lb for 6: add a back-off set.",
      level: "training",
    },
    {
      title: "Sleep",
      body: "Under 7 hours on training nights blunts recovery.\n\nGet to bed by 11.",
      level: "strategy",
    },
    {
      title: "Hamstrings",
      body: "No direct hamstring work in a month.",
      level: "training",
    },
  ],
  commitments: [
    { text: "Squat twice a week" },
    { text: "Ten minutes of mobility after each workout" },
  ],
  followUps: [
    {
      sessionId: "cs-earlier",
      commitment: "Squat twice a week",
      result: "Did it twice, both weeks.",
      checkedBy: "data",
    },
    {
      sessionId: "cs-earlier",
      commitment: "Sleep 7 hours",
      result: "Most nights, by your account.",
      checkedBy: "you",
    },
  ],
  corrections: [
    {
      sessionId: "cs-earlier",
      text: "Your back was fine: the camera angle was off.",
    },
  ],
};

/** DRAFT's insight file, saved at 3:00 pm on 14 Nov 2026 in New York. */
const DRAFT_MARKDOWN = [
  "# Coaching session · Nov 14, 2026 · 3:00 pm",
  "",
  "Your legs are on holiday. Stay hard.",
  "",
  "## Follow-ups",
  "",
  "### Squat twice a week",
  "",
  "Did it twice, both weeks.",
  "",
  "_Checked against logged data_",
  "",
  "### Sleep 7 hours",
  "",
  "Most nights, by your account.",
  "",
  "_From your own account_",
  "",
  "## Corrections",
  "",
  "Corrects Nov 7, 2026: Your back was fine: the camera angle was off.",
  "",
  "## Commitments",
  "",
  "- Squat twice a week",
  "- Ten minutes of mobility after each workout",
  "",
  "## Training",
  "",
  "### Squat stalled",
  "",
  "Three weeks at 225 lb for 6: add a back-off set.",
  "",
  "### Hamstrings",
  "",
  "No direct hamstring work in a month.",
  "",
  "## Strategy",
  "",
  "### Sleep",
  "",
  "Under 7 hours on training nights blunts recovery.",
  "",
  "Get to bed by 11.",
  "",
].join("\n");

/** EARLIER's insight file. */
const EARLIER_MARKDOWN = [
  "# Coaching session · Nov 7, 2026 · 9:00 pm",
  "",
  "Decent week. Don't get comfortable.",
  "",
  "## Commitments",
  "",
  "- Squat twice a week",
  "- Sleep 7 hours",
  "",
  "## Training",
  "",
  "### Deadlift form",
  "",
  "Your back rounds on the last rep.",
  "",
].join("\n");

/** DRAFT, saved at 3:00 pm on 14 Nov 2026 in New York. */
const SAVED = {
  ...DRAFT,
  id: "cs-saved",
  savedAt: "2026-11-14T20:00:00.000Z",
};

/**
 * Another made-up coaching session, saved in the same minute as SAVED.
 * @type {CoachingSession}
 */
const SAME_MINUTE = {
  id: "cs-same-minute",
  savedAt: "2026-11-14T20:00:40.000Z",
  verdict: "One more thing.",
  insights: [{ title: "Steps", body: "Walk after dinner.", level: "strategy" }],
  commitments: [],
  followUps: [],
};

const SAME_MINUTE_MARKDOWN = [
  "# Coaching session · Nov 14, 2026 · 3:00 pm",
  "",
  "One more thing.",
  "",
  "## Commitments",
  "",
  "None agreed this time.",
  "",
  "## Strategy",
  "",
  "### Steps",
  "",
  "Walk after dinner.",
  "",
].join("\n");

const USAGE = [
  "Usage: npm run coach -- read            print all Forge data as JSON, then",
  "                                        refresh the insight files",
  "       npm run coach -- save <draft>    save one coaching session from a",
  "                                        draft in drafts/, then remove it",
  "       npm run coach -- preview <proposal>",
  "                                        show what a proposal in drafts/",
  "                                        would change, and its fingerprint",
  "       npm run coach -- apply <proposal> <fingerprint>",
  "                                        make the proposal's changes if",
  "                                        nothing changed since its preview,",
  "                                        record it in proposals/, then",
  "                                        remove it",
].join("\n");

describe("npm run coach (#174)", () => {
  it("read prints the full export, then writes the insight files that are missing or don't match", async () => {
    const folder = await privateFolder();
    const insights = join(folder, "insights");
    await mkdir(insights);
    await writeFile(join(insights, "2026-11-07-2100.md"), EARLIER_MARKDOWN);
    await writeFile(join(insights, "2026-11-14-1500.md"), "Out of date");
    await writeFile(join(insights, "my-notes.md"), "Not the coach's");
    const longAgo = new Date("2020-01-01T00:00:00.000Z");
    await utimes(join(insights, "2026-11-07-2100.md"), longAgo, longAgo);
    const store = createMemoryStore({
      coachingSessions: [EARLIER, SAVED, SAME_MINUTE],
      gyms: [{ id: "g-1", name: "Made-up Gym", exerciseIds: [] }],
    });

    const { code, output } = await run(["read"], { store, folder });

    expect(code).toBe(0);
    const [json, summary] = output.split(/\n(?=Insight files:)/);
    const printed = JSON.parse(json);
    expect(Object.keys(printed)).toEqual([
      "app",
      "exportedAt",
      "gyms",
      "customExercises",
      "exerciseSettings",
      "routines",
      "workouts",
      "bodyWeights",
      "settings",
      "coachingSessions",
    ]);
    expect(printed).toMatchObject({
      app: "Forge",
      exportedAt: "2026-11-14T20:00:00.000Z",
      gyms: [{ id: "g-1", name: "Made-up Gym", exerciseIds: [] }],
    });
    expect(printed.coachingSessions).toEqual([SAME_MINUTE, SAVED, EARLIER]);
    expect(summary).toBe("Insight files: 2 written, 1 up to date.");
    expect((await readdir(insights)).sort()).toEqual([
      "2026-11-07-2100.md",
      "2026-11-14-1500-2.md",
      "2026-11-14-1500.md",
      "my-notes.md",
    ]);
    expect(await readFile(join(insights, "2026-11-14-1500.md"), "utf8")).toBe(
      DRAFT_MARKDOWN,
    );
    expect(await readFile(join(insights, "2026-11-14-1500-2.md"), "utf8")).toBe(
      SAME_MINUTE_MARKDOWN,
    );
    expect((await stat(join(insights, "2026-11-07-2100.md"))).mtime).toEqual(
      longAgo,
    );
    expect(await readFile(join(insights, "my-notes.md"), "utf8")).toBe(
      "Not the coach's",
    );
    // The data is printed, never saved to a file (ADR-0005).
    expect(await readdir(folder)).toEqual(["insights"]);
  });

  it("read makes insights/ when there isn't one", async () => {
    const store = createMemoryStore({ coachingSessions: [EARLIER] });
    const { code, output, folder } = await run(["read"], { store });

    expect(code).toBe(0);
    expect(output.split("\n").at(-1)).toBe(
      "Insight files: 1 written, 0 up to date.",
    );
    expect(
      await readFile(join(folder, "insights", "2026-11-07-2100.md"), "utf8"),
    ).toBe(EARLIER_MARKDOWN);
  });

  it("save adds exactly one coaching session, writes its insight file and removes the draft", async () => {
    const folder = await privateFolder();
    const draft = await writeDraft(folder, DRAFT);
    const store = createMemoryStore({ coachingSessions: [EARLIER] });

    const { code, output } = await run(["save", "made-up.json"], {
      store,
      folder,
    });

    expect(code).toBe(0);
    const [saved, ...rest] = await coachingSessions(store);
    expect(rest).toEqual([EARLIER]);
    expect(saved).toEqual({
      ...DRAFT,
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      savedAt: "2026-11-14T20:00:00.000Z",
    });
    expect(await readdir(join(folder, "insights"))).toEqual([
      "2026-11-14-1500.md",
    ]);
    expect(
      await readFile(join(folder, "insights", "2026-11-14-1500.md"), "utf8"),
    ).toBe(DRAFT_MARKDOWN);
    expect(await exists(draft)).toBe(false);
    expect(output).toBe(
      "Saved the coaching session of Nov 14, 2026 · 3:00 pm, wrote insights/2026-11-14-1500.md and removed the draft.",
    );
  });

  it("save removes the draft once saved, even when its insight file can't be written", async () => {
    const folder = await privateFolder();
    const draft = await writeDraft(folder, DRAFT);
    // A file where insights/ should be, so no insight file can be written.
    await writeFile(join(folder, "insights"), "");
    const store = createMemoryStore();

    const { code, output } = await run(["save", draft], { store, folder });

    expect(code).toBe(1);
    expect(await coachingSessions(store)).toHaveLength(1);
    expect(await exists(draft)).toBe(false);
    expect(output).toMatch(
      /^Saved the coaching session of Nov 14, 2026 · 3:00 pm and removed the draft, but couldn't write insights\/2026-11-14-1500\.md \(.+\)\. npm run coach -- read writes it\.$/,
    );
  });

  it.each([
    [
      "the core refuses its shape",
      { ...DRAFT, insights: [] },
      "A coaching session has 1 to 6 insights",
    ],
    [
      "a follow-up doesn't say how it was checked",
      {
        ...DRAFT,
        followUps: [{ ...DRAFT.followUps[0], checkedBy: undefined }],
      },
      "A follow-up was checked against data or by you",
    ],
    [
      "it names its own id",
      { ...DRAFT, id: "cs-earlier" },
      "A draft has no id: saving gives the coaching session its own",
    ],
    ["it isn't a JSON object", [DRAFT], "A draft is a JSON object"],
  ])(
    "save keeps a draft when %s, saving nothing and saying why",
    async (_, draft, why) => {
      const folder = await privateFolder();
      const path = await writeDraft(folder, draft);
      const store = createMemoryStore({ coachingSessions: [EARLIER] });

      const { code, output } = await run(["save", path], { store, folder });

      expect(code).toBe(1);
      expect(await coachingSessions(store)).toEqual([EARLIER]);
      expect(await readdir(folder)).toEqual(["drafts"]);
      expect(await readFile(path, "utf8")).toBe(JSON.stringify(draft, null, 2));
      expect(output).toBe(`Not saved: ${why}. The draft is kept: ${path}`);
    },
  );

  it("save says so when the draft isn't JSON or isn't there", async () => {
    const folder = await privateFolder();
    await mkdir(join(folder, "drafts"));
    await writeFile(join(folder, "drafts", "half.json"), '{"verdict": "Stay');

    const broken = await run(["save", "half.json"], { folder });
    const missing = await run(["save", "gone.json"], { folder });

    expect(broken.code).toBe(1);
    expect(broken.output).toMatch(
      /^Not saved: the draft isn't JSON \(.+\)\. The draft is kept: .+half\.json$/,
    );
    expect(missing.code).toBe(1);
    expect(missing.output).toBe(
      `Not saved: there's no draft at ${join(folder, "drafts", "gone.json")}.`,
    );
    expect(await readdir(folder)).toEqual(["drafts"]);
  });

  it.each([["read"], ["save"]])(
    "%s reports a Firestore refusal without the access token",
    async (command) => {
      const folder = await privateFolder();
      const path = await writeDraft(folder, DRAFT);
      /** @type {string[]} */
      const sent = [];
      // A stand-in for Firestore's REST API that refuses the sign-in.
      const store = createRestStore({
        baseUrl:
          "https://firestore.invalid/v1/projects/demo-forge/databases/(default)/documents",
        uid: "owner",
        token: async () => "secret-test-token",
        fetch: async (_, init) => {
          sent.push(JSON.stringify(init?.headers));
          return new Response(
            JSON.stringify({
              error: { status: "UNAUTHENTICATED", message: "Bad token" },
            }),
            { status: 401 },
          );
        },
      });

      const { code, output } = await run(
        command === "read" ? ["read"] : ["save", path],
        { store, folder },
      );

      expect(code).toBe(1);
      expect(sent.join()).toContain("secret-test-token");
      expect(output).toContain("Firestore answered 401 UNAUTHENTICATED");
      expect(output).not.toContain("secret-test-token");
      expect(await exists(path)).toBe(true);
      expect(await readdir(folder)).toEqual(["drafts"]);
    },
  );

  it.each([
    [[]],
    [["edit"]],
    [["delete", "cs-1"]],
    [["read", "extra"]],
    [["save"]],
    [["save", "made-up.json", "--force"]],
  ])("refuses %j with the usage", async (args) => {
    const { code, output } = await run(args);
    expect(code).toBe(1);
    expect(output).toBe(USAGE);
  });
});
