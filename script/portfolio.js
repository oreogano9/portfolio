import { resolveAssetUrl } from "./assets.js";

const DEFAULT_SETTINGS_PATH = "/data/portfolio.settings.json";
const DEFAULT_SETTINGS = {
  id: "portfolio",
  title: "Portfolio",
  titleFontFamily: "inter",
  orderMode: "random",
  columns: 5,
  gap: 0.42,
  hiddenPhotoIds: [],
  photoOrder: [],
};

const state = {
  library: { photos: [] },
  settings: { ...DEFAULT_SETTINGS },
  editing: false,
  previewing: false,
  saving: false,
  message: "",
  previewOpen: false,
  previewIndex: -1,
  renderedPhotos: [],
  resizeTimer: 0,
  masonryMeasureTimer: 0,
  measuredAspectRatios: new Map(),
  baseSettingsSignature: "",
  randomPhotoOrderIds: [],
  randomPhotoOrderSignature: "",
};

const els = {
  body: document.body,
  title: document.querySelector(".portfolio-title"),
  hero: document.querySelector(".portfolio-hero"),
  grid: document.querySelector(".portfolio-library-grid"),
  empty: document.querySelector(".portfolio-empty"),
};

const normalizeSettingsPath = (value) => String(value || DEFAULT_SETTINGS_PATH).replace(/^\/+/, "");

const getLibraryPath = () => String(els.body.dataset.photoLibrary || "/data/photo-library.json");

const getSettingsPath = () => normalizeSettingsPath(els.body.dataset.portfolioSettings || DEFAULT_SETTINGS_PATH);

const storageKey = () => `portfolio-editor:${window.location.pathname}`;

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
};

const uniqueStrings = (values) => Array.from(new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean)));

const FONT_FAMILY_OPTIONS = [
  { value: "inter", label: "Inter" },
  { value: "moonbase-alpha", label: "Moonbase Alpha" },
  { value: "ledlight", label: "LED Light" },
  { value: "saint", label: "Saint" },
  { value: "clash", label: "Clash Display" },
  { value: "neue-haas", label: "Neue Haas" },
  { value: "manrope", label: "Manrope" },
  { value: "space-grotesk", label: "Space Grotesk" },
  { value: "plus-jakarta-sans", label: "Plus Jakarta Sans" },
  { value: "sora", label: "Sora" },
  { value: "instrument-serif", label: "Instrument Serif" },
  { value: "cormorant-garamond", label: "Cormorant Garamond" },
  { value: "fraunces", label: "Fraunces" },
  { value: "newsreader", label: "Newsreader" },
  { value: "libre-baskerville", label: "Libre Baskerville" },
  { value: "syne", label: "Syne" },
  { value: "young-serif", label: "Young Serif" },
  { value: "picnic", label: "PicNic" },
];

const normalizeFontFamily = (value, fallback = DEFAULT_SETTINGS.titleFontFamily) =>
  FONT_FAMILY_OPTIONS.some((option) => option.value === value) ? value : fallback;

const getFontFamilyCssValue = (value) => {
  switch (normalizeFontFamily(value)) {
    case "moonbase-alpha":
      return '"MoonbaseAlpha", sans-serif';
    case "ledlight":
      return '"Ledlight", sans-serif';
    case "saint":
      return '"Saint", serif';
    case "manrope":
      return '"Manrope", sans-serif';
    case "space-grotesk":
      return '"SpaceGrotesk", sans-serif';
    case "plus-jakarta-sans":
      return '"PlusJakartaSans", sans-serif';
    case "sora":
      return '"Sora", sans-serif';
    case "instrument-serif":
      return '"InstrumentSerif", serif';
    case "cormorant-garamond":
      return '"CormorantGaramond", serif';
    case "fraunces":
      return '"Fraunces", serif';
    case "newsreader":
      return '"Newsreader", serif';
    case "syne":
      return '"Syne", sans-serif';
    case "young-serif":
      return '"YoungSerif", serif';
    case "picnic":
      return '"PicNic", serif';
    case "clash":
      return '"ClashDisplay", sans-serif';
    case "neue-haas":
      return '"NeueHaasDisplay", sans-serif';
    case "inter":
      return '"Inter", sans-serif';
    case "libre-baskerville":
    default:
      return '"LibreBaskerville", serif';
  }
};

const normalizeSettings = (settings = {}) => ({
  id: "portfolio",
  title: typeof settings.title === "string" && settings.title.trim() ? settings.title : DEFAULT_SETTINGS.title,
  titleFontFamily: normalizeFontFamily(settings.titleFontFamily),
  orderMode: settings.orderMode === "manual" ? "manual" : "random",
  columns: clampNumber(settings.columns, 2, 8, DEFAULT_SETTINGS.columns),
  gap: clampNumber(settings.gap, 0, 2, DEFAULT_SETTINGS.gap),
  hiddenPhotoIds: uniqueStrings(settings.hiddenPhotoIds),
  photoOrder: uniqueStrings(settings.photoOrder),
});

const serializeSettings = () => normalizeSettings(state.settings);

const settingsSignature = () => JSON.stringify(serializeSettings());

const loadJson = async (path) => {
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
};

const getSavedSettings = () => {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey()) || "null");
  } catch {
    return null;
  }
};

const persistLocalSettings = (dirty = true, syncedSignature = "") => {
  window.localStorage.setItem(
    storageKey(),
    JSON.stringify({
      ...serializeSettings(),
      meta: {
        dirty,
        baseSignature: state.baseSettingsSignature || syncedSignature,
        syncedSignature,
      },
    })
  );
};

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

const getPhotoListSignature = (photos) => photos.map(getPhotoId).join("\n");

const getRandomizedPortfolioPhotos = (photos) => {
  const signature = getPhotoListSignature(photos);
  if (state.randomPhotoOrderSignature !== signature) {
    state.randomPhotoOrderIds = shuffleItems(photos.map(getPhotoId));
    state.randomPhotoOrderSignature = signature;
  }

  const byId = new Map(photos.map((photo) => [getPhotoId(photo), photo]));
  const ordered = state.randomPhotoOrderIds.map((id) => byId.get(id)).filter(Boolean);
  const orderedIds = new Set(ordered.map(getPhotoId));
  photos.forEach((photo) => {
    if (!orderedIds.has(getPhotoId(photo))) {
      ordered.push(photo);
    }
  });
  return ordered;
};

const getPhotoName = (photo) => photo.internalName || photo.displayName || photo.originalName || "Portfolio photograph";

const getPhotoId = (photo) => String(photo?.id || photo?.src || "");

const getPhotoAspectRatio = (photo) => {
  const measured = state.measuredAspectRatios.get(getPhotoId(photo));
  if (Number.isFinite(measured) && measured > 0) {
    return measured;
  }

  const aspectRatio = Number(photo?.aspectRatio);
  if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
    return aspectRatio;
  }

  const width = Number(photo?.width);
  const height = Number(photo?.height);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return width / height;
  }

  return 0;
};

const getResponsiveColumnCount = (settings, photoCount) => {
  const maxColumns = window.matchMedia("(max-width: 760px)").matches
    ? 2
    : window.matchMedia("(max-width: 1100px)").matches
    ? 3
    : settings.columns;
  return Math.max(1, Math.min(maxColumns, photoCount || maxColumns));
};

const getMasonryWeight = (photo) => {
  const aspectRatio = getPhotoAspectRatio(photo);
  return Number.isFinite(aspectRatio) && aspectRatio > 0 ? 1 / aspectRatio : 1.25;
};

const scheduleMasonryRerender = () => {
  window.clearTimeout(state.masonryMeasureTimer);
  state.masonryMeasureTimer = window.setTimeout(render, 120);
};

const getBasePortfolioPhotos = () =>
  (Array.isArray(state.library.photos) ? state.library.photos : []).filter(
    (photo) => photo?.inPortfolio === true && photo?.trashed !== true && typeof photo?.src === "string" && photo.src
  );

const getOrderedPortfolioPhotos = () => {
  const hiddenIds = new Set(state.editing && !state.previewing ? [] : state.settings.hiddenPhotoIds);
  const photos = getBasePortfolioPhotos().filter((photo) => state.editing || !hiddenIds.has(getPhotoId(photo)));
  if (state.settings.orderMode !== "manual") {
    return state.editing ? photos : getRandomizedPortfolioPhotos(photos);
  }

  const byId = new Map(photos.map((photo) => [getPhotoId(photo), photo]));
  const ordered = state.settings.photoOrder.map((id) => byId.get(id)).filter(Boolean);
  const orderedIds = new Set(ordered.map(getPhotoId));
  photos.forEach((photo) => {
    if (!orderedIds.has(getPhotoId(photo))) {
      ordered.push(photo);
    }
  });
  return ordered;
};

const setDirty = ({ rerender = true } = {}) => {
  state.message = "Unsaved changes";
  persistLocalSettings(true);
  if (rerender) {
    render();
  } else {
    renderToolbar();
  }
};

const movePhoto = (photoId, direction) => {
  state.settings.orderMode = "manual";
  const photos = getOrderedPortfolioPhotos();
  const ids = photos.map(getPhotoId);
  const index = ids.indexOf(photoId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) {
    return;
  }
  [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
  state.settings.photoOrder = ids;
  setDirty();
};

const toggleHidden = (photoId) => {
  const hidden = new Set(state.settings.hiddenPhotoIds);
  if (hidden.has(photoId)) {
    hidden.delete(photoId);
  } else {
    hidden.add(photoId);
  }
  state.settings.hiddenPhotoIds = Array.from(hidden);
  setDirty();
};

let preview = null;

const getPreviewPhoto = () => state.renderedPhotos[state.previewIndex] || null;

const closePortfolioPreview = () => {
  state.previewOpen = false;
  state.previewIndex = -1;
  els.body.classList.remove("is-portfolio-preview-open");
  document.body.style.overflow = "";
  if (preview) {
    preview.hidden = true;
    preview.setAttribute("aria-hidden", "true");
    const image = preview.querySelector(".portfolio-preview-image");
    if (image instanceof HTMLImageElement) {
      image.removeAttribute("src");
      image.alt = "";
    }
  }
};

const renderPortfolioPreview = () => {
  if (!preview) {
    preview = document.createElement("div");
    preview.className = "portfolio-preview";
    preview.hidden = true;
    preview.setAttribute("aria-hidden", "true");
    preview.innerHTML = `
      <button class="portfolio-preview-close" type="button" aria-label="Close preview">×</button>
      <button class="portfolio-preview-nav portfolio-preview-prev" type="button" aria-label="Previous image">←</button>
      <img class="portfolio-preview-image" alt="" />
      <button class="portfolio-preview-nav portfolio-preview-next" type="button" aria-label="Next image">→</button>
    `;
    preview.addEventListener("click", (event) => {
      if (event.target === preview || event.target.closest(".portfolio-preview-close")) {
        closePortfolioPreview();
      } else if (event.target.closest(".portfolio-preview-prev")) {
        showPortfolioPreviewAt(state.previewIndex - 1);
      } else if (event.target.closest(".portfolio-preview-next")) {
        showPortfolioPreviewAt(state.previewIndex + 1);
      }
    });
    els.body.append(preview);
  }

  const photo = getPreviewPhoto();
  if (!photo) {
    closePortfolioPreview();
    return;
  }

  const image = preview.querySelector(".portfolio-preview-image");
  if (image instanceof HTMLImageElement) {
    image.src = resolveAssetUrl(photo.src);
    image.alt = getPhotoName(photo);
  }
  preview.hidden = false;
  preview.setAttribute("aria-hidden", "false");
  els.body.classList.add("is-portfolio-preview-open");
  document.body.style.overflow = "hidden";
};

const showPortfolioPreviewAt = (index) => {
  if (!state.renderedPhotos.length) {
    return;
  }
  state.previewOpen = true;
  state.previewIndex = (index + state.renderedPhotos.length) % state.renderedPhotos.length;
  renderPortfolioPreview();
};

const openPortfolioPreview = (photoId) => {
  const index = state.renderedPhotos.findIndex((photo) => getPhotoId(photo) === photoId);
  if (index < 0) {
    return;
  }
  showPortfolioPreviewAt(index);
};

const createPortfolioItem = (photo, index) => {
  const photoId = getPhotoId(photo);
  const isHidden = state.settings.hiddenPhotoIds.includes(photoId);
  const link = document.createElement("a");
  link.className = `portfolio-image-link reveal-up${isHidden ? " is-portfolio-hidden" : ""}`;
  link.href = resolveAssetUrl(photo.src);
  link.target = "_blank";
  link.rel = "noreferrer";
  link.dataset.photoId = photoId;
  link.setAttribute("aria-label", getPhotoName(photo));
  link.addEventListener("click", (event) => {
    event.preventDefault();
    if (state.editing && !state.previewing) {
      return;
    }
    openPortfolioPreview(photoId);
  });

  const image = document.createElement("img");
  const aspectRatio = Number(photo.aspectRatio);
  image.alt = getPhotoName(photo);
  image.loading = index < 10 ? "eager" : "lazy";
  image.decoding = "async";
  image.src = resolveAssetUrl(photo.previewSrc || photo.src);
  image.classList.add("is-full-res");
  if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
    image.width = 1000;
    image.height = Math.max(1, Math.round(1000 / aspectRatio));
  }
  image.addEventListener(
    "load",
    () => {
      image.dataset.ready = "true";
      if (!image.naturalWidth || !image.naturalHeight) {
        return;
      }

      const nextAspectRatio = image.naturalWidth / image.naturalHeight;
      const previousAspectRatio = state.measuredAspectRatios.get(photoId);
      if (!Number.isFinite(previousAspectRatio) || Math.abs(previousAspectRatio - nextAspectRatio) > 0.001) {
        state.measuredAspectRatios.set(photoId, nextAspectRatio);
        scheduleMasonryRerender();
      }
    },
    { once: true }
  );
  link.append(image);

  if (state.editing && !state.previewing) {
    const controls = document.createElement("span");
    controls.className = "portfolio-photo-controls";
    controls.innerHTML = `
      <button class="portfolio-photo-button" type="button" data-portfolio-photo-action="move-up" aria-label="Move ${getPhotoName(photo)} earlier">↑</button>
      <button class="portfolio-photo-button" type="button" data-portfolio-photo-action="move-down" aria-label="Move ${getPhotoName(photo)} later">↓</button>
      <button class="portfolio-photo-button" type="button" data-portfolio-photo-action="toggle-hidden">${isHidden ? "Show" : "Hide"}</button>
    `;
    controls.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.target.closest("[data-portfolio-photo-action]");
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const action = button.dataset.portfolioPhotoAction;
      if (action === "move-up") {
        movePhoto(photoId, -1);
      } else if (action === "move-down") {
        movePhoto(photoId, 1);
      } else if (action === "toggle-hidden") {
        toggleHidden(photoId);
      }
    });
    link.append(controls);
  }
  return link;
};

const createPortfolioMasonry = (photos, columnCount) => {
  const columns = Array.from({ length: columnCount }, () => ({
    height: 0,
    items: [],
  }));
  const masonryPhotos = photos.map((photo, index) => ({ photo, index }));

  masonryPhotos.forEach(({ photo, index }) => {
    const column = columns.reduce((shortest, current) => (current.height < shortest.height ? current : shortest), columns[0]);
    column.items.push(createPortfolioItem(photo, index));
    column.height += getMasonryWeight(photo);
  });

  return columns.map((column, index) => {
    const element = document.createElement("div");
    element.className = "portfolio-masonry-column";
    element.dataset.column = String(index + 1);
    element.append(...column.items);
    return element;
  });
};

const createField = ({ label, input }) => {
  const field = document.createElement("label");
  field.className = "home-edit-field portfolio-edit-field";
  const text = document.createElement("span");
  text.textContent = label;
  field.append(text, input);
  return field;
};

const createInput = ({ value, type = "text", min, max, step, onInput }) => {
  const input = document.createElement("input");
  input.type = type;
  input.value = String(value);
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  if (step !== undefined) input.step = String(step);
  input.addEventListener("input", (event) => onInput(event.currentTarget.value));
  input.addEventListener("change", (event) => onInput(event.currentTarget.value));
  return input;
};

const createSelect = ({ value, options, onChange }) => {
  const select = document.createElement("select");
  select.className = "home-edit-select";
  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  });
  select.value = value;
  select.addEventListener("change", (event) => onChange(event.currentTarget.value));
  return select;
};

const saveSettings = async () => {
  if (state.saving) {
    return;
  }
  state.saving = true;
  state.message = "Saving...";
  renderToolbar();
  try {
    const settings = serializeSettings();
    const response = await fetch("/api/save-homepage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "portfolio",
        settingsPath: getSettingsPath(),
        settings,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.details || payload?.error || "Could not save portfolio settings");
    }
    state.settings = settings;
    state.message = "Saved";
    persistLocalSettings(false, settingsSignature());
  } catch (error) {
    state.message = error instanceof Error ? error.message : String(error);
  } finally {
    state.saving = false;
    render();
  }
};

let toolbar = null;
let panel = null;

const toggleEditing = () => {
  state.editing = !state.editing;
  state.previewing = false;
  render();
};

const renderToolbar = () => {
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "home-floating-actions portfolio-floating-actions";
    els.body.append(toolbar);
  }

  toolbar.replaceChildren();
  toolbar.hidden = !state.editing;
  if (state.editing) {
    const doneButton = document.createElement("button");
    doneButton.className = "preview-toggle";
    doneButton.type = "button";
    doneButton.textContent = "Done";
    doneButton.addEventListener("click", toggleEditing);

    const previewButton = document.createElement("button");
    previewButton.className = "preview-toggle";
    previewButton.type = "button";
    previewButton.textContent = state.previewing ? "Editing" : "Preview";
    previewButton.addEventListener("click", () => {
      state.previewing = !state.previewing;
      render();
    });

    const saveButton = document.createElement("button");
    saveButton.className = "preview-toggle";
    saveButton.type = "button";
    saveButton.textContent = state.saving ? "Saving..." : "Save";
    saveButton.disabled = state.saving;
    saveButton.addEventListener("click", saveSettings);
    toolbar.append(doneButton, previewButton, saveButton);

    if (state.message) {
      const message = document.createElement("span");
      message.className = "portfolio-edit-message";
      message.textContent = state.message;
      toolbar.append(message);
    }
  }
};

const renderPanel = () => {
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "home-edit-panel portfolio-edit-panel";
    els.hero?.append(panel);
  }
  panel.replaceChildren();
  if (!state.editing || state.previewing) {
    return;
  }

  const titleInput = createInput({
    value: state.settings.title,
    onInput: (value) => {
      state.settings.title = value || "Portfolio";
      if (els.title) {
        els.title.textContent = state.settings.title;
      }
      setDirty({ rerender: false });
    },
  });

  const orderSelect = createSelect({
    value: state.settings.orderMode,
    options: [
      { value: "random", label: "Random" },
      { value: "manual", label: "Manual" },
    ],
    onChange: (value) => {
      state.settings.orderMode = value === "manual" ? "manual" : "random";
      if (state.settings.orderMode === "manual" && !state.settings.photoOrder.length) {
        state.settings.photoOrder = getOrderedPortfolioPhotos().map(getPhotoId);
      } else if (state.settings.orderMode === "random") {
        state.randomPhotoOrderIds = [];
        state.randomPhotoOrderSignature = "";
      }
      setDirty();
    },
  });

  panel.append(
    createField({ label: "Title", input: titleInput }),
    createField({
      label: "Title font",
      input: createSelect({
        value: state.settings.titleFontFamily,
        options: FONT_FAMILY_OPTIONS,
        onChange: (value) => {
          state.settings.titleFontFamily = normalizeFontFamily(value);
          if (els.title) {
            els.title.style.fontFamily = getFontFamilyCssValue(state.settings.titleFontFamily);
          }
          setDirty();
        },
      }),
    }),
    createField({ label: "Order", input: orderSelect }),
    createField({
      label: "Columns",
      input: createInput({
        type: "number",
        min: 2,
        max: 8,
        step: 1,
        value: state.settings.columns,
        onInput: (value) => {
          state.settings.columns = clampNumber(value, 2, 8, DEFAULT_SETTINGS.columns);
          setDirty();
        },
      }),
    }),
    createField({
      label: "Spacing",
      input: createInput({
        type: "number",
        min: 0,
        max: 2,
        step: 0.05,
        value: state.settings.gap,
        onInput: (value) => {
          state.settings.gap = clampNumber(value, 0, 2, DEFAULT_SETTINGS.gap);
          setDirty();
        },
      }),
    })
  );
};

const render = () => {
  if (!(els.grid instanceof HTMLElement) || !(els.empty instanceof HTMLElement)) {
    return;
  }

  const settings = serializeSettings();
  els.body.classList.toggle("is-portfolio-editing", state.editing);
  els.body.classList.toggle("is-portfolio-previewing", state.editing && state.previewing);
  els.grid.style.setProperty("--portfolio-columns", String(settings.columns));
  els.grid.style.setProperty("--portfolio-gap", `${settings.gap}rem`);
  if (els.title) {
    els.title.textContent = settings.title || "Portfolio";
    els.title.style.fontFamily = getFontFamilyCssValue(settings.titleFontFamily);
  }

  const photos = getOrderedPortfolioPhotos();
  const activeColumns = getResponsiveColumnCount(settings, photos.length);
  els.grid.style.setProperty("--portfolio-active-columns", String(activeColumns));
  state.renderedPhotos = photos;
  els.grid.replaceChildren(...createPortfolioMasonry(photos, activeColumns));
  els.empty.hidden = photos.length > 0;
  renderToolbar();
  renderPanel();
};

const init = async () => {
  const [library, settings] = await Promise.all([loadJson(getLibraryPath()), loadJson(`/${getSettingsPath()}`)]);
  state.library = library || { photos: [] };
  const baseSettings = normalizeSettings(settings || DEFAULT_SETTINGS);
  const savedSettings = getSavedSettings();
  const baseSignature = JSON.stringify(baseSettings);
  state.baseSettingsSignature = baseSignature;
  const shouldUseSaved =
    savedSettings &&
    (savedSettings?.meta?.syncedSignature === baseSignature ||
      (savedSettings?.meta?.dirty === true && savedSettings?.meta?.baseSignature === baseSignature));
  state.settings = normalizeSettings(shouldUseSaved ? savedSettings : baseSettings);
  if (!shouldUseSaved) {
    persistLocalSettings(false, settingsSignature());
  }
  window.addEventListener("keydown", (event) => {
    if (state.previewOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePortfolioPreview();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPortfolioPreviewAt(state.previewIndex - 1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showPortfolioPreviewAt(state.previewIndex + 1);
        return;
      }
    }

    const isToggle =
      (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "e";
    if (!isToggle) {
      return;
    }

    const target = event.target;
    const isTypingTarget =
      target instanceof HTMLElement &&
      (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
    if (isTypingTarget) {
      return;
    }

    event.preventDefault();
    toggleEditing();
  });
  window.addEventListener("resize", () => {
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(render, 120);
  });
  render();
};

init();
