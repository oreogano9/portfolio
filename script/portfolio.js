const HOME_SETTINGS_PATH = "/data/homepage.settings.json";

const hashString = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const randomFromSeed = (seed, salt = 0) => {
  const next = Math.imul(seed ^ (salt * 374761393), 668265263) >>> 0;
  return (next % 10000) / 10000;
};

const hrefToSettingsPath = (href) => {
  const value = String(href || "");
  const prefixedMatch = value.match(/^\/albums\/album-(.+)\.html$/);
  if (prefixedMatch) {
    return `/data/galleries/${prefixedMatch[1]}.settings.json`;
  }

  const plainMatch = value.match(/^\/albums\/([^/]+)\.html$/);
  if (!plainMatch) {
    return "";
  }

  const slug = plainMatch[1];
  if (slug === "pride2025") {
    return "/data/galleries/test.settings.json";
  }

  return `/data/galleries/${slug}.settings.json`;
};

const loadJson = async (path) => {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return response.json();
};

const flattenPhotos = (galleries) =>
  galleries.flatMap((gallery, galleryIndex) =>
    (Array.isArray(gallery?.photos) ? gallery.photos : [])
      .filter((photo) => photo && photo.deleted !== true && typeof photo.src === "string" && photo.src)
      .map((photo, photoIndex) => ({
        src: photo.src,
        previewSrc: typeof photo.previewSrc === "string" && photo.previewSrc ? photo.previewSrc : photo.src,
        alt: photo.alt || gallery.title || "Portfolio image",
        aspectRatio: Number(photo.aspectRatio) > 0 ? Number(photo.aspectRatio) : 1.5,
        albumTitle: gallery.title || "",
        seed: hashString(`${gallery.id || galleryIndex}:${photo.src}:${photoIndex}`),
      }))
  );

const createCascadeImage = (photo) => {
  const image = document.createElement("img");
  image.className = "portfolio-cascade-image";
  image.alt = photo.alt;
  image.loading = "lazy";
  image.decoding = "async";
  image.src = photo.previewSrc;
  image.dataset.fullSrc = photo.src;

  if (photo.previewSrc !== photo.src) {
    image.addEventListener(
      "load",
      () => {
        const full = new window.Image();
        full.decoding = "async";
        full.addEventListener("load", () => {
          image.src = photo.src;
          image.classList.add("is-full-res");
        });
        full.src = photo.src;
      },
      { once: true }
    );
    image.addEventListener("error", () => {
      image.src = photo.src;
      image.classList.add("is-full-res");
    });
  } else {
    image.classList.add("is-full-res");
  }

  return image;
};

const layoutCascade = (container, photos) => {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1440;
  const gutter = viewportWidth < 700 ? 16 : 24;
  const laneCount = viewportWidth < 640 ? 2 : viewportWidth < 1080 ? 3 : viewportWidth < 1440 ? 4 : 5;
  const laneWidth = Math.max(120, (viewportWidth - gutter * 2) / laneCount);
  const laneBottoms = Array.from({ length: laneCount }, () => 0);
  const fragment = document.createDocumentFragment();

  photos.forEach((photo, index) => {
    const card = document.createElement("article");
    card.className = "portfolio-cascade-card";
    card.setAttribute("aria-label", photo.albumTitle || "Portfolio image");

    const widthFactor = 0.72 + randomFromSeed(photo.seed, 1) * 0.34;
    const nominalWidth = laneWidth * widthFactor;
    const clampedWidth = Math.min(
      Math.max(viewportWidth < 700 ? 132 : 170, nominalWidth),
      viewportWidth < 700 ? laneWidth * 1.06 : laneWidth * 1.18
    );
    const laneIndex = laneBottoms.indexOf(Math.min(...laneBottoms));
    const xBase = gutter + laneIndex * laneWidth;
    const xJitter = (randomFromSeed(photo.seed, 2) - 0.5) * laneWidth * 0.36;
    const left = Math.max(gutter, Math.min(viewportWidth - gutter - clampedWidth, xBase + xJitter));
    const cardHeight = clampedWidth / Math.max(0.55, photo.aspectRatio);
    const overlap = 14 + randomFromSeed(photo.seed, 3) * 52;
    const top = Math.max(0, laneBottoms[laneIndex] - overlap + 36);
    const rotation = (randomFromSeed(photo.seed, 4) - 0.5) * (viewportWidth < 700 ? 7 : 10);
    const lift = (randomFromSeed(photo.seed, 5) - 0.5) * 24;
    const zIndex = 10 + ((index % 7) + Math.round(randomFromSeed(photo.seed, 6) * 8));

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.width = `${clampedWidth}px`;
    card.style.transform = `translateY(${lift}px) rotate(${rotation.toFixed(2)}deg)`;
    card.style.zIndex = String(zIndex);

    card.appendChild(createCascadeImage(photo));
    fragment.appendChild(card);

    laneBottoms[laneIndex] = top + cardHeight + 60 + randomFromSeed(photo.seed, 7) * 50;
  });

  container.replaceChildren(fragment);
  container.style.height = `${Math.max(...laneBottoms, 0) + 80}px`;
};

const setupPortfolio = async () => {
  const body = document.body;
  const cascade = document.getElementById("portfolio-cascade");

  if (!body.classList.contains("portfolio-page") || !(cascade instanceof HTMLElement)) {
    return;
  }

  try {
    const homepage = await loadJson(HOME_SETTINGS_PATH);
    const settingPaths = (Array.isArray(homepage?.albumCards) ? homepage.albumCards : [])
      .map((card) => hrefToSettingsPath(card?.href))
      .filter(Boolean);
    const galleries = await Promise.all(settingPaths.map((settingsPath) => loadJson(settingsPath).catch(() => null)));
    const photos = flattenPhotos(galleries.filter(Boolean));
    layoutCascade(cascade, photos);

    let resizeFrame = null;
    window.addEventListener("resize", () => {
      if (resizeFrame) {
        window.cancelAnimationFrame(resizeFrame);
      }
      resizeFrame = window.requestAnimationFrame(() => {
        layoutCascade(cascade, photos);
      });
    });
  } finally {
    body.classList.add("is-ready");
  }
};

setupPortfolio();
