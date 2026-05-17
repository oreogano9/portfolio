const HOMEPAGE_SETTINGS_PATH = "/data/homepage.settings.json";
const SPLASH_SESSION_KEY = "homepage-splash-seen";

const normalizeHomepageSettingsPath = (value) => {
  if (typeof value !== "string") {
    return HOMEPAGE_SETTINGS_PATH;
  }

  const normalized = value.replace(/^\/+/, "").replace(/^\.\//, "").trim();
  return normalized ? `/${normalized}` : HOMEPAGE_SETTINGS_PATH;
};

const shouldSkipSplash = async (body) => {
  const target = body.dataset.splashTarget || "/index/";
  const settingsPath = normalizeHomepageSettingsPath(body.dataset.homepageSettings);

  if (window.sessionStorage.getItem(SPLASH_SESSION_KEY) === "true") {
    window.location.replace(target);
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

    window.location.replace(target);
    return true;
  } catch {
    return false;
  }
};

const setupSplash = () => {
  const body = document.body;
  if (!body.classList.contains("splash-page")) {
    return;
  }

  const target = body.dataset.splashTarget || "/index/";
  const enterLink = document.querySelector("[data-splash-enter]");

  let hasEntered = false;
  let touchStartY = 0;

  const enter = () => {
    if (hasEntered) {
      return;
    }

    hasEntered = true;
    window.sessionStorage.setItem(SPLASH_SESSION_KEY, "true");
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

  body.classList.add("is-ready");
};

const bootstrapSplash = async () => {
  const body = document.body;
  if (!body.classList.contains("splash-page")) {
    return;
  }

  if (await shouldSkipSplash(body)) {
    return;
  }

  setupSplash();
};

bootstrapSplash();
