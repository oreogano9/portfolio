import { setupHomePage } from "./home.js";
import { setupHomeEditor } from "./home-editor.js";
import { setupAlbumEditor } from "./album/editor.js";
import { setupLightbox } from "./lightbox.js";

const HOMEPAGE_SETTINGS_PATH = "/data/homepage.settings.json";
const SPLASH_SESSION_KEY = "homepage-splash-seen";

const normalizeHomepageSettingsPath = (value) => {
  if (typeof value !== "string") {
    return HOMEPAGE_SETTINGS_PATH;
  }

  const normalized = value.replace(/^\/+/, "").replace(/^\.\//, "").trim();
  return normalized ? `/${normalized}` : HOMEPAGE_SETTINGS_PATH;
};

const maybeRedirectToSplash = async (body) => {
  if (!body?.classList.contains("home-page")) {
    return false;
  }

  if (window.sessionStorage.getItem(SPLASH_SESSION_KEY) === "true") {
    return false;
  }

  try {
    const settingsPath = normalizeHomepageSettingsPath(body.dataset.homepageSettings);
    const response = await fetch(settingsPath, { cache: "no-store" });
    if (!response.ok) {
      return false;
    }

    const settings = await response.json();
    if (settings?.showSplashOnEnter !== true) {
      return false;
    }

    window.location.replace("/splash/");
    return true;
  } catch {
    return false;
  }
};

const bootstrap = async () => {
  const body = document.body;

  try {
    if (await maybeRedirectToSplash(body)) {
      return;
    }

    await setupHomePage();
    await setupHomeEditor();
    await setupAlbumEditor();
    setupLightbox();
  } finally {
    if (body?.classList.contains("home-page")) {
      body.classList.add("is-ready");
    }
    if (body?.classList.contains("album-page")) {
      body.classList.add("is-ready");
    }
  }
};

bootstrap();
