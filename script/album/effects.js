export const createAlbumEffects = ({ body, grid, state, normalizeEffect, logDebug = () => {} }) => {
  const mobileLayoutQuery = window.matchMedia("(max-width: 760px), (hover: none), (pointer: coarse)");
  const effectClassNames = ["effect-focus", "effect-monochrome", "effect-lift", "effect-blur"];
  const visiblePhotos = new Set();
  let effectFrame = null;
  let visibilityObserver = null;
  let lastResizeWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  let previousActivePhoto = null;
  let previousActiveEffect = "none";
  let previousEffectStrength = 0;
  const mobileSideviewGridSelector = '.editable-photo:not(.is-deleted-photo)[data-ratio]:not([data-ratio=""])';

  const syncMobileLayoutState = () => {
    const isMobileLayout = mobileLayoutQuery.matches;
    const sideviewActive = state.runtimeMobileSideviewActive === true;
    const heroIntro = document.querySelector(".album-hero-intro");
    const header = document.querySelector(".album-page-header");
    const hasSideviewHero = sideviewActive && heroIntro?.classList.contains("mobile-sideview-hero");

    body.classList.toggle("is-mobile-layout", isMobileLayout);
    body.classList.toggle("has-mobile-sideview-mode", sideviewActive);
    body.classList.toggle("has-mobile-sideview-hero", Boolean(hasSideviewHero));
    body.classList.toggle("has-mobile-sideview-grid", sideviewActive);
    header?.classList.toggle("has-mobile-sideview-hero", Boolean(hasSideviewHero));
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    body.classList.toggle("has-scrolled-away", isMobileLayout && scrollTop > 8);
  };

  const clearEffects = () => {
    visibilityObserver?.disconnect();
    visibilityObserver = null;
    visiblePhotos.clear();
    body.classList.remove("has-scroll-effect", ...effectClassNames);
    body.style.removeProperty("--effect-strength");
    body.style.removeProperty("--effect-focus-opacity");
    body.style.removeProperty("--effect-focus-active-scale");
    body.style.removeProperty("--effect-monochrome-opacity");
    body.style.removeProperty("--effect-monochrome-grayscale");
    body.style.removeProperty("--effect-monochrome-active-scale");
    body.style.removeProperty("--effect-lift-opacity");
    body.style.removeProperty("--effect-lift-scale");
    body.style.removeProperty("--effect-lift-shadow-opacity");
    body.style.removeProperty("--effect-blur-radius");
    body.style.removeProperty("--effect-blur-scale");
    body.style.removeProperty("--effect-blur-saturation-drop");
    body.style.removeProperty("--effect-blur-opacity");
    previousActivePhoto = null;
    previousActiveEffect = "none";
    previousEffectStrength = 0;
    grid.querySelectorAll(".editable-photo").forEach((photo) => {
      photo.classList.remove("is-effect-active", "is-effect-visible");
      photo.style.removeProperty("--effect-strength");
    });
  };

  const syncEffectVariables = () => {
    const settings = state.effectSettings || {};
    body.style.setProperty("--effect-focus-opacity", String((settings.focus?.nonFocusedOpacity ?? 12) / 100));
    body.style.setProperty("--effect-focus-active-scale", String((settings.focus?.activeScale ?? 1.5) / 100));
    body.style.setProperty("--effect-monochrome-opacity", String((settings.monochrome?.nonFocusedOpacity ?? 38) / 100));
    body.style.setProperty("--effect-monochrome-grayscale", `${settings.monochrome?.grayscaleAmount ?? 100}%`);
    body.style.setProperty("--effect-monochrome-active-scale", String((settings.monochrome?.activeScale ?? 0) / 100));
    body.style.setProperty("--effect-lift-opacity", String((settings.lift?.nonFocusedOpacity ?? 34) / 100));
    body.style.setProperty("--effect-lift-scale", String((settings.lift?.scaleAmount ?? 2.4) / 100));
    body.style.setProperty("--effect-lift-shadow-opacity", String((settings.lift?.shadowOpacity ?? 12) / 100));
    body.style.setProperty("--effect-blur-radius", `${settings.blur?.blurRadius ?? 12}px`);
    body.style.setProperty("--effect-blur-scale", String((settings.blur?.scaleAmount ?? 1.2) / 100));
    body.style.setProperty("--effect-blur-saturation-drop", String((settings.blur?.saturationDrop ?? 4) / 100));
    body.style.setProperty("--effect-blur-opacity", String((settings.blur?.nonFocusedOpacity ?? 100) / 100));
  };

  const effectsShouldRun = () =>
    (state.effect !== "none" || state.photos.some((photo) => photo.effect !== "none")) && (!state.editing || state.previewing);

  const updateMobileExtendedLayout = () => {
    grid.querySelectorAll(".editable-photo").forEach((wrapper) => {
      wrapper.style.removeProperty("--mobile-extended-frame-height");
      wrapper.style.removeProperty("--mobile-extended-image-width");
      wrapper.style.removeProperty("--mobile-extended-image-height");
      wrapper.style.removeProperty("--mobile-extended-image-scale");
      wrapper.style.removeProperty("--mobile-photo-stage-scale");
      wrapper.classList.remove("is-mobile-extended-active", "is-mobile-extended-neighbor");
    });

    const manualRotatePreview = body.classList.contains("has-manual-rotate-preview");
    const shouldRunMobileExtendedEffect =
      (body.classList.contains("is-mobile-layout") || manualRotatePreview) && (!state.editing || state.previewing);
    const hasSideviewGrid = body.classList.contains("has-mobile-sideview-grid") || manualRotatePreview;
    body.classList.remove("has-mobile-extended-focus");

    if (!shouldRunMobileExtendedEffect) {
      return;
    }

    const rotateTargets = hasSideviewGrid ? Array.from(grid.querySelectorAll(mobileSideviewGridSelector)) : [];
    if (rotateTargets.length) {
      logDebug("rotate-layout", {
        targets: rotateTargets.length,
      });
    }

    let manualNormalizedImageHeight = null;
    if (manualRotatePreview && rotateTargets.length) {
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const safetyInset = 2;
      const maxFrameWidth = Math.max(0, viewportWidth - 20 - safetyInset * 2);
      const maxFrameHeight = Math.max(0, viewportHeight * 0.92 - safetyInset * 2);
      const maxRatio = rotateTargets.reduce((largest, wrapper) => {
        const ratio = Number(wrapper.dataset.ratio);
        return Number.isFinite(ratio) && ratio > 0 ? Math.max(largest, ratio) : largest;
      }, 1);
      manualNormalizedImageHeight = Math.max(0, Math.min(maxFrameWidth, maxFrameHeight / maxRatio));
    }

    rotateTargets.forEach((wrapper) => {
      const ratio = Number(wrapper.dataset.ratio);
      const computedStyle = window.getComputedStyle(wrapper);
      const gutter =
        parseFloat(computedStyle.getPropertyValue("--mobile-rotate-inline-gutter")) ||
        parseFloat(computedStyle.paddingLeft) ||
        0;
      const safetyInset = 2;
      const frameWidth = Math.max(0, wrapper.clientWidth - gutter * 2 - safetyInset * 2);
      if (!(ratio > 0) || !(frameWidth > 0)) {
        return;
      }

      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const maxFrameWidth = Math.max(0, viewportWidth - 20 - safetyInset * 2);
      const maxFrameHeight = Math.max(0, viewportHeight * 0.92 - safetyInset * 2);
      const fittedFrameWidth = Math.min(frameWidth, maxFrameWidth);
      const fittedImageHeight =
        manualRotatePreview && Number.isFinite(manualNormalizedImageHeight) && manualNormalizedImageHeight > 0
          ? Math.min(fittedFrameWidth, manualNormalizedImageHeight)
          : Math.min(fittedFrameWidth, maxFrameHeight / ratio);
      const fittedFrameHeight = Math.min(fittedImageHeight * ratio, maxFrameHeight);

      wrapper.style.setProperty("--mobile-extended-frame-height", `${fittedFrameHeight}px`);
      wrapper.style.setProperty("--mobile-extended-image-width", `${fittedFrameHeight}px`);
      wrapper.style.setProperty("--mobile-extended-image-height", `${fittedImageHeight}px`);
    });

    const extendedTargets = Array.from(grid.querySelectorAll(".editable-photo.size-extended:not(.is-deleted-photo)"));
    if (!extendedTargets.length) {
      return;
    }

    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportCenter = viewportHeight * 0.5;
    const fadeRange = viewportHeight * 0.9;
    let activeExtended = null;
    let activeStrength = 0;
    let activeDistance = Number.POSITIVE_INFINITY;
    let activeCenter = viewportCenter;

    extendedTargets.forEach((wrapper) => {
      const rect = wrapper.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        return;
      }

      let distance = 0;
      if (viewportCenter < rect.top) {
        distance = rect.top - viewportCenter;
      } else if (viewportCenter > rect.bottom) {
        distance = viewportCenter - rect.bottom;
      }

      if (distance < activeDistance) {
        activeDistance = distance;
        activeExtended = wrapper;
        activeStrength = Math.max(0, Math.min(1, 1 - distance / fadeRange));
        activeCenter = rect.top + rect.height / 2;
      }
    });

    if (!(activeExtended instanceof HTMLElement) || activeStrength <= 0.01) {
      return;
    }

    body.classList.add("has-mobile-extended-focus");
    activeExtended.classList.add("is-mobile-extended-active");
    activeExtended.style.setProperty("--mobile-extended-image-scale", String(1 + activeStrength * 0.34));
    activeExtended.style.setProperty("--mobile-photo-stage-scale", "1");

    const neighborRange = viewportHeight * 1.1;
    Array.from(grid.querySelectorAll(".editable-photo")).forEach((wrapper) => {
      if (wrapper === activeExtended) {
        return;
      }

      const rect = wrapper.getBoundingClientRect();
      const photoCenter = rect.top + rect.height / 2;
      const relative = Math.max(0, 1 - Math.abs(photoCenter - activeCenter) / neighborRange);
      const stageScale = 1 - activeStrength * relative * 0.08;
      if (stageScale < 0.999) {
        wrapper.classList.add("is-mobile-extended-neighbor");
        wrapper.style.setProperty("--mobile-photo-stage-scale", stageScale.toFixed(3));
      }
    });
  };

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
      body.classList.remove("has-scroll-effect", ...effectClassNames);
      body.style.removeProperty("--effect-strength");
      photos.forEach((photo) => {
        photo.classList.remove("is-effect-active", "is-effect-visible");
        photo.style.removeProperty("--effect-strength");
      });
      return;
    }

    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportCenter = viewportHeight * 0.5;
    const fadeRange = viewportHeight * 0.72;
    const visiblePool = photos.filter((photo) => visiblePhotos.has(photo));
    const overallPool = visiblePool.length ? visiblePool : photos;
    const candidates = effectPhotos.filter((photo) => visiblePhotos.has(photo));
    const activePool = candidates.length ? candidates : effectPhotos;

    let activePhoto = null;
    let activeEffect = "none";
    let effectStrength = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    let nearestPhoto = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    photos.forEach((photo) => {
      photo.classList.toggle("is-effect-visible", visiblePhotos.has(photo));
      photo.classList.remove("is-effect-active");
      photo.style.setProperty("--effect-strength", "0");
    });

    overallPool.forEach((photo) => {
      const rect = photo.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        return;
      }

      const photoCenter = rect.top + rect.height / 2;
      const distance = Math.abs(photoCenter - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPhoto = photo;
      }
    });

    activePool.forEach((photo) => {
      const rect = photo.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        return;
      }

      const photoCenter = rect.top + rect.height / 2;
      const distance = Math.abs(photoCenter - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        activePhoto = photo;
        activeEffect = normalizeEffect(photo.dataset.effect);
        effectStrength = Math.max(0, Math.min(1, 1 - distance / fadeRange));
      }
    });

    if (activeEffect !== "none" && nearestPhoto instanceof HTMLElement) {
      const nearestEffect = normalizeEffect(nearestPhoto.dataset.effect);
      if (nearestEffect === "none" && nearestDistance <= closestDistance) {
        activePhoto = null;
        activeEffect = "none";
      }
    }

    if (!activePhoto || activeEffect === "none") {
      body.classList.remove("has-scroll-effect", ...effectClassNames);
      body.style.removeProperty("--effect-strength");
      previousActivePhoto = null;
      previousActiveEffect = "none";
      previousEffectStrength = 0;
      return;
    }

    if (
      activeEffect === "lift" &&
      previousActivePhoto instanceof HTMLElement &&
      previousActivePhoto !== activePhoto &&
      previousActiveEffect === "lift"
    ) {
      const previousRect = previousActivePhoto.getBoundingClientRect();
      if (previousRect.bottom > 0 && previousRect.top < viewportHeight) {
        const previousCenter = previousRect.top + previousRect.height / 2;
        const previousDistance = Math.abs(previousCenter - viewportCenter);
        const switchThreshold = 28;
        if (previousDistance <= closestDistance + switchThreshold) {
          activePhoto = previousActivePhoto;
          closestDistance = previousDistance;
          effectStrength = Math.max(0, Math.min(1, 1 - previousDistance / fadeRange));
        }
      }
    }

    if (activeEffect === previousActiveEffect) {
      const smoothing = activeEffect === "lift" ? 0.18 : 0.35;
      effectStrength = previousEffectStrength + (effectStrength - previousEffectStrength) * smoothing;
    }

    body.classList.remove(...effectClassNames);
    body.classList.add("has-scroll-effect", `effect-${activeEffect}`);
    body.style.setProperty("--effect-strength", effectStrength.toFixed(3));
    syncEffectVariables();
    activePhoto.classList.add("is-effect-active");
    activePhoto.style.setProperty("--effect-strength", effectStrength.toFixed(3));
    photos.forEach((photo) => {
      const photoEffect = normalizeEffect(photo.dataset.effect);
      const strength =
        photo === activePhoto
          ? effectStrength
          : photoEffect === activeEffect
            ? Math.max(0.2, effectStrength)
            : 0;
      photo.style.setProperty("--effect-strength", strength.toFixed(3));
    });
    previousActivePhoto = activePhoto;
    previousActiveEffect = activeEffect;
    previousEffectStrength = effectStrength;
  };

  const queueEffectUpdate = () => {
    if (effectFrame !== null) {
      return;
    }
    effectFrame = window.requestAnimationFrame(updateEffects);
  };

  const refreshEffectObservers = () => {
    visibilityObserver?.disconnect();
    visiblePhotos.clear();

    if (!effectsShouldRun()) {
      queueEffectUpdate();
      return;
    }

    visibilityObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const photo = entry.target;
          if (!(photo instanceof HTMLElement)) {
            return;
          }
          if (entry.isIntersecting && entry.intersectionRatio > 0.12) {
            visiblePhotos.add(photo);
          } else {
            visiblePhotos.delete(photo);
          }
        });
        queueEffectUpdate();
      },
      {
        threshold: [0, 0.12, 0.3, 0.55, 0.8, 1],
        rootMargin: "0px 0px -8% 0px",
      }
    );

    grid.querySelectorAll(".editable-photo").forEach((photo) => {
      visibilityObserver.observe(photo);
    });

    queueEffectUpdate();
  };

  const bind = () => {
    const handleScroll = () => {
      syncMobileLayoutState();
      updateMobileExtendedLayout();
      queueEffectUpdate();
    };

    syncMobileLayoutState();
    if (typeof mobileLayoutQuery.addEventListener === "function") {
      mobileLayoutQuery.addEventListener("change", syncMobileLayoutState);
    } else if (typeof mobileLayoutQuery.addListener === "function") {
      mobileLayoutQuery.addListener(syncMobileLayoutState);
    }

    window.addEventListener("resize", () => {
      syncMobileLayoutState();

      const nextWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const widthChanged = Math.abs(nextWidth - lastResizeWidth) >= 24;
      if (widthChanged) {
        lastResizeWidth = nextWidth;
        updateMobileExtendedLayout();
        refreshEffectObservers();
        return;
      }

      queueEffectUpdate();
    });
    window.addEventListener("orientationchange", () => {
      syncMobileLayoutState();
      updateMobileExtendedLayout();
      refreshEffectObservers();
    });
    window.addEventListener("load", () => {
      updateMobileExtendedLayout();
      refreshEffectObservers();
    });
    window.addEventListener("scroll", handleScroll, { passive: true });

    refreshEffectObservers();
  };

  return {
    bind,
    queueEffectUpdate,
    updateMobileExtendedLayout,
    updateSpotlightLayout: () => {},
    refreshSpotlightObservers: refreshEffectObservers,
    syncMobileLayoutState,
  };
};
