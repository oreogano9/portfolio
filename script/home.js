import { resolveAssetUrl } from "./assets.js?v=20260524-lightbox-priority-1";

let revealObserver = null;
let portfolioImageObserver = null;
let currentAlbumFilter = "all";
const MIN_PREVIEW_PAINT_MS = 220;

const getAlbumFilterControls = () => Array.from(document.querySelectorAll(".album-link"));
const getAlbumFilterCards = () => Array.from(document.querySelectorAll(".album-card[data-category]"));
const getAlbumFilterList = () => document.querySelector(".album-list");

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const waitForPaint = () =>
  new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });

const decodeImage = async (image) => {
  if (typeof image.decode !== "function") {
    return;
  }

  try {
    await image.decode();
  } catch {
    // decode() can reject for already-decoded cached images without affecting display.
  }
};

const toCssUrl = (value) => {
  const sanitized = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\n\r\f]/g, "");
  return `url("${sanitized}")`;
};

const swapToFullImage = async (image, fullSrc, loadedFullImage) => {
  await decodeImage(loadedFullImage);
  const markFullRes = () => {
    image.classList.remove("is-preview-res", "is-swapping-full");
    image.classList.add("is-full-res");
    image.dataset.upgraded = "true";
  };

  image.classList.add("is-swapping-full");
  image.addEventListener("load", markFullRes, { once: true });
  image.src = fullSrc;
  if (image.complete && image.currentSrc === fullSrc) {
    markFullRes();
  }
};

const runWhenLightboxAllows = (callback) => {
  if (!document.body.classList.contains("is-lightbox-open")) {
    callback();
    return;
  }

  document.addEventListener("album-lightbox:closed", callback, { once: true });
};
const normalizeHomepageSettingsPath = (value) => {
  if (typeof value !== "string") {
    return "data/homepage.settings.json";
  }

  const normalized = value.replace(/^\/+/, "").replace(/^\.\//, "").trim();
  return normalized || "data/homepage.settings.json";
};

const isPrivateAlbumCard = (card) => card?.private === true;

const getAlbumTags = (value) => {
  if (typeof value !== "string") {
    return [];
  }

  const source = value.includes(";") ? value.split(";") : value.split(/\s+/);
  const tags = [];
  const seen = new Set();
  source
    .map((tag) => tag.trim())
    .filter(Boolean)
    .forEach((tag) => {
      const key = tag.toLocaleLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      tags.push(tag);
    });

  return tags;
};

const formatAlbumTags = (value) => getAlbumTags(value).join("; ");

const getAlbumTagKey = (value) => String(value || "").trim().toLocaleLowerCase();

const formatAlbumFilterLabel = (value) =>
  String(value || "")
    .trim()
    .split(/([\s-]+)/)
    .map((part) => (/^[\s-]+$/.test(part) ? part : part.slice(0, 1).toLocaleUpperCase() + part.slice(1)))
    .join("");

const bindAlbumFilterControl = (control) => {
  if (!(control instanceof HTMLElement) || control.dataset.filterBound === "true") {
    return;
  }

  control.dataset.filterBound = "true";
  control.addEventListener("click", () => {
    applyAlbumFilter(control.dataset.filter || "all");
  });
};

const shuffleItems = (items) => {
  const shuffled = [...items];
  const randomValues = new Uint32Array(shuffled.length);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomValues);
  }

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = randomValues[index] || Math.floor(Math.random() * 4294967296);
    const swapIndex = randomValue % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
};

const getGallerySettingsPathFromHref = (href) => {
  if (typeof href !== "string") {
    return "";
  }

  const prefixedMatch = href.match(/^\/albums\/album-(.+)\.html$/);
  if (prefixedMatch) {
    return `data/galleries/${prefixedMatch[1]}.settings.json`;
  }

  const plainMatch = href.match(/^\/albums\/([^/]+)\.html$/);
  if (!plainMatch) {
    return "";
  }

  if (plainMatch[1] === "pride2025") {
    return "data/galleries/pride2025.settings.json";
  }

  return `data/galleries/${plainMatch[1]}.settings.json`;
};

const getDerivedPreviewSrc = (src) => {
  if (typeof src !== "string" || !src.includes("/images/") || src.includes("/thumbs/")) {
    return "";
  }

  const lastSlash = src.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }

  return `${src.slice(0, lastSlash)}/thumbs/${src.slice(lastSlash + 1)}`;
};

const getPortfolioImageObserver = () => {
  if (portfolioImageObserver) {
    return portfolioImageObserver;
  }

  portfolioImageObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        const image = entry.target;
        portfolioImageObserver.unobserve(image);
        if (
          !(image instanceof HTMLImageElement) ||
          image.dataset.upgraded === "true" ||
          image.dataset.upgradeStarted === "true" ||
          image.dataset.previewReady !== "true"
        ) {
          return;
        }

        const fullSrc = image.dataset.fullSrc;
        if (!fullSrc || image.currentSrc === fullSrc) {
          return;
        }

        runWhenLightboxAllows(() => {
          if (image.dataset.upgradeStarted === "true" || image.dataset.upgraded === "true") {
            return;
          }

          image.dataset.upgradeStarted = "true";
          const fullImage = new window.Image();
          let canceled = false;
          fullImage.decoding = "async";
          fullImage.addEventListener("load", () => {
            document.removeEventListener("album-lightbox:opened", cancelForLightbox);
            if (canceled) {
              return;
            }
            void swapToFullImage(image, fullSrc, fullImage);
          });
          fullImage.addEventListener("error", () => {
            document.removeEventListener("album-lightbox:opened", cancelForLightbox);
            if (canceled) {
              return;
            }
            image.dataset.upgradeStarted = "false";
          });
          const cancelForLightbox = (event) => {
            if (event.detail?.src === fullSrc) {
              return;
            }

            canceled = true;
            image.dataset.upgradeStarted = "false";
            fullImage.removeAttribute?.("src");
            fullImage.src = "";
            document.removeEventListener("album-lightbox:opened", cancelForLightbox);
            document.addEventListener("album-lightbox:closed", () => getPortfolioImageObserver().observe(image), { once: true });
          };
          document.addEventListener("album-lightbox:opened", cancelForLightbox);
          fullImage.src = fullSrc;
        });
      });
    },
    {
      rootMargin: "700px 0px",
      threshold: 0.01,
    }
  );

  return portfolioImageObserver;
};

const createPortfolioImageElement = (item, index) => {
  const link = document.createElement("a");
  link.className = "portfolio-image-link reveal-up";
  link.href = item.albumHref;
  link.style.setProperty("--portfolio-row-span", String(item.rowSpan));
  link.setAttribute("aria-label", `${item.albumTitle}: ${item.alt}`);

  const image = document.createElement("img");
  const previewSrc = item.previewSrc || item.fullSrc;
  image.alt = item.alt;
  image.loading = index < 8 ? "eager" : "lazy";
  image.decoding = "async";
  image.dataset.fullSrc = item.fullSrc;
  image.dataset.previewSrc = previewSrc;
  image.dataset.upgradeStarted = "false";
  image.dataset.upgraded = previewSrc === item.fullSrc ? "true" : "false";
  if (previewSrc === item.fullSrc) {
    image.src = previewSrc;
    image.classList.add("is-full-res");
  } else {
    image.dataset.progressive = "true";
    image.classList.add("is-preview-res");
    image.style.setProperty("--preview-image", toCssUrl(previewSrc));
    const previewStartedAt = performance.now();
    image.addEventListener(
      "load",
      async () => {
        await waitForPaint();
        const remainingPreviewTime = Math.max(0, MIN_PREVIEW_PAINT_MS - (performance.now() - previewStartedAt));
        if (remainingPreviewTime > 0) {
          await wait(remainingPreviewTime);
        }
        image.dataset.previewReady = "true";
        getPortfolioImageObserver().observe(image);
      },
      { once: true }
    );
    image.addEventListener(
      "error",
      () => {
        image.dataset.upgraded = "true";
        image.src = item.fullSrc;
        image.classList.remove("is-preview-res");
        image.classList.add("is-full-res");
      },
      { once: true }
    );
    image.src = previewSrc;
  }

  link.appendChild(image);
  return link;
};

const syncPortfolioImagesFromSettings = async (cards) => {
  const grid = document.querySelector(".portfolio-image-grid");
  if (!(grid instanceof HTMLElement)) {
    return;
  }

  const galleryEntries = cards
    .map((card) => ({
      card,
      settingsPath: getGallerySettingsPathFromHref(card?.href),
    }))
    .filter((entry) => entry.settingsPath);

  const galleries = await Promise.all(
    galleryEntries.map(async ({ card, settingsPath }) => {
      try {
        const response = await fetch(`/${settingsPath}`);
        if (!response.ok) {
          return [];
        }
        const settings = await response.json();
        return (Array.isArray(settings?.photos) ? settings.photos : [])
          .filter((photo) => photo?.deleted !== true && typeof photo?.src === "string" && photo.src)
          .map((photo) => {
            const fullSrc = resolveAssetUrl(photo.src);
            const previewSrc =
              typeof photo.previewSrc === "string" && photo.previewSrc
                ? resolveAssetUrl(photo.previewSrc)
                : resolveAssetUrl(getDerivedPreviewSrc(photo.src));
            const aspectRatio = Number(photo.aspectRatio);
            return {
              albumHref: card.href,
              albumTitle: card.title || settings.title || "Album",
              fullSrc,
              previewSrc,
              alt: photo.alt || card.title || settings.title || "Portfolio image",
              rowSpan: Number.isFinite(aspectRatio) && aspectRatio < 0.85 ? 2 : 1,
            };
          });
      } catch {
        return [];
      }
    })
  );

  const images = shuffleItems(galleries.flat());
  grid.replaceChildren(...images.map((item, index) => createPortfolioImageElement(item, index)));
  observeReveals(grid);
};

const createAlbumCardElement = (card, index) => {
  const applyInlineEmptyState = (element, value) => {
    const text = typeof value === "string" ? value.trim() : "";
    element.textContent = text;
    element.classList.toggle("is-inline-empty", !text);
  };

  const element = document.createElement("a");
  element.className = "album-card reveal-up";
  element.href = card.href || "";
  element.dataset.category = formatAlbumTags(card.category);
  element.dataset.homeCardId = card.href || "";

  const number = document.createElement("span");
  number.className = "album-number";
  number.textContent = String(index + 1).padStart(2, "0");

  const copy = document.createElement("div");
  copy.className = "album-card-copy";

  const title = document.createElement("h3");
  title.className = "album-card-title";
  title.textContent = card.title || "";

  const date = document.createElement("p");
  date.className = "album-card-date";
  date.setAttribute("aria-label", "Album date");
  applyInlineEmptyState(date, card.date);

  const tags = document.createElement("p");
  tags.className = "album-card-tags";
  tags.setAttribute("aria-label", "Album tags");
  applyInlineEmptyState(tags, formatAlbumTags(card.category));

  const description = document.createElement("p");
  description.className = "album-card-description";
  applyInlineEmptyState(description, card.description);

  copy.append(title, date, tags, description);
  element.append(number, copy);
  return element;
};

const syncSiteBrand = () => {
  const brandText = document.body?.dataset.siteBrand?.trim();
  if (!brandText) {
    return;
  }

  document.querySelectorAll("[data-site-brand-target]").forEach((element) => {
    element.textContent = brandText;
  });
};

const applyAlbumFilter = (filter) => {
  const controls = getAlbumFilterControls();
  const cards = getAlbumFilterCards();
  currentAlbumFilter = getAlbumTagKey(filter) || "all";

  controls.forEach((control) => {
    control.classList.toggle("is-active", control.dataset.filter === currentAlbumFilter);
  });

  cards.forEach((card) => {
    const categories = (card.dataset.category || "")
      .split(";")
      .map((value) => getAlbumTagKey(value))
      .filter(Boolean);
    const matches = currentAlbumFilter === "all" || categories.includes(currentAlbumFilter);
    card.hidden = !matches;
  });
};

export const refreshAlbumLinks = () => {
  const cards = getAlbumFilterCards();
  const filterList = getAlbumFilterList();
  if (!(filterList instanceof HTMLElement)) {
    return;
  }

  const availableFilters = new Map([["all", "All"]]);
  cards.forEach((card) => {
    (card.dataset.category || "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => {
        const key = getAlbumTagKey(value);
        if (key && !availableFilters.has(key)) {
          availableFilters.set(key, value);
        }
      });
  });

  const controlsByFilter = new Map(getAlbumFilterControls().map((control) => [control.dataset.filter || "all", control]));
  const controls = Array.from(availableFilters, ([filter, label]) => {
    const existingControl = controlsByFilter.get(filter);
    if (existingControl instanceof HTMLButtonElement) {
      existingControl.hidden = false;
      existingControl.textContent = filter === "all" ? "All" : formatAlbumFilterLabel(label);
      bindAlbumFilterControl(existingControl);
      return existingControl;
    }

    const control = document.createElement("button");
    control.className = "album-link";
    control.type = "button";
    control.dataset.filter = filter;
    control.textContent = filter === "all" ? "All" : formatAlbumFilterLabel(label);
    bindAlbumFilterControl(control);
    return control;
  });

  filterList.replaceChildren(...controls);

  currentAlbumFilter = getAlbumTagKey(currentAlbumFilter) || "all";
  if (!availableFilters.has(currentAlbumFilter)) {
    currentAlbumFilter = "all";
  }

  applyAlbumFilter(currentAlbumFilter);
};

const getRevealObserver = () => {
  if (revealObserver) {
    return revealObserver;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.08,
      rootMargin: "0px 0px -6% 0px",
    }
  );

  return revealObserver;
};

export const observeReveals = (root = document) => {
  const observer = getRevealObserver();
  root.querySelectorAll(".reveal-up").forEach((element) => {
    if (!element.classList.contains("is-visible")) {
      observer.observe(element);
    }
  });
};

export const setupReveals = () => {
  observeReveals(document);
};

export const setupAlbumLinks = () => {
  const filterList = getAlbumFilterList();

  if (!(filterList instanceof HTMLElement)) {
    return;
  }

  getAlbumFilterControls().forEach((control) => bindAlbumFilterControl(control));

  refreshAlbumLinks();
};

export const setupMobileMenu = () => {
  const toggle = document.querySelector(".mobile-menu-toggle");
  const drawer = document.querySelector(".mobile-menu-drawer");
  const close = document.querySelector(".mobile-menu-close");

  if (!toggle || !drawer || !close) {
    return;
  }

  const setOpen = (open) => {
    drawer.classList.toggle("is-open", open);
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("has-mobile-menu", open);
  };

  toggle.addEventListener("click", () => {
    setOpen(!drawer.classList.contains("is-open"));
  });

  close.addEventListener("click", () => {
    setOpen(false);
  });

  drawer.addEventListener("click", (event) => {
    if (event.target === drawer || event.target.closest(".mobile-menu-panel a")) {
      setOpen(false);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawer.classList.contains("is-open")) {
      setOpen(false);
    }
  });
};

export const setupParallax = () => {};

const syncHomepageCardsFromSettings = async () => {
  const body = document.body;
  const albumGrid = document.querySelector(".album-grid");
  if (!body?.classList.contains("home-page") || !(albumGrid instanceof HTMLElement)) {
    return;
  }

  const settingsPath = normalizeHomepageSettingsPath(body.dataset.homepageSettings);

  try {
    const response = await fetch(`/${settingsPath}`);
    if (!response.ok) {
      return;
    }

    const settings = await response.json();
    const allCards = Array.isArray(settings?.albumCards) ? settings.albumCards : [];
    if (!allCards.length) {
      return;
    }
    const cards = allCards.filter((card) => !isPrivateAlbumCard(card));
    await syncPortfolioImagesFromSettings(cards);

    const currentHrefs = Array.from(albumGrid.querySelectorAll(".album-card[data-home-card-id]")).map(
      (card) => card.dataset.homeCardId || card.getAttribute("href") || ""
    );
    const nextHrefs = cards.map((card) => card?.href || "");
    const shouldRebuild =
      currentHrefs.length !== nextHrefs.length || currentHrefs.some((href, index) => href !== nextHrefs[index]);

    if (shouldRebuild) {
      albumGrid.replaceChildren(...cards.map((card, index) => createAlbumCardElement(card, index)));
    }
  } catch {
    return;
  }
};

export const setupHomePage = async () => {
  syncSiteBrand();
  await syncHomepageCardsFromSettings();
  setupReveals();
  setupAlbumLinks();
  setupMobileMenu();
  setupParallax();
};
