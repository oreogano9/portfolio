import { setupHomePage } from "./home.js?v=20260519-2";
import { setupHomeEditor } from "./home-editor.js?v=20260520-7";
import { setupAlbumEditor } from "./album/editor.js";
import { setupLightbox } from "./lightbox.js";

const applyGlobalSiteSettings = async (body) => {
  let settings = null;
  let draftSettings = null;

  try {
    const response = await fetch("/data/homepage.settings.json", { cache: "no-store" });
    if (response.ok) {
      settings = await response.json();
    }
  } catch {
    settings = null;
  }

  try {
    draftSettings = JSON.parse(window.localStorage.getItem("homepage-editor:/") || "null");
  } catch {
    draftSettings = null;
  }

  const useDarkMode = (draftSettings || settings)?.darkMode === true;
  const backgroundNoiseEnabled = (draftSettings || settings)?.backgroundNoiseEnabled === true;
  const backgroundNoiseOpacity = Math.max(0, Math.min(0.35, Number((draftSettings || settings)?.backgroundNoiseOpacity) || 0));
  const backgroundNoiseScale = Math.max(48, Math.min(360, Number((draftSettings || settings)?.backgroundNoiseScale) || 140));
  const backgroundNoiseContrast = Math.max(0.25, Math.min(3, Number((draftSettings || settings)?.backgroundNoiseContrast) || 1));
  document.documentElement.classList.toggle("is-site-dark-root", useDarkMode);
  body?.classList.toggle("is-site-dark", useDarkMode);
  body?.style.setProperty("--background-noise-opacity", backgroundNoiseOpacity.toFixed(3));
  body?.style.setProperty("--background-noise-size", `${Math.round(backgroundNoiseScale)}px`);
  body?.style.setProperty("--background-noise-contrast", backgroundNoiseContrast.toFixed(2));
  body?.classList.toggle("has-background-noise", backgroundNoiseEnabled && backgroundNoiseOpacity > 0);
};

const bootstrap = async () => {
  const body = document.body;

  try {
    await applyGlobalSiteSettings(body);
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
