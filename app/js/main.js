import { createForge } from "./core/forge.js";
import { createMemoryStore } from "./core/memory-store.js";
import { SEED_LIBRARY } from "./core/seed-library.js";
import { MUSCLE_GROUPS, muscleGroup } from "./core/muscle-groups.js";
import { h } from "./dom.js";

/** @import { Exercise, ExerciseType, MuscleGroup } from "./core/types.js" */

const forge = createForge({
  store: createMemoryStore(),
  library: SEED_LIBRARY,
});

/** @type {Record<ExerciseType, string>} */
const TYPE_LABELS = {
  "weight-reps": "Weight × reps",
  "bodyweight-reps": "Bodyweight",
  assisted: "Assisted",
  timed: "Timed",
  cardio: "Cardio",
};

/**
 * A screen: the wordmark, a big title and a rule, then its content.
 * @param {string} title
 * @param {(Node | string)[]} content
 */
function screen(title, ...content) {
  return h(
    "section",
    {},
    h("p", { class: "wordmark" }, "Forge"),
    h("h1", { class: "title" }, title),
    h("hr", { class: "rule" }),
    ...content,
  );
}

/**
 * One library row. The region swatch always sits beside the region's name,
 * so colour is never the only signal.
 * @param {Exercise} e
 */
function exerciseRow(e) {
  const main = muscleGroup(e.primary[0]);
  const others = [...e.primary.slice(1), ...e.secondary].map(
    (id) => muscleGroup(id).label,
  );
  return h(
    "li",
    {},
    h(
      "div",
      { class: "row-main" },
      h("span", { class: "name" }, e.name),
      h(
        "span",
        { class: "tag", "data-region": main.region },
        `${main.region} · ${main.label}`,
      ),
    ),
    h(
      "p",
      { class: "meta" },
      [...others, TYPE_LABELS[e.type]].filter(Boolean).join(" · "),
    ),
  );
}

/** @type {Record<string, { tab: string, render: () => Node }>} */
const routes = {
  "/log": { tab: "log", render: logView },
  "/library": { tab: "log", render: libraryView },
  "/stats": {
    tab: "stats",
    render: () => placeholder("Stats", "Progress charts arrive in phase 2."),
  },
  "/coach": {
    tab: "coach",
    render: () => placeholder("Coach", "The coach arrives in phase 3."),
  },
  "/more": { tab: "more", render: moreView },
};

function logView() {
  return screen(
    "No workouts yet",
    h(
      "p",
      { class: "lede" },
      "Workout logging lands with the next tickets. Meanwhile, browse the exercise library.",
    ),
    h(
      "a",
      { class: "button", href: "#/library" },
      "Exercise library",
      h("span", { "aria-hidden": "true" }, "→"),
    ),
  );
}

function libraryView() {
  /** @type {{ query: string, muscleGroup: MuscleGroup | undefined }} */
  const state = { query: "", muscleGroup: undefined };
  const list = h("ul", { class: "list" });
  const count = h("p", { class: "label count", "aria-live": "polite" });

  async function refresh() {
    const results = await forge.searchExercises(state);
    count.textContent = `${results.length} exercise${results.length === 1 ? "" : "s"}`;
    list.replaceChildren(...results.map(exerciseRow));
  }

  /** @param {MuscleGroup | undefined} id @param {string} label */
  const chip = (id, label) =>
    h(
      "button",
      {
        class: "chip",
        type: "button",
        "aria-pressed": String(state.muscleGroup === id),
        onclick: (e) => {
          state.muscleGroup = id;
          for (const c of chips.children)
            c.setAttribute("aria-pressed", String(c === e.currentTarget));
          refresh();
        },
      },
      label,
    );
  const chips = h(
    "div",
    { class: "chips", role: "group", "aria-label": "Filter by muscle group" },
    chip(undefined, "All"),
    ...MUSCLE_GROUPS.map((m) => chip(m.id, m.label)),
  );

  const search = h("input", {
    class: "search",
    type: "search",
    placeholder: "Search exercises",
    "aria-label": "Search exercises",
    oninput: (e) => {
      state.query = /** @type {HTMLInputElement} */ (e.target).value;
      refresh();
    },
  });

  refresh();
  return screen("Exercises", search, chips, count, list);
}

function moreView() {
  return screen(
    "More",
    h(
      "nav",
      { class: "menu" },
      h(
        "a",
        { href: "#/library" },
        "Exercise library",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
    ),
  );
}

/** @param {string} title @param {string} text */
function placeholder(title, text) {
  return screen(title, h("p", { class: "lede" }, text));
}

function render() {
  const route = routes[location.hash.slice(1)] ?? routes["/log"];
  document.getElementById("view")?.replaceChildren(route.render());
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
