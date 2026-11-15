import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { createRestStore } from "../../tools/store/rest-store.js";
import { describeStoreContract } from "./store-contract.js";
import {
  EMULATOR_HOST,
  FIRESTORE_PORT,
  PROJECT_ID,
  clearFirestore,
  signedInFirestore,
} from "../emulator.js";
import { OWNER_UID } from "../../app/js/firebase-config.js";

// The emulator's REST API, in place of the live project's.
const BASE_URL = `http://${EMULATOR_HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/** @type {Awaited<ReturnType<typeof signedInFirestore>>} */
let owner;
/** @type {Awaited<ReturnType<typeof signedInFirestore>>} */
let stranger;

/** An Auth emulator ID token for a signed-in test account. */
const idToken = (
  /** @type {{ app: import("firebase/app").FirebaseApp }} */ { app },
) =>
  /** @type {import("firebase/auth").User} */ (
    getAuth(app).currentUser
  ).getIdToken();

beforeAll(async () => {
  // The security rules admit only the owner's account, so these requests
  // pass the same rules the app's do.
  owner = await signedInFirestore(OWNER_UID);
  stranger = await signedInFirestore("someone-else");
});

afterAll(async () => {
  await deleteApp(owner.app);
  await deleteApp(stranger.app);
});

/** @param {Partial<Parameters<typeof createRestStore>[0]>} [options] */
const ownersStore = (options) =>
  createRestStore({
    baseUrl: BASE_URL,
    uid: OWNER_UID,
    token: () => idToken(owner),
    ...options,
  });

/**
 * A document exactly as Firestore keeps it, in its REST form.
 * @param {string} path under users/{OWNER_UID}/
 */
async function rawDocument(path) {
  const answer = await fetch(`${BASE_URL}/users/${OWNER_UID}/${path}`, {
    headers: { Authorization: `Bearer ${await idToken(owner)}` },
  });
  expect(answer.status).toBe(200);
  return answer.json();
}

describeStoreContract("REST", async () => {
  await clearFirestore();
  return ownersStore();
});

describe("REST store", () => {
  it("keeps whole numbers as integers and fractions as doubles, as the app's SDK does", async () => {
    await clearFirestore();
    const store = ownersStore();
    const workout = {
      id: "w1",
      sets: [{ reps: 8, load: 102.5, rir: 0 }],
      totals: { tonnage: 2460, negative: -5 },
    };
    await store.put("workouts", workout);

    const { fields } = await rawDocument("workouts/w1");
    const set = fields.sets.arrayValue.values[0].mapValue.fields;
    expect(set).toEqual({
      reps: { integerValue: "8" },
      load: { doubleValue: 102.5 },
      rir: { integerValue: "0" },
    });
    expect(fields.totals.mapValue.fields).toEqual({
      tonnage: { integerValue: "2460" },
      negative: { integerValue: "-5" },
    });
    expect(await store.get("workouts", "w1")).toEqual(workout);
  });

  it("reads back empty arrays, empty maps and booleans as they were put", async () => {
    await clearFirestore();
    const store = ownersStore();
    const doc = { id: "work", exerciseIds: [], settings: {}, archived: false };
    await store.put("gyms", doc);
    expect(await store.get("gyms", "work")).toEqual(doc);
  });

  it("lists every document across more than one page of results", async () => {
    await clearFirestore();
    const store = ownersStore({ pageSize: 2 });
    const ids = ["a", "b", "c", "d", "e"];
    for (const id of ids) await store.put("gyms", { id, name: id });
    const gyms = await store.list("gyms");
    expect(gyms.map((g) => g.id).sort()).toEqual(ids);
  });

  it("reports a refused request with what Firestore answered, never the token", async () => {
    await clearFirestore();
    const token = await idToken(stranger);
    // Another account's token: the security rules refuse it.
    const store = ownersStore({ token: async () => token });
    const failure = await store.get("gyms", "work").catch((error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(
      /^Firestore answered 403 PERMISSION_DENIED to GET gyms\/work: /,
    );
    expect(failure.message).not.toContain(token);
    await expect(store.put("gyms", { id: "work" })).rejects.toThrow(/403/);
    await expect(store.list("gyms")).rejects.toThrow(/403/);
    await expect(store.remove("gyms", "work")).rejects.toThrow(/403/);
  });
});
