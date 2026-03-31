export const createAlbumEffects = ({ body, grid, state, normalizeEffect }) => {
  const mobileLayoutQuery = window.matchMedia("(max-width: 760px), (hover: none), (pointer: coarse)");
  let effectFrame = null;
  let spotlightObserver = null;
  let activeSpotlight = null;

  const syncMobileLayoutState = () => {
    body.classList.toggle("is-mobile-layout", mobileLayoutQuery.matches);
  };

  const clearEffects = () => {
    body.classList.remove("has-scroll-effect", "effect-spotlight", "effect-monochrome", "effect-drift", "effect-veil");
    body.style.removeProperty("--effect-strength");
    grid.querySelectorAll(".editable-photo").forEach((photo) => {
      photo.classList.remove("is-effect-active");
      photo.classList.remove("is-spotlight-active", "is-spotlight-entering", "is-spotlight-leaving");
      photo.style.removeProperty("--effect-strength");
      photo.style.removeProperty("--spotlight-follow-offset");
    });
  };

  const clearEffectVisuals = () => {
    body.classList.remove("has-scroll-effect", "effect-spotlight", "effect-monochrome", "effect-drift", "effect-veil");
    body.style.removeProperty("--effect-strength");
    grid.querySelectorAll(".editable-photo").forEach((photo) => {
      photo.classList.remove("is-effect-active");
      photo.classList.remove("is-spotlight-active", "is-spotlight-entering", "is-spotlight-leaving");
      photo.style.removeProperty("--effect-strength");
      photo.style.removeProperty("--spotlight-follow-offset");
    });
  };

  const disconnectSpotlightObserver = () => {
    spotlightObserver?.disconnect();
    spotlightObserver = null;
    activeSpotlight = null;
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
    const spotlightTravel = viewportHeight * (body.classList.contains("is-mobile-layout") ? 0.68 : 0.92);
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
      const shellHeight = Math.max(stageHeight + spotlightTravel, viewportHeight + stageHeight * 0.2);
      wrapper.style.setProperty("--spotlight-shell-height", `${shellHeight}px`);
      wrapper.style.setProperty("--spotlight-stage-top", `${centeredTop}px`);
      wrapper.style.setProperty("--spotlight-shell-travel", `${spotlightTravel}px`);
    });
  };

  const applySpotlightState = (wrapper, phase = "idle") => {
    if (!wrapper) {
      clearEffectVisuals();
      return;
    }

    grid.querySelectorAll(".editable-photo.spotlight-shell").forEach((photo) => {
      photo.classList.toggle("is-spotlight-active", photo === wrapper && phase === "active");
      photo.classList.toggle("is-spotlight-entering", photo === wrapper && phase === "entering");
      photo.classList.toggle("is-spotlight-leaving", photo === wrapper && phase === "leaving");
      photo.classList.toggle("is-effect-active", photo === wrapper && phase !== "idle");
      photo.style.setProperty("--effect-strength", photo === wrapper && phase !== "idle" ? "1" : "0");
      photo.style.removeProperty("--spotlight-follow-offset");
    });

    body.classList.remove("effect-monochrome", "effect-drift", "effect-veil");
    body.classList.add("has-scroll-effect", "effect-spotlight");
    body.style.setProperty("--effect-strength", "1");
  };

  const refreshSpotlightObservers = () => {
    disconnectSpotlightObserver();

    if (!effectsShouldRun()) {
      clearEffects();
      return;
    }

    const spotlightWrappers = Array.from(grid.querySelectorAll(".editable-photo.spotlight-shell"));
    if (!spotlightWrappers.length) {
      return;
    }

    spotlightObserver = new IntersectionObserver(
      (entries) => {
        let nextActive = null;
        let nextPhase = "idle";

        spotlightWrappers.forEach((wrapper) => {
          const topSentinel = wrapper.querySelector(".spotlight-sentinel-top");
          const bottomSentinel = wrapper.querySelector(".spotlight-sentinel-bottom");
          const topEntry = entries.find((entry) => entry.target === topSentinel);
          const bottomEntry = entries.find((entry) => entry.target === bottomSentinel);
          const topAboveTrigger =
            topEntry?.boundingClientRect.top !== undefined
              ? topEntry.boundingClientRect.top <= (window.visualViewport?.height || window.innerHeight) * 0.5
              : false;
          const bottomAboveTrigger =
            bottomEntry?.boundingClientRect.top !== undefined
              ? bottomEntry.boundingClientRect.top <= (window.visualViewport?.height || window.innerHeight) * 0.5
              : false;

          if (topAboveTrigger && !bottomAboveTrigger) {
            nextActive = wrapper;
            nextPhase = "active";
          } else if (!topAboveTrigger && topEntry?.isIntersecting) {
            nextActive = wrapper;
            nextPhase = "entering";
          } else if (topAboveTrigger && bottomEntry?.isIntersecting) {
            nextActive = wrapper;
            nextPhase = "leaving";
          }
        });

        activeSpotlight = nextActive;
        if (activeSpotlight) {
          applySpotlightState(activeSpotlight, nextPhase);
        } else if (!Array.from(grid.querySelectorAll(".editable-photo")).some((photo) => photo.classList.contains("is-effect-active") && normalizeEffect(photo.dataset.effect) !== "spotlight")) {
          clearEffectVisuals();
        }
      },
      {
        threshold: [0, 1],
        root: null,
        rootMargin: "-50% 0px -50% 0px",
      }
    );

    spotlightWrappers.forEach((wrapper) => {
      const topSentinel = wrapper.querySelector(".spotlight-sentinel-top");
      const bottomSentinel = wrapper.querySelector(".spotlight-sentinel-bottom");
      if (topSentinel) {
        spotlightObserver.observe(topSentinel);
      }
      if (bottomSentinel) {
        spotlightObserver.observe(bottomSentinel);
      }
    });
  };

  const updateEffects = () => {
    effectFrame = null;

    if (!effectsShouldRun()) {
      disconnectSpotlightObserver();
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

    photos.forEach((photo) => {
      if (!photo.classList.contains("is-spotlight-active") && !photo.classList.contains("is-spotlight-entering") && !photo.classList.contains("is-spotlight-leaving")) {
        photo.classList.remove("is-effect-active");
      }
      if (!photo.classList.contains("is-spotlight-active") && !photo.classList.contains("is-spotlight-entering") && !photo.classList.contains("is-spotlight-leaving")) {
        photo.style.setProperty("--effect-strength", "0");
      }
      photo.style.removeProperty("--spotlight-follow-offset");
    });

    if (activeSpotlight) {
      return;
    }

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
      refreshSpotlightObservers();
    });
    window.addEventListener("orientationchange", () => {
      syncMobileLayoutState();
      updateMobileExtendedLayout();
      updateSpotlightLayout();
      refreshSpotlightObservers();
    });
    window.addEventListener("load", () => {
      queueEffectUpdate();
      updateMobileExtendedLayout();
      updateSpotlightLayout();
      refreshSpotlightObservers();
    });
    window.addEventListener("scroll", queueEffectUpdate, { passive: true });

    grid.addEventListener(
      "load",
      (event) => {
        if (event.target instanceof HTMLImageElement) {
          queueEffectUpdate();
          updateMobileExtendedLayout();
          updateSpotlightLayout();
          refreshSpotlightObservers();
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
    refreshSpotlightObservers,
    syncMobileLayoutState,
  };
};
