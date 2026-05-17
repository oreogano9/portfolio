let revealObserver = null;
let portfolioImageObserver = null;
let currentAlbumFilter = "all";

const getAlbumFilterControls = () => Array.from(document.querySelectorAll(".album-link"));
const getAlbumFilterCards = () => Array.from(document.querySelectorAll(".album-card[data-category]"));
const normalizeHomepageSettingsPath = (value) => {
  if (typeof value !== "string") {
    return "data/homepage.settings.json";
  }

  const normalized = value.replace(/^\/+/, "").replace(/^\.\//, "").trim();
  return normalized || "data/homepage.settings.json";
};

const isPrivateAlbumCard = (card) => card?.private === true;

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
    return "data/galleries/test.settings.json";
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
        if (!(image instanceof HTMLImageElement) || image.dataset.upgraded === "true") {
          return;
        }

        const fullSrc = image.dataset.fullSrc;
        if (!fullSrc || image.currentSrc === fullSrc) {
          return;
        }

        image.dataset.upgraded = "true";
        const fullImage = new window.Image();
        fullImage.decoding = "async";
        fullImage.addEventListener("load", () => {
          image.src = fullSrc;
          image.classList.add("is-full-res");
        });
        fullImage.src = fullSrc;
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
  image.src = previewSrc;
  image.loading = index < 8 ? "eager" : "lazy";
  image.decoding = "async";
  image.dataset.fullSrc = item.fullSrc;
  image.dataset.previewSrc = previewSrc;
  image.dataset.upgraded = previewSrc === item.fullSrc ? "true" : "false";
  if (previewSrc === item.fullSrc) {
    image.classList.add("is-full-res");
  } else {
    image.addEventListener(
      "error",
      () => {
        image.dataset.upgraded = "true";
        image.src = item.fullSrc;
        image.classList.add("is-full-res");
      },
      { once: true }
    );
    getPortfolioImageObserver().observe(image);
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
        const response = await fetch(`/${settingsPath}`, { cache: "no-store" });
        if (!response.ok) {
          return [];
        }
        const settings = await response.json();
        return (Array.isArray(settings?.photos) ? settings.photos : [])
          .filter((photo) => photo?.deleted !== true && typeof photo?.src === "string" && photo.src)
          .map((photo) => {
            const fullSrc = photo.src;
            const previewSrc =
              typeof photo.previewSrc === "string" && photo.previewSrc ? photo.previewSrc : getDerivedPreviewSrc(fullSrc);
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
  element.dataset.category = card.category || "";
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
  applyInlineEmptyState(tags, card.category);

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
  currentAlbumFilter = filter || "all";

  controls.forEach((control) => {
    control.classList.toggle("is-active", control.dataset.filter === currentAlbumFilter);
  });

  cards.forEach((card) => {
    const categories = (card.dataset.category || "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const matches = currentAlbumFilter === "all" || categories.includes(currentAlbumFilter);
    card.hidden = !matches;
  });
};

export const refreshAlbumLinks = () => {
  const controls = getAlbumFilterControls();
  const cards = getAlbumFilterCards();

  if (!controls.length) {
    return;
  }

  const availableFilters = new Set(["all"]);
  cards.forEach((card) => {
    (card.dataset.category || "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => availableFilters.add(value));
  });

  controls.forEach((control) => {
    const filter = control.dataset.filter || "all";
    control.hidden = !availableFilters.has(filter);
  });

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
  const controls = getAlbumFilterControls();

  if (!controls.length) {
    return;
  }

  controls.forEach((control) => {
    if (control.dataset.filterBound === "true") {
      return;
    }
    control.dataset.filterBound = "true";
    control.addEventListener("click", () => {
      applyAlbumFilter(control.dataset.filter || "all");
    });
  });

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
    const response = await fetch(`/${settingsPath}`, { cache: "no-store" });
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
