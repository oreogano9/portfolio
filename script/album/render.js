import { canJoinPhoto, deriveSectionsFromPhotos, getHeroImageSrc, getSpacerValue, shouldProgressiveRender } from "./utils.js";

const INITIAL_BLOCK_COUNT = 12;
const SUBSEQUENT_BLOCK_COUNT = 16;

export const createPhotoFigure = ({ photo, index, state, normalizeEffect }) => {
  const isDeleted = photo.deleted === true;
  const effectiveEffect = isDeleted ? "none" : photo.effect !== "none" ? photo.effect : state.effect;
  const wrapper = document.createElement("figure");
  const isExtendedLandscape = photo.size === "extended" && photo.landscape === true;
  const isJoinable = !isDeleted && canJoinPhoto(state, index, normalizeEffect);
  const canShowUnjoin = !isDeleted && photo.joinWithPrevious;
  const isHeroImage = !isDeleted && state.intro.heroImageSrc === photo.src;
  wrapper.className = `editable-photo size-${photo.size}${Number(photo.spacerAfter) > 0 ? " has-spacer" : ""}${effectiveEffect === "spotlight" ? " spotlight-shell" : ""}${isExtendedLandscape ? " mobile-extended-candidate" : ""}${photo.joinWithPrevious && isJoinable ? " is-joined-photo" : ""}${isDeleted ? " is-deleted-photo" : ""}`;
  wrapper.dataset.index = String(index);
  wrapper.dataset.effect = effectiveEffect;
  wrapper.dataset.landscape = String(photo.landscape === true);
  wrapper.dataset.ratio = Number.isFinite(photo.aspectRatio) ? String(photo.aspectRatio) : "";
  wrapper.dataset.deleted = String(isDeleted);
  wrapper.style.setProperty("--photo-after-space", getSpacerValue(photo.spacerAfter));
  wrapper.style.setProperty("--effect-direction", index % 2 === 0 ? "1" : "-1");
  const loading = index < 4 ? "eager" : "lazy";
  const fetchPriority = index < 2 ? "high" : "auto";
  const decoding = index < 4 ? "sync" : "async";
  wrapper.innerHTML = `
    <div class="photo-stage">
      ${isDeleted ? `<div class="photo-deleted-badge">DELETED</div>` : ""}
      <img class="reveal-up" src="${photo.src}" alt="${photo.alt}" loading="${loading}" fetchpriority="${fetchPriority}" decoding="${decoding}" />
      <div class="photo-controls">
        <button class="photo-control-button" type="button" data-action="up" aria-label="Move image up">↑</button>
        <button class="photo-control-button" type="button" data-action="down" aria-label="Move image down">↓</button>
        <button class="photo-toggle-button photo-hero-button${isHeroImage ? " is-active" : ""}" type="button" data-action="hero-toggle" aria-label="${isHeroImage ? "Hero image selected" : "Set as hero image"}" aria-pressed="${isHeroImage ? "true" : "false"}"${isDeleted ? " disabled" : ""}>${isHeroImage ? "★" : "☆"}</button>
        <select class="photo-size-select" data-action="size" aria-label="Photo size"${isDeleted ? " disabled" : ""}>
          ${photo.landscape === true ? `<option value="extended"${photo.size === "extended" ? " selected" : ""}>EXTENDED</option>` : ""}
          <option value="full"${photo.size === "full" ? " selected" : ""}>FULL WIDTH</option>
          <option value="medium"${photo.size === "medium" ? " selected" : ""}>MEDIUM</option>
          <option value="small"${photo.size === "small" ? " selected" : ""}>SMALL</option>
          <option value="xsmall"${photo.size === "xsmall" ? " selected" : ""}>EXTRA SMALL</option>
          <option value="xxsmall"${photo.size === "xxsmall" ? " selected" : ""}>TINY</option>
        </select>
        <button class="photo-toggle-button photo-join-button" type="button" data-action="join-toggle" aria-label="${canShowUnjoin ? "Unjoin image from previous row" : "Join image with previous row"}"${!canShowUnjoin && !isJoinable ? " disabled" : ""}>${canShowUnjoin ? "UNJOIN" : "JOIN"}</button>
        <select class="photo-effect-select" data-action="photo-effect" aria-label="Photo effect"${isDeleted ? " disabled" : ""}>
          <option value="none"${photo.effect === "none" ? " selected" : ""}>NONE</option>
          <option value="spotlight"${photo.effect === "spotlight" ? " selected" : ""}>SPOTLIGHT</option>
          <option value="monochrome"${photo.effect === "monochrome" ? " selected" : ""}>MONOCHROME</option>
          <option value="drift"${photo.effect === "drift" ? " selected" : ""}>DRIFT</option>
          <option value="veil"${photo.effect === "veil" ? " selected" : ""}>VEIL</option>
        </select>
        <button class="photo-toggle-button photo-delete-button${isDeleted ? " is-active" : ""}" type="button" data-action="delete-toggle" aria-label="${isDeleted ? "Restore image" : "Remove image"}">${isDeleted ? "RESTORE" : "REMOVE"}</button>
      </div>
      <div class="spacer-control">
        <button class="spacer-reset" type="button" data-action="spacer-reset" aria-label="Reset space after image">Reset</button>
        <div class="spacer-copy-row">
          <button class="spacer-copy-button" type="button" data-action="spacer-copy-up" aria-label="Copy this space amount to the image above"${isDeleted ? " disabled" : ""}>↑</button>
          <button class="spacer-copy-button" type="button" data-action="spacer-copy-down" aria-label="Copy this space amount to the image below"${isDeleted ? " disabled" : ""}>↓</button>
        </div>
        <label>
          SPACE
          <span class="spacer-value">${(Number(photo.spacerAfter) || 0).toFixed(2)}rem</span>
          <input class="spacer-slider" type="range" min="0" max="50" step="0.25" value="${Number(photo.spacerAfter) || 0}" aria-label="Space after image"${isDeleted ? " disabled" : ""} />
        </label>
      </div>
    </div>
  `;
  return wrapper;
};

export const buildAlbumBlocks = ({ state, normalizeEffect, includeDeleted = false }) => {
  const sectionOrder = state.sections.length ? state.sections : deriveSectionsFromPhotos(state.photos);
  const sectionsToRender = sectionOrder.length ? sectionOrder : [{ id: "", title: "" }];
  const blocks = [];

  sectionsToRender.forEach((section, sectionIndex) => {
    const sectionPhotos = state.photos
      .map((photo, index) => ({ photo, index }))
      .filter(({ photo }) => {
        const inSection = section.id ? photo.section === section.id : !photo.section;
        if (!inSection) {
          return false;
        }
        return includeDeleted ? true : !photo.deleted;
      });

    if (!sectionPhotos.length) {
      return;
    }

    if (section.id) {
      blocks.push({
        type: "heading",
        id: `subalbum-${section.id}`,
        title: section.title || section.id,
      });
    }

    sectionPhotos.forEach((entry) => {
      const previousBlock = blocks[blocks.length - 1];
      if (
        entry.photo.joinWithPrevious &&
        canJoinPhoto(state, entry.index, normalizeEffect) &&
        previousBlock &&
        (previousBlock.type === "photo" || (previousBlock.type === "row" && previousBlock.entries.length < 3))
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

    const nextSection = sectionsToRender[sectionIndex + 1];
    if (section.id && nextSection) {
      blocks.push({
        type: "next-link",
        href: `#subalbum-${nextSection.id}`,
        title: nextSection.title,
      });
    }
  });

  return blocks;
};

const updateSubalbumOverflowState = (container) => {
  const track = container.querySelector(".subalbum-index-track");
  if (!(track instanceof HTMLElement)) {
    container.classList.remove("has-right-overflow", "has-left-overflow");
    return;
  }

  const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
  const scrollLeft = Math.max(0, track.scrollLeft);
  const hasOverflow = maxScrollLeft > 2;
  const hasLeftOverflow = hasOverflow && scrollLeft > 2;
  const hasRightOverflow = hasOverflow && scrollLeft < maxScrollLeft - 2;

  container.classList.toggle("has-left-overflow", hasLeftOverflow);
  container.classList.toggle("has-right-overflow", hasRightOverflow);
};

export const renderSubalbumIndexes = ({ state, containers }) => {
  containers.forEach((container) => {
    if (!container) {
      return;
    }

    container.innerHTML = "";
    const isVisible = state.sections.length >= 2;
    container.classList.toggle("is-hidden", !isVisible);
    container.classList.toggle("has-subalbum-links", isVisible);
    if (!isVisible) {
      container.classList.remove("has-right-overflow", "has-left-overflow");
      container.__subalbumResizeObserver?.disconnect?.();
      container.__subalbumResizeObserver = null;
      return;
    }

    const track = document.createElement("div");
    track.className = "subalbum-index-track";
    state.sections.forEach((section, index) => {
      const link = document.createElement("a");
      link.className = "subalbum-index-link";
      link.href = `#subalbum-${section.id}`;
      link.textContent = `${String(index + 1).padStart(2, "0")} ${section.title}`;
      track.appendChild(link);
    });

    container.appendChild(track);

    if (!container.classList.contains("subalbum-footer-index")) {
      const hint = document.createElement("span");
      hint.className = "subalbum-index-hint";
      hint.setAttribute("aria-hidden", "true");
      hint.textContent = ">";
      container.appendChild(hint);

      container.__subalbumResizeObserver?.disconnect?.();
      if ("ResizeObserver" in window) {
        const observer = new ResizeObserver(() => updateSubalbumOverflowState(container));
        observer.observe(track);
        container.__subalbumResizeObserver = observer;
      } else {
        container.__subalbumResizeObserver = null;
      }

      track.addEventListener("scroll", () => updateSubalbumOverflowState(container), { passive: true });
      window.requestAnimationFrame(() => updateSubalbumOverflowState(container));
    } else {
      container.__subalbumResizeObserver?.disconnect?.();
      container.__subalbumResizeObserver = null;
    }
  });
};

export const renderHeroIntro = ({ heroIntro, state, siteBrand }) => {
  if (!heroIntro) {
    return false;
  }

  const heroSrc = getHeroImageSrc(state);
  const heroPhoto = state.photos.find((photo) => photo.src === heroSrc) || null;
  const hasHeroIntro = state.intro.mode === "hero" && Boolean(heroPhoto);

  heroIntro.classList.toggle("is-hidden", !hasHeroIntro);
  if (hasHeroIntro && heroPhoto) {
    heroIntro.innerHTML = `
      <p class="album-hero-brand">${siteBrand}</p>
      <div class="album-hero-media">
        <img class="album-hero-image" src="${heroPhoto.src}" alt="${heroPhoto.alt}" loading="eager" fetchpriority="high" decoding="sync" />
      </div>
      <div class="album-hero-copy">
        <p class="album-hero-title">${state.title}</p>
        ${state.intro.showArrow ? `<a class="album-hero-arrow" href="#album-grid" aria-label="Scroll to album images">⌄</a>` : ""}
      </div>
    `;
  } else {
    heroIntro.innerHTML = "";
  }

  return hasHeroIntro;
};

const createBlockNode = ({ block, state, normalizeEffect }) => {
  if (block.type === "heading") {
    const heading = document.createElement("section");
    heading.className = "subalbum-section-heading";
    heading.id = block.id;
    heading.innerHTML = `<h2 class="subalbum-title">${block.title}</h2>`;
    return heading;
  }

  if (block.type === "next-link") {
    const nextLink = document.createElement("div");
    nextLink.className = "subalbum-next";
    nextLink.innerHTML = `<a class="subalbum-next-link" href="${block.href}">Next: ${block.title}</a>`;
    return nextLink;
  }

  if (block.type === "row") {
    const row = document.createElement("div");
    row.className = "photo-join-row";
    row.style.setProperty("--photo-join-columns", String(block.entries.length));
    block.entries.forEach((entry) => {
      row.appendChild(createPhotoFigure({ photo: entry.photo, index: entry.index, state, normalizeEffect }));
    });
    return row;
  }

  return createPhotoFigure({ photo: block.entry.photo, index: block.entry.index, state, normalizeEffect });
};

export const mountAlbumBlocks = ({ grid, blocks, state, normalizeEffect, onChunkRendered = () => {} }) => {
  grid.innerHTML = "";

  let renderedCount = 0;
  let sentinel = null;
  let observer = null;

  const disconnect = () => {
    observer?.disconnect();
    observer = null;
    sentinel?.remove();
    sentinel = null;
  };

  const appendChunk = (count) => {
    const fragment = document.createDocumentFragment();
    const end = Math.min(blocks.length, renderedCount + count);
    for (let index = renderedCount; index < end; index += 1) {
      fragment.appendChild(createBlockNode({ block: blocks[index], state, normalizeEffect }));
    }
    grid.appendChild(fragment);
    renderedCount = end;
    onChunkRendered();
  };

  if (!shouldProgressiveRender(state)) {
    appendChunk(blocks.length);
    return disconnect;
  }

  const ensureSentinel = () => {
    sentinel?.remove();
    sentinel = null;

    if (renderedCount >= blocks.length) {
      disconnect();
      return;
    }

    sentinel = document.createElement("div");
    sentinel.className = "album-render-sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    grid.appendChild(sentinel);

    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        appendChunk(SUBSEQUENT_BLOCK_COUNT);
        ensureSentinel();
      },
      {
        rootMargin: "0px 0px 1200px 0px",
      }
    );

    observer.observe(sentinel);
  };

  appendChunk(INITIAL_BLOCK_COUNT);
  ensureSentinel();
  return disconnect;
};
