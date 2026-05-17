const HOMEPAGE_SETTINGS_PATH = "/data/homepage.settings.json";

const normalizeHomepageSettingsPath = (value) => {
  if (typeof value !== "string") {
    return HOMEPAGE_SETTINGS_PATH;
  }

  const normalized = value.replace(/^\/+/, "").replace(/^\.\//, "").trim();
  return normalized ? `/${normalized}` : HOMEPAGE_SETTINGS_PATH;
};

const shouldSkipSplash = async (body) => {
  const settingsPath = normalizeHomepageSettingsPath(body.dataset.homepageSettings);
  const params = new URLSearchParams(window.location.search);

  if (params.has("home")) {
    return true;
  }

  try {
    const response = await fetch(settingsPath, { cache: "no-store" });
    if (!response.ok) {
      return false;
    }

    const settings = await response.json();
    if (settings?.showSplashOnEnter === true) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

const appendPrefetchHint = (href, as) => {
  if (!href) {
    return;
  }

  const url = new URL(href, window.location.href).href;
  const exists = Array.from(document.head.querySelectorAll('link[rel="prefetch"]')).some((link) => link.href === url);
  if (exists) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = href;
  if (as) {
    link.as = as;
  }
  document.head.appendChild(link);
};

const warmHomepageAssets = async (body) => {
  const settingsPath = normalizeHomepageSettingsPath(body.dataset.homepageSettings);

  appendPrefetchHint("/styles.css", "style");
  appendPrefetchHint("/script/main.js", "script");
  appendPrefetchHint("/script/home.js", "script");

  try {
    await Promise.allSettled([
      fetch("/styles.css", { cache: "force-cache" }),
      fetch(settingsPath, { cache: "force-cache" }),
    ]);
  } catch {
    return;
  }
};

const setupSplash = () => {
  const body = document.body;
  if (!body.classList.contains("splash-page")) {
    return;
  }

  const isInlineHome = body.classList.contains("home-page");
  const target = body.dataset.splashTarget || "/?home=1";
  const enterLink = document.querySelector("[data-splash-enter]");
  const splashShell = document.querySelector("[data-splash-shell]");

  let hasEntered = false;
  let touchStartY = 0;

  const revealInlineHome = () => {
    body.classList.remove("has-active-splash");
    body.classList.add("has-entered-splash");
    splashShell?.setAttribute("aria-hidden", "true");
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname || "/");
    }
  };

  const enter = () => {
    if (hasEntered) {
      return;
    }

    hasEntered = true;
    if (isInlineHome) {
      revealInlineHome();
      return;
    }

    body.classList.add("is-leaving");
    window.setTimeout(() => {
      window.location.href = target;
    }, 220);
  };

  const maybeEnterFromWheel = (event) => {
    if (Math.abs(event.deltaY) < 8) {
      return;
    }

    event.preventDefault();
    enter();
  };

  const handleTouchStart = (event) => {
    touchStartY = event.touches[0]?.clientY || 0;
  };

  const handleTouchMove = (event) => {
    const currentY = event.touches[0]?.clientY || 0;
    if (touchStartY - currentY > 18) {
      enter();
    }
  };

  enterLink?.addEventListener("click", (event) => {
    event.preventDefault();
    enter();
  });

  window.addEventListener("wheel", maybeEnterFromWheel, { passive: false });
  window.addEventListener("touchstart", handleTouchStart, { passive: true });
  window.addEventListener("touchmove", handleTouchMove, { passive: true });

  body.classList.add("has-active-splash");
  body.classList.add("is-ready");

  return revealInlineHome;
};

const bootstrapSplash = async () => {
  const body = document.body;
  if (!body.classList.contains("splash-page")) {
    return;
  }

  const revealInlineHome = setupSplash();

  if (await shouldSkipSplash(body)) {
    revealInlineHome?.();
    body.classList.add("is-ready");
    return;
  }

  warmHomepageAssets(body);
};

bootstrapSplash();
