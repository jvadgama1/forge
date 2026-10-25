import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

/** A fresh, empty Firestore store for each contract test. */
async function freshStore() {
  await sdk.waitForPendingWrites(owner.db);
  await clearFirestore();
  return createFirestoreStore({ sdk, db: owner.db, uid: owner.uid });
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
