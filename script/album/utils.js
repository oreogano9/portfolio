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
  if (explicitHero && state.photos.some((photo) => photo.src === explicitHero && !photo.deleted)) {
    return explicitHero;
  }
  return state.photos.find((photo) => !photo.deleted)?.src || "";
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
  if (current.deleted || previous.deleted) {
    return false;
  }

  if (current.section !== previous.section) {
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

export const shouldProgressiveRender = () => {
  return false;
};
