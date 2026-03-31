export const deriveSectionsFromPhotos = (photos) => {
  const derived = [];
  photos.forEach((photo) => {
    if (!photo.section || derived.some((section) => section.id === photo.section)) {
      return;
    }
    derived.push({
      id: photo.section,
      title: photo.section,
    });
  });
  return derived;
};

export const getSpacerValue = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric}rem` : "0rem";
};

export const getHeroImageSrc = (state) => {
  const explicitHero = typeof state.intro.heroImageSrc === "string" ? state.intro.heroImageSrc : "";
  if (explicitHero && state.photos.some((photo) => photo.src === explicitHero)) {
    return explicitHero;
  }
  return state.photos[0]?.src || "";
};

export const canJoinPhoto = (state, index, normalizeEffect) => {
  if (index <= 0) {
    return false;
  }

  const current = state.photos[index];
  const previous = state.photos[index - 1];
  if (!current || !previous) {
    return false;
  }

  const currentEffect = normalizeEffect(current.effect !== "none" ? current.effect : state.effect);
  const previousEffect = normalizeEffect(previous.effect !== "none" ? previous.effect : state.effect);
  if (current.section !== previous.section || currentEffect === "spotlight" || previousEffect === "spotlight") {
    return false;
  }

  let rowSize = 1;
  let cursor = index - 1;
  while (cursor > 0 && state.photos[cursor].joinWithPrevious && state.photos[cursor - 1]?.section === previous.section) {
    rowSize += 1;
    cursor -= 1;
  }

  return rowSize < 3;
};

export const shouldProgressiveRender = (state) => !state.editing || state.previewing;
