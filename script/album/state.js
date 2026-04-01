export const effectOptions = ["none", "focus", "monochrome", "lift", "blur", "glow", "tilt"];
export const sizeOptions = ["full", "extended", "medium", "small", "xsmall", "xxsmall"];
export const spacingMap = {
  tight: "0.75rem",
  default: "1.25rem",
  airy: "2.5rem",
};

export const normalizeEffect = (value, fallback = "none") => (effectOptions.includes(value) ? value : fallback);

export const normalizeAssetPath = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/")) {
    return value;
  }

  if (value.startsWith("./")) {
    return `/${value.slice(2)}`;
  }

  if (value.startsWith("../")) {
    return `/${value.replace(/^\.\.\//, "")}`;
  }

  return value.startsWith("images/") || value.startsWith("assets/") || value.startsWith("data/")
    ? `/${value}`
    : value;
};

export const normalizeSettingsPath = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/^\/+/, "").replace(/^\.\//, "").replace(/^\.\.\//, "");
};

export const normalizeSections = (value) =>
  Array.isArray(value)
    ? value
        .filter((section) => typeof section?.id === "string" && typeof section?.title === "string")
        .map((section) => ({
          id: section.id,
          title: section.title,
        }))
    : [];

export const normalizeTopSpacer = (value, fallback = 7) => {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : Number(fallback);
  return Math.max(0, Math.min(40, numeric || 0));
};

export const normalizeTitleScale = (value, fallback = 0.6) => {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : Number(fallback);
  return Math.max(0.6, Math.min(1.8, Number.isFinite(numeric) ? numeric : 0.6));
};

export const normalizeMobileRotateClockwise = (value, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof fallback === "boolean") {
    return fallback;
  }

  return false;
};

export const normalizeIntro = (value, fallback = {}) => ({
  mode: value?.mode === "hero" ? "hero" : fallback.mode === "hero" ? "hero" : "default",
  heroImageSrc:
    typeof value?.heroImageSrc === "string"
      ? normalizeAssetPath(value.heroImageSrc)
      : typeof fallback.heroImageSrc === "string"
        ? normalizeAssetPath(fallback.heroImageSrc)
        : "",
  showArrow:
    typeof value?.showArrow === "boolean"
      ? value.showArrow
      : typeof fallback.showArrow === "boolean"
        ? fallback.showArrow
        : true,
});

export const normalizePhoto = (photo, fallback = {}) => ({
  src: typeof photo?.src === "string" ? normalizeAssetPath(photo.src) : normalizeAssetPath(fallback.src || ""),
  previewSrc:
    typeof photo?.previewSrc === "string"
      ? normalizeAssetPath(photo.previewSrc)
      : typeof fallback.previewSrc === "string"
        ? normalizeAssetPath(fallback.previewSrc)
        : "",
  alt: typeof photo?.alt === "string" ? photo.alt : fallback.alt || "",
  section: typeof photo?.section === "string" ? photo.section : fallback.section || "",
  size: sizeOptions.includes(photo?.size) ? photo.size : fallback.size || "full",
  spacerAfter: Number.isFinite(Number(photo?.spacerAfter)) ? Number(photo.spacerAfter) : Number(fallback.spacerAfter) || 0,
  effect: normalizeEffect(photo?.effect, fallback.effect || "none"),
  joinWithPrevious:
    typeof photo?.joinWithPrevious === "boolean"
      ? photo.joinWithPrevious
      : typeof fallback.joinWithPrevious === "boolean"
        ? fallback.joinWithPrevious
        : false,
  deleted:
    typeof photo?.deleted === "boolean"
      ? photo.deleted
      : typeof fallback.deleted === "boolean"
        ? fallback.deleted
        : false,
  landscape:
    typeof photo?.landscape === "boolean"
      ? photo.landscape
      : typeof fallback.landscape === "boolean"
        ? fallback.landscape
        : null,
  aspectRatio: Number.isFinite(Number(photo?.aspectRatio))
    ? Number(photo.aspectRatio)
    : Number.isFinite(Number(fallback.aspectRatio))
      ? Number(fallback.aspectRatio)
      : null,
});

export const toSettingsPayload = ({ galleryId, titleFallback = "", input = {} }) => ({
  id: galleryId,
  title: typeof input.title === "string" ? input.title : titleFallback,
  titleScale: normalizeTitleScale(input.titleScale),
  mobileRotateClockwise: normalizeMobileRotateClockwise(input.mobileRotateClockwise),
  spacing: ["tight", "default", "airy"].includes(input.spacing) ? input.spacing : "tight",
  topSpacer: normalizeTopSpacer(input.topSpacer),
  effect: normalizeEffect(input.effect),
  intro: normalizeIntro(input.intro),
  sections: normalizeSections(input.sections),
  photos: Array.isArray(input.photos) ? input.photos.map((photo) => normalizePhoto(photo)) : [],
});

export const getSettingsSignature = ({ galleryId, titleFallback = "", input = {} }) =>
  JSON.stringify(toSettingsPayload({ galleryId, titleFallback, input }));

export const getSavedState = (storageKey) => {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
};

export const fetchJsonState = async (settingsUrl) => {
  if (!settingsUrl) {
    return null;
  }

  try {
    const response = await fetch(settingsUrl, { cache: "no-store" });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
};

export const fetchSiteBrand = async () => {
  try {
    const response = await fetch("/index.html", { cache: "no-store" });
    if (!response.ok) {
      return "Konrad Parada Photos";
    }
    const markup = await response.text();
    const doc = new DOMParser().parseFromString(markup, "text/html");
    return doc.querySelector(".brand")?.textContent?.trim() || "Konrad Parada Photos";
  } catch {
    return "Konrad Parada Photos";
  }
};

export const serializeState = (state, galleryId) => ({
  id: galleryId,
  title: state.title,
  titleScale: normalizeTitleScale(state.titleScale),
  mobileRotateClockwise: normalizeMobileRotateClockwise(state.mobileRotateClockwise),
  spacing: state.spacing,
  topSpacer: normalizeTopSpacer(state.topSpacer),
  effect: state.effect,
  intro: {
    mode: state.intro.mode,
    heroImageSrc: normalizeAssetPath(state.intro.heroImageSrc),
    showArrow: state.intro.showArrow,
  },
  sections: state.sections,
  photos: state.photos.map((photo) => ({
    src: normalizeAssetPath(photo.src),
    previewSrc: normalizeAssetPath(photo.previewSrc),
    alt: photo.alt,
    section: photo.section,
    size: photo.size,
    spacerAfter: photo.spacerAfter,
    effect: photo.effect,
    joinWithPrevious: photo.joinWithPrevious,
    deleted: photo.deleted,
    landscape: typeof photo.landscape === "boolean" ? photo.landscape : null,
    aspectRatio: Number.isFinite(Number(photo.aspectRatio)) ? Number(photo.aspectRatio) : null,
  })),
});

export const getPersistedAlbumState = ({ state, galleryId, currentSyncedSignature, dirty = true, syncedSignature = "" }) => ({
  ...serializeState(state, galleryId),
  meta: {
    dirty,
    baseSignature: currentSyncedSignature,
    syncedSignature,
  },
});
