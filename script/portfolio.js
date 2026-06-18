import { resolveAssetUrl } from "./assets.js";

const DEFAULT_SETTINGS_PATH = "/data/portfolio.settings.json";
const DEFAULT_SETTINGS = {
  id: "portfolio",
  title: "Portfolio",
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

const normalizeSettings = (settings = {}) => ({
  id: "portfolio",
  title: typeof settings.title === "string" && settings.title.trim() ? settings.title : DEFAULT_SETTINGS.title,
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

const getPhotoName = (photo) => photo.internalName || photo.displayName || photo.originalName || "Portfolio photograph";

const getPhotoId = (photo) => String(photo?.id || photo?.src || "");

const getBasePortfolioPhotos = () =>
  (Array.isArray(state.library.photos) ? state.library.photos : []).filter(
    (photo) => photo?.inPortfolio === true && photo?.trashed !== true && typeof photo?.src === "string" && photo.src
  );

const getOrderedPortfolioPhotos = () => {
  const hiddenIds = new Set(state.editing && !state.previewing ? [] : state.settings.hiddenPhotoIds);
  const photos = getBasePortfolioPhotos().filter((photo) => state.editing || !hiddenIds.has(getPhotoId(photo)));
  if (state.settings.orderMode !== "manual") {
    return state.editing ? photos : shuffleItems(photos);
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
  if (state.editing && !state.previewing) {
    link.addEventListener("click", (event) => event.preventDefault());
  }

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
    const response = await fetch("/api/save-portfolio", {
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

const renderToolbar = () => {
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "home-floating-actions portfolio-floating-actions";
    els.body.append(toolbar);
  }

  const editButton = document.createElement("button");
  editButton.className = "preview-toggle";
  editButton.type = "button";
  editButton.textContent = state.editing ? "Done" : "Edit";
  editButton.addEventListener("click", () => {
    state.editing = !state.editing;
    state.previewing = false;
    render();
  });

  toolbar.replaceChildren(editButton);
  if (state.editing) {
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
    toolbar.append(previewButton, saveButton);

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
      }
      setDirty();
    },
  });

  panel.append(
    createField({ label: "Title", input: titleInput }),
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
  }

  const photos = getOrderedPortfolioPhotos();
  els.grid.replaceChildren(...photos.map(createPortfolioItem));
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
  const shouldUseSaved =
    savedSettings &&
    (savedSettings?.meta?.dirty === true || savedSettings?.meta?.syncedSignature === baseSignature);
  state.settings = normalizeSettings(shouldUseSaved ? savedSettings : baseSettings);
  if (!shouldUseSaved) {
    persistLocalSettings(false, settingsSignature());
  }
  render();
};

init();
