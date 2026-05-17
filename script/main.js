import { setupHomePage } from "./home.js";
import { setupHomeEditor } from "./home-editor.js";
import { setupAlbumEditor } from "./album/editor.js";
import { setupLightbox } from "./lightbox.js";

const bootstrap = async () => {
  const body = document.body;

  try {
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
