export const createAlbumEffects = ({ body, grid, state, normalizeEffect }) => {
  const mobileLayoutQuery = window.matchMedia("(max-width: 760px), (hover: none), (pointer: coarse)");
  const visiblePhotos = new Set();
  let effectFrame = null;
  let visibilityObserver = null;

  const syncMobileLayoutState = () => {
    body.classList.toggle("is-mobile-layout", mobileLayoutQuery.matches);
  };

  const clearEffects = () => {
    visibilityObserver?.disconnect();
    visibilityObserver = null;
    visiblePhotos.clear();
    body.classList.remove("has-scroll-effect", "effect-focus", "effect-monochrome", "effect-lift");
    body.style.removeProperty("--effect-strength");
    grid.querySelectorAll(".editable-photo").forEach((photo) => {
      photo.classList.remove("is-effect-active", "is-effect-visible");
      photo.style.removeProperty("--effect-strength");
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
      body.classList.remove("has-scroll-effect", "effect-focus", "effect-monochrome", "effect-lift");
      body.style.removeProperty("--effect-strength");
      photos.forEach((photo) => {
        photo.classList.remove("is-effect-active", "is-effect-visible");
        photo.style.removeProperty("--effect-strength");
      });
      return;
    }

    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const activationLine = viewportHeight * 0.33;
    const influenceRange = viewportHeight * 0.6;
    const candidates = effectPhotos.filter((photo) => visiblePhotos.has(photo));
    const activePool = candidates.length ? candidates : effectPhotos;

    let activePhoto = null;
    let activeEffect = "none";
    let effectStrength = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    photos.forEach((photo) => {
      photo.classList.toggle("is-effect-visible", visiblePhotos.has(photo));
      photo.classList.remove("is-effect-active");
      photo.style.setProperty("--effect-strength", "0");
    });

    activePool.forEach((photo) => {
      const rect = photo.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        return;
      }

      const photoCenter = rect.top + rect.height / 2;
      const distance = Math.abs(photoCenter - activationLine);
      const strength = Math.max(0, Math.min(1, 1 - distance / influenceRange));
      if (strength <= 0) {
        return;
      }

      if (distance < closestDistance) {
        closestDistance = distance;
        activePhoto = photo;
        activeEffect = normalizeEffect(photo.dataset.effect);
        effectStrength = strength;
      }
    });

    if (!activePhoto || activeEffect === "none" || effectStrength <= 0.04) {
      body.classList.remove("has-scroll-effect", "effect-focus", "effect-monochrome", "effect-lift");
      body.style.removeProperty("--effect-strength");
      return;
    }

    body.classList.remove("effect-focus", "effect-monochrome", "effect-lift");
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
    syncMobileLayoutState();
    if (typeof mobileLayoutQuery.addEventListener === "function") {
      mobileLayoutQuery.addEventListener("change", syncMobileLayoutState);
    } else if (typeof mobileLayoutQuery.addListener === "function") {
      mobileLayoutQuery.addListener(syncMobileLayoutState);
    }

    window.addEventListener("resize", () => {
      syncMobileLayoutState();
      updateMobileExtendedLayout();
      refreshEffectObservers();
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
    window.addEventListener("scroll", queueEffectUpdate, { passive: true });

    grid.addEventListener(
      "load",
      (event) => {
        if (event.target instanceof HTMLImageElement) {
          updateMobileExtendedLayout();
          queueEffectUpdate();
        }
      },
      true
    );

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
