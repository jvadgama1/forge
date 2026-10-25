import { beforeEach, describe, expect, it } from "vitest";

/** @import { Store } from "../../app/js/core/types.js" */

/**
 * The store contract (spec #3, seam 2): every Store implementation must pass
 * this same suite, so the in-memory store used by core tests stays honest.
 * @param {string} name
 * @param {() => Promise<Store>} makeStore A fresh, empty store per test.
 */
export function describeStoreContract(name, makeStore) {
  describe(`${name} store contract`, () => {
    /** @type {Store} */
    let store;
    beforeEach(async () => {
      store = await makeStore();
    });

    it("returns undefined for a document that doesn't exist", async () => {
      expect(await store.get("gyms", "nope")).toBeUndefined();
    });

    it("returns a document exactly as it was put, including nested arrays, objects and nulls", async () => {
      const gym = {
        id: "work",
        name: "Work",
        exerciseIds: ["lat-pulldown", "leg-press"],
        settings: { lastUsed: null, notes: { seat: 4 } },
      };
      await store.put("gyms", gym);
      expect(await store.get("gyms", "work")).toEqual(gym);
    });

    it("drops fields whose value is undefined, since stored documents are plain data", async () => {
      await store.put("gyms", { id: "work", name: "Work", note: undefined });
      const stored = await store.get("gyms", "work");
      expect(stored && Object.keys(stored).sort()).toEqual(["id", "name"]);
    });

    it("replaces a document when one with the same id is put again", async () => {
      await store.put("gyms", {
        id: "home",
        name: "Home",
        exerciseIds: ["push-up"],
      });
      await store.put("gyms", { id: "home", name: "Home gym" });
      expect(await store.get("gyms", "home")).toEqual({
        id: "home",
        name: "Home gym",
      });
    });

    it("lists every document in a collection and nothing from other collections", async () => {
      await store.put("gyms", { id: "work", name: "Work" });
      await store.put("gyms", { id: "home", name: "Home" });
      await store.put("bodyWeight", {
        id: "2026-10-24",
        load: 180,
        unit: "lb",
      });
      const gyms = await store.list("gyms");
      expect(gyms.map((g) => g.id).sort()).toEqual(["home", "work"]);
    });

    it("lists an empty collection as an empty array", async () => {
      expect(await store.list("routines")).toEqual([]);
    });

    it("removes a document, and removing a missing one is harmless", async () => {
      await store.put("gyms", { id: "work", name: "Work" });
      await store.remove("gyms", "work");
      await store.remove("gyms", "never-existed");
      expect(await store.get("gyms", "work")).toBeUndefined();
      expect(await store.list("gyms")).toEqual([]);
    });

    it("keeps returned documents independent of later changes made by the caller", async () => {
      const gym = { id: "work", name: "Work", exerciseIds: ["leg-press"] };
      await store.put("gyms", gym);
      gym.exerciseIds.push("lat-pulldown");
      const stored = await store.get("gyms", "work");
      expect(stored?.exerciseIds).toEqual(["leg-press"]);
    });
  });
}
