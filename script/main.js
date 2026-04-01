import { setupHomePage } from "./home.js";
import { setupHomeEditor } from "./home-editor.js";
import { setupAlbumEditor } from "./album/editor.js";
import { setupLightbox } from "./lightbox.js";

const bootstrap = async () => {
  await setupHomeEditor();
  setupHomePage();
  await setupAlbumEditor();
  setupLightbox();
};

bootstrap();
