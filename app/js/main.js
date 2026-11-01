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
import { exerciseView } from "./screens/exercise.js";
import { historyView } from "./screens/history.js";
import { gymsView } from "./screens/gyms.js";
import { gymView } from "./screens/gym.js";
import { placeholderView } from "./screens/placeholder.js";
import { routinesView } from "./screens/routines.js";
import { routineView } from "./screens/routine.js";
import { bodyWeightView } from "./screens/body-weight.js";
import { workoutsView } from "./screens/workouts.js";
import { pastWorkoutView } from "./screens/past-workout.js";
import { moreView } from "./screens/more.js";

/** @import { ScreenContext } from "./screens/screen.js" */

// A route ending in /:id matches any last segment, passed to the screen as `id`.
// On a wide screen (#23), a route with a `beside` screen shows it on the left
// and its own on the right: a list beside the item open from it, or the
// logging screen beside an exercise's history. `empty` is the right pane
// before anything is open.
/** @type {Record<string, { tab: string, render: (context: ScreenContext) => Node, beside?: (context: ScreenContext) => Node, empty?: string }>} */
const routes = {
  "/log": { tab: "log", render: logView },
  "/log/ex/:id": { tab: "log", render: logView },
  "/log/exercises": { tab: "log", render: workoutListView },
  "/log/add": { tab: "log", render: addExerciseView },
  "/log/done": { tab: "log", render: workoutDoneView },
  "/log/done/:id": { tab: "log", render: workoutDoneView },
  "/log/history/:id": { tab: "log", render: historyView, beside: logView },
  "/exercises": { tab: "log", render: exercisesView },
  "/exercises/:id": { tab: "log", render: exerciseView },
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
  "/routines": {
    tab: "more",
    render: routinesView,
    empty: "Pick a routine to see or change it.",
  },
  "/routines/:id": { tab: "more", render: routineView, beside: routinesView },
  "/body-weight": { tab: "more", render: bodyWeightView },
  "/workouts": {
    tab: "more",
    render: workoutsView,
    empty: "Pick a workout to see or correct it.",
  },
  "/workouts/:id": {
    tab: "more",
    render: pastWorkoutView,
    beside: workoutsView,
  },
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

// The desktop layout (#23): a side rail, and two panes where a route has
// them. Matches slab.css's breakpoint.
const wide = matchMedia("(min-width: 960px)");

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
  /** @type {ScreenContext} */
  const context = {
    user: state.user,
    forge: state.forge,
    signOut: auth.signOut,
    id,
  };
  const main = route.render(context);
  view?.replaceChildren(
    wide.matches && (route.beside || route.empty)
      ? h(
          "div",
          { class: "panes" },
          h(
            "div",
            { class: "pane pane-list" },
            route.beside?.(context) ?? main,
          ),
          h(
            "div",
            { class: "pane" },
            route.beside ? main : h("p", { class: "lede" }, route.empty ?? ""),
          ),
        )
      : main,
  );
  view?.classList.toggle(
    "two-pane",
    wide.matches && !!(route.beside || route.empty),
  );
  markOpen();
  for (const a of document.querySelectorAll(".tabs a")) {
    if (a.getAttribute("data-tab") === route.tab)
      a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
}

/**
 * Marks the link to the item open beside a list (#23). The list may still
 * be loading, so it marks again as rows arrive.
 */
function markOpen() {
  const list = document.querySelector(".pane-list");
  if (!list) return;
  const mark = () => {
    for (const a of list.querySelectorAll("a[href]"))
      if (a.getAttribute("href") === location.hash)
        a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
  };
  mark();
  new MutationObserver(mark).observe(list, { childList: true, subtree: true });
}

wide.addEventListener("change", render);
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
