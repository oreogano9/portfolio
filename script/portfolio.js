import { resolveAssetUrl } from "./assets.js";

const state = {
  library: { photos: [] },
};

const getLibraryPath = () => String(document.body.dataset.photoLibrary || "/data/photo-library.json");

const shuffleItems = (items) => {
  const shuffled = [...items];
  const randomValues = new Uint32Array(shuffled.length);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomValues);
  }

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = randomValues[index] || Math.floor(Math.random() * 2 ** 32);
    const swapIndex = randomValue % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

const getPhotoName = (photo) => photo.internalName || photo.displayName || photo.originalName || "Portfolio photograph";

const getPortfolioPhotos = () =>
  shuffleItems(
    (Array.isArray(state.library.photos) ? state.library.photos : []).filter(
      (photo) => photo?.inPortfolio === true && photo?.trashed !== true && typeof photo?.src === "string" && photo.src
    )
  );

const createPortfolioItem = (photo, index) => {
  const link = document.createElement("a");
  link.className = "portfolio-image-link reveal-up";
  link.href = resolveAssetUrl(photo.src);
  link.target = "_blank";
  link.rel = "noreferrer";
  link.setAttribute("aria-label", getPhotoName(photo));

  const aspectRatio = Number(photo.aspectRatio);
  link.style.setProperty("--portfolio-row-span", Number.isFinite(aspectRatio) && aspectRatio < 0.85 ? "2" : "1");

  const image = document.createElement("img");
  image.alt = getPhotoName(photo);
  image.loading = index < 10 ? "eager" : "lazy";
  image.decoding = "async";
  image.src = resolveAssetUrl(photo.previewSrc || photo.src);
  image.classList.add("is-full-res");
  image.addEventListener(
    "load",
    () => {
      image.dataset.ready = "true";
    },
    { once: true }
  );

  link.append(image);
  return link;
};

const renderPortfolio = () => {
  const grid = document.querySelector(".portfolio-library-grid");
  const empty = document.querySelector(".portfolio-empty");
  if (!(grid instanceof HTMLElement) || !(empty instanceof HTMLElement)) {
    return;
  }

  const photos = getPortfolioPhotos();
  grid.replaceChildren(...photos.map(createPortfolioItem));
  empty.hidden = photos.length > 0;
};

const init = async () => {
  try {
    const response = await fetch(getLibraryPath());
    if (!response.ok) {
      throw new Error("Could not load photo library");
    }
    state.library = await response.json();
  } catch {
    state.library = { photos: [] };
  }

  renderPortfolio();
};

init();
