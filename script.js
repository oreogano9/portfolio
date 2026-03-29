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

  const syncActiveLink = () => {
    const hash = window.location.hash || "#albums";

    controls.forEach((control) => {
      const href = control.getAttribute("href");
      control.classList.toggle("is-active", href === hash || (hash === "#albums" && href === "#albums"));
    });
  };

  window.addEventListener("hashchange", syncActiveLink);
  syncActiveLink();
};

const setupParallax = () => {
  return;
};

const setupAlbumEditor = () => {
  const body = document.body;
  const grid = document.querySelector(".album-detail-grid");
  const title = document.querySelector(".masthead-title");
  const header = document.querySelector(".album-page-header");
  const toggle = document.querySelector("#album-edit-toggle");
  const previewToggle = document.querySelector("#album-preview-toggle");

  if (!body.classList.contains("album-page") || !grid || !title || !header || !toggle || !previewToggle) {
    return;
  }

  const storageKey = `album-editor:${window.location.pathname}`;
  const originalPhotos = Array.from(grid.querySelectorAll("img")).map((image) => ({
    src: image.getAttribute("src") || "",
    alt: image.getAttribute("alt") || "",
    size: "full",
    spacerAfter: 0,
    spotlight: false,
  }));

  const savedState = (() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  })();

  const mergePhotos = (savedPhotos) => {
    if (!Array.isArray(savedPhotos) || !savedPhotos.length) {
      return originalPhotos;
    }

    const originalBySrc = new Map(originalPhotos.map((photo) => [photo.src, photo]));
    const merged = savedPhotos
      .filter((photo) => typeof photo?.src === "string" && originalBySrc.has(photo.src))
      .map((photo) => ({
        src: photo.src,
        alt: originalBySrc.get(photo.src)?.alt || photo.alt || "",
        size: ["full", "medium", "small", "xsmall", "xxsmall"].includes(photo.size) ? photo.size : "full",
        spacerAfter: Number.isFinite(Number(photo.spacerAfter)) ? Number(photo.spacerAfter) : 0,
        spotlight: photo.spotlight === true,
      }));

    originalPhotos.forEach((photo) => {
      if (!merged.some((item) => item.src === photo.src)) {
        merged.push(photo);
      }
    });

    return merged;
  };

  const state = {
    title: typeof savedState?.title === "string" && savedState.title.trim() ? savedState.title : title.textContent.trim(),
    spacing: "tight",
    effect: savedState?.effect === "spotlight" ? "spotlight" : "none",
    photos: mergePhotos(savedState?.photos),
    editing: false,
    previewing: false,
  };

  state.photos = state.photos.map((photo) => ({
    ...photo,
    spacerAfter: 0,
  }));

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
        photos: state.photos,
      })
    );
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
    </select>
  `;
  header.appendChild(headerControls);

  const titleInput = headerControls.querySelector(".header-edit-input");
  const [spacingSelect, effectSelect] = headerControls.querySelectorAll(".header-edit-select");

  let spotlightFrame = null;

  const clearSpotlight = () => {
    body.classList.remove("has-spotlight-effect", "has-spotlight-image");
    grid.querySelectorAll(".editable-photo").forEach((photo) => {
      photo.classList.remove(
        "is-spotlight-active",
        "is-spotlight-gap-before",
        "is-spotlight-gap-after",
        "is-spotlight-edge-top",
        "is-spotlight-edge-bottom"
      );
      photo.style.removeProperty("--spotlight-opacity");
    });
  };

  const spotlightShouldRun = () => state.photos.some((photo) => photo.spotlight) && (!state.editing || state.previewing);

  const updateSpotlight = () => {
    spotlightFrame = null;

    if (!spotlightShouldRun()) {
      clearSpotlight();
      return;
    }

    const photos = Array.from(grid.querySelectorAll(".editable-photo"));
    if (!photos.length) {
      clearSpotlight();
      return;
    }

    const spotlightPhotos = photos.filter((photo) => photo.dataset.spotlight === "true");
    if (!spotlightPhotos.length) {
      clearSpotlight();
      return;
    }

    const viewportCenter = window.innerHeight * 0.5;
    const fadeRange = window.innerHeight * 0.7;
    const triggerRange = window.innerHeight * 0.8;
    let activePhoto = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    photos.forEach((photo) => {
      photo.style.setProperty("--spotlight-opacity", "0");
    });

    spotlightPhotos.forEach((photo) => {
      const rect = photo.getBoundingClientRect();
      const photoCenter = rect.top + rect.height / 2;
      const distance = Math.abs(photoCenter - viewportCenter);
      const opacity = Math.max(0, Math.min(1, 1 - distance / fadeRange));

      photo.style.setProperty("--spotlight-opacity", opacity.toFixed(3));

      if (distance < closestDistance) {
        closestDistance = distance;
        activePhoto = photo;
      }
    });

    if (!activePhoto || closestDistance > triggerRange) {
      clearSpotlight();
      return;
    }

    body.classList.add("has-spotlight-effect");
    body.classList.add("has-spotlight-image");

    const activeIndex = photos.indexOf(activePhoto);
    const previousPhoto = photos[activeIndex - 1] || null;
    const nextPhoto = photos[activeIndex + 1] || null;

    activePhoto.classList.add("is-spotlight-active");

    if (previousPhoto) {
      previousPhoto.classList.add("is-spotlight-gap-after");
    } else {
      activePhoto.classList.add("is-spotlight-edge-top");
    }

    if (nextPhoto) {
      nextPhoto.classList.add("is-spotlight-gap-before");
    } else {
      activePhoto.classList.add("is-spotlight-edge-bottom");
    }
  };

  const queueSpotlightUpdate = () => {
    if (spotlightFrame !== null) {
      return;
    }

    spotlightFrame = window.requestAnimationFrame(updateSpotlight);
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

  const render = () => {
    title.textContent = state.title;
    grid.style.setProperty("--album-gap", spacingMap[state.spacing]);
    titleInput.value = state.title;
    spacingSelect.value = state.spacing;
    effectSelect.value = state.effect;
    toggle.textContent = state.editing ? "Done" : "Edit";
    body.classList.toggle("is-editing", state.editing);
    body.classList.toggle("is-previewing", state.editing && state.previewing);
    body.classList.toggle("is-spotlight-mode", state.photos.some((photo) => photo.spotlight));
    previewToggle.textContent = state.previewing ? "Show Editor" : "Preview";
    previewToggle.setAttribute("aria-pressed", state.previewing ? "true" : "false");

    grid.innerHTML = "";

    state.photos.forEach((photo, index) => {
      const wrapper = document.createElement("figure");
      wrapper.className = `editable-photo size-${photo.size}${Number(photo.spacerAfter) > 0 ? " has-spacer" : ""}`;
      wrapper.dataset.index = String(index);
      wrapper.dataset.spotlight = photo.spotlight ? "true" : "false";
      wrapper.style.setProperty("--photo-after-space", getSpacerValue(photo.spacerAfter));
      wrapper.innerHTML = `
        <img class="reveal-up" src="${photo.src}" alt="${photo.alt}" />
        <div class="photo-controls">
          <button class="photo-control-button" type="button" data-action="up" aria-label="Move image up">↑</button>
          <button class="photo-control-button" type="button" data-action="down" aria-label="Move image down">↓</button>
          <select class="photo-size-select" data-action="size" aria-label="Photo size">
            <option value="full"${photo.size === "full" ? " selected" : ""}>Full Width</option>
            <option value="medium"${photo.size === "medium" ? " selected" : ""}>Medium</option>
            <option value="small"${photo.size === "small" ? " selected" : ""}>Small</option>
            <option value="xsmall"${photo.size === "xsmall" ? " selected" : ""}>Extra Small</option>
            <option value="xxsmall"${photo.size === "xxsmall" ? " selected" : ""}>Tiny</option>
          </select>
          <select class="photo-effect-select" data-action="photo-effect" aria-label="Photo effect">
            <option value="none"${photo.spotlight ? "" : " selected"}>None</option>
            <option value="spotlight"${photo.spotlight ? " selected" : ""}>Spotlight</option>
          </select>
        </div>
        <div class="spacer-control">
          <label>
            Space After
            <span class="spacer-value">${(Number(photo.spacerAfter) || 0).toFixed(2)}rem</span>
            <input class="spacer-slider" type="range" min="0" max="50" step="0.25" value="${Number(photo.spacerAfter) || 0}" aria-label="Space after image" />
          </label>
          <button class="spacer-reset" type="button" data-action="spacer-reset" aria-label="Reset space after image">Reset</button>
        </div>
      `;
      grid.appendChild(wrapper);
    });

    queueSpotlightUpdate();
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
    state.effect = event.target.value === "spotlight" ? "spotlight" : "none";
    save();
    queueSpotlightUpdate();
  });

  grid.addEventListener("click", (event) => {
    const button = event.target.closest(".photo-control-button, .spacer-reset");
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
      state.photos[index].size = select.value;
      save();
      render();
      return;
    }

    if (select?.classList.contains("photo-effect-select")) {
      state.photos[index].spotlight = select.value === "spotlight";
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

  toggle.addEventListener("click", () => {
    state.editing = !state.editing;
    if (!state.editing) {
      state.previewing = false;
    }
    render();
  });

  previewToggle.addEventListener("click", () => {
    if (!state.editing) {
      return;
    }

    state.previewing = !state.previewing;
    render();
  });

  window.addEventListener("scroll", queueSpotlightUpdate, { passive: true });
  window.addEventListener("resize", queueSpotlightUpdate);

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
setupParallax();
setupAlbumEditor();
setupLightbox();
