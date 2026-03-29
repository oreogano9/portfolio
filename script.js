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
  `;
  header.appendChild(headerControls);

  const titleInput = headerControls.querySelector(".header-edit-input");
  const spacingSelect = headerControls.querySelector(".header-edit-select");

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
    const numeric = Math.max(0, Math.min(12, Number(value) || 0));
    state.photos[index].spacerAfter = numeric;
    save();
    render();
  };

  const render = () => {
    title.textContent = state.title;
    grid.style.setProperty("--album-gap", spacingMap[state.spacing]);
    titleInput.value = state.title;
    spacingSelect.value = state.spacing;
    toggle.textContent = state.editing ? "Done" : "Edit";
    body.classList.toggle("is-editing", state.editing);
    body.classList.toggle("is-previewing", state.editing && state.previewing);
    previewToggle.textContent = state.previewing ? "Show Editor" : "Preview";
    previewToggle.setAttribute("aria-pressed", state.previewing ? "true" : "false");

    grid.innerHTML = "";

    state.photos.forEach((photo, index) => {
      const wrapper = document.createElement("figure");
      wrapper.className = `editable-photo size-${photo.size}${Number(photo.spacerAfter) > 0 ? " has-spacer" : ""}`;
      wrapper.dataset.index = String(index);
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
        </div>
        <div class="spacer-control">
          <label>
            Space After
            <span class="spacer-value">${(Number(photo.spacerAfter) || 0).toFixed(2)}rem</span>
            <input class="spacer-slider" type="range" min="0" max="12" step="0.25" value="${Number(photo.spacerAfter) || 0}" aria-label="Space after image" />
          </label>
          <button class="spacer-reset" type="button" data-action="spacer-reset" aria-label="Reset space after image">Reset</button>
        </div>
      `;
      grid.appendChild(wrapper);
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
    const select = event.target.closest(".photo-size-select");
    const wrapper = event.target.closest(".editable-photo");
    if (!wrapper) {
      return;
    }

    const index = Number(wrapper.dataset.index);
    if (select) {
      state.photos[index].size = select.value;
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
    startScale: 1,
    translateX: 0,
    translateY: 0,
    startTranslateX: 0,
    startTranslateY: 0,
    pinchDistance: 0,
    panStartX: 0,
    panStartY: 0,
  };

  const applyImageTransform = () => {
    lightboxImage.style.transform = `translate(${gesture.translateX}px, ${gesture.translateY}px) scale(${gesture.scale})`;
    lightboxImage.style.cursor = gesture.scale > 1 ? "grab" : "";
  };

  const resetImageTransform = () => {
    gesture.scale = 1;
    gesture.startScale = 1;
    gesture.translateX = 0;
    gesture.translateY = 0;
    gesture.startTranslateX = 0;
    gesture.startTranslateY = 0;
    gesture.pinchDistance = 0;
    gesture.panStartX = 0;
    gesture.panStartY = 0;
    applyImageTransform();
  };

  const getTouchDistance = (touches) => {
    const [first, second] = touches;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
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
        gesture.startScale = gesture.scale;
      } else if (event.touches.length === 1 && gesture.scale > 1) {
        gesture.panStartX = event.touches[0].clientX;
        gesture.panStartY = event.touches[0].clientY;
        gesture.startTranslateX = gesture.translateX;
        gesture.startTranslateY = gesture.translateY;
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
        if (!gesture.pinchDistance) {
          gesture.pinchDistance = distance;
        }

        const nextScale = gesture.startScale * (distance / gesture.pinchDistance);
        gesture.scale = Math.min(4, Math.max(1, nextScale));
        if (gesture.scale <= 1) {
          gesture.translateX = 0;
          gesture.translateY = 0;
        }
        applyImageTransform();
      } else if (event.touches.length === 1 && gesture.scale > 1) {
        event.preventDefault();
        const touch = event.touches[0];
        gesture.translateX = gesture.startTranslateX + (touch.clientX - gesture.panStartX);
        gesture.translateY = gesture.startTranslateY + (touch.clientY - gesture.panStartY);
        applyImageTransform();
      }
    },
    { passive: false }
  );

  lightboxImage.addEventListener("touchend", () => {
    if (gesture.scale <= 1) {
      resetImageTransform();
      return;
    }

    gesture.startScale = gesture.scale;
    gesture.startTranslateX = gesture.translateX;
    gesture.startTranslateY = gesture.translateY;
    gesture.pinchDistance = 0;
  });
};

setupReveals();
setupAlbumLinks();
setupParallax();
setupAlbumEditor();
setupLightbox();
