import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { EMULATOR_HOST, FIRESTORE_PORT, PROJECT_ID } from "../emulator.js";

/** @type {import("@firebase/rules-unit-testing").RulesTestEnvironment} */
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(
        new URL("../../firestore.rules", import.meta.url),
        "utf8",
      ),
      host: EMULATOR_HOST,
      port: FIRESTORE_PORT,
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

describe("Firestore security rules", () => {
  it("let a signed-in user read and write documents under their own root", async () => {
    const alice = env.authenticatedContext("alice").firestore();
    await assertSucceeds(
      alice.doc("users/alice/gyms/work").set({ id: "work" }),
    );
    await assertSucceeds(alice.doc("users/alice/gyms/work").get());
    await assertSucceeds(alice.collection("users/alice/gyms").get());
  });

  it("refuse an unauthenticated user everywhere", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(anon.doc("users/alice/gyms/work").get());
    await assertFails(anon.doc("users/alice/gyms/work").set({ id: "work" }));
    await assertFails(anon.collection("users/alice/gyms").get());
  });

  it("refuse a signed-in user access to another user's root", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/alice/gyms/work").set({ id: "work" });
    });
    const bob = env.authenticatedContext("bob").firestore();
    await assertFails(bob.doc("users/alice/gyms/work").get());
    await assertFails(bob.doc("users/alice/gyms/work").set({ id: "hijack" }));
    await assertFails(bob.collection("users/alice/gyms").get());
  });

  it("treat a user's own root document as theirs, but not another user's", async () => {
    // In rules v2, {document=**} also matches zero segments, so users/{uid}
    // itself belongs to that user (a natural home for a profile later).
    const alice = env.authenticatedContext("alice").firestore();
    await assertSucceeds(alice.doc("users/alice").set({ id: "alice" }));
    await assertFails(alice.doc("users/bob").set({ id: "bob" }));
  });

  it("refuse reads and writes outside users/", async () => {
    const alice = env.authenticatedContext("alice").firestore();
    await assertFails(alice.doc("shared/anything").set({ id: "x" }));
    await assertFails(alice.doc("shared/anything").get());
  });
});
