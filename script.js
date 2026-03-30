const setupReveals = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.08,
      rootMargin: "0px 0px -6% 0px",
    }
  );

  document.querySelectorAll(".reveal-up").forEach((element) => {
    observer.observe(element);
  });
};

const setupAlbumLinks = () => {
  const controls = document.querySelectorAll(".album-link");
  const cards = document.querySelectorAll(".album-card[data-category]");

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

  const applyFilter = (filter) => {
    const activeFilter = filter || "all";

    controls.forEach((control) => {
      control.classList.toggle("is-active", control.dataset.filter === activeFilter);
    });

    cards.forEach((card) => {
      const categories = (card.dataset.category || "")
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const matches = activeFilter === "all" || categories.includes(activeFilter);
      card.hidden = !matches;
    });
  };

  controls.forEach((control) => {
    control.addEventListener("click", () => {
      applyFilter(control.dataset.filter || "all");
    });
  });

  applyFilter("all");
};

const setupMobileMenu = () => {
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

const setupParallax = () => {
  return;
};

const setupAlbumEditor = async () => {
  const body = document.body;
  const grid = document.querySelector(".album-detail-grid");
  const title = document.querySelector(".masthead-title");
  const header = document.querySelector(".album-page-header");
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

  const storageKey = `album-editor:${window.location.pathname}`;
  const galleryId = body.dataset.galleryId || "gallery";
  const settingsUrl = body.dataset.gallerySettings || "";
  const effectOptions = ["none", "spotlight", "monochrome", "drift", "veil"];
  const normalizeEffect = (value, fallback = "none") => (effectOptions.includes(value) ? value : fallback);
  const originalPhotos = Array.from(grid.querySelectorAll("img")).map((image) => ({
    src: image.getAttribute("src") || "",
    alt: image.getAttribute("alt") || "",
    section: image.dataset.section || "",
    size: "full",
    spacerAfter: 0,
    effect: "none",
    joinWithPrevious: false,
  }));

  const normalizeSections = (value) =>
    Array.isArray(value)
      ? value
          .filter((section) => typeof section?.id === "string" && typeof section?.title === "string")
          .map((section) => ({
            id: section.id,
            title: section.title,
          }))
      : [];

  const sizeOptions = ["full", "extended", "medium", "small", "xsmall", "xxsmall"];
  const mobileLayoutQuery = window.matchMedia("(max-width: 760px), (hover: none), (pointer: coarse)");

  const syncMobileLayoutState = () => {
    body.classList.toggle("is-mobile-layout", mobileLayoutQuery.matches);
  };

  const normalizePhoto = (photo, fallback = {}) => ({
    src: typeof photo?.src === "string" ? photo.src : fallback.src || "",
    alt: typeof photo?.alt === "string" ? photo.alt : fallback.alt || "",
    section: typeof photo?.section === "string" ? photo.section : fallback.section || "",
    size: sizeOptions.includes(photo?.size) ? photo.size : fallback.size || "full",
    spacerAfter: Number.isFinite(Number(photo?.spacerAfter)) ? Number(photo.spacerAfter) : Number(fallback.spacerAfter) || 0,
    effect: normalizeEffect(photo?.effect, fallback.effect || "none"),
    joinWithPrevious:
      typeof photo?.joinWithPrevious === "boolean"
        ? photo.joinWithPrevious
        : typeof fallback.joinWithPrevious === "boolean"
          ? fallback.joinWithPrevious
          : false,
    landscape:
      typeof photo?.landscape === "boolean"
        ? photo.landscape
        : typeof fallback.landscape === "boolean"
          ? fallback.landscape
          : null,
    aspectRatio: Number.isFinite(Number(photo?.aspectRatio))
      ? Number(photo.aspectRatio)
      : Number.isFinite(Number(fallback.aspectRatio))
        ? Number(fallback.aspectRatio)
        : null,
  });

  const toSettingsPayload = (input = {}) => ({
    id: galleryId,
    title: typeof input.title === "string" ? input.title : title.textContent.trim(),
    spacing: ["tight", "default", "airy"].includes(input.spacing) ? input.spacing : "tight",
    effect: normalizeEffect(input.effect),
    sections: normalizeSections(input.sections),
    photos: Array.isArray(input.photos) ? input.photos.map((photo) => normalizePhoto(photo)) : [],
  });

  const getSettingsSignature = (input = {}) => JSON.stringify(toSettingsPayload(input));

  const savedState = (() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  })();

  const jsonState = settingsUrl
    ? await fetch(settingsUrl, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null)
    : null;
  let currentSyncedSignature = jsonState ? getSettingsSignature(jsonState) : "";

  const jsonSections = normalizeSections(jsonState?.sections);
  const jsonPhotos = Array.isArray(jsonState?.photos)
    ? jsonState.photos.map((photo) => normalizePhoto(photo))
    : [];
  const basePhotos = originalPhotos.length ? originalPhotos : jsonPhotos;

  const mergePhotos = (savedPhotos) => {
    if (!Array.isArray(savedPhotos) || !savedPhotos.length) {
      return basePhotos.map((photo) => normalizePhoto(photo));
    }

    const baseBySrc = new Map(basePhotos.map((photo) => [photo.src, photo]));
    const merged = savedPhotos
      .filter((photo) => typeof photo?.src === "string" && (baseBySrc.has(photo.src) || !basePhotos.length))
      .map((photo) => normalizePhoto(photo, baseBySrc.get(photo.src)));

    basePhotos.forEach((photo) => {
      if (!merged.some((item) => item.src === photo.src)) {
        merged.push(normalizePhoto(photo));
      }
    });

    return merged;
  };

  const deriveSectionsFromPhotos = (photos) => {
    const derived = [];
    photos.forEach((photo) => {
      if (!photo.section || derived.some((section) => section.id === photo.section)) {
        return;
      }
      derived.push({
        id: photo.section,
        title: photo.section,
      });
    });
    return derived;
  };

  const shouldUseSavedState = !jsonState && Boolean(savedState);
  const preferredState = jsonState || savedState;

  const state = {
    title:
      (typeof preferredState?.title === "string" && preferredState.title.trim()) ||
      title.textContent.trim(),
    spacing: ["tight", "default", "airy"].includes(preferredState?.spacing) ? preferredState.spacing : "tight",
    effect: normalizeEffect(preferredState?.effect),
    photos: mergePhotos(preferredState?.photos),
    sections: normalizeSections(preferredState?.sections).length
      ? normalizeSections(preferredState?.sections)
      : jsonSections.length && !shouldUseSavedState
        ? jsonSections
        : deriveSectionsFromPhotos(basePhotos),
    editing: false,
    previewing: false,
  };

  if (!shouldUseSavedState && jsonState) {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        title: state.title,
        spacing: state.spacing,
        effect: state.effect,
        sections: state.sections,
        photos: state.photos,
        meta: {
          dirty: false,
          baseSignature: currentSyncedSignature,
          syncedSignature: currentSyncedSignature,
        },
      })
    );
  }

  const ensureLandscapeState = (photo) => {
    if (!photo.landscape && photo.size === "extended") {
      photo.size = "full";
    }
  };

  state.photos.forEach(ensureLandscapeState);

  const spacingMap = {
    tight: "0.75rem",
    default: "1.25rem",
    airy: "2.5rem",
  };

  const save = () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        title: state.title,
        spacing: state.spacing,
        effect: state.effect,
        sections: state.sections,
        photos: state.photos,
        meta: {
          dirty: true,
          baseSignature: currentSyncedSignature,
          syncedSignature: "",
        },
      })
    );
  };

  let saveState = {
    pending: false,
    message: "",
  };

  const serializeSettings = () => ({
    id: galleryId,
    title: state.title,
    spacing: state.spacing,
    effect: state.effect,
    sections: state.sections,
    photos: state.photos.map((photo) => ({
      src: photo.src,
      alt: photo.alt,
      section: photo.section,
      size: photo.size,
      spacerAfter: photo.spacerAfter,
      effect: photo.effect,
      joinWithPrevious: photo.joinWithPrevious,
    })),
  });

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
        render();
      }
    });
    image.src = photo.src;
  };

  state.photos.forEach((photo, index) => {
    loadLandscapeState(photo, index);
  });

  syncMobileLayoutState();
  if (typeof mobileLayoutQuery.addEventListener === "function") {
    mobileLayoutQuery.addEventListener("change", syncMobileLayoutState);
  } else if (typeof mobileLayoutQuery.addListener === "function") {
    mobileLayoutQuery.addListener(syncMobileLayoutState);
  }
  window.addEventListener("resize", syncMobileLayoutState);
  window.addEventListener("orientationchange", syncMobileLayoutState);

  const updateMobileExtendedLayout = () => {
    if (!body.classList.contains("is-mobile-layout")) {
      grid.querySelectorAll(".editable-photo.mobile-extended-candidate").forEach((wrapper) => {
        wrapper.style.removeProperty("--mobile-extended-frame-height");
        wrapper.style.removeProperty("--mobile-extended-image-width");
        wrapper.style.removeProperty("--mobile-extended-image-height");
      });
      return;
    }

    grid.querySelectorAll(".editable-photo.mobile-extended-candidate").forEach((wrapper) => {
      const ratio = Number(wrapper.dataset.ratio);
      const frameWidth = wrapper.clientWidth;
      if (!(ratio > 1) || !(frameWidth > 0)) {
        return;
      }

      wrapper.style.setProperty("--mobile-extended-frame-height", `${frameWidth * ratio}px`);
      wrapper.style.setProperty("--mobile-extended-image-width", `${frameWidth * ratio}px`);
      wrapper.style.setProperty("--mobile-extended-image-height", `${frameWidth}px`);
    });
  };

  const updateSpotlightLayout = () => {
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const spotlightTravel = viewportHeight * 0.8;

    grid.querySelectorAll(".editable-photo.spotlight-shell").forEach((wrapper) => {
      const stage = wrapper.querySelector(".photo-stage");
      if (!(stage instanceof HTMLElement)) {
        return;
      }

      const stageHeight = stage.getBoundingClientRect().height;
      if (!(stageHeight > 0)) {
        return;
      }

      const centeredTop = Math.max(0, (viewportHeight - stageHeight) / 2);
      wrapper.style.setProperty("--spotlight-shell-top-gap", `0px`);
      wrapper.style.setProperty("--spotlight-shell-bottom-gap", `${spotlightTravel}px`);
      wrapper.style.setProperty("--spotlight-stage-top", `${centeredTop}px`);
    });
  };

  const exportSettings = () => {
    const json = JSON.stringify(serializeSettings(), null, 2);
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
    if (!settingsUrl || saveState.pending) {
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
          settingsPath: settingsUrl.replace(/^\.\//, ""),
          settings: serializeSettings(),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Save failed");
      }

      const savedSignature = getSettingsSignature(serializeSettings());
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          title: state.title,
          spacing: state.spacing,
          effect: state.effect,
          sections: state.sections,
          photos: state.photos,
          meta: {
            dirty: false,
            baseSignature: savedSignature,
            syncedSignature: savedSignature,
          },
        })
      );
      currentSyncedSignature = savedSignature;

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

  const headerControls = document.createElement("div");
  headerControls.className = "header-edit-controls";
  headerControls.innerHTML = `
    <input class="header-edit-input" type="text" aria-label="Album title" />
    <select class="header-edit-select" aria-label="Space between photos">
      <option value="tight">Tight spacing</option>
      <option value="default">Default spacing</option>
      <option value="airy">Airy spacing</option>
    </select>
    <select class="header-edit-select" aria-label="Album effect">
      <option value="none">No Effect</option>
      <option value="spotlight">Spotlight</option>
      <option value="monochrome">Monochrome</option>
      <option value="drift">Drift</option>
      <option value="veil">Veil</option>
    </select>
  `;
  header.appendChild(headerControls);

  const titleInput = headerControls.querySelector(".header-edit-input");
  const [spacingSelect, effectSelect] = headerControls.querySelectorAll(".header-edit-select");

  let effectFrame = null;

  const clearEffects = () => {
    body.classList.remove("has-scroll-effect", "effect-spotlight", "effect-monochrome", "effect-drift", "effect-veil");
    body.style.removeProperty("--effect-strength");
    grid.querySelectorAll(".editable-photo").forEach((photo) => {
      photo.classList.remove("is-effect-active");
      photo.style.removeProperty("--effect-strength");
      photo.style.removeProperty("--spotlight-follow-offset");
    });
  };

  const clearEffectVisuals = () => {
    body.classList.remove("has-scroll-effect", "effect-spotlight", "effect-monochrome", "effect-drift", "effect-veil");
    body.style.removeProperty("--effect-strength");
    grid.querySelectorAll(".editable-photo").forEach((photo) => {
      photo.classList.remove("is-effect-active");
      photo.style.removeProperty("--effect-strength");
      photo.style.removeProperty("--spotlight-follow-offset");
    });
  };

  const effectsShouldRun = () =>
    (state.effect !== "none" || state.photos.some((photo) => photo.effect !== "none")) && (!state.editing || state.previewing);

  const updateEffects = () => {
    effectFrame = null;

    if (!effectsShouldRun()) {
      clearEffects();
      return;
    }

    const photos = Array.from(grid.querySelectorAll(".editable-photo"));
    if (!photos.length) {
      clearEffects();
      return;
    }

    const effectPhotos = photos.filter((photo) => normalizeEffect(photo.dataset.effect) !== "none");
    if (!effectPhotos.length) {
      clearEffects();
      return;
    }

    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportCenter = viewportHeight * 0.5;
    const fadeRange = viewportHeight * 0.85;
    const triggerRange = state.effect !== "none" ? Number.POSITIVE_INFINITY : viewportHeight * 1.1;
    let activePhoto = null;
    let activeEffect = "none";
    let effectStrength = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    let spotlightProgress = 0.5;

    photos.forEach((photo) => {
      photo.classList.remove("is-effect-active");
      photo.style.setProperty("--effect-strength", "0");
      photo.style.removeProperty("--spotlight-follow-offset");
    });

    const spotlightPhotos = effectPhotos.filter((photo) => normalizeEffect(photo.dataset.effect) === "spotlight");
    spotlightPhotos.forEach((photo) => {
      const rect = photo.getBoundingClientRect();
      const stage = photo.querySelector(".photo-stage");
      const stageRect = stage instanceof HTMLElement ? stage.getBoundingClientRect() : rect;
      const stickyTop = Math.max(0, (viewportHeight - stageRect.height) / 2);
      const activeWindow = Math.max(1, rect.height - stageRect.height);
      const isInWindow = rect.top <= stickyTop && rect.bottom >= stickyTop + stageRect.height;
      if (!isInWindow) {
        return;
      }

      const stageCenter = stageRect.top + stageRect.height / 2;
      const distance = Math.abs(stageCenter - viewportCenter);
      if (distance < closestDistance) {
        const rawProgress = (stickyTop - rect.top) / activeWindow;
        const clampedProgress = Math.max(0, Math.min(1, rawProgress));
        const edgeStrength = Math.min(clampedProgress, 1 - clampedProgress) * 2;
        closestDistance = distance;
        activePhoto = photo;
        activeEffect = "spotlight";
        effectStrength = Math.max(0.2, Math.min(1, edgeStrength));
        spotlightProgress = clampedProgress;
      }
    });

    if (!activePhoto) {
      closestDistance = Number.POSITIVE_INFINITY;
      effectPhotos
        .filter((photo) => normalizeEffect(photo.dataset.effect) !== "spotlight")
        .forEach((photo) => {
          const rect = photo.getBoundingClientRect();
          const photoCenter = rect.top + rect.height / 2;
          const distance = Math.abs(photoCenter - viewportCenter);

          if (distance < closestDistance) {
            closestDistance = distance;
            activePhoto = photo;
            activeEffect = normalizeEffect(photo.dataset.effect);
            effectStrength = Math.max(0, Math.min(1, 1 - distance / fadeRange));
          }
        });
    }

    if (!activePhoto || (activeEffect !== "spotlight" && closestDistance > triggerRange)) {
      clearEffectVisuals();
      return;
    }

    body.classList.remove("effect-spotlight", "effect-monochrome", "effect-drift", "effect-veil");
    body.classList.add("has-scroll-effect", `effect-${activeEffect}`);
    body.style.setProperty("--effect-strength", effectStrength.toFixed(3));
    activePhoto.classList.add("is-effect-active");
    activePhoto.style.setProperty("--effect-strength", effectStrength.toFixed(3));
    if (activeEffect === "spotlight") {
      const followOffset = (0.5 - spotlightProgress) * viewportHeight * 0.16;
      activePhoto.style.setProperty("--spotlight-follow-offset", `${followOffset.toFixed(2)}px`);
    }
  };

  const queueEffectUpdate = () => {
    if (effectFrame !== null) {
      return;
    }

    effectFrame = window.requestAnimationFrame(updateEffects);
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

  const getSpacerValue = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric}rem` : "0rem";
  };

  const updateSpacer = (index, value) => {
    const numeric = Math.max(0, Math.min(50, Number(value) || 0));
    state.photos[index].spacerAfter = numeric;
    save();
    render();
  };

  const canJoinPhoto = (index) => {
    if (index <= 0) {
      return false;
    }

    const current = state.photos[index];
    const previous = state.photos[index - 1];
    if (!current || !previous) {
      return false;
    }

    const currentEffect = normalizeEffect(current.effect !== "none" ? current.effect : state.effect);
    const previousEffect = normalizeEffect(previous.effect !== "none" ? previous.effect : state.effect);
    if (current.section !== previous.section || currentEffect === "spotlight" || previousEffect === "spotlight") {
      return false;
    }

    let rowSize = 1;
    let cursor = index - 1;
    while (cursor > 0 && state.photos[cursor].joinWithPrevious && state.photos[cursor - 1]?.section === previous.section) {
      rowSize += 1;
      cursor -= 1;
    }

    return rowSize < 3;
  };

  const createPhotoFigure = (photo, index) => {
    const effectiveEffect = photo.effect !== "none" ? photo.effect : state.effect;
    const wrapper = document.createElement("figure");
    const isExtendedLandscape = photo.size === "extended" && photo.landscape === true;
    const isJoinable = canJoinPhoto(index);
    const canShowUnjoin = photo.joinWithPrevious;
    wrapper.className = `editable-photo size-${photo.size}${Number(photo.spacerAfter) > 0 ? " has-spacer" : ""}${effectiveEffect === "spotlight" ? " spotlight-shell" : ""}${isExtendedLandscape ? " mobile-extended-candidate" : ""}${photo.joinWithPrevious && canJoinPhoto(index) ? " is-joined-photo" : ""}`;
    wrapper.dataset.index = String(index);
    wrapper.dataset.effect = effectiveEffect;
    wrapper.dataset.landscape = String(photo.landscape === true);
    wrapper.dataset.ratio = Number.isFinite(photo.aspectRatio) ? String(photo.aspectRatio) : "";
    wrapper.style.setProperty("--photo-after-space", getSpacerValue(photo.spacerAfter));
    wrapper.style.setProperty("--effect-direction", index % 2 === 0 ? "1" : "-1");
    const loading = index < 4 ? "eager" : "lazy";
    const fetchPriority = index < 2 ? "high" : "auto";
    const decoding = index < 4 ? "sync" : "async";
    wrapper.innerHTML = `
        <div class="photo-stage">
          <img class="reveal-up" src="${photo.src}" alt="${photo.alt}" loading="${loading}" fetchpriority="${fetchPriority}" decoding="${decoding}" />
          <div class="photo-controls">
            <button class="photo-control-button" type="button" data-action="up" aria-label="Move image up">↑</button>
            <button class="photo-control-button" type="button" data-action="down" aria-label="Move image down">↓</button>
            <select class="photo-size-select" data-action="size" aria-label="Photo size">
              ${photo.landscape === true ? `<option value="extended"${photo.size === "extended" ? " selected" : ""}>EXTENDED</option>` : ""}
              <option value="full"${photo.size === "full" ? " selected" : ""}>FULL WIDTH</option>
              <option value="medium"${photo.size === "medium" ? " selected" : ""}>MEDIUM</option>
              <option value="small"${photo.size === "small" ? " selected" : ""}>SMALL</option>
              <option value="xsmall"${photo.size === "xsmall" ? " selected" : ""}>EXTRA SMALL</option>
              <option value="xxsmall"${photo.size === "xxsmall" ? " selected" : ""}>TINY</option>
            </select>
            <button class="photo-toggle-button photo-join-button" type="button" data-action="join-toggle" aria-label="${canShowUnjoin ? "Unjoin image from previous row" : "Join image with previous row"}"${!canShowUnjoin && !isJoinable ? " disabled" : ""}>${canShowUnjoin ? "UNJOIN" : "JOIN"}</button>
            <select class="photo-effect-select" data-action="photo-effect" aria-label="Photo effect">
              <option value="none"${photo.effect === "none" ? " selected" : ""}>NONE</option>
              <option value="spotlight"${photo.effect === "spotlight" ? " selected" : ""}>SPOTLIGHT</option>
              <option value="monochrome"${photo.effect === "monochrome" ? " selected" : ""}>MONOCHROME</option>
              <option value="drift"${photo.effect === "drift" ? " selected" : ""}>DRIFT</option>
              <option value="veil"${photo.effect === "veil" ? " selected" : ""}>VEIL</option>
            </select>
          </div>
          <div class="spacer-control">
            <button class="spacer-reset" type="button" data-action="spacer-reset" aria-label="Reset space after image">Reset</button>
            <label>
              SPACE
              <span class="spacer-value">${(Number(photo.spacerAfter) || 0).toFixed(2)}rem</span>
              <input class="spacer-slider" type="range" min="0" max="50" step="0.25" value="${Number(photo.spacerAfter) || 0}" aria-label="Space after image" />
            </label>
          </div>
        </div>
      `;
    return wrapper;
  };

  const render = () => {
    title.textContent = state.title;
    grid.style.setProperty("--album-gap", spacingMap[state.spacing]);
    titleInput.value = state.title;
    spacingSelect.value = state.spacing;
    effectSelect.value = state.effect;
    toggleButtons.forEach((button) => {
      button.textContent = state.editing ? "Done" : "Edit";
    });
    saveButtons.forEach((button) => {
      button.textContent = saveState.pending ? "Saving..." : saveState.message || "Save";
      button.disabled = saveState.pending;
    });
    exportButtons.forEach((button) => {
      button.textContent = "Export JSON";
    });
    body.classList.toggle("is-editing", state.editing);
    body.classList.toggle("is-previewing", state.editing && state.previewing);
    previewButtons.forEach((button) => {
      button.textContent = state.previewing ? "Show Editor" : "Preview";
      button.setAttribute("aria-pressed", state.previewing ? "true" : "false");
    });

    [subalbumIndex, subalbumFooterIndex].forEach((container) => {
      if (!container) {
        return;
      }

      container.innerHTML = "";
      container.classList.toggle("is-hidden", state.sections.length < 2);
      state.sections.forEach((section, index) => {
        const link = document.createElement("a");
        link.className = "subalbum-index-link";
        link.href = `#subalbum-${section.id}`;
        link.textContent = `${String(index + 1).padStart(2, "0")} ${section.title}`;
        container.appendChild(link);
      });
    });

    grid.innerHTML = "";
    const sectionOrder = state.sections.length ? state.sections : deriveSectionsFromPhotos(state.photos);
    const sectionsToRender = sectionOrder.length ? sectionOrder : [{ id: "", title: "" }];
    sectionsToRender.forEach((section, sectionIndex) => {
      const sectionPhotos = state.photos
        .map((photo, index) => ({ photo, index }))
        .filter(({ photo }) => (section.id ? photo.section === section.id : !photo.section));
      if (!sectionPhotos.length) {
        return;
      }

      if (section.id) {
        const heading = document.createElement("section");
        heading.className = "subalbum-section-heading";
        heading.id = `subalbum-${section.id}`;
        heading.innerHTML = `
          <h2 class="subalbum-title">${section.title || section.id}</h2>
        `;
        grid.appendChild(heading);
      }

      const blocks = [];
      sectionPhotos.forEach((entry) => {
        const previousBlock = blocks[blocks.length - 1];
        if (
          entry.photo.joinWithPrevious &&
          canJoinPhoto(entry.index) &&
          previousBlock &&
          ((previousBlock.type === "photo") || (previousBlock.type === "row" && previousBlock.entries.length < 3))
        ) {
          if (previousBlock.type === "photo") {
            blocks[blocks.length - 1] = {
              type: "row",
              entries: [previousBlock.entry, entry],
            };
          } else {
            previousBlock.entries.push(entry);
          }
          return;
        }

        blocks.push({
          type: "photo",
          entry,
        });
      });

      blocks.forEach((block) => {
        if (block.type === "row") {
          const row = document.createElement("div");
          row.className = "photo-join-row";
          row.style.setProperty("--photo-join-columns", String(block.entries.length));
          block.entries.forEach((entry) => {
            row.appendChild(createPhotoFigure(entry.photo, entry.index));
          });
          grid.appendChild(row);
          return;
        }

        grid.appendChild(createPhotoFigure(block.entry.photo, block.entry.index));
      });

      const nextSection = sectionsToRender[sectionIndex + 1];
      if (section.id && nextSection) {
        const nextLink = document.createElement("div");
        nextLink.className = "subalbum-next";
        nextLink.innerHTML = `<a class="subalbum-next-link" href="#subalbum-${nextSection.id}">Next: ${nextSection.title}</a>`;
        grid.appendChild(nextLink);
      }
    });

    queueEffectUpdate();
    window.requestAnimationFrame(() => {
      updateMobileExtendedLayout();
      updateSpotlightLayout();
    });
  };

  titleInput.addEventListener("input", (event) => {
    state.title = event.target.value || "Untitled Album";
    title.textContent = state.title;
    save();
  });

  spacingSelect.addEventListener("change", (event) => {
    state.spacing = event.target.value;
    grid.style.setProperty("--album-gap", spacingMap[state.spacing]);
    save();
  });

  effectSelect.addEventListener("change", (event) => {
    state.effect = normalizeEffect(event.target.value);
    save();
    queueEffectUpdate();
  });

  grid.addEventListener("click", (event) => {
    const button = event.target.closest(".photo-control-button, .spacer-reset, .photo-join-button");
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
    } else if (action === "spacer-reset") {
      updateSpacer(index, 0);
    } else if (action === "join-toggle") {
      if (state.photos[index].joinWithPrevious) {
        state.photos[index].joinWithPrevious = false;
      } else if (canJoinPhoto(index)) {
        state.photos[index].joinWithPrevious = true;
      }
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
      } else {
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
    wrapper.style.setProperty("--photo-after-space", getSpacerValue(state.photos[index].spacerAfter));
    const valueLabel = wrapper.querySelector(".spacer-value");
    if (valueLabel) {
      valueLabel.textContent = `${state.photos[index].spacerAfter.toFixed(2)}rem`;
    }
    save();
  });

  toggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.editing = !state.editing;
      if (!state.editing) {
        state.previewing = false;
      }
      render();
    });
  });

  previewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.editing) {
        return;
      }

      state.previewing = !state.previewing;
      render();
    });
  });

  window.addEventListener("keydown", (event) => {
    const isMacToggle = event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "e";
    if (!isMacToggle) {
      return;
    }

    const target = event.target;
    const isTypingTarget =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT");

    if (isTypingTarget) {
      return;
    }

    event.preventDefault();
    state.editing = !state.editing;
    if (!state.editing) {
      state.previewing = false;
    }
    render();
  });

  saveButtons.forEach((button) => {
    button.addEventListener("click", saveSettingsToGitHub);
  });
  exportButtons.forEach((button) => {
    button.addEventListener("click", exportSettings);
  });

  window.addEventListener("scroll", queueEffectUpdate, { passive: true });
  window.addEventListener("resize", () => {
    queueEffectUpdate();
    updateMobileExtendedLayout();
    updateSpotlightLayout();
  });
  window.addEventListener("orientationchange", () => {
    updateMobileExtendedLayout();
    updateSpotlightLayout();
  });
  window.addEventListener("load", () => {
    queueEffectUpdate();
    updateMobileExtendedLayout();
    updateSpotlightLayout();
  });
  grid.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLImageElement) {
        queueEffectUpdate();
        updateMobileExtendedLayout();
        updateSpotlightLayout();
      }
    },
    true
  );

  render();
};

const setupLightbox = () => {
  const lightbox = document.querySelector("#lightbox");
  const lightboxImage = lightbox?.querySelector(".lightbox-image");
  const closeButton = lightbox?.querySelector(".lightbox-close");
  const grid = document.querySelector(".album-detail-grid");

  if (!lightbox || !lightboxImage || !closeButton || !grid) {
    return;
  }

  const gesture = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    pinchDistance: 0,
    pinchCenterX: 0,
    pinchCenterY: 0,
    panStartX: 0,
    panStartY: 0,
    panBaseX: 0,
    panBaseY: 0,
  };

  const applyImageTransform = () => {
    lightboxImage.style.transform = `translate(${gesture.translateX}px, ${gesture.translateY}px) scale(${gesture.scale})`;
    lightboxImage.style.cursor = gesture.scale > 1 ? "grab" : "";
  };

  const resetImageTransform = () => {
    gesture.scale = 1;
    gesture.translateX = 0;
    gesture.translateY = 0;
    gesture.pinchDistance = 0;
    gesture.pinchCenterX = 0;
    gesture.pinchCenterY = 0;
    gesture.panStartX = 0;
    gesture.panStartY = 0;
    gesture.panBaseX = 0;
    gesture.panBaseY = 0;
    applyImageTransform();
  };

  const getTouchDistance = (touches) => {
    const [first, second] = touches;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  };

  const getTouchMidpoint = (touches) => {
    const [first, second] = touches;
    return {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    };
  };

  const close = () => {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImage.setAttribute("src", "");
    lightboxImage.setAttribute("alt", "");
    document.body.style.overflow = "";
    resetImageTransform();
  };

  grid.addEventListener("click", (event) => {
    const image = event.target.closest("img");
    const insideControls = event.target.closest(".photo-controls, .spacer-control");

    if (!image || insideControls) {
      return;
    }

    lightboxImage.setAttribute("src", image.getAttribute("src") || "");
    lightboxImage.setAttribute("alt", image.getAttribute("alt") || "");
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    resetImageTransform();
  });

  closeButton.addEventListener("click", close);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      close();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox.classList.contains("is-open")) {
      close();
    }
  });

  lightboxImage.addEventListener(
    "touchstart",
    (event) => {
      if (!lightbox.classList.contains("is-open")) {
        return;
      }

      if (event.touches.length === 2) {
        event.preventDefault();
        gesture.pinchDistance = getTouchDistance(event.touches);
        const midpoint = getTouchMidpoint(event.touches);
        gesture.pinchCenterX = midpoint.x;
        gesture.pinchCenterY = midpoint.y;
      } else if (event.touches.length === 1 && gesture.scale > 1) {
        gesture.panStartX = event.touches[0].clientX;
        gesture.panStartY = event.touches[0].clientY;
        gesture.panBaseX = gesture.translateX;
        gesture.panBaseY = gesture.translateY;
      }
    },
    { passive: false }
  );

  lightboxImage.addEventListener(
    "touchmove",
    (event) => {
      if (!lightbox.classList.contains("is-open")) {
        return;
      }

      if (event.touches.length === 2) {
        event.preventDefault();
        const distance = getTouchDistance(event.touches);
        const midpoint = getTouchMidpoint(event.touches);
        if (!gesture.pinchDistance) {
          gesture.pinchDistance = distance;
          gesture.pinchCenterX = midpoint.x;
          gesture.pinchCenterY = midpoint.y;
        }

        const previousScale = gesture.scale;
        const nextScale = Math.min(4, Math.max(1, previousScale * (distance / gesture.pinchDistance)));
        const rect = lightboxImage.getBoundingClientRect();
        const rectCenterX = rect.left + rect.width / 2;
        const rectCenterY = rect.top + rect.height / 2;
        const midpointDeltaX = midpoint.x - gesture.pinchCenterX;
        const midpointDeltaY = midpoint.y - gesture.pinchCenterY;

        gesture.translateX += midpointDeltaX;
        gesture.translateY += midpointDeltaY;

        if (previousScale > 0 && nextScale !== previousScale) {
          const offsetX = midpoint.x - rectCenterX - gesture.translateX;
          const offsetY = midpoint.y - rectCenterY - gesture.translateY;
          const scaleRatio = nextScale / previousScale;
          gesture.translateX += (1 - scaleRatio) * offsetX;
          gesture.translateY += (1 - scaleRatio) * offsetY;
        }

        gesture.scale = nextScale;
        gesture.pinchDistance = distance;
        gesture.pinchCenterX = midpoint.x;
        gesture.pinchCenterY = midpoint.y;

        if (gesture.scale <= 1) {
          gesture.translateX = 0;
          gesture.translateY = 0;
        }
        applyImageTransform();
      } else if (event.touches.length === 1 && gesture.scale > 1) {
        event.preventDefault();
        const touch = event.touches[0];
        gesture.translateX = gesture.panBaseX + (touch.clientX - gesture.panStartX);
        gesture.translateY = gesture.panBaseY + (touch.clientY - gesture.panStartY);
        applyImageTransform();
      }
    },
    { passive: false }
  );

  lightboxImage.addEventListener("touchend", (event) => {
    if (gesture.scale <= 1) {
      resetImageTransform();
      return;
    }

    if (event.touches.length === 1) {
      gesture.pinchDistance = 0;
      gesture.pinchCenterX = 0;
      gesture.pinchCenterY = 0;
      gesture.panStartX = event.touches[0].clientX;
      gesture.panStartY = event.touches[0].clientY;
      gesture.panBaseX = gesture.translateX;
      gesture.panBaseY = gesture.translateY;
      return;
    }

    if (event.touches.length === 2) {
      gesture.pinchDistance = getTouchDistance(event.touches);
      const midpoint = getTouchMidpoint(event.touches);
      gesture.pinchCenterX = midpoint.x;
      gesture.pinchCenterY = midpoint.y;
      return;
    }

    gesture.pinchDistance = 0;
    gesture.pinchCenterX = 0;
    gesture.pinchCenterY = 0;
  });

  lightboxImage.addEventListener("touchcancel", () => {
    if (gesture.scale <= 1) {
      resetImageTransform();
      return;
    }

    gesture.pinchDistance = 0;
    gesture.pinchCenterX = 0;
    gesture.pinchCenterY = 0;
  });
};

setupReveals();
setupAlbumLinks();
setupMobileMenu();
setupParallax();
setupAlbumEditor();
setupLightbox();
