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

  if (!body.classList.contains("album-page") || !grid || !title || !header || !toggle) {
    return;
  }

  const storageKey = `album-editor:${window.location.pathname}`;
  const originalPhotos = Array.from(grid.querySelectorAll("img")).map((image) => ({
    src: image.getAttribute("src") || "",
    alt: image.getAttribute("alt") || "",
    size: "full",
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
        size: ["full", "medium", "small"].includes(photo.size) ? photo.size : "full",
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
    spacing: ["tight", "default", "airy"].includes(savedState?.spacing) ? savedState.spacing : "default",
    photos: mergePhotos(savedState?.photos),
    editing: false,
  };

  const spacingMap = {
    tight: "0.75rem",
    default: "1.25rem",
    airy: "2rem",
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

  const render = () => {
    title.textContent = state.title;
    grid.style.setProperty("--album-gap", spacingMap[state.spacing]);
    titleInput.value = state.title;
    spacingSelect.value = state.spacing;
    toggle.textContent = state.editing ? "Done" : "Edit";
    body.classList.toggle("is-editing", state.editing);

    grid.innerHTML = "";

    state.photos.forEach((photo, index) => {
      const wrapper = document.createElement("figure");
      wrapper.className = `editable-photo size-${photo.size}`;
      wrapper.dataset.index = String(index);
      wrapper.innerHTML = `
        <img class="reveal-up" src="${photo.src}" alt="${photo.alt}" />
        <div class="photo-controls">
          <button class="photo-control-button" type="button" data-action="up" aria-label="Move image up">↑</button>
          <button class="photo-control-button" type="button" data-action="down" aria-label="Move image down">↓</button>
          <select class="photo-size-select" data-action="size" aria-label="Photo size">
            <option value="full"${photo.size === "full" ? " selected" : ""}>Full</option>
            <option value="medium"${photo.size === "medium" ? " selected" : ""}>Medium</option>
            <option value="small"${photo.size === "small" ? " selected" : ""}>Small</option>
          </select>
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
    const button = event.target.closest(".photo-control-button");
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
    }
  });

  grid.addEventListener("change", (event) => {
    const select = event.target.closest(".photo-size-select");
    if (!select) {
      return;
    }

    const wrapper = event.target.closest(".editable-photo");
    if (!wrapper) {
      return;
    }

    const index = Number(wrapper.dataset.index);
    state.photos[index].size = select.value;
    save();
    render();
  });

  toggle.addEventListener("click", () => {
    state.editing = !state.editing;
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

  const close = () => {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImage.setAttribute("src", "");
    lightboxImage.setAttribute("alt", "");
    document.body.style.overflow = "";
  };

  grid.addEventListener("click", (event) => {
    const image = event.target.closest("img");
    const insideControls = event.target.closest(".photo-controls");

    if (!image || insideControls) {
      return;
    }

    lightboxImage.setAttribute("src", image.getAttribute("src") || "");
    lightboxImage.setAttribute("alt", image.getAttribute("alt") || "");
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
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
};

setupReveals();
setupAlbumLinks();
setupParallax();
setupAlbumEditor();
setupLightbox();
