import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { deleteApp } from "firebase/app";
import * as sdk from "firebase/firestore";
import { createFirestoreStore } from "../../app/js/store/firestore-store.js";
import { describeStoreContract } from "./store-contract.js";
import { clearFirestore, signedInFirestore } from "../emulator.js";
import { OWNER_UID } from "../../app/js/firebase-config.js";
import { createForge } from "../../app/js/core/forge.js";
import { library } from "../core/library-fixture.js";

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
const instances = [];

// Each test's writes reach the server before the next test clears it.
afterEach(async () => {
  for (const { app, db } of instances.splice(0)) {
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
  instances.push(instance);
  return createFirestoreStore({ sdk, db: instance.db, uid: instance.uid });
}

describeStoreContract("Firestore", freshStore);

describe("Firestore store", () => {
  it("keeps documents on the server exactly as put, once writes have synced", async () => {
    const store = await freshStore();
    // The contract reads back from the live copy (ADR-0007); this is what
    // Firestore itself keeps.
    await store.put("gyms", {
      id: "work",
      name: "Work",
      exerciseIds: ["lat-pulldown", "leg-press"],
      settings: { lastUsed: null, notes: { seat: 4 } },
      note: undefined,
    });
    await store.synced();

    // A second app instance has an empty cache, so this read must come from the server.
    const reader = await signedInFirestore(OWNER_UID);
    const readerStore = createFirestoreStore({
      sdk,
      db: reader.db,
      uid: reader.uid,
    });
    const stored = await readerStore.get("gyms", "work");
    expect(stored).toEqual({
      id: "work",
      name: "Work",
      exerciseIds: ["lat-pulldown", "leg-press"],
      settings: { lastUsed: null, notes: { seat: 4 } },
    });
    expect(stored && "note" in stored).toBe(false);
    await deleteApp(reader.app);
  });

  it("works with no connection: reads what the device has, and keeps new writes", async () => {
    await clearFirestore();
    const device = await signedInFirestore(OWNER_UID);
    instances.push(device);
    const before = createFirestoreStore({ sdk, ...device });
    await before.put("gyms", { id: "work", name: "Work" });
    expect(await before.list("gyms")).toHaveLength(1);
    await before.synced();

    // The app opened again with no signal (spec #3, story 5).
    await sdk.disableNetwork(device.db);
    const offline = createFirestoreStore({ sdk, ...device });
    expect(await offline.list("gyms")).toEqual([{ id: "work", name: "Work" }]);
    expect(await offline.list("routines")).toEqual([]);
    await offline.put("gyms", { id: "home", name: "Home" });
    expect(await offline.get("gyms", "home")).toEqual({
      id: "home",
      name: "Home",
    });

    await sdk.enableNetwork(device.db);
    await offline.synced();
    const reader = await signedInFirestore(OWNER_UID);
    instances.push(reader);
    expect(
      await createFirestoreStore({ sdk, ...reader }).get("gyms", "home"),
    ).toEqual({ id: "home", name: "Home" });
  });

  it("keeps feedback sent with no connection, and syncs it once there is one (#124)", async () => {
    await clearFirestore();
    const phone = await signedInFirestore(OWNER_UID);
    instances.push(phone);
    await sdk.disableNetwork(phone.db);
    const forge = createForge({
      store: createFirestoreStore({ sdk, ...phone }),
      library,
      appVersion: { commit: "0a1b2c3", date: "2026-11-08T12:00:00.000Z" },
    });
    const sent = await forge.sendFeedback("Made-up feedback from the gym");
    expect((await forge.listFeedback()).map((item) => item.text)).toEqual([
      "Made-up feedback from the gym",
    ]);

    await sdk.enableNetwork(phone.db);
    await sdk.waitForPendingWrites(phone.db);
    const desktop = await signedInFirestore(OWNER_UID);
    instances.push(desktop);
    expect(
      await createFirestoreStore({ sdk, ...desktop }).get("feedback", sent.id),
    ).toEqual(sent);
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
