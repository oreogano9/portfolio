export const createAlbumEffects = ({ body, grid, state, normalizeEffect }) => {
  const mobileLayoutQuery = window.matchMedia("(max-width: 760px), (hover: none), (pointer: coarse)");
  let effectFrame = null;

  const syncMobileLayoutState = () => {
    body.classList.toggle("is-mobile-layout", mobileLayoutQuery.matches);
  };

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
    const spotlightTravel = viewportHeight * (body.classList.contains("is-mobile-layout") ? 0.62 : 0.78);
    const shouldUseSpotlightLayout = !state.editing || state.previewing;

    grid.querySelectorAll(".editable-photo.spotlight-shell").forEach((wrapper) => {
      const stage = wrapper.querySelector(".photo-stage");
      if (!(stage instanceof HTMLElement)) {
        return;
      }

      if (!shouldUseSpotlightLayout) {
        wrapper.style.removeProperty("--spotlight-shell-height");
        wrapper.style.removeProperty("--spotlight-stage-top");
        wrapper.style.removeProperty("--spotlight-shell-travel");
        return;
      }

      const stageHeight = stage.getBoundingClientRect().height;
      if (!(stageHeight > 0)) {
        return;
      }

      const centeredTop = Math.max(0, (viewportHeight - stageHeight) / 2);
      const shellHeight = stageHeight + spotlightTravel;
      wrapper.style.setProperty("--spotlight-shell-height", `${shellHeight}px`);
      wrapper.style.setProperty("--spotlight-stage-top", `${centeredTop}px`);
      wrapper.style.setProperty("--spotlight-shell-travel", `${spotlightTravel}px`);
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
      const stickyTop = parseFloat(photo.style.getPropertyValue("--spotlight-stage-top")) || Math.max(0, (viewportHeight - stageRect.height) / 2);
      const activeWindow = Math.max(
        1,
        parseFloat(photo.style.getPropertyValue("--spotlight-shell-travel")) || rect.height - stageRect.height
      );
      const stickyBottom = stickyTop + stageRect.height;
      const isInWindow = rect.top <= stickyTop && rect.bottom >= stickyBottom;
      if (!isInWindow) {
        return;
      }

      const stageCenter = stageRect.top + stageRect.height / 2;
      const distance = Math.abs(stageCenter - viewportCenter);
      if (distance < closestDistance) {
        const rawProgress = (stickyTop - rect.top) / activeWindow;
        const clampedProgress = Math.max(0, Math.min(1, rawProgress));
        const centerDistanceStrength = Math.max(0, 1 - distance / (viewportHeight * 0.38));
        const edgeStrength = Math.min(clampedProgress, 1 - clampedProgress) * 2;
        closestDistance = distance;
        activePhoto = photo;
        activeEffect = "spotlight";
        effectStrength = Math.max(0.22, Math.min(1, Math.max(edgeStrength, centerDistanceStrength)));
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
      const followOffset = (0.5 - spotlightProgress) * viewportHeight * 0.08;
      activePhoto.style.setProperty("--spotlight-follow-offset", `${followOffset.toFixed(2)}px`);
    }
  };

  const queueEffectUpdate = () => {
    if (effectFrame !== null) {
      return;
    }
    effectFrame = window.requestAnimationFrame(updateEffects);
  };

  const bind = () => {
    syncMobileLayoutState();
    if (typeof mobileLayoutQuery.addEventListener === "function") {
      mobileLayoutQuery.addEventListener("change", syncMobileLayoutState);
    } else if (typeof mobileLayoutQuery.addListener === "function") {
      mobileLayoutQuery.addListener(syncMobileLayoutState);
    }

    window.addEventListener("resize", () => {
      syncMobileLayoutState();
      queueEffectUpdate();
      updateMobileExtendedLayout();
      updateSpotlightLayout();
    });
    window.addEventListener("orientationchange", () => {
      syncMobileLayoutState();
      updateMobileExtendedLayout();
      updateSpotlightLayout();
    });
    window.addEventListener("load", () => {
      queueEffectUpdate();
      updateMobileExtendedLayout();
      updateSpotlightLayout();
    });
    window.addEventListener("scroll", queueEffectUpdate, { passive: true });

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
  };

  return {
    bind,
    queueEffectUpdate,
    updateMobileExtendedLayout,
    updateSpotlightLayout,
    syncMobileLayoutState,
  };
};
