import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { describeStoreContract } from "./store-contract.js";

describeStoreContract("in-memory", async () => createMemoryStore());
