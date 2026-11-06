import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { deleteApp } from "firebase/app";
import * as sdk from "firebase/firestore";
import { createFirestoreStore } from "../../app/js/store/firestore-store.js";
import { describeStoreContract } from "./store-contract.js";
import { clearFirestore, signedInFirestore } from "../emulator.js";
import { OWNER_UID } from "../../app/js/firebase-config.js";

/** @type {Awaited<ReturnType<typeof signedInFirestore>>} */
let owner;

beforeAll(async () => {
  // The security rules admit only the owner's account.
  owner = await signedInFirestore(OWNER_UID);
});

afterAll(async () => {
  await deleteApp(owner.app);
});

/** @type {Awaited<ReturnType<typeof signedInFirestore>>[]} */
const fresh = [];

// Each test's writes reach the server before the next test clears it.
afterEach(async () => {
  for (const { app, db } of fresh.splice(0)) {
    await sdk.waitForPendingWrites(db);
    await deleteApp(app);
  }
});

/**
 * A fresh, empty Firestore store for each contract test: its own app
 * instance, since the store answers reads from a copy that starts from the
 * local cache (ADR-0007), and an earlier test's documents may be cached.
 */
async function freshStore() {
  await clearFirestore();
  const instance = await signedInFirestore(OWNER_UID);
  fresh.push(instance);
  return createFirestoreStore({ sdk, db: instance.db, uid: instance.uid });
}

describeStoreContract("Firestore", freshStore);

describe("Firestore store", () => {
  it("keeps documents on the server once writes have synced", async () => {
    const store = await freshStore();
    await store.put("gyms", { id: "work", name: "Work" });
    await store.synced();

    // A second app instance has an empty cache, so this read must come from the server.
    const reader = await signedInFirestore(OWNER_UID);
    const readerStore = createFirestoreStore({
      sdk,
      db: reader.db,
      uid: reader.uid,
    });
    expect(await readerStore.get("gyms", "work")).toEqual({
      id: "work",
      name: "Work",
    });
    await deleteApp(reader.app);
  });

  it("shows changes made on another device without starting again", async () => {
    const store = await freshStore();
    await store.put("gyms", { id: "work", name: "Work" });
    expect(await store.list("gyms")).toHaveLength(1);

    // The desktop, say: its own app instance and cache.
    const other = await signedInFirestore(OWNER_UID);
    const otherStore = createFirestoreStore({
      sdk,
      db: other.db,
      uid: other.uid,
    });
    await otherStore.put("gyms", { id: "work", name: "Work (upstairs)" });
    await otherStore.put("gyms", { id: "home", name: "Home" });
    await otherStore.synced();
    await expect
      .poll(() => store.list("gyms"), { timeout: 10000 })
      .toEqual([
        { id: "home", name: "Home" },
        { id: "work", name: "Work (upstairs)" },
      ]);

    await otherStore.remove("gyms", "home");
    await otherStore.synced();
    await expect
      .poll(() => store.get("gyms", "home"), { timeout: 10000 })
      .toBeUndefined();
    await deleteApp(other.app);
  });

  it("reports a write the server rejects to onError instead of failing silently", async () => {
    await clearFirestore();
    const errors = /** @type {unknown[]} */ ([]);
    // Writing under another account's root is refused by the security rules.
    const store = createFirestoreStore({
      sdk,
      db: owner.db,
      uid: "someone-else",
      onError: (error) => errors.push(error),
    });
    await store.put("gyms", { id: "work", name: "Work" });
    await expect
      .poll(() => errors.length, { timeout: 10000 })
      .toBeGreaterThan(0);
  });
});
