import { observeReveals, refreshAlbumLinks } from "./home.js?v=20260519-1";
import { mountHomeReactEditorUi } from "./editor-react-ui.js?v=20260519-1";

const DEFAULT_SETTINGS_PATH = "data/homepage.settings.json";
const DEFAULT_INDENT_MODE = "quote-column";
const DEFAULT_FONT_FAMILY = "inter";
const DEFAULT_QUOTE_FONT_FAMILY = "libre-baskerville";
const DEFAULT_TITLE_FONT_FAMILY = "libre-baskerville";
const DEFAULT_UI_FONT_FAMILY = "inter";
const DEFAULT_SHOW_SPLASH_ON_ENTER = true;
const DEFAULT_DARK_MODE = false;
const FONT_FAMILY_OPTIONS = [
  "inter",
  "moonbase-alpha",
  "ledlight",
  "saint",
  "clash",
  "neue-haas",
  "manrope",
  "space-grotesk",
  "plus-jakarta-sans",
  "sora",
  "instrument-serif",
  "cormorant-garamond",
  "fraunces",
  "newsreader",
  "libre-baskerville",
  "syne",
  "young-serif",
];

const normalizeHomepageSettingsPath = (value) => {
  if (typeof value !== "string") {
    return DEFAULT_SETTINGS_PATH;
  }

  const normalized = value.replace(/^\/+/, "").replace(/^\.\//, "").trim();
  return normalized || DEFAULT_SETTINGS_PATH;
};

const normalizeMastheadScale = (value, fallback = 1) => {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : Number(fallback);
  return Math.max(0.5, Math.min(1.6, numeric || 1));
};

const normalizeMastheadTopSpace = (value, fallback = 10) => {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : Number(fallback);
  return Math.max(0, Math.min(20, numeric || 0));
};

const normalizeQuoteBottomSpace = (value, fallback = 1) => {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : Number(fallback);
  return Math.max(0, Math.min(12, numeric || 0));
};

const normalizeIndentMode = (value, fallback = DEFAULT_INDENT_MODE) =>
  value === "full-width" || value === DEFAULT_INDENT_MODE ? value : fallback;

const normalizeFontFamily = (value, fallback = DEFAULT_FONT_FAMILY) => {
  if (FONT_FAMILY_OPTIONS.includes(value)) {
    return value;
  }
  return fallback;
};

const normalizeShowSplashOnEnter = (value, fallback = DEFAULT_SHOW_SPLASH_ON_ENTER) => {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
};

const normalizeDarkMode = (value, fallback = DEFAULT_DARK_MODE) => {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
};

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
    case "libre-baskerville":
      return '"LibreBaskerville", serif';
    case "syne":
      return '"Syne", sans-serif';
    case "young-serif":
      return '"YoungSerif", serif';
    case "clash":
      return '"ClashDisplay", sans-serif';
    case "neue-haas":
      return '"NeueHaasDisplay", sans-serif';
    case "inter":
    default:
      return '"Inter", sans-serif';
  }
};

const normalizeCard = (card, fallback = {}) => ({
  href: typeof card?.href === "string" && card.href.trim() ? card.href : fallback.href || "",
  title: typeof card?.title === "string" && card.title.trim() ? card.title : fallback.title || "",
  date: typeof card?.date === "string" ? card.date : fallback.date || "",
  category: typeof card?.category === "string" ? card.category : fallback.category || "",
  description: typeof card?.description === "string" ? card.description : fallback.description || "",
  private: card?.private === true || fallback.private === true,
});

const normalizeCategoryString = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
};

const isPrivateAlbumCard = (card) => card?.private === true;

const serializeHomepageState = (state) => ({
  id: "homepage",
  quoteText: state.quoteText,
  quoteAttribution: state.quoteAttribution,
  mastheadScale: normalizeMastheadScale(state.mastheadScale),
  mastheadTopSpace: normalizeMastheadTopSpace(state.mastheadTopSpace),
  quoteBottomSpace: normalizeQuoteBottomSpace(state.quoteBottomSpace),
  showSplashOnEnter: normalizeShowSplashOnEnter(state.showSplashOnEnter),
  darkMode: normalizeDarkMode(state.darkMode),
  fontFamily: normalizeFontFamily(state.fontFamily),
  quoteFontFamily: normalizeFontFamily(state.quoteFontFamily, DEFAULT_QUOTE_FONT_FAMILY),
  titleFontFamily: normalizeFontFamily(state.titleFontFamily, DEFAULT_TITLE_FONT_FAMILY),
  uiFontFamily: normalizeFontFamily(state.uiFontFamily, DEFAULT_UI_FONT_FAMILY),
  albumsIndentMode: normalizeIndentMode(state.albumsIndentMode),
  albumCards: state.albumCards.map((card) => normalizeCard(card)),
});

const getHomepageSettingsSignature = (state) => JSON.stringify(serializeHomepageState(state));

const getSavedHomepageState = (storageKey) => {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
};

const fetchHomepageState = async (settingsUrl) => {
  try {
    const response = await fetch(settingsUrl, { cache: "no-store" });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
};

const mergeAlbumCards = (preferredCards, defaultCards) => {
  if (!Array.isArray(preferredCards) || !preferredCards.length) {
    return defaultCards.map((card) => normalizeCard(card));
  }

  const defaultsByHref = new Map(defaultCards.map((card) => [card.href, card]));
  const merged = preferredCards
    .map((card) => normalizeCard(card, defaultsByHref.get(normalizeCard(card).href)))
    .filter((card) => card.href);

  defaultCards.forEach((card) => {
    if (!merged.some((item) => item.href === card.href)) {
      merged.push(normalizeCard(card));
    }
  });

  return merged;
};

export const setupHomeEditor = async () => {
  const body = document.body;
  if (!body.classList.contains("home-page")) {
    return;
  }

  if (!body.classList.contains("has-active-splash")) {
    body.classList.remove("is-ready");
  }

  const quote = document.querySelector(".homepage-quote");
  const attribution = document.querySelector(".homepage-quote-attribution");
  const mastheadCopy = document.querySelector(".masthead-copy");
  const albumsSection = document.querySelector(".albums-section");
  const albumGrid = albumsSection?.querySelector(".album-grid");
  let cardElements = Array.from(document.querySelectorAll(".album-card[data-home-card-id]"));

  if (!quote || !attribution || !mastheadCopy || !albumsSection || !albumGrid) {
    return;
  }

  const defaults = {
    quoteText: quote.textContent.trim(),
    quoteAttribution: attribution.textContent.trim(),
    mastheadScale: 1,
    mastheadTopSpace: 10,
    quoteBottomSpace: 1,
    showSplashOnEnter: DEFAULT_SHOW_SPLASH_ON_ENTER,
    darkMode: DEFAULT_DARK_MODE,
    fontFamily: DEFAULT_FONT_FAMILY,
    quoteFontFamily: DEFAULT_QUOTE_FONT_FAMILY,
    titleFontFamily: DEFAULT_TITLE_FONT_FAMILY,
    uiFontFamily: DEFAULT_UI_FONT_FAMILY,
    albumsIndentMode: DEFAULT_INDENT_MODE,
    albumCards: cardElements.map((card) => ({
      href: card.dataset.homeCardId || card.getAttribute("href") || "",
      title: card.querySelector(".album-card-title")?.textContent?.trim() || "",
      date: card.querySelector(".album-card-date")?.textContent?.trim() || "",
      category: card.dataset.category || "",
      description: card.querySelector(".album-card-description")?.textContent?.trim() || "",
      private: card.dataset.private === "true",
    })),
  };

  const storageKey = `homepage-editor:${window.location.pathname}`;
  const settingsPath = normalizeHomepageSettingsPath(body.dataset.homepageSettings);
  const settingsUrl = `/${settingsPath}`;
  const savedState = getSavedHomepageState(storageKey);
  const jsonState = await fetchHomepageState(settingsUrl);

  const baseState = {
    quoteText: typeof jsonState?.quoteText === "string" ? jsonState.quoteText : defaults.quoteText,
    quoteAttribution: typeof jsonState?.quoteAttribution === "string" ? jsonState.quoteAttribution : defaults.quoteAttribution,
    mastheadScale: normalizeMastheadScale(jsonState?.mastheadScale, defaults.mastheadScale),
    mastheadTopSpace: normalizeMastheadTopSpace(jsonState?.mastheadTopSpace, defaults.mastheadTopSpace),
    quoteBottomSpace: normalizeQuoteBottomSpace(jsonState?.quoteBottomSpace, defaults.quoteBottomSpace),
    showSplashOnEnter: normalizeShowSplashOnEnter(jsonState?.showSplashOnEnter, defaults.showSplashOnEnter),
    darkMode: normalizeDarkMode(jsonState?.darkMode, defaults.darkMode),
    fontFamily: normalizeFontFamily(jsonState?.fontFamily, defaults.fontFamily),
    quoteFontFamily: normalizeFontFamily(
      jsonState?.quoteFontFamily,
      normalizeFontFamily(jsonState?.displayFontFamily, defaults.quoteFontFamily)
    ),
    titleFontFamily: normalizeFontFamily(
      jsonState?.titleFontFamily,
      normalizeFontFamily(jsonState?.displayFontFamily, defaults.titleFontFamily)
    ),
    uiFontFamily: normalizeFontFamily(jsonState?.uiFontFamily, defaults.uiFontFamily),
    albumsIndentMode: normalizeIndentMode(jsonState?.albumsIndentMode, defaults.albumsIndentMode),
    albumCards: mergeAlbumCards(jsonState?.albumCards, defaults.albumCards),
  };

  let currentSyncedSignature = getHomepageSettingsSignature(baseState);
  const shouldUseSavedState =
    Boolean(savedState) &&
    (!jsonState || savedState?.meta?.dirty === true || savedState?.meta?.syncedSignature === currentSyncedSignature);

  const preferredState = shouldUseSavedState ? savedState : baseState;

  const state = {
    quoteText: typeof preferredState?.quoteText === "string" ? preferredState.quoteText : baseState.quoteText,
    quoteAttribution:
      typeof preferredState?.quoteAttribution === "string" ? preferredState.quoteAttribution : baseState.quoteAttribution,
    mastheadScale: normalizeMastheadScale(preferredState?.mastheadScale, baseState.mastheadScale),
    mastheadTopSpace: normalizeMastheadTopSpace(preferredState?.mastheadTopSpace, baseState.mastheadTopSpace),
    quoteBottomSpace: normalizeQuoteBottomSpace(preferredState?.quoteBottomSpace, baseState.quoteBottomSpace),
    showSplashOnEnter: normalizeShowSplashOnEnter(preferredState?.showSplashOnEnter, baseState.showSplashOnEnter),
    darkMode: normalizeDarkMode(preferredState?.darkMode, baseState.darkMode),
    fontFamily: normalizeFontFamily(preferredState?.fontFamily, baseState.fontFamily),
    quoteFontFamily: normalizeFontFamily(
      preferredState?.quoteFontFamily,
      normalizeFontFamily(preferredState?.displayFontFamily, baseState.quoteFontFamily)
    ),
    titleFontFamily: normalizeFontFamily(
      preferredState?.titleFontFamily,
      normalizeFontFamily(preferredState?.displayFontFamily, baseState.titleFontFamily)
    ),
    uiFontFamily: normalizeFontFamily(preferredState?.uiFontFamily, baseState.uiFontFamily),
    albumsIndentMode: normalizeIndentMode(preferredState?.albumsIndentMode, baseState.albumsIndentMode),
    albumCards: mergeAlbumCards(preferredState?.albumCards, defaults.albumCards),
    editing: false,
  };

  const persistLocalState = (dirty = true, syncedSignature = "") => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...serializeHomepageState(state),
        meta: {
          dirty,
          syncedSignature,
        },
      })
    );
  };

  if (!shouldUseSavedState) {
    persistLocalState(false, currentSyncedSignature);
  }

  let saveState = {
    pending: false,
    message: "",
  };

  const toolbar = document.createElement("div");
  toolbar.className = "home-floating-actions";
  body.appendChild(toolbar);

  const quoteEditor = document.createElement("div");
  quoteEditor.className = "home-edit-panel home-quote-editor";
  mastheadCopy.appendChild(quoteEditor);

  const albumEditorList = document.createElement("div");
  albumEditorList.className = "home-edit-panel home-album-editor-list";
  albumsSection.insertBefore(albumEditorList, albumGrid);
  const reactUi = mountHomeReactEditorUi({
    toolbarContainer: toolbar,
    quoteContainer: quoteEditor,
    cardsContainer: albumEditorList,
  });
  let activeInlineField = null;

  const createAlbumCardElement = (card, index) => {
    const element = document.createElement("a");
    element.className = "album-card reveal-up";
    element.href = card.href;
    element.dataset.category = card.category || "";
    element.dataset.homeCardId = card.href;
    element.dataset.private = card.private ? "true" : "false";

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
    date.textContent = card.date || "";

    const tags = document.createElement("p");
    tags.className = "album-card-tags";
    tags.setAttribute("aria-label", "Album tags");
    tags.textContent = card.category || "";

    const description = document.createElement("p");
    description.className = "album-card-description";
    description.textContent = card.description || "";

    const privateToggle = document.createElement("span");
    privateToggle.className = "album-card-private-toggle";
    privateToggle.setAttribute("role", "switch");
    privateToggle.setAttribute("tabindex", "0");

    copy.append(title, date, tags, description);
    element.append(number, copy, privateToggle);
    return element;
  };

  const getVisibleAlbumCards = () => (state.editing ? state.albumCards : state.albumCards.filter((card) => !isPrivateAlbumCard(card)));

  const syncAlbumGridCards = () => {
    const visibleCards = getVisibleAlbumCards();
    const expectedHrefs = visibleCards.map((card) => card.href);
    const currentCards = Array.from(albumGrid.querySelectorAll(".album-card[data-home-card-id]"));
    const currentHrefs = currentCards.map((card) => card.dataset.homeCardId || card.getAttribute("href") || "");
    const shouldRebuild =
      currentHrefs.length !== expectedHrefs.length ||
      currentHrefs.some((href, index) => href !== expectedHrefs[index]);

    if (shouldRebuild) {
      albumGrid.replaceChildren(...visibleCards.map((card, index) => createAlbumCardElement(card, index)));
      observeReveals(albumGrid);
    }

    cardElements = Array.from(albumGrid.querySelectorAll(".album-card[data-home-card-id]"));
    cardElements.forEach((cardElement, index) => {
      const number = cardElement.querySelector(".album-number");
      if (number) {
        number.textContent = String(index + 1).padStart(2, "0");
      }
    });
  };

  const getCardByHref = (href) => state.albumCards.find((entry) => entry.href === href) || null;

  const getFieldValue = (fieldId) => {
    if (fieldId === "quote") {
      return state.quoteText;
    }
    if (fieldId === "attribution") {
      return state.quoteAttribution;
    }
    if (fieldId.startsWith("card-title:")) {
      return getCardByHref(fieldId.slice("card-title:".length))?.title || "";
    }
    if (fieldId.startsWith("card-date:")) {
      return getCardByHref(fieldId.slice("card-date:".length))?.date || "";
    }
    if (fieldId.startsWith("card-description:")) {
      return getCardByHref(fieldId.slice("card-description:".length))?.description || "";
    }
    if (fieldId.startsWith("card-category:")) {
      return getCardByHref(fieldId.slice("card-category:".length))?.category || "";
    }
    return "";
  };

  const setFieldValue = (fieldId, value) => {
    if (fieldId === "quote") {
      state.quoteText = value;
      return;
    }
    if (fieldId === "attribution") {
      state.quoteAttribution = value;
      return;
    }
    if (fieldId.startsWith("card-title:")) {
      const card = getCardByHref(fieldId.slice("card-title:".length));
      if (card) {
        card.title = value;
      }
      return;
    }
    if (fieldId.startsWith("card-date:")) {
      const card = getCardByHref(fieldId.slice("card-date:".length));
      if (card) {
        card.date = value;
      }
      return;
    }
    if (fieldId.startsWith("card-description:")) {
      const card = getCardByHref(fieldId.slice("card-description:".length));
      if (card) {
        card.description = value;
      }
      return;
    }
    if (fieldId.startsWith("card-category:")) {
      const card = getCardByHref(fieldId.slice("card-category:".length));
      if (card) {
        card.category = value;
      }
    }
  };

  const normalizeFieldValue = (fieldId) => {
    if (fieldId.startsWith("card-category:")) {
      setFieldValue(fieldId, normalizeCategoryString(getFieldValue(fieldId)));
    }
  };

  const clearInlineEditState = () => {
    activeInlineField = null;
  };

  const finishInlineEdit = (fieldId, { cancel = false } = {}) => {
    if (!activeInlineField || activeInlineField.fieldId !== fieldId) {
      return;
    }

    if (cancel) {
      setFieldValue(fieldId, activeInlineField.originalValue);
      saveDraft();
    } else {
      normalizeFieldValue(fieldId);
      saveDraft();
    }

    clearInlineEditState();
    render();
  };

  const resizeTextarea = (element) => {
    if (!(element instanceof HTMLTextAreaElement)) {
      return;
    }

    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  const startInlineEdit = ({ fieldId, element, multiline = false }) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    if (activeInlineField?.fieldId === fieldId) {
      return;
    }

    if (activeInlineField) {
      finishInlineEdit(activeInlineField.fieldId);
    }

    const originalValue = getFieldValue(fieldId);
    activeInlineField = {
      fieldId,
      originalValue,
    };

    const control = document.createElement(multiline ? "textarea" : "input");
    control.className = multiline ? "inline-edit-input inline-edit-textarea" : "inline-edit-input";
    if (multiline) {
      control.rows = Math.max(2, originalValue.split("\n").length || 2);
    } else {
      control.type = "text";
    }
    control.value = originalValue;
    control.setAttribute("aria-label", fieldId);

    control.addEventListener("input", () => {
      setFieldValue(fieldId, control.value);
      saveDraft();
      if (multiline) {
        resizeTextarea(control);
      }
    });

    control.addEventListener("blur", () => {
      finishInlineEdit(fieldId);
    });

    control.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finishInlineEdit(fieldId, { cancel: true });
        return;
      }

      if (event.key === "Enter" && (!multiline || !event.shiftKey)) {
        event.preventDefault();
        control.blur();
      }
    });

    element.replaceChildren(control);
    element.classList.remove("is-inline-placeholder", "is-inline-empty");
    element.classList.add("is-inline-editing");
    if (multiline) {
      resizeTextarea(control);
    }

    window.requestAnimationFrame(() => {
      control.focus();
      const valueLength = control.value.length;
      control.setSelectionRange?.(valueLength, valueLength);
    });
  };

  const applyInlineText = ({ element, fieldId, value, placeholder, hideWhenEmpty = false }) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    if (activeInlineField?.fieldId === fieldId) {
      return;
    }

    element.classList.remove("is-inline-editing", "is-inline-placeholder", "is-inline-empty");
    element.dataset.inlineField = fieldId;
    const hasValue = value.trim().length > 0;

    if (hasValue) {
      element.textContent = value;
      return;
    }

    element.classList.add("is-inline-empty");
    if (!state.editing && hideWhenEmpty) {
      element.textContent = "";
      return;
    }

    if (!hideWhenEmpty) {
      element.textContent = placeholder;
      element.classList.add("is-inline-placeholder");
      return;
    }

    if (state.editing) {
      element.textContent = placeholder;
      element.classList.add("is-inline-placeholder");
      return;
    }

    element.textContent = "";
  };

  const render = () => {
    body.style.setProperty("--homepage-masthead-scale", String(normalizeMastheadScale(state.mastheadScale)));
    body.style.setProperty("--homepage-masthead-top-space", `${normalizeMastheadTopSpace(state.mastheadTopSpace)}rem`);
    body.style.setProperty("--homepage-quote-bottom-space", `${normalizeQuoteBottomSpace(state.quoteBottomSpace)}rem`);
    const siteFontFamilyValue = getFontFamilyCssValue(state.fontFamily);
    body.style.setProperty("--site-font-family", siteFontFamilyValue);
    body.style.setProperty("--site-quote-font-family", getFontFamilyCssValue(state.quoteFontFamily));
    body.style.setProperty("--site-title-font-family", getFontFamilyCssValue(state.titleFontFamily));
    body.style.setProperty("--site-ui-font-family", getFontFamilyCssValue(state.uiFontFamily));
    body.dataset.siteFontFamily = normalizeFontFamily(state.fontFamily);
    body.classList.toggle("is-site-dark", state.darkMode === true);
    body.classList.toggle("has-homepage-indent", state.albumsIndentMode === DEFAULT_INDENT_MODE);
    body.classList.toggle("is-home-editing", state.editing);
    applyInlineText({
      element: quote,
      fieldId: "quote",
      value: state.quoteText,
      placeholder: "Add quote",
    });
    applyInlineText({
      element: attribution,
      fieldId: "attribution",
      value: state.quoteAttribution,
      placeholder: "Add attribution",
    });

    syncAlbumGridCards();

    cardElements.forEach((card) => {
      const href = card.dataset.homeCardId || card.getAttribute("href") || "";
      const config = state.albumCards.find((entry) => entry.href === href);
      if (!config) {
        return;
      }

      card.dataset.category = config.category;
      card.dataset.private = config.private ? "true" : "false";
      card.classList.toggle("is-private", config.private === true);
      const titleElement = card.querySelector(".album-card-title");
      const dateElement = card.querySelector(".album-card-date");
      const tagsElement = card.querySelector(".album-card-tags");
      const descriptionElement = card.querySelector(".album-card-description");
      const privateToggle = card.querySelector(".album-card-private-toggle");
      applyInlineText({
        element: titleElement,
        fieldId: `card-title:${href}`,
        value: config.title,
        placeholder: "Add album title",
      });
      applyInlineText({
        element: dateElement,
        fieldId: `card-date:${href}`,
        value: config.date,
        placeholder: "00/00/00",
        hideWhenEmpty: true,
      });
      applyInlineText({
        element: tagsElement,
        fieldId: `card-category:${href}`,
        value: config.category,
        placeholder: "Add tags",
        hideWhenEmpty: true,
      });
      applyInlineText({
        element: descriptionElement,
        fieldId: `card-description:${href}`,
        value: config.description,
        placeholder: "Add description",
        hideWhenEmpty: true,
      });
      if (privateToggle instanceof HTMLElement) {
        privateToggle.textContent = config.private ? "Private" : "Public";
        privateToggle.setAttribute("aria-label", `${config.private ? "Make public" : "Make private"}: ${config.title || "album"}`);
        privateToggle.setAttribute("aria-checked", config.private ? "true" : "false");
      }
    });

    refreshAlbumLinks();

    reactUi.render({
      editing: state.editing,
      saveState,
      quoteState: {
        quoteText: state.quoteText,
        quoteAttribution: state.quoteAttribution,
        mastheadScale: normalizeMastheadScale(state.mastheadScale),
        mastheadTopSpace: normalizeMastheadTopSpace(state.mastheadTopSpace),
        quoteBottomSpace: normalizeQuoteBottomSpace(state.quoteBottomSpace),
        showSplashOnEnter: normalizeShowSplashOnEnter(state.showSplashOnEnter),
        darkMode: normalizeDarkMode(state.darkMode),
        fontFamily: normalizeFontFamily(state.fontFamily),
        quoteFontFamily: normalizeFontFamily(state.quoteFontFamily, DEFAULT_QUOTE_FONT_FAMILY),
        titleFontFamily: normalizeFontFamily(state.titleFontFamily, DEFAULT_TITLE_FONT_FAMILY),
        uiFontFamily: normalizeFontFamily(state.uiFontFamily, DEFAULT_UI_FONT_FAMILY),
      },
      cards: state.albumCards,
      actions: {
        toggleEdit: () => {
          if (activeInlineField) {
            finishInlineEdit(activeInlineField.fieldId);
          }
          state.editing = !state.editing;
          render();
        },
        saveToGitHub: saveSettingsToGitHub,
        setQuoteText: (value) => {
          state.quoteText = value;
          saveDraft();
          render();
        },
        setQuoteAttribution: (value) => {
          state.quoteAttribution = value;
          saveDraft();
          render();
        },
        setMastheadScale: (value) => {
          state.mastheadScale = normalizeMastheadScale(value, state.mastheadScale);
          saveDraft();
          render();
        },
        setMastheadTopSpace: (value) => {
          state.mastheadTopSpace = normalizeMastheadTopSpace(value, state.mastheadTopSpace);
          saveDraft();
          render();
        },
        setQuoteBottomSpace: (value) => {
          state.quoteBottomSpace = normalizeQuoteBottomSpace(value, state.quoteBottomSpace);
          saveDraft();
          render();
        },
        setShowSplashOnEnter: (value) => {
          state.showSplashOnEnter = normalizeShowSplashOnEnter(value, state.showSplashOnEnter);
          saveDraft();
          render();
        },
        setDarkMode: (value) => {
          state.darkMode = normalizeDarkMode(value, state.darkMode);
          saveDraft();
          render();
        },
        setFontFamily: (value) => {
          state.fontFamily = normalizeFontFamily(value, state.fontFamily);
          saveDraft();
          render();
        },
        setQuoteFontFamily: (value) => {
          state.quoteFontFamily = normalizeFontFamily(value, state.quoteFontFamily);
          saveDraft();
          render();
        },
        setTitleFontFamily: (value) => {
          state.titleFontFamily = normalizeFontFamily(value, state.titleFontFamily);
          saveDraft();
          render();
        },
        setUiFontFamily: (value) => {
          state.uiFontFamily = normalizeFontFamily(value, state.uiFontFamily);
          saveDraft();
          render();
        },
        setCardTitle: (href, value) => {
          const card = state.albumCards.find((entry) => entry.href === href);
          if (!card) {
            return;
          }
          card.title = value;
          saveDraft();
          render();
        },
        setCardDescription: (href, value) => {
          const card = state.albumCards.find((entry) => entry.href === href);
          if (!card) {
            return;
          }
          card.description = value;
          saveDraft();
          render();
        },
        setCardCategory: (href, value) => {
          const card = state.albumCards.find((entry) => entry.href === href);
          if (!card) {
            return;
          }
          card.category = normalizeCategoryString(value);
          saveDraft();
          render();
        },
        setCardPrivate: (href, value) => {
          const card = state.albumCards.find((entry) => entry.href === href);
          if (!card) {
            return;
          }
          card.private = value === true;
          saveDraft();
          render();
        },
        createAlbum: async () => {
          const nextTitle = window.prompt("Album title");
          if (!nextTitle || !nextTitle.trim()) {
            return;
          }

          saveState = {
            pending: true,
            message: "Creating...",
          };
          render();

          try {
            const payload = serializeHomepageState(state);
            const response = await fetch("/api/create-album", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                settingsPath,
                settings: payload,
                title: nextTitle.trim(),
              }),
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(result.error || "Album creation failed");
            }

            state.albumCards = Array.isArray(result.homepageSettings?.albumCards)
              ? mergeAlbumCards(result.homepageSettings.albumCards, defaults.albumCards)
              : state.albumCards;
            currentSyncedSignature = getHomepageSettingsSignature(result.homepageSettings || serializeHomepageState(state));
            persistLocalState(false, currentSyncedSignature);
            saveState = {
              pending: false,
              message: "Album created",
            };
          } catch (error) {
            saveState = {
              pending: false,
              message: error instanceof Error ? error.message : "Album creation failed",
            };
          }

          render();
          window.setTimeout(() => {
            saveState = {
              pending: false,
              message: "",
            };
            render();
          }, 2500);
        },
      },
    });
  };

  mastheadCopy.addEventListener("click", (event) => {
    if (!state.editing) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const fieldElement = target.closest(".homepage-quote, .homepage-quote-attribution");
    if (!(fieldElement instanceof HTMLElement)) {
      return;
    }

    if (fieldElement.classList.contains("homepage-quote")) {
      startInlineEdit({ fieldId: "quote", element: fieldElement, multiline: true });
      return;
    }

    startInlineEdit({ fieldId: "attribution", element: fieldElement });
  });

  albumGrid.addEventListener("click", (event) => {
    if (!state.editing) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const privateToggle = target.closest(".album-card-private-toggle");
    if (privateToggle instanceof HTMLElement) {
      const card = privateToggle.closest(".album-card");
      const href = card?.dataset.homeCardId || card?.getAttribute("href") || "";
      const config = getCardByHref(href);
      if (config) {
        event.preventDefault();
        config.private = config.private !== true;
        saveDraft();
        render();
      }
      return;
    }

    const titleElement = target.closest(".album-card-title");
    if (titleElement instanceof HTMLElement) {
      const card = titleElement.closest(".album-card");
      const href = card?.dataset.homeCardId || card?.getAttribute("href") || "";
      if (href) {
        event.preventDefault();
        startInlineEdit({ fieldId: `card-title:${href}`, element: titleElement });
      }
      return;
    }

    const dateElement = target.closest(".album-card-date");
    if (dateElement instanceof HTMLElement) {
      const card = dateElement.closest(".album-card");
      const href = card?.dataset.homeCardId || card?.getAttribute("href") || "";
      if (href) {
        event.preventDefault();
        startInlineEdit({ fieldId: `card-date:${href}`, element: dateElement });
      }
      return;
    }

    const tagsElement = target.closest(".album-card-tags");
    if (tagsElement instanceof HTMLElement) {
      const card = tagsElement.closest(".album-card");
      const href = card?.dataset.homeCardId || card?.getAttribute("href") || "";
      if (href) {
        event.preventDefault();
        startInlineEdit({ fieldId: `card-category:${href}`, element: tagsElement });
      }
      return;
    }

    const descriptionElement = target.closest(".album-card-description");
    if (descriptionElement instanceof HTMLElement) {
      const card = descriptionElement.closest(".album-card");
      const href = card?.dataset.homeCardId || card?.getAttribute("href") || "";
      if (href) {
        event.preventDefault();
        startInlineEdit({ fieldId: `card-description:${href}`, element: descriptionElement, multiline: true });
      }
    }
  });

  albumGrid.addEventListener("keydown", (event) => {
    if (!state.editing || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains("album-card-private-toggle")) {
      return;
    }

    const card = target.closest(".album-card");
    const href = card?.dataset.homeCardId || card?.getAttribute("href") || "";
    const config = getCardByHref(href);
    if (!config) {
      return;
    }

    event.preventDefault();
    config.private = config.private !== true;
    saveDraft();
    render();
  });

  const saveDraft = () => {
    persistLocalState(true, "");
  };

  const saveSettingsToGitHub = async () => {
    if (saveState.pending) {
      return;
    }

    saveState = {
      pending: true,
      message: "Saving...",
    };
    render();

    try {
      const payload = serializeHomepageState(state);
      const response = await fetch("/api/save-homepage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: "homepage",
          settingsPath,
          settings: payload,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Save failed");
      }

      currentSyncedSignature = getHomepageSettingsSignature(payload);
      persistLocalState(false, currentSyncedSignature);
      saveState = {
        pending: false,
        message: "Saved",
      };
    } catch (error) {
      saveState = {
        pending: false,
        message: error instanceof Error ? error.message : "Save failed",
      };
    }

    render();
    window.setTimeout(() => {
      saveState = {
        pending: false,
        message: "",
      };
      render();
    }, 2500);
  };

  window.addEventListener("keydown", (event) => {
    const isMacToggle = event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "e";
    if (!isMacToggle) {
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
    if (activeInlineField) {
      finishInlineEdit(activeInlineField.fieldId);
    }
    state.editing = !state.editing;
    render();
  });

  render();
  body.classList.add("is-ready");
};
