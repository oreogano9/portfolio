import {
  fetchJsonState,
  fetchSiteBrand,
  getPersistedAlbumState,
  getSavedState,
  getSettingsSignature,
  normalizeEffect,
  normalizeIntro,
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
    titleScale: normalizeTitleScale(preferredState?.titleScale),
    mobileRotateClockwise: normalizeMobileRotateClockwise(preferredState?.mobileRotateClockwise),
    spacing: ["tight", "default", "airy"].includes(preferredState?.spacing) ? preferredState.spacing : "tight",
    topSpacer: normalizeTopSpacer(preferredState?.topSpacer),
    effect: normalizeEffect(preferredState?.effect),
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
  };

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

  const syncModeUi = () => {
    toggleButtons.forEach((button) => {
      button.textContent = state.editing ? "Done" : "Edit";
    });
    body.classList.toggle("is-editing", state.editing);
    body.classList.toggle("is-previewing", state.editing && state.previewing);
    previewButtons.forEach((button) => {
      button.textContent = state.previewing ? "Show Editor" : "Preview";
      button.setAttribute("aria-pressed", state.previewing ? "true" : "false");
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
    grid.style.setProperty("--album-gap", spacingMap[state.spacing]);
    topSpacerSection?.style.setProperty("--album-top-spacer-height", `${normalizeTopSpacer(state.topSpacer)}rem`);
    syncModeUi();
    headerReactUi.render({
      titleScale: normalizeTitleScale(state.titleScale),
      topSpacer: normalizeTopSpacer(state.topSpacer),
      spacing: state.spacing,
      effect: state.effect,
      introMode: state.intro.mode,
      showArrow: state.intro.showArrow,
      mobileRotateClockwise: state.mobileRotateClockwise,
      showDeleted: state.showDeleted,
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
      movePhoto(index, -1);
    } else if (action === "down") {
      movePhoto(index, 1);
    } else if (action === "hero-toggle") {
      if (state.photos[index].deleted) {
        return;
      }
      state.intro.heroImageSrc = state.photos[index].src;
      save();
      render();
    } else if (action === "spacer-reset") {
      updateSpacer(index, 0);
    } else if (action === "spacer-copy-value") {
      copySpacerValue(index);
    } else if (action === "spacer-paste-value") {
      pasteSpacerValue(index);
    } else if (action === "join-toggle") {
      if (state.photos[index].joinWithPrevious) {
        state.photos[index].joinWithPrevious = false;
      } else if (canJoinPhoto(state, index, normalizeEffect)) {
        state.photos[index].joinWithPrevious = true;
      }
      save();
      render();
    } else if (action === "delete-toggle") {
      state.photos[index].deleted = !state.photos[index].deleted;
      normalizeDeletedNeighbors(index);
      save();
      render();
    }
  });

  grid.addEventListener("change", (event) => {
    const select = event.target.closest(".photo-size-select, .photo-effect-select");
    const wrapper = event.target.closest(".editable-photo");
    if (!wrapper) {
      return;
    }

    const index = Number(wrapper.dataset.index);
    if (select?.classList.contains("photo-size-select")) {
      if (select.value === "extended" && state.photos[index].landscape !== true) {
        state.photos[index].size = "full";
      } else if (sizeOptions.includes(select.value)) {
        state.photos[index].size = select.value;
      }
      save();
      render();
      return;
    }

    if (select?.classList.contains("photo-effect-select")) {
      state.photos[index].effect = normalizeEffect(select.value);
      save();
      render();
      return;
    }

    const slider = event.target.closest(".spacer-slider");
    if (slider) {
      updateSpacer(index, slider.value);
    }
  });

  grid.addEventListener("input", (event) => {
    const slider = event.target.closest(".spacer-slider");
    if (!slider) {
      return;
    }

    const wrapper = event.target.closest(".editable-photo");
    if (!wrapper) {
      return;
    }

    const index = Number(wrapper.dataset.index);
    state.photos[index].spacerAfter = Number(slider.value) || 0;
    wrapper.classList.toggle("has-spacer", state.photos[index].spacerAfter > 0);
    wrapper.style.setProperty("--photo-after-space", `${state.photos[index].spacerAfter.toFixed(2)}rem`);
    const valueLabel = wrapper.querySelector(".spacer-value");
    if (valueLabel) {
      valueLabel.textContent = `${state.photos[index].spacerAfter.toFixed(2)}rem`;
    }
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
