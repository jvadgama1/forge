import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { EMULATOR_HOST, FIRESTORE_PORT, PROJECT_ID } from "../emulator.js";
import { OWNER_UID } from "../../app/js/firebase-config.js";

const OWNER_ROOT = `users/${OWNER_UID}`;

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
  it("let the owner read and write documents under their own root", async () => {
    const owner = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      owner.doc(`${OWNER_ROOT}/gyms/work`).set({ id: "work" }),
    );
    await assertSucceeds(owner.doc(`${OWNER_ROOT}/gyms/work`).get());
    await assertSucceeds(owner.collection(`${OWNER_ROOT}/gyms`).get());
  });

  it("refuse an unauthenticated user everywhere", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(anon.doc(`${OWNER_ROOT}/gyms/work`).get());
    await assertFails(anon.doc(`${OWNER_ROOT}/gyms/work`).set({ id: "work" }));
    await assertFails(anon.collection(`${OWNER_ROOT}/gyms`).get());
  });

  it("refuse another account access to the owner's data", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${OWNER_ROOT}/gyms/work`).set({ id: "work" });
    });
    const bob = env.authenticatedContext("bob").firestore();
    await assertFails(bob.doc(`${OWNER_ROOT}/gyms/work`).get());
    await assertFails(bob.doc(`${OWNER_ROOT}/gyms/work`).set({ id: "hijack" }));
    await assertFails(bob.collection(`${OWNER_ROOT}/gyms`).get());
  });

  it("treat the owner's root document as theirs, but not another account's", async () => {
    // In rules v2, {document=**} also matches zero segments, so users/{uid}
    // itself belongs to that user (a natural home for a profile later).
    const owner = env.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(owner.doc(OWNER_ROOT).set({ id: OWNER_UID }));
    await assertFails(owner.doc("users/bob").set({ id: "bob" }));
  });

  it("refuse any account but the owner's everywhere, even under its own root", async () => {
    const bob = env.authenticatedContext("bob").firestore();
    await assertFails(bob.doc("users/bob/gyms/work").set({ id: "work" }));
    await assertFails(bob.doc("users/bob/gyms/work").get());
    await assertFails(bob.collection("users/bob/gyms").get());
    await assertFails(bob.doc("users/bob").set({ id: "bob" }));
  });

  it("refuse reads and writes outside users/", async () => {
    const owner = env.authenticatedContext(OWNER_UID).firestore();
    await assertFails(owner.doc("shared/anything").set({ id: "x" }));
    await assertFails(owner.doc("shared/anything").get());
  });
});
