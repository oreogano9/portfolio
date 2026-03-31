import { canJoinPhoto, deriveSectionsFromPhotos, getHeroImageSrc, getSpacerValue, shouldProgressiveRender } from "./utils.js";

const INITIAL_BLOCK_COUNT = 12;
const SUBSEQUENT_BLOCK_COUNT = 16;
const INITIAL_EAGER_GRID_IMAGES = 3;

const createProgressiveImage = ({
  photo,
  className = "",
  loading = "lazy",
  fetchPriority = "auto",
  decoding = "async",
  eagerUpgrade = false,
}) => {
  const image = document.createElement("img");
  const previewSrc = typeof photo.previewSrc === "string" ? photo.previewSrc : "";
  const fullSrc = photo.src;
  const aspectRatio = Number(photo.aspectRatio);

  image.className = className;
  image.alt = photo.alt;
  image.loading = loading;
  image.setAttribute("fetchpriority", fetchPriority);
  image.decoding = decoding;
  image.dataset.fullSrc = fullSrc;
  if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
    image.width = 1000;
    image.height = Math.max(1, Math.round(1000 / aspectRatio));
  }
  if (previewSrc && previewSrc !== fullSrc) {
    image.src = previewSrc;
    image.dataset.previewSrc = previewSrc;
    image.dataset.progressive = "true";
    image.dataset.upgraded = "false";

    const upgradeToFull = () => {
      if (image.dataset.upgraded === "true") {
        return;
      }
      image.dataset.upgraded = "true";
      const highRes = new window.Image();
      highRes.decoding = "async";
      if (eagerUpgrade) {
        highRes.loading = "eager";
        highRes.setAttribute?.("fetchpriority", "high");
      }
      highRes.addEventListener("load", () => {
        image.src = fullSrc;
        image.classList.add("is-full-res");
      });
      highRes.src = fullSrc;
    };

    image.addEventListener("load", upgradeToFull, { once: true });
  } else {
    image.src = fullSrc;
    image.classList.add("is-full-res");
  }

  return image;
};

export const createPhotoFigure = ({ photo, index, state, normalizeEffect, renderOrder = 0 }) => {
  const isDeleted = photo.deleted === true;
  const effectiveEffect = isDeleted ? "none" : photo.effect !== "none" ? photo.effect : state.effect;
  const wrapper = document.createElement("figure");
  const isExtendedLandscape = photo.size === "extended" && photo.landscape === true;
  const hasAspectRatio = Number.isFinite(Number(photo.aspectRatio)) && Number(photo.aspectRatio) > 0;
  const isMobileRotateCandidate = !isDeleted && state.mobileRotateClockwise && hasAspectRatio;
  const isJoinable = !isDeleted && canJoinPhoto(state, index, normalizeEffect);
  const canShowUnjoin = !isDeleted && photo.joinWithPrevious;
  const isHeroImage = !isDeleted && state.intro.heroImageSrc === photo.src;
  wrapper.className = `editable-photo size-${photo.size}${Number(photo.spacerAfter) > 0 ? " has-spacer" : ""}${isExtendedLandscape ? " mobile-extended-candidate" : ""}${isMobileRotateCandidate ? " mobile-rotate-candidate" : ""}${photo.joinWithPrevious && isJoinable ? " is-joined-photo" : ""}${isDeleted ? " is-deleted-photo" : ""}`;
  wrapper.dataset.index = String(index);
  wrapper.dataset.src = photo.src;
  wrapper.dataset.effect = effectiveEffect;
  wrapper.dataset.landscape = String(photo.landscape === true);
  wrapper.dataset.ratio = Number.isFinite(photo.aspectRatio) ? String(photo.aspectRatio) : "";
  wrapper.dataset.deleted = String(isDeleted);
  wrapper.style.setProperty("--photo-after-space", getSpacerValue(photo.spacerAfter));
  const shouldEagerLoad = renderOrder < INITIAL_EAGER_GRID_IMAGES;
  const loading = shouldEagerLoad ? "eager" : "lazy";
  const fetchPriority = "auto";
  const decoding = shouldEagerLoad ? "sync" : "async";
  wrapper.innerHTML = `
    <div class="photo-stage">
      ${isDeleted ? `<div class="photo-deleted-badge">DELETED</div>` : ""}
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
          <option value="focus"${photo.effect === "focus" ? " selected" : ""}>FOCUS</option>
          <option value="monochrome"${photo.effect === "monochrome" ? " selected" : ""}>MONOCHROME</option>
          <option value="lift"${photo.effect === "lift" ? " selected" : ""}>LIFT</option>
          <option value="blur"${photo.effect === "blur" ? " selected" : ""}>BLUR</option>
          <option value="glow"${photo.effect === "glow" ? " selected" : ""}>GLOW</option>
          <option value="tilt"${photo.effect === "tilt" ? " selected" : ""}>TILT</option>
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
  const stage = wrapper.querySelector(".photo-stage");
  const controls = wrapper.querySelector(".photo-controls");
  const image = createProgressiveImage({
    photo,
    className: "reveal-up",
    loading,
    fetchPriority,
    decoding,
    eagerUpgrade: shouldEagerLoad,
  });
  if (stage && controls) {
    stage.insertBefore(image, controls);
  }
  return wrapper;
};

const blockMatchesAnchor = (block, anchor) => {
  if (!anchor) {
    return false;
  }

  if (anchor.type === "heading") {
    return block.type === "heading" && block.id === anchor.id;
  }

  if (anchor.type !== "photo") {
    return false;
  }

  if (block.type === "photo") {
    return block.entry.photo.src === anchor.src;
  }

  if (block.type === "row") {
    return block.entries.some((entry) => entry.photo.src === anchor.src);
  }

  return false;
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
    heroIntro.innerHTML = "";
    const brand = document.createElement("p");
    brand.className = "album-hero-brand";
    brand.textContent = siteBrand;

    const media = document.createElement("div");
    media.className = "album-hero-media";
    media.appendChild(
      createProgressiveImage({
        photo: heroPhoto,
        className: "album-hero-image",
        loading: "eager",
        fetchPriority: "high",
        decoding: "sync",
        eagerUpgrade: true,
      })
    );

    const copy = document.createElement("div");
    copy.className = "album-hero-copy";
    const title = document.createElement("p");
    title.className = "album-hero-title";
    title.textContent = state.title;
    const arrow = document.createElement("a");
    arrow.className = `album-hero-arrow${state.intro.showArrow ? "" : " is-hidden"}`;
    arrow.href = "#album-grid";
    arrow.setAttribute("aria-label", "Scroll to album images");
    arrow.setAttribute("aria-hidden", state.intro.showArrow ? "false" : "true");
    arrow.tabIndex = state.intro.showArrow ? 0 : -1;
    arrow.textContent = "⌄";
    copy.append(title, arrow);

    heroIntro.append(brand, media, copy);
  } else {
    heroIntro.innerHTML = "";
  }

  return hasHeroIntro;
};

const createBlockNode = ({ block, state, normalizeEffect, renderState }) => {
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
      row.appendChild(
        createPhotoFigure({
          photo: entry.photo,
          index: entry.index,
          state,
          normalizeEffect,
          renderOrder: renderState.photoCount++,
        })
      );
    });
    return row;
  }

  return createPhotoFigure({
    photo: block.entry.photo,
    index: block.entry.index,
    state,
    normalizeEffect,
    renderOrder: renderState.photoCount++,
  });
};

export const mountAlbumBlocks = ({ grid, blocks, state, normalizeEffect, anchor = null, onChunkRendered = () => {} }) => {
  grid.innerHTML = "";

  let renderedCount = 0;
  let sentinel = null;
  let observer = null;
  const renderState = {
    photoCount: 0,
  };

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
      fragment.appendChild(createBlockNode({ block: blocks[index], state, normalizeEffect, renderState }));
    }
    grid.appendChild(fragment);
    renderedCount = end;
    onChunkRendered();
  };

  if (!shouldProgressiveRender(state)) {
    appendChunk(blocks.length);
    return disconnect;
  }

  const anchoredBlockIndex = anchor ? blocks.findIndex((block) => blockMatchesAnchor(block, anchor)) : -1;
  const initialBlockCount = anchoredBlockIndex >= 0 ? Math.max(INITIAL_BLOCK_COUNT, anchoredBlockIndex + 1) : INITIAL_BLOCK_COUNT;

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

  appendChunk(initialBlockCount);
  ensureSentinel();
  return disconnect;
};
