import { setupHomePage } from "./home.js?v=20260519-1";
import { setupHomeEditor } from "./home-editor.js?v=20260519-1";
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

  body?.classList.toggle("is-site-dark", (draftSettings || settings)?.darkMode === true);
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
