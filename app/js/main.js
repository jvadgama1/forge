import { createForge } from "./core/forge.js";
import { SEED_LIBRARY } from "./core/seed-library.js";
import { MUSCLE_GROUPS, muscleGroup } from "./core/muscle-groups.js";
import { createFirestoreStore } from "./store/firestore-store.js";
import { firebaseApp, firebaseAuth, firestore } from "./firebase-sdk.js";
import { FIREBASE_CONFIG, OWNER_UID } from "./firebase-config.js";
import { h } from "./dom.js";

/** @import { Exercise, ExerciseType, MuscleGroup } from "./core/types.js" */
/** @import { User } from "firebase/auth" */

const app = firebaseApp.initializeApp(FIREBASE_CONFIG);
const auth = firebaseAuth.getAuth(app);
// The persistent cache keeps data on the device and queues writes made with
// no signal, syncing them when the connection returns (spec #3, story 5).
const db = firestore.initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: firestore.persistentLocalCache({
    tabManager: firestore.persistentMultipleTabManager(),
  }),
});

/** undefined until Firebase has checked for a saved session; null when signed out. */
/** @type {User | null | undefined} */
let user;
/** @type {ReturnType<typeof createForge>} */
let forge;

/**
 * The security rules refuse every account but the owner's (#9).
 * @param {User | null | undefined} account
 * @returns {account is User}
 */
const isOwner = (account) => account?.uid === OWNER_UID;

/**
 * Shows that a change didn't reach the server, so a lost set never goes unnoticed.
 * @param {unknown} error
 */
function showSaveError(error) {
  console.error("Forge: a change failed to save", error);
  const alert = /** @type {HTMLElement} */ (document.getElementById("alert"));
  alert.textContent =
    "⚠ A change didn't save. Check you're signed in, then try again.";
  alert.hidden = false;
}

firebaseAuth.onAuthStateChanged(auth, (signedIn) => {
  user = signedIn;
  if (isOwner(signedIn)) {
    forge = createForge({
      store: createFirestoreStore({
        sdk: firestore,
        db,
        uid: signedIn.uid,
        onError: showSaveError,
      }),
      library: SEED_LIBRARY,
    });
  }
  render();
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

/**
 * The signed-in account's uid with a Copy button: what the owner allowlist
 * holds, so it stays visible even to an account that isn't on it (#9).
 * @param {User} account
 */
function accountId(account) {
  const copied = h("span", { class: "label", "aria-live": "polite" });
  return [
    h("p", { class: "label" }, "Account ID"),
    h(
      "p",
      { class: "account-id" },
      h("code", {}, account.uid),
      h(
        "button",
        {
          class: "chip",
          type: "button",
          onclick: async () => {
            await navigator.clipboard.writeText(account.uid);
            copied.textContent = "Copied";
          },
        },
        "Copy",
      ),
      copied,
    ),
  ];
}

function moreView() {
  const account = /** @type {User} */ (user);
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
    h("h2", { class: "label section" }, "Account"),
    h("p", { class: "account" }, account.email ?? "Signed in"),
    ...accountId(account),
    h(
      "button",
      {
        class: "button secondary",
        type: "button",
        onclick: () => firebaseAuth.signOut(auth),
      },
      "Sign out",
    ),
  );
}

function signInView() {
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
            await firebaseAuth.signInWithPopup(
              auth,
              new firebaseAuth.GoogleAuthProvider(),
            );
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

/** Shown to a Google account that isn't the owner's (#9). */
function notOwnerView() {
  const account = /** @type {User} */ (user);
  return screen(
    "Not your Forge",
    h(
      "p",
      { class: "lede" },
      `This Forge belongs to someone else, so ${account.email ?? "this account"} can't see or save anything here. Sign out to use a different Google account.`,
    ),
    ...accountId(account),
    h(
      "button",
      {
        class: "button",
        type: "button",
        onclick: () => firebaseAuth.signOut(auth),
      },
      "Sign out",
      h("span", { "aria-hidden": "true" }, "→"),
    ),
  );
}

/** @param {string} title @param {string} text */
function placeholder(title, text) {
  return screen(title, h("p", { class: "lede" }, text));
}

function render() {
  const view = document.getElementById("view");
  const tabs = /** @type {HTMLElement} */ (document.querySelector(".tabs"));
  tabs.hidden = !isOwner(user);
  if (user === undefined) {
    // Firebase is still checking for a saved session: show only the wordmark.
    view?.replaceChildren(h("p", { class: "wordmark" }, "Forge"));
    return;
  }
  if (user === null) {
    view?.replaceChildren(signInView());
    return;
  }
  if (!isOwner(user)) {
    view?.replaceChildren(notOwnerView());
    return;
  }
  const route = routes[location.hash.slice(1)] ?? routes["/log"];
  view?.replaceChildren(route.render());
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
