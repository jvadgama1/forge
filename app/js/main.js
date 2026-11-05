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
import { statsView } from "./screens/stats.js";
import {
  markBesideView,
  markView,
  markWorkoutView,
  pointWorkoutView,
} from "./screens/mark.js";

/** @import { ScreenContext } from "./screens/screen.js" */

/**
 * A screen shown beside a route's own on a wide screen (#23), on the left.
 * @typedef {object} Beside
 * @property {(context: ScreenContext) => Node} render
 * @property {boolean} list A list stays in view while the item beside it
 *   scrolls; another screen scrolls with the page.
 * @property {boolean} [keep] Kept rather than redrawn while it's for the same
 *   id, so numbers typed in it aren't lost (the logging screen beside its
 *   exercise's history).
 */

/**
 * @typedef {object} Route
 * @property {string} tab
 * @property {(context: ScreenContext) => Node} render
 * @property {Beside} [beside]
 * @property {string} [empty] A list route's right pane on a wide screen,
 *   until an item is open (#23).
 * @property {boolean} [fullWidth] Takes the whole width on a wide screen,
 *   rather than a phone's (the Stats board's columns, #90).
 */

// A route ending in /:id matches any last segment, passed to the screen as `id`.
/** @type {Record<string, Route>} */
const routes = {
  "/log": { tab: "log", render: logView },
  "/log/ex/:id": { tab: "log", render: logView },
  "/log/exercises": { tab: "log", render: workoutListView },
  "/log/add": { tab: "log", render: addExerciseView },
  "/log/done": { tab: "log", render: workoutDoneView },
  "/log/done/:id": { tab: "log", render: workoutDoneView },
  "/log/history/:id": {
    tab: "log",
    render: historyView,
    beside: { render: logView, list: false, keep: true },
  },
  "/exercises": { tab: "log", render: exercisesView },
  "/exercises/:id": { tab: "log", render: exerciseView },
  "/stats": { tab: "stats", render: statsView, fullWidth: true },
  // The workouts behind a mark, and one of them beside the list (#84).
  "/stats/:id": {
    tab: "stats",
    render: markView,
    empty: "Pick a workout to see what it gave.",
  },
  "/stats/workout/:id": {
    tab: "stats",
    render: markWorkoutView,
    beside: { render: markBesideView, list: true },
  },
  "/stats/point/:id": {
    tab: "stats",
    render: pointWorkoutView,
    beside: { render: statsView, list: false },
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
  "/routines/:id": {
    tab: "more",
    render: routineView,
    beside: { render: routinesView, list: true },
  },
  "/body-weight": { tab: "more", render: bodyWeightView },
  "/workouts": {
    tab: "more",
    render: workoutsView,
    empty: "Pick a workout to see or correct it.",
  },
  "/workouts/:id": {
    tab: "more",
    render: pastWorkoutView,
    beside: { render: workoutsView, list: true },
  },
};

// The desktop layout (#23): a side rail, and two panes where a route has
// them; and where Forge opens with no route (#90). Matches slab.css's
// breakpoint. Crossing it takes effect on the next screen, so a resize
// never throws away what's typed.
const wide = matchMedia("(min-width: 960px)");

/**
 * The route for a hash path, and its id for a /:id route.
 * @param {string} path
 */
function resolve(path) {
  // With no route, a wide screen opens on the board and a phone on logging
  // (DESIGN.md: one app, two layouts; #90).
  if (path === "" || path === "/")
    return { route: routes[wide.matches ? "/stats" : "/log"], id: undefined };
  if (routes[path]) return { route: routes[path], id: undefined };
  const cut = path.lastIndexOf("/");
  const route = routes[`${path.slice(0, cut)}/:id`];
  if (route) return { route, id: decodeURIComponent(path.slice(cut + 1)) };
  return { route: routes["/log"], id: undefined };
}

/**
 * The screen last drawn on its own or on the left, so one with `keep` can
 * stay (#23).
 * @type {{ render: Route["render"], id: string | undefined, node: Node } | undefined}
 */
let shown;

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
  const twoPane = wide.matches && !!(route.beside || route.empty);
  if (!twoPane) {
    view?.replaceChildren(main);
    shown = { render: route.render, id, node: main };
  } else {
    const [left, right] = panes(route, context, main);
    view?.replaceChildren(h("div", { class: "panes" }, left, right));
  }
  view?.classList.toggle("two-pane", twoPane);
  view?.classList.toggle("full-width", wide.matches && !!route.fullWidth);
  markOpen();
  for (const a of document.querySelectorAll(".tabs a")) {
    if (a.getAttribute("data-tab") === route.tab)
      a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
}

/**
 * A two-pane route's panes (#23): what's beside it, or the list itself, on
 * the left; the item, or the list's empty line, on the right.
 * @param {Route} route
 * @param {ScreenContext} context
 * @param {Node} main the route's own screen
 */
function panes(route, context, main) {
  const { beside } = route;
  if (!beside) {
    shown = { render: route.render, id: context.id, node: main };
    return [
      h("div", { class: "pane pane-list" }, main),
      h("div", { class: "pane" }, h("p", { class: "lede" }, route.empty ?? "")),
    ];
  }
  const kept =
    beside.keep && shown?.render === beside.render && shown.id === context.id;
  const left = kept && shown ? shown.node : beside.render(context);
  shown = { render: beside.render, id: context.id, node: left };
  return [
    h(
      "div",
      { class: beside.list ? "pane pane-list" : "pane pane-side" },
      left,
    ),
    h("div", { class: "pane" }, main),
  ];
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
