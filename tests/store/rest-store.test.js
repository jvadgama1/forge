import { describe, expect, it } from "vitest";
import { createRestStore } from "../../tools/store/rest-store.js";

// The emulator doesn't check a token's expiry, so a stand-in answers as the
// live REST API does to an expired access token.
const EXPIRED = {
  error: {
    code: 401,
    message:
      "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.",
    status: "UNAUTHENTICATED",
  },
};

describe("REST store", () => {
  it("reports an expired token with what Firestore answered, never the token", async () => {
    const token = "ya29.made-up-expired-token";
    const store = createRestStore({
      baseUrl:
        "https://firestore.example/v1/projects/p/databases/(default)/documents",
      uid: "owner",
      token: async () => token,
      fetch: async () => Response.json(EXPIRED, { status: 401 }),
    });
    const failure = await store.list("workouts").catch((error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe(
      "Firestore answered 401 UNAUTHENTICATED to GET workouts: Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.",
    );
    expect(failure.message).not.toContain(token);
  });
});
