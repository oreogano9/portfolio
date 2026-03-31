export const createAlbumEffects = ({ body, grid, state, normalizeEffect }) => {
  const mobileLayoutQuery = window.matchMedia("(max-width: 760px), (hover: none), (pointer: coarse)");
  let effectFrame = null;
  let spotlightTriggers = [];
  let spotlightRefreshFrame = null;
  let spotlightBooting = true;

  const syncMobileLayoutState = () => {
    body.classList.toggle("is-mobile-layout", mobileLayoutQuery.matches);
  };

  const getScrollTrigger = () => {
    const gsapApi = window.gsap;
    const plugin = window.ScrollTrigger;
    if (!gsapApi || !plugin) {
      return null;
    }

    if (!gsapApi.core.globals().ScrollTrigger) {
      gsapApi.registerPlugin(plugin);
    }

    return plugin;
  };

  const killSpotlightTriggers = () => {
    spotlightTriggers.forEach((trigger) => trigger.kill());
    spotlightTriggers = [];
  };

  const refreshExistingSpotlightTriggers = () => {
    const ScrollTrigger = getScrollTrigger();
    if (!ScrollTrigger || !spotlightTriggers.length) {
      return;
    }

    ScrollTrigger.refresh();
  };

  const clearEffects = () => {
    killSpotlightTriggers();
    body.classList.remove("has-scroll-effect", "effect-spotlight", "effect-monochrome", "effect-drift", "effect-veil");
    body.style.removeProperty("--effect-strength");
    body.style.removeProperty("--spotlight-bg-progress");
    grid.querySelectorAll(".editable-photo").forEach((photo) => {
      photo.classList.remove("is-effect-active", "is-spotlight-active");
      photo.style.removeProperty("--effect-strength");
      photo.style.removeProperty("--spotlight-stage-top");
      photo.style.removeProperty("--spotlight-shell-height");
    });
  };

  const clearNonSpotlightEffects = () => {
    body.classList.remove("has-scroll-effect", "effect-monochrome", "effect-drift", "effect-veil");
    body.style.removeProperty("--effect-strength");
    if (!grid.querySelector(".editable-photo.is-spotlight-active")) {
      body.style.removeProperty("--spotlight-bg-progress");
    }
    grid.querySelectorAll(".editable-photo").forEach((photo) => {
      if (!photo.classList.contains("is-spotlight-active")) {
        photo.classList.remove("is-effect-active");
        photo.style.removeProperty("--effect-strength");
      }
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
    const shouldUseSpotlightLayout = !state.editing || state.previewing;

    grid.querySelectorAll(".editable-photo.spotlight-shell").forEach((wrapper) => {
      const stage = wrapper.querySelector(".photo-stage");
      if (!(stage instanceof HTMLElement)) {
        return;
      }

      if (!shouldUseSpotlightLayout) {
        wrapper.style.removeProperty("--spotlight-shell-height");
        wrapper.style.removeProperty("--spotlight-stage-top");
        return;
      }

      const stageHeight = stage.getBoundingClientRect().height;
      if (!(stageHeight > 0)) {
        return;
      }

      const centeredTop = Math.max(0, (viewportHeight - stageHeight) / 2);
      const travel = viewportHeight * (body.classList.contains("is-mobile-layout") ? 0.7 : 1);
      const shellHeight = Math.max(stageHeight + travel, viewportHeight + stageHeight * 0.15);

      wrapper.style.setProperty("--spotlight-shell-height", `${shellHeight}px`);
      wrapper.style.setProperty("--spotlight-stage-top", `${centeredTop}px`);
    });
  };

  const activateSpotlight = (wrapper) => {
    if (spotlightBooting) {
      return;
    }

    body.classList.remove("effect-monochrome", "effect-drift", "effect-veil");
    body.classList.add("has-scroll-effect", "effect-spotlight");
    body.style.setProperty("--effect-strength", "1");

    grid.querySelectorAll(".editable-photo").forEach((photo) => {
      const isActive = photo === wrapper;
      photo.classList.toggle("is-spotlight-active", isActive);
      photo.classList.toggle("is-effect-active", isActive);
      photo.style.setProperty("--effect-strength", isActive ? "1" : "0");
    });
  };

  const updateSpotlightProgress = (progress) => {
    const clamped = Math.max(0, Math.min(1, progress));
    const ramp = clamped < 0.5 ? clamped * 2 : (1 - clamped) * 2;
    const eased = Math.max(0, Math.min(1, 1 - Math.pow(1 - ramp, 2.2)));
    body.style.setProperty("--spotlight-bg-progress", eased.toFixed(3));
  };

  const setupSpotlightTriggers = () => {
    killSpotlightTriggers();

    if (!effectsShouldRun()) {
      return;
    }

    const ScrollTrigger = getScrollTrigger();
    if (!ScrollTrigger) {
      return;
    }

    const spotlightWrappers = Array.from(grid.querySelectorAll(".editable-photo")).filter(
      (photo) => normalizeEffect(photo.dataset.effect) === "spotlight"
    );

    if (!spotlightWrappers.length) {
      return;
    }

    spotlightWrappers.forEach((wrapper) => {
      const stage = wrapper.querySelector(".photo-stage");
      if (!(stage instanceof HTMLElement)) {
        return;
      }

      const trigger = ScrollTrigger.create({
        trigger: wrapper,
        pin: stage,
        start: () => {
          const viewportHeight = window.visualViewport?.height || window.innerHeight;
          const stageHeight = stage.getBoundingClientRect().height;
          const centeredTop = Math.max(0, (viewportHeight - stageHeight) / 2);
          return `top top+=${Math.round(centeredTop)}`;
        },
        end: () => {
          const viewportHeight = window.visualViewport?.height || window.innerHeight;
          return `+=${Math.round(viewportHeight * (body.classList.contains("is-mobile-layout") ? 0.7 : 1))}`;
        },
        pinSpacing: true,
        invalidateOnRefresh: true,
        onEnter: () => activateSpotlight(wrapper),
        onEnterBack: () => activateSpotlight(wrapper),
        onUpdate: (self) => {
          if (wrapper.classList.contains("is-spotlight-active")) {
            updateSpotlightProgress(self.progress);
          }
        },
        onLeave: () => {
          wrapper.classList.remove("is-spotlight-active", "is-effect-active");
          body.style.removeProperty("--spotlight-bg-progress");
          clearNonSpotlightEffects();
        },
        onLeaveBack: () => {
          wrapper.classList.remove("is-spotlight-active", "is-effect-active");
          body.style.removeProperty("--spotlight-bg-progress");
          clearNonSpotlightEffects();
        },
      });

      spotlightTriggers.push(trigger);
    });

    ScrollTrigger.refresh();
  };

  const updateEffects = () => {
    effectFrame = null;

    if (!effectsShouldRun()) {
      clearEffects();
      return;
    }

    const hasActiveSpotlight = grid.querySelector(".editable-photo.is-spotlight-active");
    if (hasActiveSpotlight) {
      return;
    }

    const photos = Array.from(grid.querySelectorAll(".editable-photo"));
    if (!photos.length) {
      clearEffects();
      return;
    }

    const effectPhotos = photos.filter((photo) => {
      const effect = normalizeEffect(photo.dataset.effect);
      return effect !== "none" && effect !== "spotlight";
    });

    if (!effectPhotos.length) {
      body.classList.remove("effect-monochrome", "effect-drift", "effect-veil");
      body.classList.remove("has-scroll-effect");
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
      photo.classList.remove("is-effect-active");
      photo.style.setProperty("--effect-strength", "0");
    });

    effectPhotos.forEach((photo) => {
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

    if (!activePhoto || closestDistance > triggerRange) {
      clearNonSpotlightEffects();
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

  const scheduleSpotlightRefresh = ({ rebuild = false } = {}) => {
    if (spotlightRefreshFrame !== null) {
      window.cancelAnimationFrame(spotlightRefreshFrame);
    }

    spotlightRefreshFrame = window.requestAnimationFrame(() => {
      spotlightRefreshFrame = null;
      updateSpotlightLayout();
      if (rebuild) {
        setupSpotlightTriggers();
      } else {
        refreshExistingSpotlightTriggers();
      }
      queueEffectUpdate();
    });
  };

  const refreshSpotlightObservers = ({ rebuild = true } = {}) => {
    scheduleSpotlightRefresh({ rebuild });
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
      refreshSpotlightObservers({ rebuild: true });
    });
    window.addEventListener("orientationchange", () => {
      syncMobileLayoutState();
      updateMobileExtendedLayout();
      refreshSpotlightObservers({ rebuild: true });
    });
    window.addEventListener("load", () => {
      updateMobileExtendedLayout();
      refreshSpotlightObservers({ rebuild: true });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          spotlightBooting = false;
          queueEffectUpdate();
        });
      });
    });
    window.addEventListener("scroll", queueEffectUpdate, { passive: true });

    grid.addEventListener(
      "load",
      (event) => {
        if (event.target instanceof HTMLImageElement) {
          updateMobileExtendedLayout();
          refreshSpotlightObservers({ rebuild: false });
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
