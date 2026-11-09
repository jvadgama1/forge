// @ts-nocheck -- run in every shot's page before the app (#129), in place of
// the browser's service workers, which `npm run shots` blocks.
//
// The page's ?update= says what the site has: nothing newer (the default),
// a new version the check on opening finds ("ready"), or one only a later
// check finds ("later"), as Check for updates under More does.
(() => {
  const update = new URLSearchParams(location.search).get("update");
  let checks = 0;

  const worker = (state) =>
    Object.assign(new EventTarget(), { state, postMessage() {} });
  const active = worker("activated");
  const registration = Object.assign(new EventTarget(), {
    installing: null,
    waiting: null,
    active,
    async update() {
      checks++;
      if (!(update === "ready" || (update === "later" && checks > 1))) return;
      if (registration.waiting || registration.installing) return;
      const next = worker("installing");
      registration.installing = next;
      registration.dispatchEvent(new Event("updatefound"));
      setTimeout(() => {
        registration.installing = null;
        registration.waiting = next;
        next.state = "installed";
        next.dispatchEvent(new Event("statechange"));
      });
    },
  });
  const container = Object.assign(new EventTarget(), {
    controller: active,
    getRegistration: async () => registration,
    register: async () => registration,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    value: container,
    configurable: true,
  });
})();
