import { h } from "../dom.js";
import { screen } from "./screen.js";

/** @param {{ signIn: () => Promise<unknown> }} auth */
export function signInView({ signIn }) {
  const status = h("p", { class: "lede", role: "status" });
  return screen(
    "Sign in",
    h(
      "p",
      { class: "lede" },
      "Your workouts sync between your phone and computer under your Google account.",
    ),
    h(
      "button",
      {
        class: "button",
        type: "button",
        onclick: async () => {
          status.textContent = "";
          try {
            await signIn();
          } catch (error) {
            const code = /** @type {{ code?: string }} */ (error).code;
            if (code === "auth/popup-closed-by-user") return;
            status.textContent = `Sign-in didn't finish (${code ?? "unknown error"}). Try again.`;
          }
        },
      },
      "Continue with Google",
      h("span", { "aria-hidden": "true" }, "→"),
    ),
    status,
  );
}
