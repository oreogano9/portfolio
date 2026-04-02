import { refreshAlbumLinks } from "./home.js";
import { mountHomeReactEditorUi } from "./editor-react-ui.js";

const DEFAULT_SETTINGS_PATH = "data/homepage.settings.json";
const DEFAULT_INDENT_MODE = "quote-column";
const DEFAULT_FONT_FAMILY = "inter";
const DEFAULT_DISPLAY_FONT_FAMILY = "inter";
const FONT_FAMILY_OPTIONS = [
  "inter",
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

const getFontFamilyCssValue = (value) => {
  switch (normalizeFontFamily(value)) {
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
});

const normalizeCategoryString = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
};

const serializeHomepageState = (state) => ({
  id: "homepage",
  quoteText: state.quoteText,
  quoteAttribution: state.quoteAttribution,
  mastheadScale: normalizeMastheadScale(state.mastheadScale),
  mastheadTopSpace: normalizeMastheadTopSpace(state.mastheadTopSpace),
  quoteBottomSpace: normalizeQuoteBottomSpace(state.quoteBottomSpace),
  fontFamily: normalizeFontFamily(state.fontFamily),
  displayFontFamily: normalizeFontFamily(state.displayFontFamily, DEFAULT_DISPLAY_FONT_FAMILY),
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

  body.classList.remove("is-ready");

  const quote = document.querySelector(".homepage-quote");
  const attribution = document.querySelector(".homepage-quote-attribution");
  const mastheadCopy = document.querySelector(".masthead-copy");
  const albumsSection = document.querySelector(".albums-section");
  const albumGrid = albumsSection?.querySelector(".album-grid");
  const cardElements = Array.from(document.querySelectorAll(".album-card[data-home-card-id]"));

  if (!quote || !attribution || !mastheadCopy || !albumsSection || !albumGrid || !cardElements.length) {
    return;
  }

  const defaults = {
    quoteText: quote.textContent.trim(),
    quoteAttribution: attribution.textContent.trim(),
    mastheadScale: 1,
    mastheadTopSpace: 10,
    quoteBottomSpace: 1,
    fontFamily: DEFAULT_FONT_FAMILY,
    displayFontFamily: DEFAULT_DISPLAY_FONT_FAMILY,
    albumsIndentMode: DEFAULT_INDENT_MODE,
    albumCards: cardElements.map((card) => ({
      href: card.dataset.homeCardId || card.getAttribute("href") || "",
      title: card.querySelector(".album-card-title")?.textContent?.trim() || "",
      date: card.querySelector(".album-card-date")?.textContent?.trim() || "",
      category: card.dataset.category || "",
      description: card.querySelector(".album-card-description")?.textContent?.trim() || "",
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
    fontFamily: normalizeFontFamily(jsonState?.fontFamily, defaults.fontFamily),
    displayFontFamily: normalizeFontFamily(jsonState?.displayFontFamily, defaults.displayFontFamily),
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
    fontFamily: normalizeFontFamily(preferredState?.fontFamily, baseState.fontFamily),
    displayFontFamily: normalizeFontFamily(preferredState?.displayFontFamily, baseState.displayFontFamily),
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
    body.style.setProperty("--site-display-font-family", getFontFamilyCssValue(state.displayFontFamily));
    body.dataset.siteFontFamily = normalizeFontFamily(state.fontFamily);
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

    cardElements.forEach((card) => {
      const href = card.dataset.homeCardId || card.getAttribute("href") || "";
      const config = state.albumCards.find((entry) => entry.href === href);
      if (!config) {
        return;
      }

      card.dataset.category = config.category;
      const titleElement = card.querySelector(".album-card-title");
      const dateElement = card.querySelector(".album-card-date");
      const tagsElement = card.querySelector(".album-card-tags");
      const descriptionElement = card.querySelector(".album-card-description");
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
        fontFamily: normalizeFontFamily(state.fontFamily),
        displayFontFamily: normalizeFontFamily(state.displayFontFamily, DEFAULT_DISPLAY_FONT_FAMILY),
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
        setFontFamily: (value) => {
          state.fontFamily = normalizeFontFamily(value, state.fontFamily);
          saveDraft();
          render();
        },
        setDisplayFontFamily: (value) => {
          state.displayFontFamily = normalizeFontFamily(value, state.displayFontFamily);
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
