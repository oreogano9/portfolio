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
  normalizeBlocks,
  normalizeContentBlock,
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
  const NORMAL_SPACER_REM = 17.75;
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

  const createBlockId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

  const buildDefaultBlocksFromPhotos = (photos) => {
    const blocks = [];
    photos.forEach((photo) => {
      blocks.push({
        type: "photo",
        photoId: photo.id || photo.src,
      });
      const spacerValue = Math.max(0, Math.min(50, Number(photo.spacerAfter) || 0));
      if (spacerValue > 0) {
        blocks.push({
          type: "space",
          id: createBlockId("space"),
          value: spacerValue,
        });
      }
    });
    return blocks;
  };

  const normalizeRuntimeBlocks = (photos, rawBlocks) => {
    const normalizedPhotos = photos.map((photo) => normalizePhoto(photo));
    const photoById = new Map(normalizedPhotos.map((photo) => [photo.id || photo.src, photo]));
    const photoIdsInBlocks = [];
    const extras = [];
    const normalizedBlocks = normalizeBlocks(rawBlocks);

    normalizedBlocks.forEach((block) => {
      if (block.type === "photo" && photoById.has(block.photoId)) {
        photoIdsInBlocks.push(block.photoId);
        extras.push(block);
        return;
      }
      if (block.type === "text" || block.type === "space") {
        extras.push(block);
      }
    });

    if (!normalizedBlocks.length || !photoIdsInBlocks.length) {
      return {
        photos: normalizedPhotos,
        blocks: buildDefaultBlocksFromPhotos(normalizedPhotos),
      };
    }

    const orderedPhotos = [];
    const seen = new Set();
    photoIdsInBlocks.forEach((photoId) => {
      const photo = photoById.get(photoId);
      if (!photo || seen.has(photoId)) {
        return;
      }
      seen.add(photoId);
      orderedPhotos.push(photo);
    });
    normalizedPhotos.forEach((photo) => {
      const photoId = photo.id || photo.src;
      if (!seen.has(photoId)) {
        orderedPhotos.push(photo);
      }
    });

    const finalBlocks = [];
    const availablePhotoIds = new Set(orderedPhotos.map((photo) => photo.id || photo.src));
    extras.forEach((block) => {
      if (block.type === "photo") {
        if (availablePhotoIds.has(block.photoId)) {
          finalBlocks.push(block);
          availablePhotoIds.delete(block.photoId);
        }
        return;
      }
      finalBlocks.push(block);
    });
    orderedPhotos.forEach((photo) => {
      const photoId = photo.id || photo.src;
      if (!finalBlocks.some((block) => block.type === "photo" && block.photoId === photoId)) {
        finalBlocks.push({ type: "photo", photoId });
      }
    });

    return {
      photos: orderedPhotos,
      blocks: finalBlocks,
    };
  };

  const syncPhotoSpacersFromBlocks = (photos, blocks) => {
    photos.forEach((photo) => {
      photo.spacerAfter = 0;
    });
    const photoIndexById = new Map(photos.map((photo, index) => [photo.id || photo.src, index]));
    blocks.forEach((block, index) => {
      if (block?.type !== "photo") {
        return;
      }
      const photoIndex = photoIndexById.get(block.photoId);
      if (!Number.isInteger(photoIndex)) {
        return;
      }
      let cursor = index + 1;
      let spacerTotal = 0;
      while (cursor < blocks.length && blocks[cursor]?.type !== "photo") {
        if (blocks[cursor]?.type === "space") {
          spacerTotal += Math.max(0, Math.min(50, Number(blocks[cursor].value) || 0));
        }
        cursor += 1;
      }
      photos[photoIndex].spacerAfter = spacerTotal;
    });
  };

  const rebuildBlocksFromPhotoOrder = (nextPhotos) => {
    const currentPhotoIds = state.photos.map((photo) => photo.id || photo.src);
    const slots = Array.from({ length: currentPhotoIds.length + 1 }, () => []);
    let slotIndex = 0;
    state.blocks.forEach((block) => {
      if (block?.type === "photo") {
        slotIndex += 1;
        return;
      }
      slots[Math.max(0, Math.min(slots.length - 1, slotIndex))].push(block);
    });

    const nextBlocks = [];
    nextPhotos.forEach((photo, index) => {
      const beforeSlot = slots[index] || [];
      beforeSlot.forEach((block) => nextBlocks.push(block));
      nextBlocks.push({
        type: "photo",
        photoId: photo.id || photo.src,
      });
    });
    (slots[nextPhotos.length] || []).forEach((block) => nextBlocks.push(block));
    state.blocks = nextBlocks;
    syncPhotoSpacersFromBlocks(nextPhotos, nextBlocks);
  };

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
  const initialPhotos = mergePhotos(preferredState?.photos);
  const normalizedBlockState = normalizeRuntimeBlocks(initialPhotos, preferredState?.blocks);
  syncPhotoSpacersFromBlocks(normalizedBlockState.photos, normalizedBlockState.blocks);

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
    photos: normalizedBlockState.photos,
    blocks: normalizedBlockState.blocks,
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
    activeTextBlockId: null,
    activeSpaceBlockId: null,
    selectedSpacerPreset: 17.75,
    zoomedOut: false,
    previewRotated: false,
    mobileSideviewOverride: null,
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

  const selectAllButtons = actionGroups.map((group) => {
    const button = document.createElement("button");
    const isMobile = group.classList.contains("mobile-home-section");
    button.className = isMobile ? "mobile-home-button album-select-all-button" : "preview-toggle album-select-all-button";
    button.type = "button";
    button.dataset.albumAction = "select-all";
    button.textContent = "Select All";
    if (isMobile) {
      const unselectButton = group.querySelector('[data-album-action="clear-selection"]');
      group.insertBefore(button, unselectButton || null);
    } else {
      const unselectButton = group.querySelector('[data-album-action="clear-selection"]');
      group.insertBefore(button, unselectButton || group.firstChild);
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

  const uploadButtons = actionGroups.map((group) => {
    const button = document.createElement("button");
    const isMobile = group.classList.contains("mobile-home-section");
    button.className = isMobile ? "mobile-home-button album-upload-button" : "preview-toggle album-upload-button";
    button.type = "button";
    button.dataset.albumAction = "upload-images";
    button.textContent = "Upload Images";
    button.hidden = true;
    if (isMobile) {
      const saveButton = group.querySelector('[data-album-action="save"]');
      group.insertBefore(button, saveButton || null);
    } else {
      const saveButton = group.querySelector('[data-album-action="save"]');
      group.insertBefore(button, saveButton || null);
    }
    return button;
  });

  const sideviewButtons = Array.from(document.querySelectorAll(".album-sideview-toggle-button"));
  const uploadInput = document.createElement("input");
  uploadInput.type = "file";
  uploadInput.accept = "image/*";
  uploadInput.multiple = true;
  uploadInput.hidden = true;
  body.appendChild(uploadInput);

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
  let uploadState = {
    pending: false,
    message: "",
  };
  const prefetchedPrioritySources = new Set();
  let hasMarkedReady = false;
  let cleanupRenderedBlocks = () => {};
  let landscapeRenderQueued = false;
  let activeTitleEdit = null;
  let pendingFollowTarget = null;
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

  const queueFollowTarget = (target) => {
    pendingFollowTarget = target;
  };

  const followPendingTargetIntoView = () => {
    if (!pendingFollowTarget) {
      return;
    }

    let target = null;
    if (pendingFollowTarget.type === "photo" && pendingFollowTarget.src) {
      target = Array.from(grid.querySelectorAll(".editable-photo")).find((element) => element.dataset.src === pendingFollowTarget.src) || null;
    } else if (pendingFollowTarget.type === "text" && pendingFollowTarget.id) {
      target = grid.querySelector(`.album-text-block[data-block-id="${CSS.escape(pendingFollowTarget.id)}"]`);
    } else if (pendingFollowTarget.type === "space" && pendingFollowTarget.id) {
      target = grid.querySelector(`.album-space-block[data-block-id="${CSS.escape(pendingFollowTarget.id)}"]`);
    }

    pendingFollowTarget = null;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    markProgrammaticScroll("follow-target");
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
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
  let lastAppliedZoomedOutMode = false;

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

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error(`Failed to read ${file.name}`));
      });
      reader.addEventListener("error", () => {
        reject(reader.error || new Error(`Failed to read ${file.name}`));
      });
      reader.readAsDataURL(file);
    });

  const loadImageElement = (src) =>
    new Promise((resolve, reject) => {
      const image = new window.Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", () => reject(new Error("Image decode failed")));
      image.src = src;
    });

  const buildScaledDataUrl = ({ image, mimeType, maxEdge }) => {
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    if (!width || !height) {
      throw new Error("Image dimensions unavailable");
    }

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas unavailable");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const exportType = mimeType === "image/png" ? "image/png" : "image/jpeg";
    const quality = exportType === "image/png" ? undefined : 0.88;
    return canvas.toDataURL(exportType, quality);
  };

  const prepareUploadPayload = async (files) => {
    const prepared = [];
    for (const file of files) {
      const fullDataUrl = await readFileAsDataUrl(file);
      const image = await loadImageElement(fullDataUrl);
      prepared.push({
        name: file.name,
        type: file.type || "image/jpeg",
        width: image.naturalWidth || image.width || 0,
        height: image.naturalHeight || image.height || 0,
        fullDataUrl,
        thumbDataUrl: buildScaledDataUrl({
          image,
          mimeType: file.type || "image/jpeg",
          maxEdge: 1600,
        }),
      });
    }
    return prepared;
  };

  const applyReturnedSettings = (nextSettings) => {
    if (!nextSettings || typeof nextSettings !== "object") {
      return;
    }

    state.title = (typeof nextSettings.title === "string" && nextSettings.title.trim()) || state.title;
    state.titleFontFamily = normalizeAlbumTitleFontFamily(nextSettings.titleFontFamily, state.titleFontFamily);
    state.titleScale = normalizeTitleScale(nextSettings.titleScale, state.titleScale);
    state.mobileRotateClockwise = normalizeMobileRotateClockwise(
      nextSettings.mobileRotateClockwise,
      state.mobileRotateClockwise
    );
    state.spacing = ["tight", "default", "airy"].includes(nextSettings.spacing) ? nextSettings.spacing : state.spacing;
    state.topSpacer = normalizeTopSpacer(nextSettings.topSpacer, state.topSpacer);
    state.effect = normalizeEffect(nextSettings.effect, state.effect);
    state.effectSettings = normalizeEffectSettings(nextSettings.effectSettings || state.effectSettings);
    state.intro = normalizeIntro(nextSettings.intro, state.intro);
    state.sections = normalizeSections(nextSettings.sections).length
      ? normalizeSections(nextSettings.sections)
      : state.sections;

    const mergedPhotos = mergePhotos(nextSettings.photos);
    const normalizedBlockState = normalizeRuntimeBlocks(mergedPhotos, nextSettings.blocks);
    syncPhotoSpacersFromBlocks(normalizedBlockState.photos, normalizedBlockState.blocks);
    normalizedBlockState.photos.forEach(ensureLandscapeState);
    state.photos = normalizedBlockState.photos;
    state.blocks = normalizedBlockState.blocks;
  };

  const uploadImagesToGitHub = async (fileList) => {
    if (!canonicalSettingsPath || uploadState.pending || !fileList.length) {
      return;
    }

    uploadState = {
      pending: true,
      message: "Uploading...",
    };
    render();

    try {
      const files = await prepareUploadPayload(fileList);
      const response = await fetch("/api/upload-gallery-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          galleryId,
          settingsPath: canonicalSettingsPath,
          settings: serializeState(state, galleryId),
          files,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || result.details || "Upload failed");
      }

      applyReturnedSettings(result.settings);
      const savedSignature = getSettingsSignature({
        galleryId,
        titleFallback: state.title,
        input: serializeState(state, galleryId),
      });
      currentSyncedSignature = savedSignature;
      persistLocalState(false, savedSignature);
      if (Array.isArray(result.uploadedPhotos) && result.uploadedPhotos[0]?.src) {
        queueFollowTarget({ type: "photo", src: result.uploadedPhotos[0].src });
      }
      uploadState = {
        pending: false,
        message: "Uploaded",
      };
    } catch (error) {
      uploadState = {
        pending: false,
        message: error instanceof Error ? error.message : "Upload failed",
      };
    }

    render();

    window.setTimeout(() => {
      uploadState = {
        pending: false,
        message: "",
      };
      render();
    }, 2500);
  };

  const movePhoto = (index, direction) => {
    const targetPhoto = state.photos[index];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.photos.length) {
      return;
    }

    if (collapseGapTowards([index], direction)) {
      return;
    }

    if (targetPhoto?.src) {
      queueFollowTarget({ type: "photo", src: targetPhoto.src });
    }

    reorderPhotoIndexes([index], direction < 0 ? index - 1 : index + 2, {
      transferTrailingGapFromIndex: targetIndex,
      collapseSourceLeadingGap: false,
      sourceTrailingGapTargetIndex: targetIndex,
    });
  };

  const getSelectedIndexes = () => Array.from(state.selectedPhotoIndexes).sort((a, b) => a - b);

  const getSelectedSectionId = () => {
    const indexes = getSelectedIndexes();
    if (!indexes.length) {
      return null;
    }

    const sectionIds = new Set(
      indexes.map((index) => (typeof state.photos[index]?.section === "string" ? state.photos[index].section : ""))
    );
    return sectionIds.size === 1 ? Array.from(sectionIds)[0] : null;
  };

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
    if (state.selectedPhotoIndexes.size > 0) {
      state.activeTextBlockId = null;
      state.activeSpaceBlockId = null;
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
      state.activeTextBlockId = null;
      state.activeSpaceBlockId = null;
    } else {
      state.selectedPhotoIndexes.delete(index);
      if (state.activeSettingsPhotoIndex === index) {
        state.activeSettingsPhotoIndex = getSelectedIndexes().find((selectedIndex) => selectedIndex !== index) ?? null;
      }
    }
    render();
  };

  const activateTextBlock = (blockId) => {
    if (typeof blockId !== "string" || !blockId) {
      return;
    }
    if (state.activeTextBlockId === blockId) {
      const textBlock = grid.querySelector(`.album-text-block[data-block-id="${blockId}"]`);
      if (textBlock instanceof HTMLElement) {
        textBlock.focus();
      }
      return;
    }
    state.selectedPhotoIndexes.clear();
    state.activeSettingsPhotoIndex = null;
    state.activeTextBlockId = blockId;
    state.activeSpaceBlockId = null;
    render();
    window.requestAnimationFrame(() => {
      const textBlock = grid.querySelector(`.album-text-block[data-block-id="${blockId}"]`);
      if (!(textBlock instanceof HTMLElement)) {
        return;
      }
      textBlock.focus();
      const selection = window.getSelection?.();
      if (!selection) {
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(textBlock);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  };

  body.addEventListener("mousedown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const floatingEditor = target.closest(".floating-photo-editor");
    if (floatingEditor?.dataset.editorType !== "text") {
      return;
    }
    if (!target.closest("button, select, input, label")) {
      return;
    }
    event.preventDefault();
  });

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

  const areIndexesContiguous = (indexes) => {
    if (indexes.length <= 1) {
      return true;
    }

    for (let cursor = 1; cursor < indexes.length; cursor += 1) {
      if (indexes[cursor] !== indexes[cursor - 1] + 1) {
        return false;
      }
    }

    return true;
  };

  const collapseGapTowards = (indexes, direction) => {
    const normalizedIndexes = Array.from(new Set(indexes))
      .filter((index) => Number.isInteger(index) && index >= 0 && index < state.photos.length)
      .sort((a, b) => a - b);
    if (!normalizedIndexes.length) {
      return false;
    }

    if (direction < 0) {
      const startIndex = normalizedIndexes[0];
      if (startIndex <= 0) {
        return false;
      }
      const previousPhoto = state.photos[startIndex - 1];
      if (!previousPhoto || (Number(previousPhoto.spacerAfter) || 0) <= 0) {
        return false;
      }
      previousPhoto.spacerAfter = 0;
    } else {
      const endIndex = normalizedIndexes[normalizedIndexes.length - 1];
      const currentPhoto = state.photos[endIndex];
      if (!currentPhoto || (Number(currentPhoto.spacerAfter) || 0) <= 0) {
        return false;
      }
      currentPhoto.spacerAfter = 0;
    }

    save();
    render();
    return true;
  };

  const getNormalizedReorderResult = (indexes, destinationIndex, options = {}) => {
    const selectedIndexes = Array.from(new Set(indexes))
      .filter((index) => Number.isInteger(index) && index >= 0 && index < state.photos.length)
      .sort((a, b) => a - b);
    if (!selectedIndexes.length) {
      return null;
    }

    const clampedDestinationIndex = Math.max(0, Math.min(state.photos.length, Number(destinationIndex) || 0));
    const selectedSet = new Set(selectedIndexes);
    const selectedPhotos = selectedIndexes.map((index) => state.photos[index]);
    const selectedOriginalPositions = new Map(selectedIndexes.map((index, offset) => [index, offset]));
    const originalGaps = state.photos.map((photo) => Math.max(0, Math.min(50, Number(photo.spacerAfter) || 0)));
    const nextGapByPhoto = new Map(state.photos.map((photo, index) => [photo, originalGaps[index] ?? 0]));
    const transferredGapIndex = Number.isInteger(options.transferTrailingGapFromIndex) ? options.transferTrailingGapFromIndex : -1;
    const transferredGapValue = transferredGapIndex >= 0 ? originalGaps[transferredGapIndex] ?? 0 : 0;
    const collapseSourceLeadingGap = options.collapseSourceLeadingGap !== false;
    const sourceTrailingGapTargetIndex = Number.isInteger(options.sourceTrailingGapTargetIndex)
      ? options.sourceTrailingGapTargetIndex
      : -1;
    const selectedTrailingGapValue = originalGaps[selectedIndexes[selectedIndexes.length - 1]] ?? 0;

    state.photos.forEach((photo, index) => {
      const isSelected = selectedSet.has(index);
      const nextIndex = index + 1;
      const nextIsSelected = nextIndex < state.photos.length && selectedSet.has(nextIndex);

      if (isSelected) {
        nextGapByPhoto.set(photo, nextIsSelected ? originalGaps[index] ?? 0 : 0);
        return;
      }

      // Any gap directly before a moved photo collapses at the source position.
      if (collapseSourceLeadingGap && nextIsSelected) {
        nextGapByPhoto.set(photo, 0);
      }
    });

    const remainingPhotos = state.photos.filter((_, index) => !selectedSet.has(index));
    const insertionIndex = Math.max(
      0,
      Math.min(
        remainingPhotos.length,
        clampedDestinationIndex - selectedIndexes.filter((index) => index < clampedDestinationIndex).length
      )
    );
    const nextPhotos = [
      ...remainingPhotos.slice(0, insertionIndex),
      ...selectedPhotos,
      ...remainingPhotos.slice(insertionIndex),
    ];

    nextPhotos.forEach((photo) => {
      photo.spacerAfter = nextGapByPhoto.get(photo) ?? 0;
    });

    if (transferredGapValue > 0 && insertionIndex > 0) {
      const previousPhoto = nextPhotos[insertionIndex - 1];
      const lastInsertedPhoto = nextPhotos[insertionIndex + selectedPhotos.length - 1];
      if (previousPhoto) {
        previousPhoto.spacerAfter = 0;
      }
      if (lastInsertedPhoto) {
        lastInsertedPhoto.spacerAfter = transferredGapValue;
      }
    }

    if (sourceTrailingGapTargetIndex >= 0 && selectedTrailingGapValue > 0) {
      const crossedPhoto = state.photos[sourceTrailingGapTargetIndex];
      if (crossedPhoto && !selectedSet.has(sourceTrailingGapTargetIndex)) {
        crossedPhoto.spacerAfter = selectedTrailingGapValue;
      }
    }

    const nextSelectedIndexes = selectedPhotos.map((_, offset) => insertionIndex + offset);
    return {
      nextPhotos,
      nextSelectedIndexes,
      insertionIndex,
      selectedOriginalPositions,
    };
  };

  const reorderPhotoIndexes = (indexes, destinationIndex, options = {}) => {
    const result = getNormalizedReorderResult(indexes, destinationIndex, options);
    if (!result) {
      return false;
    }

    const {
      nextPhotos,
    } = result;
    const previouslySelectedPhotos = getSelectedIndexes()
      .map((index) => state.photos[index])
      .filter(Boolean);
    const previousActivePhoto =
      Number.isInteger(state.activeSettingsPhotoIndex) && state.photos[state.activeSettingsPhotoIndex]
        ? state.photos[state.activeSettingsPhotoIndex]
        : null;
    state.photos = nextPhotos;
    rebuildBlocksFromPhotoOrder(nextPhotos);
    const nextSelectedIndexes = previouslySelectedPhotos
      .map((photo) => nextPhotos.indexOf(photo))
      .filter((index) => index >= 0);
    state.selectedPhotoIndexes = new Set(nextSelectedIndexes);
    const nextActiveIndex = previousActivePhoto ? nextPhotos.indexOf(previousActivePhoto) : -1;
    state.activeSettingsPhotoIndex = nextActiveIndex >= 0 ? nextActiveIndex : nextSelectedIndexes[0] ?? null;

    normalizeAllJoinStates();
    clampIndexSelection();
    save();
    render();
    return true;
  };

  const insertSelectedPhotosAt = (destinationIndex, options = {}) => {
    if (getSelectedSectionId() === null) {
      return false;
    }
    return reorderPhotoIndexes(getSelectedIndexes(), destinationIndex, options);
  };

  const moveSelectedPhotos = (direction) => {
    const indexes = getSelectedIndexes();
    if (!indexes.length || !areIndexesContiguous(indexes)) {
      return;
    }
    const leadPhoto =
      direction < 0 ? state.photos[indexes[0]] : state.photos[indexes[indexes.length - 1]];

    if (collapseGapTowards(indexes, direction)) {
      return;
    }

    const startIndex = indexes[0];
    const endIndex = indexes[indexes.length - 1];
    if (direction < 0) {
      if (startIndex === 0) {
        return;
      }
      if (leadPhoto?.src) {
        queueFollowTarget({ type: "photo", src: leadPhoto.src });
      }
      reorderPhotoIndexes(indexes, startIndex - 1, {
        transferTrailingGapFromIndex: startIndex - 1,
        collapseSourceLeadingGap: false,
        sourceTrailingGapTargetIndex: startIndex - 1,
      });
      return;
    }

    if (endIndex >= state.photos.length - 1) {
      return;
    }
    if (leadPhoto?.src) {
      queueFollowTarget({ type: "photo", src: leadPhoto.src });
    }
    reorderPhotoIndexes(indexes, endIndex + 2, {
      transferTrailingGapFromIndex: endIndex + 1,
      collapseSourceLeadingGap: false,
      sourceTrailingGapTargetIndex: endIndex + 1,
    });
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
    setSpaceBlockForSlot(index + 1, numeric);
    save();
    render();
  };

  const getPhotoBlockPositionByPhotoIndex = (photoIndex) => {
    const photo = state.photos[photoIndex];
    if (!photo) {
      return -1;
    }
    return state.blocks.findIndex((block) => block?.type === "photo" && block.photoId === (photo.id || photo.src));
  };

  const getRenderedSpacerAfterForPhotoIndex = (photoIndex) => {
    const photo = state.photos[photoIndex];
    if (!photo) {
      return 0;
    }

    const photoBlockIndex = getPhotoBlockPositionByPhotoIndex(photoIndex);
    if (photoBlockIndex >= 0 && state.blocks[photoBlockIndex + 1]?.type === "space") {
      return 0;
    }

    return Math.max(0, Number(photo.spacerAfter) || 0);
  };

  const getSlotRange = (slotIndex) => {
    const photoBlockPositions = state.blocks
      .map((block, index) => (block?.type === "photo" ? index : -1))
      .filter((index) => index >= 0);
    const start = slotIndex <= 0 ? 0 : (photoBlockPositions[slotIndex - 1] ?? state.blocks.length) + 1;
    const end = slotIndex >= photoBlockPositions.length ? state.blocks.length : photoBlockPositions[slotIndex];
    return { start, end };
  };

  const setSpaceBlockForSlot = (slotIndex, value) => {
    const numeric = Math.max(0, Math.min(50, Number(value) || 0));
    const { start, end } = getSlotRange(slotIndex);
    const blocksInSlot = state.blocks.slice(start, end);
    const nonSpaceBlocks = blocksInSlot.filter((block) => block?.type !== "space");
    const nextSlotBlocks = numeric > 0 ? [...nonSpaceBlocks, { type: "space", id: createBlockId("space"), value: numeric }] : nonSpaceBlocks;
    state.blocks.splice(start, end - start, ...nextSlotBlocks);
    syncPhotoSpacersFromBlocks(state.photos, state.blocks);
  };

  const getTextBlockIndexById = (blockId) =>
    state.blocks.findIndex((block) => block?.type === "text" && block.id === blockId);

  const getSpaceBlockIndexById = (blockId) =>
    state.blocks.findIndex((block) => block?.type === "space" && block.id === blockId);

  const activateSpaceBlock = (blockId) => {
    if (typeof blockId !== "string" || !blockId) {
      return;
    }
    if (state.activeSpaceBlockId === blockId) {
      return;
    }
    state.selectedPhotoIndexes.clear();
    state.activeSettingsPhotoIndex = null;
    state.activeTextBlockId = null;
    state.activeSpaceBlockId = blockId;
    render();
  };

  const setSpaceBlockAdjacentToBlock = (blockIndex, side, value) => {
    if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= state.blocks.length) {
      return false;
    }
    const numeric = Math.max(0, Math.min(50, Number(value) || 0));
    const adjacentIndex = side === "before" ? blockIndex - 1 : blockIndex + 1;
    const adjacentBlock = state.blocks[adjacentIndex];
    if (adjacentBlock?.type === "space") {
      if (numeric > 0) {
        adjacentBlock.value = numeric;
      } else {
        state.blocks.splice(adjacentIndex, 1);
      }
    } else if (numeric > 0) {
      const insertIndex = side === "before" ? blockIndex : blockIndex + 1;
      state.blocks.splice(insertIndex, 0, {
        type: "space",
        id: createBlockId("space"),
        value: numeric,
      });
    }
    syncPhotoSpacersFromBlocks(state.photos, state.blocks);
    save();
    render();
    return true;
  };

  const placeSpacerAroundTextBlock = (blockId, side, value) => {
    const blockIndex = getTextBlockIndexById(blockId);
    if (blockIndex < 0) {
      return false;
    }
    return setSpaceBlockAdjacentToBlock(blockIndex, side, value);
  };

  const clearTextBlockSpaces = (blockId) => {
    const blockIndex = getTextBlockIndexById(blockId);
    if (blockIndex < 0) {
      return false;
    }
    setSpaceBlockAdjacentToBlock(blockIndex, "before", 0);
    const nextIndex = getTextBlockIndexById(blockId);
    if (nextIndex >= 0) {
      setSpaceBlockAdjacentToBlock(nextIndex, "after", 0);
    }
    return true;
  };

  const moveTextBlock = (blockId, direction) => {
    const index = getTextBlockIndexById(blockId);
    if (index < 0) {
      return false;
    }
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.blocks.length) {
      return false;
    }
    const [block] = state.blocks.splice(index, 1);
    state.blocks.splice(targetIndex, 0, block);
    save();
    queueFollowTarget({ type: "text", id: blockId });
    render();
    return true;
  };

  const removeTextBlock = (blockId) => {
    const index = getTextBlockIndexById(blockId);
    if (index < 0) {
      return false;
    }
    state.blocks.splice(index, 1);
    if (state.activeTextBlockId === blockId) {
      state.activeTextBlockId = null;
    }
    save();
    render();
    return true;
  };

  const updateSpaceBlockValue = (blockId, value) => {
    const index = getSpaceBlockIndexById(blockId);
    if (index < 0) {
      return false;
    }
    const numeric = Math.max(0, Math.min(50, Number(value) || 0));
    if (numeric <= 0) {
      state.blocks.splice(index, 1);
      if (state.activeSpaceBlockId === blockId) {
        state.activeSpaceBlockId = null;
      }
    } else {
      state.blocks[index].value = numeric;
    }
    syncPhotoSpacersFromBlocks(state.photos, state.blocks);
    save();
    render();
    return true;
  };

  const moveSpaceBlock = (blockId, direction) => {
    const index = getSpaceBlockIndexById(blockId);
    if (index < 0) {
      return false;
    }
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.blocks.length) {
      return false;
    }
    const [block] = state.blocks.splice(index, 1);
    state.blocks.splice(targetIndex, 0, block);
    syncPhotoSpacersFromBlocks(state.photos, state.blocks);
    save();
    queueFollowTarget({ type: "space", id: blockId });
    render();
    return true;
  };

  const removeSpaceBlock = (blockId) => {
    const index = getSpaceBlockIndexById(blockId);
    if (index < 0) {
      return false;
    }
    state.blocks.splice(index, 1);
    if (state.activeSpaceBlockId === blockId) {
      state.activeSpaceBlockId = null;
    }
    syncPhotoSpacersFromBlocks(state.photos, state.blocks);
    save();
    render();
    return true;
  };

  const execTextFormat = (command, value = null) => {
    const blockId = state.activeTextBlockId;
    if (!blockId) {
      return false;
    }
    const textBlock = grid.querySelector(`.album-text-block[data-block-id="${blockId}"]`);
    if (!(textBlock instanceof HTMLElement)) {
      return false;
    }
    const selection = window.getSelection?.();
    textBlock.focus();
    document.execCommand(command, false, value);
    const block = state.blocks.find((item) => item?.type === "text" && item.id === blockId);
    if (block) {
      block.html = textBlock.innerHTML;
      save();
    }
    return true;
  };

  const updateTextBlockLayout = (blockId, updates = {}) => {
    const block = state.blocks.find((item) => item?.type === "text" && item.id === blockId);
    if (!block) {
      return false;
    }
    if (typeof updates.size === "string") {
      block.size = ["small", "normal", "large"].includes(updates.size) ? updates.size : block.size || "normal";
    }
    if (typeof updates.align === "string") {
      block.align = ["left", "center", "right"].includes(updates.align) ? updates.align : block.align || "left";
    }
    if (typeof updates.rotatedPosition === "string") {
      block.rotatedPosition = ["top", "middle", "bottom"].includes(updates.rotatedPosition)
        ? updates.rotatedPosition
        : block.rotatedPosition || "middle";
    }
    save();
    render();
    window.requestAnimationFrame(() => {
      const textElement = grid.querySelector(`.album-text-block[data-block-id="${blockId}"]`);
      if (textElement instanceof HTMLElement) {
        textElement.focus();
      }
    });
    return true;
  };

  const stepTextBlockSize = (blockId, direction) => {
    const block = state.blocks.find((item) => item?.type === "text" && item.id === blockId);
    if (!block) {
      return false;
    }
    const order = ["small", "normal", "large"];
    const currentIndex = Math.max(0, order.indexOf(block.size || "normal"));
    const nextIndex = Math.max(0, Math.min(order.length - 1, currentIndex + direction));
    if (nextIndex === currentIndex) {
      return false;
    }
    return updateTextBlockLayout(blockId, { size: order[nextIndex] });
  };

  const insertBlockIntoSlot = (slotIndex, block) => {
    const normalizedBlock = normalizeContentBlock(block);
    if (!normalizedBlock || normalizedBlock.type === "photo") {
      return false;
    }
    const { start, end } = getSlotRange(slotIndex);
    state.blocks.splice(end, 0, normalizedBlock);
    syncPhotoSpacersFromBlocks(state.photos, state.blocks);
    save();
    render();
    return true;
  };

  const insertTextNearPhoto = (photoIndex, side) => {
    const photoBlockIndex = getPhotoBlockPositionByPhotoIndex(photoIndex);
    if (photoBlockIndex < 0) {
      return false;
    }
    let insertIndex = side === "before" ? photoBlockIndex : photoBlockIndex + 1;
    if (side === "after" && state.blocks[insertIndex]?.type === "space") {
      insertIndex = photoBlockIndex + 1;
    }
    state.blocks.splice(insertIndex, 0, normalizeContentBlock({
      type: "text",
      id: createBlockId("text"),
      html: "<p>Text</p>",
      size: "normal",
      width: "medium",
      align: "left",
    }));
    syncPhotoSpacersFromBlocks(state.photos, state.blocks);
    save();
    render();
    return true;
  };

  const addSpacerAtInsertionTarget = (wrapperIndex, action, value = NORMAL_SPACER_REM) => {
    const slotIndex = action === "insert-after" ? wrapperIndex + 1 : wrapperIndex;
    setSpaceBlockForSlot(slotIndex, value);
    save();
    render();
    return true;
  };

  const placeSpacerAroundPhoto = (sourceIndex, side, value) => {
    const normalizedValue = Math.max(0, Math.min(50, Number(value) || 0));
    if (side === "before") {
      const currentPhoto = state.photos[sourceIndex];
      if (!currentPhoto || sourceIndex <= 0) {
        return false;
      }
      setSpaceBlockForSlot(sourceIndex, normalizedValue);
      syncSpacerUiForIndexes([sourceIndex - 1]);
      save();
      render();
      return true;
    }

    const currentPhoto = state.photos[sourceIndex];
    if (!currentPhoto || currentPhoto.deleted) {
      return false;
    }
    setSpaceBlockForSlot(sourceIndex + 1, normalizedValue);
    syncSpacerUiForIndexes([sourceIndex]);
    save();
    render();
    return true;
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
    document.querySelectorAll(".spacer-paste-button").forEach((button) => {
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
      const renderedSpacerAfter = getRenderedSpacerAfterForPhotoIndex(photoIndex);
      const photoWrapper = grid.querySelector(`.editable-photo[data-index="${photoIndex}"]`);
      photoWrapper?.classList.toggle("has-spacer", photo.spacerAfter > 0);
      photoWrapper?.style.setProperty("--photo-after-space", `${renderedSpacerAfter.toFixed(2)}rem`);
      const valueLabel = photoWrapper?.querySelector(".spacer-value");
      if (valueLabel) {
        valueLabel.textContent = `${photo.spacerAfter.toFixed(2)}rem`;
      }
      const slider = photoWrapper?.querySelector(".spacer-slider");
      if (slider) {
        slider.value = String(photo.spacerAfter);
      }

      const floatingEditor = body.querySelector(`.floating-photo-editor[data-photo-editor-index="${photoIndex}"]`);
      const floatingValueLabel = floatingEditor?.querySelector(".spacer-value");
      if (floatingValueLabel) {
        floatingValueLabel.textContent = `${photo.spacerAfter.toFixed(2)}rem`;
      }
      const floatingSlider = floatingEditor?.querySelector(".spacer-slider");
      if (floatingSlider) {
        floatingSlider.value = String(photo.spacerAfter);
      }
    });
  };

  const getPhotoEditorIndexFromTarget = (target) => {
    if (!(target instanceof HTMLElement)) {
      return null;
    }
    const floatingEditor = target.closest(".floating-photo-editor");
    if (floatingEditor instanceof HTMLElement) {
      const index = Number(floatingEditor.dataset.photoEditorIndex);
      return Number.isInteger(index) ? index : null;
    }
    const wrapper = target.closest(".editable-photo");
    if (wrapper instanceof HTMLElement) {
      const index = Number(wrapper.dataset.index);
      return Number.isInteger(index) ? index : null;
    }
    return null;
  };

  const renderFloatingPhotoEditor = () => {
    body.querySelector(".floating-photo-editor")?.remove();
    if (!state.editing) {
      return;
    }
    if (typeof state.activeTextBlockId === "string" && state.activeTextBlockId) {
      const textBlock = state.blocks.find((block) => block?.type === "text" && block.id === state.activeTextBlockId);
      const textSize = textBlock?.size || "normal";
      const textAlign = textBlock?.align || "left";
      const textRotatedPosition = textBlock?.rotatedPosition || "middle";
      const isRotatedTextPreview = state.previewRotated === true;
      const floatingEditor = document.createElement("div");
      floatingEditor.className = "floating-photo-editor";
      floatingEditor.dataset.editorType = "text";
      floatingEditor.dataset.blockId = state.activeTextBlockId;
      floatingEditor.innerHTML = `
        <div class="photo-controls text-block-controls">
          <button class="photo-control-button" type="button" data-action="text-move-up" aria-label="Move text up">↑</button>
          <button class="photo-control-button" type="button" data-action="text-move-down" aria-label="Move text down">↓</button>
          <button class="photo-control-button" type="button" data-action="text-size-down" aria-label="Smaller text">−</button>
          <button class="photo-control-button" type="button" data-action="text-size-up" aria-label="Larger text">+</button>
          <button class="photo-toggle-button" type="button" data-action="text-bold" aria-label="Bold text">Bold</button>
          <button class="photo-toggle-button" type="button" data-action="text-italic" aria-label="Italic text">Italic</button>
          <button class="photo-toggle-button" type="button" data-action="text-paragraph" aria-label="Paragraph text">P</button>
          <button class="photo-toggle-button" type="button" data-action="text-heading" aria-label="Heading text">H</button>
          <button class="photo-toggle-button${textAlign === "left" ? " is-active" : ""}" type="button" data-action="text-align-left" aria-label="Align text left" aria-pressed="${textAlign === "left" ? "true" : "false"}">Left</button>
          <button class="photo-toggle-button${textAlign === "center" ? " is-active" : ""}" type="button" data-action="text-align-center" aria-label="Align text center" aria-pressed="${textAlign === "center" ? "true" : "false"}">Center</button>
          <button class="photo-toggle-button${textAlign === "right" ? " is-active" : ""}" type="button" data-action="text-align-right" aria-label="Align text right" aria-pressed="${textAlign === "right" ? "true" : "false"}">Right</button>
          <span class="text-size-indicator" aria-label="Text size preset">${textSize}</span>
          <button class="photo-toggle-button photo-delete-button" type="button" data-action="text-remove" aria-label="Remove text block">X</button>
        </div>
        ${
          isRotatedTextPreview
            ? `<div class="photo-controls text-block-controls text-block-rotated-position-controls">
          <button class="photo-toggle-button${textRotatedPosition === "top" ? " is-active" : ""}" type="button" data-action="text-rotate-top" aria-label="Place text at top in rotated view" aria-pressed="${textRotatedPosition === "top" ? "true" : "false"}">Top</button>
          <button class="photo-toggle-button${textRotatedPosition === "middle" ? " is-active" : ""}" type="button" data-action="text-rotate-middle" aria-label="Place text in middle in rotated view" aria-pressed="${textRotatedPosition === "middle" ? "true" : "false"}">Middle</button>
          <button class="photo-toggle-button${textRotatedPosition === "bottom" ? " is-active" : ""}" type="button" data-action="text-rotate-bottom" aria-label="Place text at bottom in rotated view" aria-pressed="${textRotatedPosition === "bottom" ? "true" : "false"}">Bottom</button>
        </div>`
            : ""
        }
        <div class="spacer-control text-block-spacer-control">
          <div class="spacer-preset-row">
            <button class="spacer-preset-button${state.selectedSpacerPreset === 8.875 ? " is-primary" : ""}" type="button" data-action="spacer-preset" data-value="8.875">Small</button>
            <button class="spacer-preset-button${state.selectedSpacerPreset === 17.75 ? " is-primary" : ""}" type="button" data-action="spacer-preset" data-value="17.75">Normal</button>
            <button class="spacer-preset-button${state.selectedSpacerPreset === 35.5 ? " is-primary" : ""}" type="button" data-action="spacer-preset" data-value="35.5">Big</button>
            <div class="spacer-place-row">
              <button class="spacer-place-button" type="button" data-action="text-spacer-before" aria-label="Place selected spacer above text">↑</button>
              <button class="spacer-place-button" type="button" data-action="text-spacer-after" aria-label="Place selected spacer below text">↓</button>
            </div>
          </div>
          <button class="spacer-reset" type="button" data-action="text-spacer-reset" aria-label="Clear text spacers">Reset</button>
        </div>
      `;
      body.appendChild(floatingEditor);
      return;
    }

    if (typeof state.activeSpaceBlockId === "string" && state.activeSpaceBlockId) {
      const spaceBlock = state.blocks.find((block) => block?.type === "space" && block.id === state.activeSpaceBlockId);
      if (!spaceBlock) {
        return;
      }
      const floatingEditor = document.createElement("div");
      floatingEditor.className = "floating-photo-editor";
      floatingEditor.dataset.editorType = "space";
      floatingEditor.dataset.blockId = state.activeSpaceBlockId;
      floatingEditor.innerHTML = `
        <div class="photo-controls text-block-controls">
          <button class="photo-control-button" type="button" data-action="space-move-up" aria-label="Move spacer up">↑</button>
          <button class="photo-control-button" type="button" data-action="space-move-down" aria-label="Move spacer down">↓</button>
          <button class="spacer-preset-button${state.selectedSpacerPreset === 8.875 ? " is-primary" : ""}" type="button" data-action="spacer-preset" data-value="8.875">Small</button>
          <button class="spacer-preset-button${state.selectedSpacerPreset === 17.75 ? " is-primary" : ""}" type="button" data-action="spacer-preset" data-value="17.75">Normal</button>
          <button class="spacer-preset-button${state.selectedSpacerPreset === 35.5 ? " is-primary" : ""}" type="button" data-action="spacer-preset" data-value="35.5">Big</button>
          <button class="photo-toggle-button photo-delete-button" type="button" data-action="space-remove" aria-label="Remove spacer block">X</button>
        </div>
        <div class="spacer-control text-block-spacer-control">
          <button class="spacer-reset" type="button" data-action="space-reset" aria-label="Reset spacer block">Reset</button>
          <div class="spacer-copy-row">
            <button class="spacer-copy-button" type="button" data-action="space-copy-value" aria-label="Copy spacer value">⧉</button>
            <button class="spacer-copy-button spacer-paste-button" type="button" data-action="space-paste-value" aria-label="Paste spacer value"${!Number.isFinite(spacerClipboard) ? " disabled" : ""}>⎘</button>
          </div>
          <label aria-label="Spacer block size">
            <button class="spacer-value spacer-value-button" type="button" data-action="space-edit-value" aria-label="Edit spacer block size">${(Number(spaceBlock.value) || 0).toFixed(2)}rem</button>
            <div class="space-value-inputs">
              <input class="spacer-slider" type="range" min="0" max="50" step="0.25" value="${Number(spaceBlock.value) || 0}" aria-label="Spacer block size">
              <input class="space-value-number" type="number" min="0" max="50" step="0.25" value="${Number(spaceBlock.value) || 0}" aria-label="Spacer block size number">
            </div>
          </label>
        </div>
      `;
      body.appendChild(floatingEditor);
      syncSpacerClipboardUi();
      return;
    }

    if (!Number.isInteger(state.activeSettingsPhotoIndex)) {
      return;
    }
    const activeWrapper = grid.querySelector(`.editable-photo[data-index="${state.activeSettingsPhotoIndex}"]`);
    if (!(activeWrapper instanceof HTMLElement)) {
      return;
    }

    const controls = activeWrapper.querySelector(".photo-controls");
    const spacerControl = activeWrapper.querySelector(".spacer-control");
    const effectPanel = activeWrapper.querySelector(".photo-effect-live-panel");
    if (!controls && !spacerControl && !effectPanel) {
      return;
    }

    const floatingEditor = document.createElement("div");
    floatingEditor.className = "floating-photo-editor";
    floatingEditor.dataset.photoEditorIndex = String(state.activeSettingsPhotoIndex);
    if (controls) {
      floatingEditor.appendChild(controls.cloneNode(true));
    }
    if (spacerControl) {
      floatingEditor.appendChild(spacerControl.cloneNode(true));
    }
    if (effectPanel && state.previewing) {
      floatingEditor.appendChild(effectPanel.cloneNode(true));
    }
    body.appendChild(floatingEditor);
    syncSpacerClipboardUi();
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
    const isMobileLayout = body.classList.contains("is-mobile-layout");
    const shouldApplyZoomedOut = state.editing && state.zoomedOut && !isMobileLayout;
    lastAppliedZoomedOutMode = shouldApplyZoomedOut;
    const effectiveSideviewActive = getHeroIntroState(state).hasMobileSideviewHero;
    toggleButtons.forEach((button) => {
      button.textContent = state.editing ? "Done" : "Edit";
    });
    body.classList.toggle("is-editing", state.editing);
    body.classList.toggle("is-previewing", state.editing && state.previewing);
    body.classList.toggle("is-zoomed-out-edit", shouldApplyZoomedOut);
    body.classList.toggle("has-manual-rotate-preview", state.editing && state.previewRotated);
    previewButtons.forEach((button) => {
      button.textContent = state.previewing ? "Show Editor" : "Preview";
      button.setAttribute("aria-pressed", state.previewing ? "true" : "false");
    });
    zoomButtons.forEach((button) => {
      button.textContent = state.zoomedOut ? "Normal View" : "Zoom Out";
      button.disabled = !state.editing || isMobileLayout;
      button.setAttribute("aria-pressed", shouldApplyZoomedOut ? "true" : "false");
    });
    clearSelectionButtons.forEach((button) => {
      button.disabled = !state.editing || state.selectedPhotoIndexes.size === 0;
    });
    selectAllButtons.forEach((button) => {
      button.disabled = !state.editing || state.selectedPhotoIndexes.size >= state.photos.length;
    });
    rotatePreviewButtons.forEach((button) => {
      button.textContent = state.previewRotated ? "Normal Rotation" : "Rotated View";
      button.disabled = !state.editing;
      button.setAttribute("aria-pressed", state.editing && state.previewRotated ? "true" : "false");
    });
    uploadButtons.forEach((button) => {
      button.hidden = !state.editing;
      button.textContent = uploadState.pending ? "Uploading..." : uploadState.message || "Upload Images";
      button.disabled = !state.editing || uploadState.pending;
    });
    sideviewButtons.forEach((button) => {
      button.classList.toggle("is-active", effectiveSideviewActive);
      button.setAttribute("aria-pressed", effectiveSideviewActive ? "true" : "false");
      button.setAttribute("aria-label", effectiveSideviewActive ? "Switch to normal view" : "Switch to side view");
      button.setAttribute("title", effectiveSideviewActive ? "Switch to normal view" : "Switch to side view");
    });
    renderFloatingPhotoEditor();
    renderDebugPanel();
  };

  const syncViewportModeUi = () => {
    const shouldApplyZoomedOut = state.editing && state.zoomedOut && !body.classList.contains("is-mobile-layout");
    if (shouldApplyZoomedOut !== lastAppliedZoomedOutMode) {
      render();
      return;
    }
    syncModeUi();
    window.requestAnimationFrame(() => {
      effects.updateMobileExtendedLayout();
      effects.updateSpotlightLayout();
      effects.refreshSpotlightObservers();
      effects.queueEffectUpdate();
    });
  };

  const shouldRerenderForModeToggle = () => {
    if (state.showDeleted) {
      return true;
    }

    const isMobileLayout = body.classList.contains("is-mobile-layout");
    const hasRuntimeMobileSideviewClasses =
      body.classList.contains("has-mobile-sideview-mode") ||
      body.classList.contains("has-mobile-sideview-hero") ||
      body.classList.contains("has-mobile-sideview-grid");

    if (isMobileLayout || hasRuntimeMobileSideviewClasses || state.runtimeMobileSideviewActive) {
      return true;
    }

    return false;
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
  window.addEventListener("resize", () => window.requestAnimationFrame(syncViewportModeUi));
  window.addEventListener("orientationchange", () => window.requestAnimationFrame(syncViewportModeUi));
  window.visualViewport?.addEventListener?.("resize", () => window.requestAnimationFrame(syncViewportModeUi));
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
    const includeDeleted = state.editing && !state.previewing && state.showDeleted;
    const activeInsertSection = getSelectedSectionId();
    const visiblePhotos = state.photos
      .map((photo, index) => ({ photo, index }))
      .filter(({ photo }) => (includeDeleted ? true : !photo.deleted));
    state.__activeInsertSection = activeInsertSection;
    state.__sectionFirstIndexes = new Set();
    state.__sectionLastIndexes = new Set();
    visiblePhotos.forEach(({ photo, index }, visibleIndex) => {
      if (activeInsertSection !== null && photo.section !== activeInsertSection) {
        return;
      }
      const previous = visiblePhotos[visibleIndex - 1];
      const next = visiblePhotos[visibleIndex + 1];
      if (!previous || previous.photo.section !== photo.section) {
        state.__sectionFirstIndexes.add(index);
      }
      if (!next || next.photo.section !== photo.section) {
        state.__sectionLastIndexes.add(index);
      }
    });
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
        if (state.mobileRotateClockwise !== true) {
          state.mobileSideviewOverride = null;
        }
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
    uploadButtons.forEach((button) => {
      button.textContent = uploadState.pending ? "Uploading..." : uploadState.message || "Upload Images";
      button.disabled = !state.editing || uploadState.pending;
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
    const shouldApplyRuntimeMobileSideview = hasMobileSideviewHero && (!state.editing || state.previewing);
    const shouldApplyHeroSideview = hasMobileSideviewHero && (shouldApplyRuntimeMobileSideview || state.previewRotated === true);
    state.runtimeMobileSideviewActive = shouldApplyRuntimeMobileSideview;
    logDebug("hero-state", {
      intro: hasHeroIntro ? 1 : 0,
      sideview: shouldApplyRuntimeMobileSideview ? 1 : 0,
    });
    const heroTitle = heroIntro?.querySelector(".album-hero-title");
    applyTitleDisplay(title);
    if (heroTitle instanceof HTMLElement) {
      applyTitleDisplay(heroTitle);
    }
    body.classList.toggle("has-hero-intro", hasHeroIntro);
    body.classList.toggle("has-mobile-sideview-mode", shouldApplyRuntimeMobileSideview);
    body.classList.toggle("has-mobile-sideview-hero", shouldApplyHeroSideview);
    body.classList.toggle("has-mobile-sideview-grid", shouldApplyRuntimeMobileSideview);

    renderSubalbumIndexes({
      state,
      containers: [subalbumIndex, subalbumFooterIndex],
    });
    header.classList.toggle("has-top-subalbum-index", state.sections.length >= 2 && Boolean(subalbumIndex));
    header.classList.toggle("has-mobile-sideview-hero", shouldApplyHeroSideview);

    const blocks = buildAlbumBlocks({
      state,
      normalizeEffect,
      includeDeleted,
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
    renderFloatingPhotoEditor();
    syncSpacerClipboardUi();
    observeReveals(heroIntro || document);

    effects.queueEffectUpdate();
    window.requestAnimationFrame(() => {
      restoreRenderAnchor(renderAnchor);
      effects.updateMobileExtendedLayout();
      effects.updateSpotlightLayout();
      effects.refreshSpotlightObservers();
      followPendingTargetIntoView();
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

    const insertButton = event.target.closest(".photo-insert-target");
    if (insertButton) {
      const wrapper = event.target.closest(".editable-photo");
      if (!wrapper || !state.editing) {
        return;
      }
      event.preventDefault();
      const index = getPhotoEditorIndexFromTarget(event.target);
      if (!Number.isInteger(index)) {
        return;
      }
      if (!getSelectedIndexes().length) {
        addSpacerAtInsertionTarget(index, insertButton.dataset.action, NORMAL_SPACER_REM);
        return;
      }
      const destinationIndex = insertButton.dataset.action === "insert-before" ? index : index + 1;
      const transferTrailingGapFromIndex = insertButton.dataset.action === "insert-after" ? index : index - 1;
      insertSelectedPhotosAt(destinationIndex, {
        transferTrailingGapFromIndex: transferTrailingGapFromIndex >= 0 ? transferTrailingGapFromIndex : null,
      });
      return;
    }

    const button = event.target.closest(
      ".photo-control-button, .spacer-reset, .spacer-copy-button, .spacer-preset-button, .spacer-place-button, .photo-join-button, .photo-hero-button, .photo-delete-button, [data-action=\"text-insert-before\"], [data-action=\"text-insert-after\"]"
    );
    if (!button) {
      return;
    }

    const index = getPhotoEditorIndexFromTarget(event.target);
    if (!Number.isInteger(index)) {
      return;
    }

    event.preventDefault();
    const action = button.dataset.action;
    const selectedIndexes = getSelectedIndexes();
    const shouldMoveSelection = state.selectedPhotoIndexes.has(index) && selectedIndexes.length > 1 && areIndexesContiguous(selectedIndexes);

    if (action === "up") {
      if (shouldMoveSelection) {
        moveSelectedPhotos(-1);
      } else {
        movePhoto(index, -1);
      }
    } else if (action === "down") {
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
    } else if (action === "spacer-preset") {
      state.selectedSpacerPreset = Math.max(0, Math.min(50, Number(button.dataset.value) || NORMAL_SPACER_REM));
      render();
    } else if (action === "spacer-place-before") {
      placeSpacerAroundPhoto(index, "before", state.selectedSpacerPreset);
    } else if (action === "spacer-place-after") {
      placeSpacerAroundPhoto(index, "after", state.selectedSpacerPreset);
    } else if (action === "text-insert-before") {
      insertTextNearPhoto(index, "before");
    } else if (action === "text-insert-after") {
      insertTextNearPhoto(index, "after");
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

  document.addEventListener("click", (event) => {
    if (!state.editing || (!state.activeTextBlockId && !state.activeSpaceBlockId)) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.closest(".album-text-block") || target.closest(".album-space-block") || target.closest(".floating-photo-editor")) {
      return;
    }
    state.activeTextBlockId = null;
    state.activeSpaceBlockId = null;
    render();
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

    const textBlock = target.closest(".album-text-block");
    if (textBlock instanceof HTMLElement) {
      const blockId = textBlock.dataset.blockId || "";
      if (state.activeTextBlockId === blockId) {
        return;
      }
      event.preventDefault();
      activateTextBlock(blockId);
      return;
    }

    const spaceBlock = target.closest(".album-space-block");
    if (spaceBlock instanceof HTMLElement) {
      const blockId = spaceBlock.dataset.blockId || "";
      event.preventDefault();
      activateSpaceBlock(blockId);
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
    const index = getPhotoEditorIndexFromTarget(event.target);
    if (!Number.isInteger(index)) {
      return;
    }
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
      const sliderIndex = getPhotoEditorIndexFromTarget(event.target);
      if (!Number.isInteger(sliderIndex)) {
        return;
      }
      updateSpacer(sliderIndex, slider.value);
    }
  });

  grid.addEventListener("input", (event) => {
    const textBlock = event.target.closest(".album-text-block[contenteditable=\"true\"]");
    if (textBlock instanceof HTMLElement) {
      const blockId = textBlock.dataset.blockId;
      const block = state.blocks.find((item) => item?.type === "text" && item.id === blockId);
      if (block) {
        block.html = textBlock.innerHTML;
        save();
      }
      return;
    }

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

    const index = getPhotoEditorIndexFromTarget(event.target);
    if (!Number.isInteger(index)) {
      return;
    }
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

  grid.addEventListener("keydown", (event) => {
    const textBlock = event.target.closest(".album-text-block[contenteditable=\"true\"]");
    if (!(textBlock instanceof HTMLElement)) {
      return;
    }

    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      document.execCommand("insertText", false, " ");
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      document.execCommand("insertLineBreak");
    }
  });

  body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest(".floating-photo-editor")) {
      return;
    }

    const floatingEditor = target.closest(".floating-photo-editor");
    if (floatingEditor?.dataset.editorType === "text") {
      const action = target.closest("button")?.dataset.action;
      if (!action) {
        return;
      }
      event.preventDefault();
      const blockId = floatingEditor.dataset.blockId;
      if (!blockId) {
        return;
      }
      if (action === "text-move-up") {
        moveTextBlock(blockId, -1);
      } else if (action === "text-move-down") {
        moveTextBlock(blockId, 1);
      } else if (action === "text-size-down") {
        stepTextBlockSize(blockId, -1);
      } else if (action === "text-size-up") {
        stepTextBlockSize(blockId, 1);
      } else if (action === "text-bold") {
        execTextFormat("bold");
      } else if (action === "text-italic") {
        execTextFormat("italic");
      } else if (action === "text-paragraph") {
        execTextFormat("formatBlock", "p");
      } else if (action === "text-heading") {
        execTextFormat("formatBlock", "h2");
      } else if (action === "text-align-left") {
        updateTextBlockLayout(blockId, { align: "left" });
      } else if (action === "text-align-center") {
        updateTextBlockLayout(blockId, { align: "center" });
      } else if (action === "text-align-right") {
        updateTextBlockLayout(blockId, { align: "right" });
      } else if (action === "text-rotate-top") {
        updateTextBlockLayout(blockId, { rotatedPosition: "top" });
      } else if (action === "text-rotate-middle") {
        updateTextBlockLayout(blockId, { rotatedPosition: "middle" });
      } else if (action === "text-rotate-bottom") {
        updateTextBlockLayout(blockId, { rotatedPosition: "bottom" });
      } else if (action === "spacer-preset") {
        state.selectedSpacerPreset = Math.max(0, Math.min(50, Number(target.closest("button")?.dataset.value) || NORMAL_SPACER_REM));
        render();
      } else if (action === "text-spacer-before") {
        placeSpacerAroundTextBlock(blockId, "before", state.selectedSpacerPreset);
      } else if (action === "text-spacer-after") {
        placeSpacerAroundTextBlock(blockId, "after", state.selectedSpacerPreset);
      } else if (action === "text-spacer-reset") {
        clearTextBlockSpaces(blockId);
      } else if (action === "text-remove") {
        removeTextBlock(blockId);
      }
      return;
    }

    if (floatingEditor?.dataset.editorType === "space") {
      const action = target.closest("button")?.dataset.action;
      const blockId = floatingEditor.dataset.blockId;
      if (!blockId) {
        return;
      }
      if (action === "space-move-up") {
        event.preventDefault();
        moveSpaceBlock(blockId, -1);
      } else if (action === "space-move-down") {
        event.preventDefault();
        moveSpaceBlock(blockId, 1);
      } else if (action === "spacer-preset") {
        event.preventDefault();
        const presetValue = Math.max(0, Math.min(50, Number(target.closest("button")?.dataset.value) || NORMAL_SPACER_REM));
        state.selectedSpacerPreset = presetValue;
        updateSpaceBlockValue(blockId, presetValue);
      } else if (action === "space-reset") {
        event.preventDefault();
        updateSpaceBlockValue(blockId, 0);
      } else if (action === "space-copy-value") {
        event.preventDefault();
        const block = state.blocks.find((item) => item?.type === "space" && item.id === blockId);
        spacerClipboard = Math.max(0, Math.min(50, Number(block?.value) || 0));
        syncSpacerClipboardUi();
        render();
      } else if (action === "space-paste-value") {
        event.preventDefault();
        if (Number.isFinite(spacerClipboard)) {
          updateSpaceBlockValue(blockId, spacerClipboard);
        }
      } else if (action === "space-edit-value") {
        event.preventDefault();
        const block = state.blocks.find((item) => item?.type === "space" && item.id === blockId);
        const currentValue = Number(block?.value) || 0;
        const nextValue = window.prompt("Spacer size (rem)", currentValue.toFixed(2));
        if (nextValue !== null) {
          updateSpaceBlockValue(blockId, nextValue);
        }
      } else if (action === "space-remove") {
        event.preventDefault();
        removeSpaceBlock(blockId);
      }
      return;
    }

    const button = target.closest(
      ".photo-control-button, .spacer-reset, .spacer-copy-button, .spacer-preset-button, .spacer-place-button, .photo-join-button, .photo-hero-button, .photo-delete-button, [data-action=\"text-insert-before\"], [data-action=\"text-insert-after\"]"
    );
    if (!button) {
      return;
    }

    const index = getPhotoEditorIndexFromTarget(target);
    if (!Number.isInteger(index)) {
      return;
    }

    event.preventDefault();
    const action = button.dataset.action;
    const selectedIndexes = getSelectedIndexes();
    const shouldMoveSelection = state.selectedPhotoIndexes.has(index) && selectedIndexes.length > 1 && areIndexesContiguous(selectedIndexes);

    if (action === "up") {
      if (shouldMoveSelection) {
        moveSelectedPhotos(-1);
      } else {
        movePhoto(index, -1);
      }
    } else if (action === "down") {
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
    } else if (action === "spacer-preset") {
      state.selectedSpacerPreset = Math.max(0, Math.min(50, Number(button.dataset.value) || NORMAL_SPACER_REM));
      render();
    } else if (action === "spacer-place-before") {
      placeSpacerAroundPhoto(index, "before", state.selectedSpacerPreset);
    } else if (action === "spacer-place-after") {
      placeSpacerAroundPhoto(index, "after", state.selectedSpacerPreset);
    } else if (action === "text-insert-before") {
      insertTextNearPhoto(index, "before");
    } else if (action === "text-insert-after") {
      insertTextNearPhoto(index, "after");
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

  body.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest(".floating-photo-editor")) {
      return;
    }

    const effectNumber = target.closest(".photo-effect-setting-number");
    if (effectNumber) {
      updateEffectSetting(effectNumber.dataset.effectName, effectNumber.dataset.effectKey, effectNumber.value);
      return;
    }

    const index = getPhotoEditorIndexFromTarget(target);
    if (!Number.isInteger(index)) {
      return;
    }

    const select = target.closest(".photo-size-select, .photo-effect-select");
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

    const slider = target.closest(".spacer-slider");
    if (slider) {
      updateSpacer(index, slider.value);
    }
  });

  body.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest(".floating-photo-editor")) {
      return;
    }

    const floatingEditor = target.closest(".floating-photo-editor");
    if (floatingEditor?.dataset.editorType === "space") {
      const blockId = floatingEditor.dataset.blockId;
      const slider = target.closest(".spacer-slider");
      const numberInput = target.closest(".space-value-number");
      if (blockId && (slider || numberInput)) {
        updateSpaceBlockValue(blockId, slider?.value ?? numberInput?.value);
      }
      return;
    }

    const effectSlider = target.closest(".photo-effect-setting-slider");
    if (effectSlider) {
      const wrapper = effectSlider.closest(".photo-effect-live-field");
      const numberInput = wrapper?.querySelector(".photo-effect-setting-number");
      if (numberInput) {
        numberInput.value = effectSlider.value;
      }
      updateEffectSetting(effectSlider.dataset.effectName, effectSlider.dataset.effectKey, effectSlider.value);
      return;
    }

    const slider = target.closest(".spacer-slider");
    if (!slider) {
      return;
    }

    const index = getPhotoEditorIndexFromTarget(target);
    if (!Number.isInteger(index)) {
      return;
    }

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
      const wasMobileSideviewActive = getHeroIntroState(state).hasMobileSideviewHero;
      const requiresRerender = shouldRerenderForModeToggle();
      state.editing = !state.editing;
      if (state.editing && wasMobileSideviewActive) {
        state.previewRotated = true;
      }
      if (!state.editing) {
        state.previewing = false;
        state.selectedPhotoIndexes.clear();
        state.activeSettingsPhotoIndex = null;
        state.activeTextBlockId = null;
        state.activeSpaceBlockId = null;
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

      const requiresRerender = shouldRerenderForModeToggle();
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

  sideviewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextState = !getHeroIntroState(state).hasMobileSideviewHero;
      state.mobileSideviewOverride = nextState;
      lastReactiveSideviewState = getHeroIntroState(state).hasMobileSideviewHero;
      render();
    });
  });

  clearSelectionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.editing || state.selectedPhotoIndexes.size === 0) {
        return;
      }
      state.selectedPhotoIndexes.clear();
      state.activeSettingsPhotoIndex = null;
      state.activeTextBlockId = null;
      state.activeSpaceBlockId = null;
      render();
    });
  });

  selectAllButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.editing || state.photos.length === 0) {
        return;
      }
      state.selectedPhotoIndexes = new Set(state.photos.map((_, index) => index));
      state.activeSettingsPhotoIndex = 0;
      state.activeTextBlockId = null;
      state.activeSpaceBlockId = null;
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
    const wasMobileSideviewActive = getHeroIntroState(state).hasMobileSideviewHero;
    const requiresRerender = shouldRerenderForModeToggle();
    state.editing = !state.editing;
    if (state.editing && wasMobileSideviewActive) {
      state.previewRotated = true;
    }
    if (!state.editing) {
      state.previewing = false;
      state.selectedPhotoIndexes.clear();
      state.activeSettingsPhotoIndex = null;
      state.activeTextBlockId = null;
      state.activeSpaceBlockId = null;
      state.zoomedOut = false;
      state.previewRotated = false;
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
  uploadButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.editing || uploadState.pending) {
        return;
      }
      uploadInput.click();
    });
  });
  uploadInput.addEventListener("change", async () => {
    const selectedFiles = Array.from(uploadInput.files || []).filter((file) => file.type.startsWith("image/"));
    uploadInput.value = "";
    if (!selectedFiles.length) {
      return;
    }
    await uploadImagesToGitHub(selectedFiles);
  });
  exportButtons.forEach((button) => {
    button.addEventListener("click", exportSettings);
  });

  await waitForInitialViewportStability();
  lastReactiveSideviewState = getHeroIntroState(state).hasMobileSideviewHero;
  render();
};
