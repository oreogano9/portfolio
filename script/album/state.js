export const effectOptions = ["none", "focus", "monochrome", "lift", "blur"];
export const sizeOptions = ["full", "extended", "medium", "small", "xsmall", "xxsmall"];
export const spacingMap = {
  tight: "0.75rem",
  default: "1.25rem",
  airy: "2.5rem",
};
export const SITE_BRAND = "Konrad Parada Photos";
export const albumFontOptions = [
  "inter",
  "moonbase-alpha",
  "ledlight",
  "saint",
  "clash",
  "neue-haas",
  "manrope",
  "space-grotesk",
  "plus-jakarta-sans",
  "sora",
  "instrument-serif",
  "cormorant-garamond",
  "fraunces",
  "newsreader",
  "libre-baskerville",
  "syne",
  "young-serif",
];

const clampNumber = (value, min, max, fallback) => {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : Number(fallback);
  return Math.max(min, Math.min(max, numeric));
};

export const normalizeEffect = (value, fallback = "none") => (effectOptions.includes(value) ? value : fallback);

export const normalizeAlbumTitleFontFamily = (value, fallback = "libre-baskerville") =>
  albumFontOptions.includes(value) ? value : fallback;

export const getAlbumTitleFontFamilyCssValue = (value) => {
  switch (normalizeAlbumTitleFontFamily(value)) {
    case "moonbase-alpha":
      return '"MoonbaseAlpha", sans-serif';
    case "ledlight":
      return '"Ledlight", sans-serif';
    case "saint":
      return '"Saint", serif';
    case "manrope":
      return '"Manrope", sans-serif';
    case "space-grotesk":
      return '"SpaceGrotesk", sans-serif';
    case "plus-jakarta-sans":
      return '"PlusJakartaSans", sans-serif';
    case "sora":
      return '"Sora", sans-serif';
    case "instrument-serif":
      return '"InstrumentSerif", serif';
    case "cormorant-garamond":
      return '"CormorantGaramond", serif';
    case "fraunces":
      return '"Fraunces", serif';
    case "newsreader":
      return '"Newsreader", serif';
    case "libre-baskerville":
      return '"LibreBaskerville", serif';
    case "syne":
      return '"Syne", sans-serif';
    case "young-serif":
      return '"YoungSerif", serif';
    case "clash":
      return '"ClashDisplay", sans-serif';
    case "neue-haas":
      return '"NeueHaasDisplay", sans-serif';
    case "inter":
    default:
      return '"Inter", sans-serif';
  }
};

export const defaultEffectSettings = Object.freeze({
  focus: {
    nonFocusedOpacity: 12,
    activeScale: 1.5,
  },
  monochrome: {
    grayscaleAmount: 100,
    nonFocusedOpacity: 38,
    activeScale: 0,
  },
  lift: {
    scaleAmount: 2.4,
    nonFocusedOpacity: 34,
    shadowOpacity: 12,
  },
  blur: {
    blurRadius: 16,
    scaleAmount: 1.2,
    saturationDrop: 4,
    nonFocusedOpacity: 100,
  },
});

export const normalizeEffectSettings = (value = {}) => ({
  focus: {
    nonFocusedOpacity: clampNumber(
      value?.focus?.nonFocusedOpacity,
      0,
      100,
      defaultEffectSettings.focus.nonFocusedOpacity
    ),
    activeScale: clampNumber(value?.focus?.activeScale, 0, 8, defaultEffectSettings.focus.activeScale),
  },
  monochrome: {
    grayscaleAmount: clampNumber(
      value?.monochrome?.grayscaleAmount,
      0,
      100,
      defaultEffectSettings.monochrome.grayscaleAmount
    ),
    nonFocusedOpacity: clampNumber(
      value?.monochrome?.nonFocusedOpacity,
      0,
      100,
      defaultEffectSettings.monochrome.nonFocusedOpacity
    ),
    activeScale: clampNumber(value?.monochrome?.activeScale, 0, 8, defaultEffectSettings.monochrome.activeScale),
  },
  lift: {
    scaleAmount: clampNumber(value?.lift?.scaleAmount, 0, 8, defaultEffectSettings.lift.scaleAmount),
    nonFocusedOpacity: clampNumber(
      value?.lift?.nonFocusedOpacity,
      0,
      100,
      defaultEffectSettings.lift.nonFocusedOpacity
    ),
    shadowOpacity: clampNumber(value?.lift?.shadowOpacity, 0, 40, defaultEffectSettings.lift.shadowOpacity),
  },
  blur: {
    blurRadius: clampNumber(value?.blur?.blurRadius, 0, 24, defaultEffectSettings.blur.blurRadius),
    scaleAmount: clampNumber(value?.blur?.scaleAmount, 0, 5, defaultEffectSettings.blur.scaleAmount),
    saturationDrop: clampNumber(value?.blur?.saturationDrop, 0, 30, defaultEffectSettings.blur.saturationDrop),
    nonFocusedOpacity: clampNumber(
      value?.blur?.nonFocusedOpacity,
      0,
      100,
      defaultEffectSettings.blur.nonFocusedOpacity
    ),
  },
});

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
  return Math.max(-40, Math.min(40, numeric || 0));
};

export const normalizeTitleScale = (value, fallback = 0.6) => {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : Number(fallback);
  return Math.max(0.05, Math.min(1.8, Number.isFinite(numeric) ? numeric : 0.6));
};

export const normalizeMobileRotateClockwise = (value, fallback = true) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof fallback === "boolean") {
    return fallback;
  }

  return true;
};

export const normalizeIntro = (value, fallback = { mode: "hero", showArrow: true }) => ({
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
  id:
    typeof photo?.id === "string" && photo.id.trim()
      ? photo.id.trim()
      : typeof fallback.id === "string" && fallback.id.trim()
        ? fallback.id.trim()
        : normalizeAssetPath(photo?.src || fallback.src || ""),
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

const normalizeBlockWidth = (value, fallback = "medium") =>
  ["small", "medium", "full"].includes(value) ? value : fallback;

const normalizeBlockTextSize = (value, fallback = "normal") =>
  ["small", "normal", "large"].includes(value) ? value : fallback;

const normalizeBlockAlign = (value, fallback = "left") =>
  ["left", "center", "right"].includes(value) ? value : fallback;

const normalizeBlockRotatedPosition = (value, fallback = "middle") =>
  ["top", "middle", "bottom"].includes(value) ? value : fallback;

export const normalizeContentBlock = (block) => {
  if (block?.type === "text") {
    return {
      type: "text",
      id:
        typeof block?.id === "string" && block.id.trim()
          ? block.id.trim()
          : `text-${Math.random().toString(36).slice(2, 10)}`,
      html: typeof block?.html === "string" ? block.html : "<p>Text</p>",
      size: normalizeBlockTextSize(block?.size),
      width: normalizeBlockWidth(block?.width),
      align: normalizeBlockAlign(block?.align),
      rotatedPosition: normalizeBlockRotatedPosition(block?.rotatedPosition),
    };
  }

  if (block?.type === "space") {
    return {
      type: "space",
      id:
        typeof block?.id === "string" && block.id.trim()
          ? block.id.trim()
          : `space-${Math.random().toString(36).slice(2, 10)}`,
      value: clampNumber(block?.value, 0, 50, 0),
    };
  }

  if (block?.type === "photo") {
    const photoId = typeof block?.photoId === "string" ? normalizeAssetPath(block.photoId) : "";
    if (!photoId) {
      return null;
    }
    return {
      type: "photo",
      photoId,
    };
  }

  return null;
};

export const normalizeBlocks = (value) =>
  Array.isArray(value) ? value.map((block) => normalizeContentBlock(block)).filter(Boolean) : [];

export const toSettingsPayload = ({ galleryId, titleFallback = "", input = {} }) => ({
  id: galleryId,
  title: typeof input.title === "string" ? input.title : titleFallback,
  private: input.private === true,
  titleFontFamily: normalizeAlbumTitleFontFamily(input.titleFontFamily),
  titleScale: normalizeTitleScale(input.titleScale),
  mobileRotateClockwise: normalizeMobileRotateClockwise(input.mobileRotateClockwise, true),
  spacing: ["tight", "default", "airy"].includes(input.spacing) ? input.spacing : "airy",
  topSpacer: normalizeTopSpacer(input.topSpacer),
  effect: normalizeEffect(input.effect),
  effectSettings: normalizeEffectSettings(input.effectSettings),
  intro: normalizeIntro(input.intro),
  sections: normalizeSections(input.sections),
  photos: Array.isArray(input.photos) ? input.photos.map((photo) => normalizePhoto(photo)) : [],
  blocks: normalizeBlocks(input.blocks),
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
  return SITE_BRAND;
};

export const serializeState = (state, galleryId) => ({
  id: galleryId,
  title: state.title,
  private: state.private === true,
  titleFontFamily: normalizeAlbumTitleFontFamily(state.titleFontFamily),
  titleScale: normalizeTitleScale(state.titleScale),
  mobileRotateClockwise: normalizeMobileRotateClockwise(state.mobileRotateClockwise),
  spacing: state.spacing,
  topSpacer: normalizeTopSpacer(state.topSpacer),
  effect: state.effect,
  effectSettings: normalizeEffectSettings(state.effectSettings),
  intro: {
    mode: state.intro.mode,
    heroImageSrc: normalizeAssetPath(state.intro.heroImageSrc),
    showArrow: state.intro.showArrow,
  },
  sections: state.sections,
  photos: state.photos.map((photo) => ({
    id: photo.id,
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
  blocks: Array.isArray(state.blocks)
    ? state.blocks
        .map((block) => {
          if (block?.type === "photo") {
            return {
              type: "photo",
              photoId: typeof block.photoId === "string" ? normalizeAssetPath(block.photoId) : "",
            };
          }
          if (block?.type === "space") {
            return {
              type: "space",
              id: block.id,
              value: clampNumber(block.value, 0, 50, 0),
            };
          }
          if (block?.type === "text") {
            return {
              type: "text",
              id: block.id,
              html: typeof block.html === "string" ? block.html : "<p>Text</p>",
              size: normalizeBlockTextSize(block.size),
              width: normalizeBlockWidth(block.width),
              align: normalizeBlockAlign(block.align),
              rotatedPosition: normalizeBlockRotatedPosition(block.rotatedPosition),
            };
          }
          return null;
        })
        .filter(Boolean)
    : [],
});

export const getPersistedAlbumState = ({ state, galleryId, currentSyncedSignature, dirty = true, syncedSignature = "" }) => ({
  ...serializeState(state, galleryId),
  meta: {
    dirty,
    baseSignature: currentSyncedSignature,
    syncedSignature,
  },
});
