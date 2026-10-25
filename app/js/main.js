// Startup and routing. Screens live in screens/, sign-in state in auth.js.
import { startAuth } from "./auth.js";
import { showSaveError } from "./save-error.js";
import { h } from "./dom.js";
import { signInView } from "./screens/sign-in.js";
import { notOwnerView } from "./screens/not-owner.js";
import { logView } from "./screens/log.js";
import { libraryView } from "./screens/library.js";
import { placeholderView } from "./screens/placeholder.js";
import { moreView } from "./screens/more.js";

/** @import { ScreenContext } from "./screens/screen.js" */

/** @type {Record<string, { tab: string, render: (context: ScreenContext) => Node }>} */
const routes = {
  "/log": { tab: "log", render: logView },
  "/library": { tab: "log", render: libraryView },
  "/stats": {
    tab: "stats",
    render: () =>
      placeholderView("Stats", "Progress charts arrive in phase 2."),
  },
  "/coach": {
    tab: "coach",
    render: () => placeholderView("Coach", "The coach arrives in phase 3."),
  },
  "/more": { tab: "more", render: moreView },
};

const auth = startAuth({ onChange: render, onSaveError: showSaveError });

function render() {
  const view = document.getElementById("view");
  const tabs = /** @type {HTMLElement} */ (document.querySelector(".tabs"));
  const { state } = auth;
  tabs.hidden = state.status !== "signed-in";
  if (state.status === "checking") {
    // Firebase is still checking for a saved sign-in: show only the wordmark.
    view?.replaceChildren(h("p", { class: "wordmark" }, "Forge"));
    return;
  }
  if (state.status === "signed-out") {
    view?.replaceChildren(signInView(auth));
    return;
  }
  if (state.status === "not-owner") {
    view?.replaceChildren(
      notOwnerView({ user: state.user, signOut: auth.signOut }),
    );
    return;
  }
  const route = routes[location.hash.slice(1)] ?? routes["/log"];
  view?.replaceChildren(
    route.render({
      user: state.user,
      forge: state.forge,
      signOut: auth.signOut,
    }),
  );
  for (const a of document.querySelectorAll(".tabs a")) {
    if (a.getAttribute("data-tab") === route.tab)
      a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", render);
render();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
