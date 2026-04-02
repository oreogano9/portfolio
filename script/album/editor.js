import {
  fetchJsonState,
  fetchSiteBrand,
  getAlbumTitleFontFamilyCssValue,
  getPersistedAlbumState,
  getSavedState,
  getSettingsSignature,
  normalizeEffect,
  normalizeEffectSettings,
  normalizeIntro,
  normalizeAlbumTitleFontFamily,
  normalizeMobileRotateClockwise,
  normalizePhoto,
  normalizeSections,
  normalizeSettingsPath,
  normalizeTitleScale,
  normalizeTopSpacer,
  serializeState,
  sizeOptions,
  spacingMap,
} from "./state.js";
import { createAlbumEffects } from "./effects.js";
import { canJoinPhoto, deriveSectionsFromPhotos } from "./utils.js";
import {
  buildAlbumBlocks,
  collectHeadingAdjacentPhotos,
  getHeroIntroState,
  mountAlbumBlocks,
  renderHeroIntro,
  renderSubalbumIndexes,
} from "./render.js";
import { mountAlbumReactHeaderUi } from "../editor-react-ui.js";
import { observeReveals } from "../home.js";

export const setupAlbumEditor = async () => {
  const body = document.body;
  const grid = document.querySelector(".album-detail-grid");
  const title = document.querySelector(".masthead-title");
  const header = document.querySelector(".album-page-header");
  let topSpacerSection = document.querySelector(".album-top-spacer");
  let heroIntro = header?.querySelector(".album-hero-intro");
  const subalbumIndex = document.querySelector(".subalbum-index");
  const subalbumFooterIndex = document.querySelector(".subalbum-footer-index");
  const toggleButtons = Array.from(document.querySelectorAll('[data-album-action="edit"]'));
  const previewButtons = Array.from(document.querySelectorAll('[data-album-action="preview"]'));
  const saveButtons = Array.from(document.querySelectorAll('[data-album-action="save"]'));
  const exportButtons = Array.from(document.querySelectorAll('[data-album-action="export"]'));
  const actionGroups = Array.from(document.querySelectorAll(".floating-editor-actions, .mobile-home-section"));
  const previewToggle = previewButtons[0];

  if (
    !body.classList.contains("album-page") ||
    !grid ||
    !title ||
    !header ||
    !toggleButtons.length ||
    !previewToggle ||
    !saveButtons.length ||
    !exportButtons.length
  ) {
    return;
  }

  if (!topSpacerSection) {
    topSpacerSection = document.createElement("section");
    topSpacerSection.className = "album-top-spacer";
    topSpacerSection.setAttribute("aria-hidden", "true");
    header.parentNode?.insertBefore(topSpacerSection, header);
  }

  if (!heroIntro) {
    heroIntro = document.createElement("div");
    heroIntro.className = "album-hero-intro is-hidden";
    heroIntro.setAttribute("aria-live", "polite");
    const headerTitle = header.querySelector(".masthead-title");
    if (headerTitle) {
      header.insertBefore(heroIntro, headerTitle);
    } else {
      header.appendChild(heroIntro);
    }
  }

  const storageKey = `album-editor:${window.location.pathname}`;
  const galleryId = body.dataset.galleryId || "gallery";
  const settingsUrl = body.dataset.gallerySettings || "";
  const canonicalSettingsPath = normalizeSettingsPath(settingsUrl);
  let spacerClipboard = null;

  const originalPhotos = Array.from(grid.querySelectorAll("img")).map((image) => {
    const naturalWidth = image.naturalWidth || Number(image.getAttribute("width")) || 0;
    const naturalHeight = image.naturalHeight || Number(image.getAttribute("height")) || 0;
    const hasIntrinsicSize = naturalWidth > 0 && naturalHeight > 0;

    return {
      src: image.getAttribute("src") || "",
      alt: image.getAttribute("alt") || "",
      section: image.dataset.section || "",
      size: "full",
      spacerAfter: 0,
      effect: "none",
      joinWithPrevious: false,
      landscape: hasIntrinsicSize ? naturalWidth > naturalHeight : null,
      aspectRatio: hasIntrinsicSize ? naturalWidth / naturalHeight : null,
    };
  });

  const savedState = getSavedState(storageKey);
  const jsonState = await fetchJsonState(settingsUrl);
  const siteBrand = await fetchSiteBrand();

  let currentSyncedSignature = jsonState
    ? getSettingsSignature({ galleryId, titleFallback: title.textContent.trim(), input: jsonState })
    : "";

  const jsonSections = normalizeSections(jsonState?.sections);
  const jsonPhotos = Array.isArray(jsonState?.photos) ? jsonState.photos.map((photo) => normalizePhoto(photo)) : [];
  const basePhotos = originalPhotos.length ? originalPhotos.map((photo) => normalizePhoto(photo)) : jsonPhotos;

  const mergePhotos = (savedPhotos) => {
    if (!Array.isArray(savedPhotos) || !savedPhotos.length) {
      return basePhotos.map((photo) => normalizePhoto(photo));
    }

    const baseBySrc = new Map(basePhotos.map((photo) => [photo.src, photo]));
    const merged = savedPhotos
      .filter((photo) => typeof photo?.src === "string" && (baseBySrc.has(normalizePhoto(photo).src) || !basePhotos.length))
      .map((photo) => normalizePhoto(photo, baseBySrc.get(normalizePhoto(photo).src)));

    basePhotos.forEach((photo) => {
      if (!merged.some((item) => item.src === photo.src)) {
        merged.push(normalizePhoto(photo));
      }
    });

    return merged;
  };

  const shouldUseSavedState = !jsonState && Boolean(savedState);
  const preferredState = jsonState || savedState;

  const state = {
    title: (typeof preferredState?.title === "string" && preferredState.title.trim()) || title.textContent.trim(),
    titleFontFamily: normalizeAlbumTitleFontFamily(preferredState?.titleFontFamily),
    titleScale: normalizeTitleScale(preferredState?.titleScale),
    mobileRotateClockwise: normalizeMobileRotateClockwise(preferredState?.mobileRotateClockwise),
    spacing: ["tight", "default", "airy"].includes(preferredState?.spacing) ? preferredState.spacing : "tight",
    topSpacer: normalizeTopSpacer(preferredState?.topSpacer),
    effect: normalizeEffect(preferredState?.effect),
    effectSettings: normalizeEffectSettings(preferredState?.effectSettings),
    intro: normalizeIntro(preferredState?.intro),
    photos: mergePhotos(preferredState?.photos),
    sections: normalizeSections(preferredState?.sections).length
      ? normalizeSections(preferredState?.sections)
      : jsonSections.length && !shouldUseSavedState
        ? jsonSections
        : deriveSectionsFromPhotos(basePhotos),
    editing: false,
    previewing: false,
    showDeleted: false,
    runtimeMobileSideviewActive: false,
    selectedPhotoIndexes: new Set(),
    activeSettingsPhotoIndex: null,
    zoomedOut: false,
    previewRotated: false,
  };

  const zoomButtons = actionGroups.map((group) => {
    const button = document.createElement("button");
    const isMobile = group.classList.contains("mobile-home-section");
    button.className = isMobile ? "mobile-home-button album-zoom-button" : "preview-toggle album-zoom-button";
    button.type = "button";
    button.dataset.albumAction = "zoom-out";
    button.textContent = "Zoom Out";
    if (isMobile) {
      const exportButton = group.querySelector('[data-album-action="export"]');
      group.insertBefore(button, exportButton || null);
    } else {
      const previewButton = group.querySelector('[data-album-action="preview"]');
      group.insertBefore(button, previewButton ? previewButton.nextSibling : null);
    }
    return button;
  });

  const clearSelectionButtons = actionGroups.map((group) => {
    const button = document.createElement("button");
    const isMobile = group.classList.contains("mobile-home-section");
    button.className = isMobile ? "mobile-home-button album-unselect-button" : "preview-toggle album-unselect-button";
    button.type = "button";
    button.dataset.albumAction = "clear-selection";
    button.textContent = "Unselect";
    if (isMobile) {
      const homeLink = group.querySelector('a.mobile-home-button[href="/index.html"]');
      group.insertBefore(button, homeLink ? homeLink.nextSibling : group.firstChild);
    } else {
      group.insertBefore(button, group.firstChild);
    }
    return button;
  });

  const rotatePreviewButtons = actionGroups.map((group) => {
    const button = document.createElement("button");
    const isMobile = group.classList.contains("mobile-home-section");
    button.className = isMobile ? "mobile-home-button album-rotate-preview-button" : "preview-toggle album-rotate-preview-button";
    button.type = "button";
    button.dataset.albumAction = "rotate-preview";
    button.textContent = "Rotated View";
    if (isMobile) {
      const saveButton = group.querySelector('[data-album-action="save"]');
      group.insertBefore(button, saveButton || null);
    } else {
      const editButton = group.querySelector('[data-album-action="edit"]');
      group.insertBefore(button, editButton || null);
    }
    return button;
  });

  const persistLocalState = (dirty = true, syncedSignature = "") => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(getPersistedAlbumState({ state, galleryId, currentSyncedSignature, dirty, syncedSignature }))
    );
  };

  if (!shouldUseSavedState && jsonState) {
    persistLocalState(false, currentSyncedSignature);
  }

  const ensureLandscapeState = (photo) => {
    if (!photo.landscape && photo.size === "extended") {
      photo.size = "full";
    }
  };

  state.photos.forEach(ensureLandscapeState);

  const save = () => {
    persistLocalState(true, "");
  };

  const jumpToSubalbum = (headingId) => {
    if (!headingId) {
      return;
    }

    grid.__ensureAnchorRendered?.({ type: "heading", id: headingId });
    const target = grid.querySelector(`#${CSS.escape(headingId)}`);
    if (!(target instanceof HTMLElement)) {
      return;
    }

    window.requestAnimationFrame(() => {
      markProgrammaticScroll("subalbum");
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  [subalbumIndex, subalbumFooterIndex].forEach((container) => {
    container?.addEventListener("click", (event) => {
      const link = event.target.closest(".subalbum-index-link");
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }

      const hash = link.getAttribute("href") || "";
      if (!hash.startsWith("#subalbum-")) {
        return;
      }

      event.preventDefault();
      jumpToSubalbum(hash.slice(1));
    });
  });

  let saveState = {
    pending: false,
    message: "",
  };
  const prefetchedPrioritySources = new Set();
  let hasMarkedReady = false;
  let cleanupRenderedBlocks = () => {};
  let landscapeRenderQueued = false;
  let activeTitleEdit = null;
  const debugEntries = [];
  const debugPanel = document.createElement("aside");
  const debugTitle = document.createElement("div");
  const debugLog = document.createElement("div");
  let debugProgrammaticScrollUntil = 0;
  let lastDebugScrollY = window.scrollY || window.pageYOffset || 0;
  let lastDebugScrollTs = performance.now();
  let lastDebugResizeTs = 0;
  debugPanel.className = "album-debug-panel";
  debugTitle.className = "album-debug-title";
  debugTitle.textContent = "Debug";
  debugLog.className = "album-debug-log";
  debugPanel.append(debugTitle, debugLog);
  body.appendChild(debugPanel);

  const viewportAnchorY = () => (window.visualViewport?.height || window.innerHeight) * 0.33;

  const waitForInitialViewportStability = async () => {
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    });
  };

  const renderDebugPanel = () => {
    debugLog.innerHTML = debugEntries
      .slice()
      .reverse()
      .map((entry) => {
        const count = entry.count > 1 ? ` x${entry.count}` : "";
        return `<div class="album-debug-entry"><span class="album-debug-time">${entry.time}</span><span class="album-debug-label">${entry.label}${count}</span><span class="album-debug-details">${entry.summary}</span></div>`;
      })
      .join("");
  };

  const logDebug = (label, details = {}) => {
    const time = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const summary = Object.entries(details)
      .filter(([, value]) => value !== "" && value !== null && value !== undefined && value !== false)
      .map(([key, value]) => `${key}:${value}`)
      .join(" ");
    const key = `${label}|${summary}`;
    const lastEntry = debugEntries[debugEntries.length - 1];

    if (lastEntry?.key === key) {
      lastEntry.count += 1;
      lastEntry.time = time;
    } else {
      debugEntries.push({
        key,
        label,
        summary,
        time,
        count: 1,
      });
      if (debugEntries.length > 28) {
        debugEntries.splice(0, debugEntries.length - 28);
      }
    }

    renderDebugPanel();
  };

  const markProgrammaticScroll = (reason) => {
    debugProgrammaticScrollUntil = performance.now() + 1400;
    logDebug("programmatic-scroll", {
      reason,
      y: Math.round(window.scrollY || window.pageYOffset || 0),
    });
  };

  const captureRenderAnchor = () => {
    const candidates = [
      ...Array.from(grid.querySelectorAll(".editable-photo")),
      ...Array.from(grid.querySelectorAll(".subalbum-section-heading")),
    ];

    if (!candidates.length) {
      return null;
    }

    const anchorLine = viewportAnchorY();
    let chosen = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    candidates.forEach((candidate) => {
      const rect = candidate.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= (window.visualViewport?.height || window.innerHeight)) {
        return;
      }

      const distance = Math.abs(rect.top - anchorLine);
      if (distance < closestDistance) {
        chosen = { element: candidate, rect };
        closestDistance = distance;
      }
    });

    if (!chosen) {
      return null;
    }

    const { element, rect } = chosen;
    const topOffset = rect.top - anchorLine;

    if (element.classList.contains("editable-photo")) {
      return {
        type: "photo",
        src: element.dataset.src || "",
        topOffset,
      };
    }

    if (element.id) {
      return {
        type: "heading",
        id: element.id,
        topOffset,
      };
    }

    return null;
  };

  const restoreRenderAnchor = (anchor) => {
    if (!anchor) {
      return;
    }

    let target = null;
    if (anchor.type === "photo" && anchor.src) {
      target = Array.from(grid.querySelectorAll(".editable-photo")).find((element) => element.dataset.src === anchor.src) || null;
    } else if (anchor.type === "heading" && anchor.id) {
      target = grid.querySelector(`#${CSS.escape(anchor.id)}`);
    }

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const desiredTop = viewportAnchorY() + anchor.topOffset;
    const delta = target.getBoundingClientRect().top - desiredTop;
    if (Math.abs(delta) > 1) {
      markProgrammaticScroll("restore-anchor");
      logDebug("restore-anchor", {
        target: anchor.type === "photo" ? "photo" : anchor.id,
        delta: delta.toFixed(1),
      });
      window.scrollBy(0, delta);
    }
  };

  const queueLandscapeRender = () => {
    if (hasMarkedReady || landscapeRenderQueued) {
      return;
    }

    landscapeRenderQueued = true;
    logDebug("landscape-rerender", {});
    window.requestAnimationFrame(() => {
      landscapeRenderQueued = false;
      render();
    });
  };

  const loadLandscapeState = (photo, index) => {
    if (typeof photo.landscape === "boolean") {
      return;
    }

    const image = new window.Image();
    image.addEventListener("load", () => {
      const isLandscape = image.naturalWidth > image.naturalHeight;
      if (state.photos[index]) {
        state.photos[index].landscape = isLandscape;
        state.photos[index].aspectRatio = image.naturalWidth / image.naturalHeight;
        ensureLandscapeState(state.photos[index]);
        save();
        queueLandscapeRender();
      }
    });
    image.src = photo.src;
  };

  state.photos.forEach((photo, index) => {
    loadLandscapeState(photo, index);
  });

  const finishTitleInlineEdit = ({ cancel = false } = {}) => {
    if (!activeTitleEdit) {
      return;
    }

    if (cancel) {
      state.title = activeTitleEdit.originalValue;
      title.textContent = state.title;
      save();
    }

    activeTitleEdit = null;
    render();
  };

  const applyTitleDisplay = (element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    if (activeTitleEdit?.element === element) {
      return;
    }

    element.classList.remove("is-inline-editing", "is-inline-placeholder");
    if (state.title.trim()) {
      element.textContent = state.title;
    } else if (state.editing) {
      element.textContent = "Add title";
      element.classList.add("is-inline-placeholder");
    } else {
      element.textContent = "";
    }
  };

  const startTitleInlineEdit = (element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    if (activeTitleEdit?.element === element) {
      return;
    }

    if (activeTitleEdit) {
      finishTitleInlineEdit();
    }

    activeTitleEdit = {
      element,
      originalValue: state.title,
    };

    const input = document.createElement("input");
    input.className = "inline-edit-input inline-edit-title";
    input.type = "text";
    input.value = state.title;
    input.setAttribute("aria-label", "Album title");

    input.addEventListener("input", () => {
      state.title = input.value;
      save();
    });

    input.addEventListener("blur", () => {
      finishTitleInlineEdit();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finishTitleInlineEdit({ cancel: true });
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });

    element.replaceChildren(input);
    element.classList.remove("is-inline-placeholder");
    element.classList.add("is-inline-editing");

    window.requestAnimationFrame(() => {
      input.focus();
      const length = input.value.length;
      input.setSelectionRange?.(length, length);
    });
  };

  const headerControls = document.createElement("div");
  headerControls.className = "header-edit-controls";
  header.appendChild(headerControls);
  const headerReactUi = mountAlbumReactHeaderUi({ container: headerControls });

  const effects = createAlbumEffects({
    body,
    grid,
    state,
    normalizeEffect,
    logDebug,
  });
  effects.bind();
  let lastReactiveSideviewState = getHeroIntroState(state).hasMobileSideviewHero;

  const exportSettings = () => {
    const json = JSON.stringify(serializeState(state, galleryId), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${galleryId}.settings.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const saveSettingsToGitHub = async () => {
    if (!canonicalSettingsPath || saveState.pending) {
      return;
    }

    saveState = {
      pending: true,
      message: "Saving...",
    };
    render();

    try {
      const response = await fetch("/api/save-gallery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          galleryId,
          settingsPath: canonicalSettingsPath,
          settings: serializeState(state, galleryId),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Save failed");
      }

      const savedSignature = getSettingsSignature({
        galleryId,
        titleFallback: title.textContent.trim(),
        input: serializeState(state, galleryId),
      });
      currentSyncedSignature = savedSignature;
      persistLocalState(false, savedSignature);
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

  const movePhoto = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.photos.length) {
      return;
    }

    [state.photos[index], state.photos[targetIndex]] = [state.photos[targetIndex], state.photos[index]];
    save();
    render();
  };

  const getSelectedIndexes = () => Array.from(state.selectedPhotoIndexes).sort((a, b) => a - b);

  const clampIndexSelection = () => {
    state.selectedPhotoIndexes = new Set(
      getSelectedIndexes().filter((index) => Number.isInteger(index) && index >= 0 && index < state.photos.length)
    );
    if (
      !Number.isInteger(state.activeSettingsPhotoIndex) ||
      !state.selectedPhotoIndexes.has(state.activeSettingsPhotoIndex)
    ) {
      state.activeSettingsPhotoIndex = getSelectedIndexes()[0] ?? null;
    }
  };

  const togglePhotoSelection = (index, forceChecked) => {
    if (!Number.isInteger(index) || index < 0 || index >= state.photos.length) {
      return;
    }
    const nextChecked = typeof forceChecked === "boolean" ? forceChecked : !state.selectedPhotoIndexes.has(index);
    if (nextChecked) {
      state.selectedPhotoIndexes.add(index);
      state.activeSettingsPhotoIndex = index;
    } else {
      state.selectedPhotoIndexes.delete(index);
      if (state.activeSettingsPhotoIndex === index) {
        state.activeSettingsPhotoIndex = getSelectedIndexes().find((selectedIndex) => selectedIndex !== index) ?? null;
      }
    }
    render();
  };

  const applyToSelection = (callback, finalize = () => {}) => {
    const indexes = getSelectedIndexes();
    if (!indexes.length) {
      return false;
    }
    indexes.forEach((index) => {
      if (state.photos[index]) {
        callback(state.photos[index], index);
      }
    });
    finalize(indexes);
    clampIndexSelection();
    save();
    render();
    return true;
  };

  const moveSelectedPhotos = (direction) => {
    const indexes = getSelectedIndexes();
    if (!indexes.length) {
      return;
    }

    if (direction < 0) {
      for (let cursor = 0; cursor < indexes.length; cursor += 1) {
        const index = indexes[cursor];
        if (index === 0 || state.selectedPhotoIndexes.has(index - 1)) {
          continue;
        }
        [state.photos[index - 1], state.photos[index]] = [state.photos[index], state.photos[index - 1]];
        state.selectedPhotoIndexes.delete(index);
        state.selectedPhotoIndexes.add(index - 1);
      }
    } else {
      for (let cursor = indexes.length - 1; cursor >= 0; cursor -= 1) {
        const index = indexes[cursor];
        if (index >= state.photos.length - 1 || state.selectedPhotoIndexes.has(index + 1)) {
          continue;
        }
        [state.photos[index + 1], state.photos[index]] = [state.photos[index], state.photos[index + 1]];
        state.selectedPhotoIndexes.delete(index);
        state.selectedPhotoIndexes.add(index + 1);
      }
    }

    save();
    render();
  };

  const normalizeDeletedNeighbors = (index) => {
    const current = state.photos[index];
    if (!current) {
      return;
    }

    if (current.deleted) {
      current.joinWithPrevious = false;
    }

    const next = state.photos[index + 1];
    if (next?.joinWithPrevious && !canJoinPhoto(state, index + 1, normalizeEffect)) {
      next.joinWithPrevious = false;
    }

    if (current.deleted && state.intro.heroImageSrc === current.src) {
      state.intro.heroImageSrc = "";
    }
  };

  const updateSpacer = (index, value) => {
    const numeric = Math.max(0, Math.min(50, Number(value) || 0));
    state.photos[index].spacerAfter = numeric;
    save();
    render();
  };

  const normalizeAllJoinStates = () => {
    state.photos.forEach((photo, index) => {
      if (photo.deleted) {
        photo.joinWithPrevious = false;
        return;
      }
      if (photo.joinWithPrevious && !canJoinPhoto(state, index, normalizeEffect)) {
        photo.joinWithPrevious = false;
      }
    });
  };

  const getPropagationIndexes = (sourceIndex) => {
    const selectedIndexes = getSelectedIndexes();
    if (selectedIndexes.length <= 1 || !state.selectedPhotoIndexes.has(sourceIndex)) {
      return [sourceIndex];
    }
    return selectedIndexes;
  };

  const applyPhotoChange = ({ sourceIndex, callback, finalize = () => {} }) => {
    const indexes = getPropagationIndexes(sourceIndex);
    indexes.forEach((index) => {
      const photo = state.photos[index];
      if (photo) {
        callback(photo, index);
      }
    });
    finalize(indexes);
    clampIndexSelection();
    save();
    render();
  };

  const syncSpacerClipboardUi = () => {
    grid.querySelectorAll(".spacer-paste-button").forEach((button) => {
      if (button.closest(".editable-photo.is-deleted-photo")) {
        return;
      }

      button.disabled = !Number.isFinite(spacerClipboard);
    });
  };

  const copySpacerValue = (fromIndex) => {
    if (fromIndex < 0 || fromIndex >= state.photos.length) {
      return;
    }

    if (state.photos[fromIndex].deleted) {
      return;
    }

    spacerClipboard = Math.max(0, Math.min(50, Number(state.photos[fromIndex].spacerAfter) || 0));
    syncSpacerClipboardUi();
  };

  const pasteSpacerValue = (toIndex) => {
    if (toIndex < 0 || toIndex >= state.photos.length || !Number.isFinite(spacerClipboard)) {
      return;
    }

    if (state.photos[toIndex].deleted) {
      return;
    }

    updateSpacer(toIndex, spacerClipboard);
  };

  const syncSpacerUiForIndexes = (indexes) => {
    indexes.forEach((photoIndex) => {
      const photo = state.photos[photoIndex];
      if (!photo) {
        return;
      }
      const photoWrapper = grid.querySelector(`.editable-photo[data-index="${photoIndex}"]`);
      photoWrapper?.classList.toggle("has-spacer", photo.spacerAfter > 0);
      photoWrapper?.style.setProperty("--photo-after-space", `${photo.spacerAfter.toFixed(2)}rem`);
      const valueLabel = photoWrapper?.querySelector(".spacer-value");
      if (valueLabel) {
        valueLabel.textContent = `${photo.spacerAfter.toFixed(2)}rem`;
      }
      const slider = photoWrapper?.querySelector(".spacer-slider");
      if (slider) {
        slider.value = String(photo.spacerAfter);
      }
    });
  };

  const updateEffectSetting = (effectName, key, value) => {
    if (!state.effectSettings[effectName]) {
      return;
    }
    const normalized = normalizeEffectSettings({
      ...state.effectSettings,
      [effectName]: {
        ...state.effectSettings[effectName],
        [key]: value,
      },
    });
    state.effectSettings = normalized;
    save();
    render();
    effects.queueEffectUpdate();
  };

  const syncModeUi = () => {
    toggleButtons.forEach((button) => {
      button.textContent = state.editing ? "Done" : "Edit";
    });
    body.classList.toggle("is-editing", state.editing);
    body.classList.toggle("is-previewing", state.editing && state.previewing);
    body.classList.toggle("is-zoomed-out-edit", state.editing && state.zoomedOut);
    body.classList.toggle("has-manual-rotate-preview", state.editing && state.previewRotated);
    previewButtons.forEach((button) => {
      button.textContent = state.previewing ? "Show Editor" : "Preview";
      button.setAttribute("aria-pressed", state.previewing ? "true" : "false");
    });
    zoomButtons.forEach((button) => {
      button.textContent = state.zoomedOut ? "Normal View" : "Zoom Out";
      button.disabled = !state.editing;
      button.setAttribute("aria-pressed", state.editing && state.zoomedOut ? "true" : "false");
    });
    clearSelectionButtons.forEach((button) => {
      button.disabled = !state.editing || state.selectedPhotoIndexes.size === 0;
    });
    rotatePreviewButtons.forEach((button) => {
      button.textContent = state.previewRotated ? "Normal Rotation" : "Rotated View";
      button.disabled = !state.editing;
      button.setAttribute("aria-pressed", state.editing && state.previewRotated ? "true" : "false");
    });
    renderDebugPanel();
  };

  const logScrollJump = () => {
    const now = performance.now();
    const currentY = window.scrollY || window.pageYOffset || 0;
    const deltaY = currentY - lastDebugScrollY;
    const deltaTime = now - lastDebugScrollTs;
    const isProgrammatic = now < debugProgrammaticScrollUntil;

    if (!isProgrammatic && deltaTime < 450 && deltaY < -80) {
      logDebug("scroll-jump", {
        from: Math.round(lastDebugScrollY),
        to: Math.round(currentY),
        dy: Math.round(deltaY),
      });
    }

    lastDebugScrollY = currentY;
    lastDebugScrollTs = now;
  };

  const logResizeEvent = (label) => {
    const now = performance.now();
    if (now - lastDebugResizeTs < 120) {
      return;
    }

    lastDebugResizeTs = now;
    logDebug(label, {
      w: Math.round(window.innerWidth || document.documentElement.clientWidth || 0),
      h: Math.round(window.innerHeight || document.documentElement.clientHeight || 0),
      y: Math.round(window.scrollY || window.pageYOffset || 0),
    });
  };

  const observeSizeShifts = (element, label) => {
    if (!(element instanceof HTMLElement) || typeof window.ResizeObserver !== "function") {
      return () => {};
    }

    let lastHeight = Math.round(element.getBoundingClientRect().height);
    const observer = new window.ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const nextHeight = Math.round(entry.contentRect.height);
      const delta = nextHeight - lastHeight;
      if (Math.abs(delta) >= 24) {
        logDebug("layout-shift", {
          target: label,
          from: lastHeight,
          to: nextHeight,
          dy: delta,
          y: Math.round(window.scrollY || window.pageYOffset || 0),
        });
      }
      lastHeight = nextHeight;
    });

    observer.observe(element);
    return () => observer.disconnect();
  };

  const cleanupHeaderSizeObserver = observeSizeShifts(header, "header");
  const cleanupGridSizeObserver = observeSizeShifts(grid, "grid");
  window.addEventListener("scroll", logScrollJump, { passive: true });
  document.addEventListener("scroll", logScrollJump, { passive: true, capture: true });
  window.addEventListener("resize", () => logResizeEvent("resize"));
  window.addEventListener("orientationchange", () => logResizeEvent("orientation"));
  window.visualViewport?.addEventListener?.("resize", () => logResizeEvent("visual-viewport"));
  window.visualViewport?.addEventListener?.("scroll", () => {
    logDebug("visual-scroll", {
      top: Math.round(window.visualViewport?.offsetTop || 0),
      left: Math.round(window.visualViewport?.offsetLeft || 0),
      y: Math.round(window.scrollY || window.pageYOffset || 0),
    });
  });
  window.addEventListener("hashchange", () => {
    logDebug("hashchange", {
      hash: window.location.hash || "-",
      y: Math.round(window.scrollY || window.pageYOffset || 0),
    });
  });
  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (!target.matches("input, textarea, select, button, a")) {
        return;
      }
      logDebug("focus", {
        tag: target.tagName.toLowerCase(),
        cls: target.className || "-",
      });
    },
    true
  );

  const render = () => {
    const renderAnchor = hasMarkedReady ? captureRenderAnchor() : null;
    logDebug("render", {
      anchor: renderAnchor?.type || "none",
      editing: state.editing ? 1 : 0,
      sideview: state.runtimeMobileSideviewActive ? 1 : 0,
    });
    body.style.setProperty("--album-title-scale", String(normalizeTitleScale(state.titleScale)));
    body.style.setProperty("--album-title-font-family", getAlbumTitleFontFamilyCssValue(state.titleFontFamily));
    grid.style.setProperty("--album-gap", spacingMap[state.spacing]);
    topSpacerSection?.style.setProperty("--album-top-spacer-height", `${normalizeTopSpacer(state.topSpacer)}rem`);
    syncModeUi();
    headerReactUi.render({
      titleFontFamily: state.titleFontFamily,
      titleScale: normalizeTitleScale(state.titleScale),
      topSpacer: normalizeTopSpacer(state.topSpacer),
      spacing: state.spacing,
      effect: state.effect,
      effectSettings: state.effectSettings,
      introMode: state.intro.mode,
      showArrow: state.intro.showArrow,
      mobileRotateClockwise: state.mobileRotateClockwise,
      showDeleted: state.showDeleted,
      onTitleFontFamilyChange: (value) => {
        state.titleFontFamily = normalizeAlbumTitleFontFamily(value, state.titleFontFamily);
        body.style.setProperty("--album-title-font-family", getAlbumTitleFontFamilyCssValue(state.titleFontFamily));
        save();
        render();
      },
      onTitleScaleChange: (value) => {
        state.titleScale = normalizeTitleScale(value, state.titleScale);
        body.style.setProperty("--album-title-scale", String(state.titleScale));
        save();
        render();
      },
      onTopSpacerChange: (value) => {
        state.topSpacer = normalizeTopSpacer(value, state.topSpacer);
        if (topSpacerSection) {
          topSpacerSection.style.setProperty("--album-top-spacer-height", `${state.topSpacer}rem`);
        }
        save();
        render();
      },
      onSpacingChange: (value) => {
        state.spacing = value;
        grid.style.setProperty("--album-gap", spacingMap[state.spacing]);
        save();
        render();
      },
      onEffectChange: (value) => {
        state.effect = normalizeEffect(value);
        save();
        render();
        effects.queueEffectUpdate();
      },
      onEffectSettingChange: (effectName, key, value) => {
        updateEffectSetting(effectName, key, value);
      },
      onIntroModeChange: (value) => {
        state.intro.mode = value === "hero" ? "hero" : "default";
        save();
        render();
      },
      onShowArrowChange: (value) => {
        state.intro.showArrow = value === "true";
        save();
        render();
      },
      onMobileRotateChange: (value) => {
        state.mobileRotateClockwise = value === "true";
        save();
        render();
      },
      onToggleDeleted: () => {
        state.showDeleted = !state.showDeleted;
        render();
      },
    });
    saveButtons.forEach((button) => {
      button.textContent = saveState.pending ? "Saving..." : saveState.message || "Save";
      button.disabled = saveState.pending;
    });
    exportButtons.forEach((button) => {
      button.textContent = "Export JSON";
    });

    const heroIntroState = renderHeroIntro({
      heroIntro,
      state,
      siteBrand,
    });
    const { hasHeroIntro, hasMobileSideviewHero } = heroIntroState;
    state.runtimeMobileSideviewActive = hasMobileSideviewHero;
    logDebug("hero-state", {
      intro: hasHeroIntro ? 1 : 0,
      sideview: hasMobileSideviewHero ? 1 : 0,
    });
    const heroTitle = heroIntro?.querySelector(".album-hero-title");
    applyTitleDisplay(title);
    if (heroTitle instanceof HTMLElement) {
      applyTitleDisplay(heroTitle);
    }
    body.classList.toggle("has-hero-intro", hasHeroIntro);
    body.classList.toggle("has-mobile-sideview-mode", hasMobileSideviewHero);
    body.classList.toggle("has-mobile-sideview-hero", hasMobileSideviewHero);
    body.classList.toggle("has-mobile-sideview-grid", hasMobileSideviewHero);

    renderSubalbumIndexes({
      state,
      containers: [subalbumIndex, subalbumFooterIndex],
    });
    header.classList.toggle("has-top-subalbum-index", state.sections.length >= 2 && Boolean(subalbumIndex));
    header.classList.toggle("has-mobile-sideview-hero", hasMobileSideviewHero);

    const blocks = buildAlbumBlocks({
      state,
      normalizeEffect,
      includeDeleted: state.editing && !state.previewing && state.showDeleted,
    });
    const priorityPhotos = collectHeadingAdjacentPhotos(blocks, 2).filter((photo) => !photo.deleted);
    const priorityPhotoSources = new Set(priorityPhotos.map((photo) => photo.src));

    priorityPhotos.forEach((photo) => {
      if (!photo.src || prefetchedPrioritySources.has(photo.src)) {
        return;
      }

      prefetchedPrioritySources.add(photo.src);
      const preloadImage = new window.Image();
      preloadImage.decoding = "async";
      preloadImage.loading = "eager";
      preloadImage.setAttribute?.("fetchpriority", "high");
      preloadImage.src = photo.src;
    });

    cleanupRenderedBlocks();
    cleanupRenderedBlocks = mountAlbumBlocks({
      grid,
      blocks,
      state,
      normalizeEffect,
      anchor: renderAnchor,
      priorityPhotoSources,
      onChunkRendered: () => {
        logDebug("chunk", {
          photos: grid.querySelectorAll(".editable-photo").length,
        });
        observeReveals(grid);
        effects.updateMobileExtendedLayout();
        effects.updateSpotlightLayout();
        effects.refreshSpotlightObservers();
        effects.queueEffectUpdate();
      },
    });
    syncSpacerClipboardUi();
    observeReveals(heroIntro || document);

    effects.queueEffectUpdate();
    window.requestAnimationFrame(() => {
      restoreRenderAnchor(renderAnchor);
      effects.updateMobileExtendedLayout();
      effects.updateSpotlightLayout();
      effects.refreshSpotlightObservers();
      if (!hasMarkedReady) {
        hasMarkedReady = true;
        body.classList.add("is-ready");
      }
    });
  };

  const syncReactiveSideviewRender = () => {
    const nextState = getHeroIntroState(state).hasMobileSideviewHero;
    if (nextState === lastReactiveSideviewState) {
      return;
    }
    logDebug("sideview-rerender", {
      next: nextState ? 1 : 0,
    });
    lastReactiveSideviewState = nextState;
    render();
  };

  window.addEventListener("orientationchange", syncReactiveSideviewRender);
  window.screen?.orientation?.addEventListener?.("change", syncReactiveSideviewRender);

  grid.addEventListener("click", (event) => {
    const selectionButton = event.target.closest(".photo-select-indicator");
    if (selectionButton) {
      const wrapper = event.target.closest(".editable-photo");
      if (!wrapper || !state.editing) {
        return;
      }
      event.preventDefault();
      togglePhotoSelection(Number(wrapper.dataset.index));
      return;
    }

    const button = event.target.closest(
      ".photo-control-button, .spacer-reset, .spacer-copy-button, .photo-join-button, .photo-hero-button, .photo-delete-button"
    );
    if (!button) {
      return;
    }

    const wrapper = event.target.closest(".editable-photo");
    if (!wrapper) {
      return;
    }

    event.preventDefault();
    const index = Number(wrapper.dataset.index);
    const action = button.dataset.action;

    if (action === "up") {
      const shouldMoveSelection = state.selectedPhotoIndexes.has(index) && getSelectedIndexes().length > 1;
      if (shouldMoveSelection) {
        moveSelectedPhotos(-1);
      } else {
        movePhoto(index, -1);
      }
    } else if (action === "down") {
      const shouldMoveSelection = state.selectedPhotoIndexes.has(index) && getSelectedIndexes().length > 1;
      if (shouldMoveSelection) {
        moveSelectedPhotos(1);
      } else {
        movePhoto(index, 1);
      }
    } else if (action === "hero-toggle") {
      if (state.photos[index].deleted) {
        return;
      }
      state.intro.heroImageSrc = state.photos[index].src;
      save();
      render();
    } else if (action === "spacer-reset") {
      applyPhotoChange({
        sourceIndex: index,
        callback: (photo) => {
          photo.spacerAfter = 0;
        },
        finalize: (indexes) => {
          syncSpacerUiForIndexes(indexes);
        },
      });
    } else if (action === "spacer-copy-value") {
      copySpacerValue(index);
    } else if (action === "spacer-paste-value") {
      if (!Number.isFinite(spacerClipboard)) {
        return;
      }
      applyPhotoChange({
        sourceIndex: index,
        callback: (photo) => {
          if (!photo.deleted) {
            photo.spacerAfter = Math.max(0, Math.min(50, Number(spacerClipboard) || 0));
          }
        },
        finalize: (indexes) => {
          syncSpacerUiForIndexes(indexes);
        },
      });
    } else if (action === "edit-spacer-value") {
      const valueButton = button.closest(".spacer-value-button");
      if (!(valueButton instanceof HTMLButtonElement)) {
        return;
      }

      const currentValue = Number(state.photos[index]?.spacerAfter) || 0;
      const nextValue = window.prompt("Space after image (rem)", currentValue.toFixed(2));
      if (nextValue === null) {
        return;
      }

      applyPhotoChange({
        sourceIndex: index,
        callback: (photo) => {
          photo.spacerAfter = Math.max(0, Math.min(50, Number(nextValue) || 0));
        },
        finalize: (indexes) => {
          syncSpacerUiForIndexes(indexes);
        },
      });
    } else if (action === "join-toggle") {
      const shouldJoin = !state.photos[index].joinWithPrevious;
      applyPhotoChange({
        sourceIndex: index,
        callback: (photo, photoIndex) => {
          if (shouldJoin) {
            photo.joinWithPrevious = canJoinPhoto(state, photoIndex, normalizeEffect);
          } else {
            photo.joinWithPrevious = false;
          }
        },
        finalize: () => {
          normalizeAllJoinStates();
        },
      });
    } else if (action === "delete-toggle") {
      const shouldDelete = !state.photos[index].deleted;
      applyPhotoChange({
        sourceIndex: index,
        callback: (photo, photoIndex) => {
          photo.deleted = shouldDelete;
          normalizeDeletedNeighbors(photoIndex);
        },
        finalize: () => {
          normalizeAllJoinStates();
        },
      });
    }
  });

  grid.addEventListener("click", (event) => {
    if (!state.editing) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest(".photo-controls, .spacer-control, .photo-select-indicator, a, button, select, input, label")) {
      return;
    }

    const wrapper = target.closest(".editable-photo");
    if (!wrapper) {
      return;
    }

    const image = target.closest("img");
    const stage = target.closest(".photo-stage");
    if (!image && !stage) {
      return;
    }

    event.preventDefault();
    togglePhotoSelection(Number(wrapper.dataset.index));
  });

  grid.addEventListener("change", (event) => {
    const effectNumber = event.target.closest(".photo-effect-setting-number");
    if (effectNumber) {
      updateEffectSetting(effectNumber.dataset.effectName, effectNumber.dataset.effectKey, effectNumber.value);
      return;
    }

    const select = event.target.closest(".photo-size-select, .photo-effect-select");
    const wrapper = event.target.closest(".editable-photo");
    if (!wrapper) {
      return;
    }

    const index = Number(wrapper.dataset.index);
    if (select?.classList.contains("photo-size-select")) {
      applyPhotoChange({
        sourceIndex: index,
        callback: (photo) => {
          if (select.value === "extended" && photo.landscape !== true) {
            photo.size = "full";
          } else if (sizeOptions.includes(select.value)) {
            photo.size = select.value;
          }
        },
      });
      return;
    }

    if (select?.classList.contains("photo-effect-select")) {
      applyPhotoChange({
        sourceIndex: index,
        callback: (photo) => {
          photo.effect = normalizeEffect(select.value);
        },
      });
      return;
    }

    const slider = event.target.closest(".spacer-slider");
    if (slider) {
      updateSpacer(index, slider.value);
    }
  });

  grid.addEventListener("input", (event) => {
    const effectSlider = event.target.closest(".photo-effect-setting-slider");
    if (effectSlider) {
      const wrapper = effectSlider.closest(".photo-effect-live-field");
      const numberInput = wrapper?.querySelector(".photo-effect-setting-number");
      if (numberInput) {
        numberInput.value = effectSlider.value;
      }
      updateEffectSetting(effectSlider.dataset.effectName, effectSlider.dataset.effectKey, effectSlider.value);
      return;
    }

    const slider = event.target.closest(".spacer-slider");
    if (!slider) {
      return;
    }

    const wrapper = event.target.closest(".editable-photo");
    if (!wrapper) {
      return;
    }

    const index = Number(wrapper.dataset.index);
    const indexes = getPropagationIndexes(index);
    indexes.forEach((photoIndex) => {
      const photo = state.photos[photoIndex];
      if (!photo) {
        return;
      }
      photo.spacerAfter = Number(slider.value) || 0;
      const photoWrapper = grid.querySelector(`.editable-photo[data-index="${photoIndex}"]`);
      photoWrapper?.classList.toggle("has-spacer", photo.spacerAfter > 0);
    });
    syncSpacerUiForIndexes(indexes);
    save();
  });

  toggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (activeTitleEdit) {
        finishTitleInlineEdit();
      }
      const requiresRerender = state.showDeleted;
      state.editing = !state.editing;
      if (!state.editing) {
        state.previewing = false;
        state.selectedPhotoIndexes.clear();
        state.activeSettingsPhotoIndex = null;
        state.zoomedOut = false;
        state.previewRotated = false;
      }
      if (requiresRerender) {
        render();
        return;
      }

      syncModeUi();
    });
  });

  previewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.editing) {
        return;
      }

      const requiresRerender = state.showDeleted;
      state.previewing = !state.previewing;
      if (requiresRerender) {
        render();
        return;
      }

      syncModeUi();
    });
  });

  zoomButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.editing) {
        return;
      }
      state.zoomedOut = !state.zoomedOut;
      render();
    });
  });

  rotatePreviewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.editing) {
        return;
      }
      state.previewRotated = !state.previewRotated;
      render();
    });
  });

  clearSelectionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.editing || state.selectedPhotoIndexes.size === 0) {
        return;
      }
      state.selectedPhotoIndexes.clear();
      render();
    });
  });

  header.addEventListener("click", (event) => {
    if (!state.editing) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const titleTarget = target.closest(".masthead-title, .album-hero-title");
    if (!(titleTarget instanceof HTMLElement)) {
      return;
    }

    startTitleInlineEdit(titleTarget);
  });

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
    if (activeTitleEdit) {
      finishTitleInlineEdit();
    }
    const requiresRerender = state.showDeleted;
    state.editing = !state.editing;
    if (!state.editing) {
      state.previewing = false;
    }
    if (requiresRerender) {
      render();
      return;
    }

    syncModeUi();
  });

  saveButtons.forEach((button) => {
    button.addEventListener("click", saveSettingsToGitHub);
  });
  exportButtons.forEach((button) => {
    button.addEventListener("click", exportSettings);
  });

  await waitForInitialViewportStability();
  lastReactiveSideviewState = getHeroIntroState(state).hasMobileSideviewHero;
  render();
};
