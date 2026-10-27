// Startup and routing. Screens live in screens/, sign-in state in auth.js.
import { startAuth } from "./auth.js";
import { showSaveError } from "./save-error.js";
import { h } from "./dom.js";
import { signInView } from "./screens/sign-in.js";
import { notOwnerView } from "./screens/not-owner.js";
import { logView } from "./screens/log.js";
import { workoutListView } from "./screens/workout-list.js";
import { workoutDoneView } from "./screens/workout-done.js";
import { addExerciseView } from "./screens/add-exercise.js";
import { exercisesView } from "./screens/exercises.js";
import { historyView } from "./screens/history.js";
import { gymsView } from "./screens/gyms.js";
import { gymView } from "./screens/gym.js";
import { placeholderView } from "./screens/placeholder.js";
import { routinesView } from "./screens/routines.js";
import { routineView } from "./screens/routine.js";
import { moreView } from "./screens/more.js";

/** @import { ScreenContext } from "./screens/screen.js" */

// A route ending in /:id matches any last segment, passed to the screen as `id`.
/** @type {Record<string, { tab: string, render: (context: ScreenContext) => Node }>} */
const routes = {
  "/log": { tab: "log", render: logView },
  "/log/ex/:id": { tab: "log", render: logView },
  "/log/exercises": { tab: "log", render: workoutListView },
  "/log/add": { tab: "log", render: addExerciseView },
  "/log/done": { tab: "log", render: workoutDoneView },
  "/log/done/:id": { tab: "log", render: workoutDoneView },
  "/log/history/:id": { tab: "log", render: historyView },
  "/exercises": { tab: "log", render: exercisesView },
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
  "/gyms": { tab: "more", render: gymsView },
  "/gyms/:id": { tab: "more", render: gymView },
  "/routines": { tab: "more", render: routinesView },
  "/routines/:id": { tab: "more", render: routineView },
};

/**
 * The route for a hash path, and its id for a /:id route.
 * @param {string} path
 */
function resolve(path) {
  if (routes[path]) return { route: routes[path], id: undefined };
  const cut = path.lastIndexOf("/");
  const route = routes[`${path.slice(0, cut)}/:id`];
  if (route) return { route, id: decodeURIComponent(path.slice(cut + 1)) };
  return { route: routes["/log"], id: undefined };
}

const auth = startAuth({
  onChange: () => {
    render();
    finishAbandoned();
  },
  onSaveError: showSaveError,
});

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
  const { route, id } = resolve(location.hash.slice(1));
  view?.replaceChildren(
    route.render({
      user: state.user,
      forge: state.forge,
      signOut: auth.signOut,
      id,
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
/**
 * Finishes a workout abandoned while the app was closed or away (#45), on
 * whatever screen it opens to. Only then re-render: otherwise numbers typed
 * but not logged would be lost.
 */
async function finishAbandoned() {
  const { state } = auth;
  if (state.status !== "signed-in") return;
  if (await state.forge.finishAbandonedWorkout()) render();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") finishAbandoned();
});
render();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
