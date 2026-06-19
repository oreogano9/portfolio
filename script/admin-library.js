import { resolveAssetUrl } from "./assets.js";

const LIBRARY_SETTINGS_PATH = "data/photo-library.json";
const LIBRARY_S3_PREFIX = "albums/library";
const ORIGINALS_PREFIX = `${LIBRARY_S3_PREFIX}/originals`;
const THUMBS_PREFIX = `${LIBRARY_S3_PREFIX}/thumbs`;
const MAX_THUMB_EDGE = 900;
const THUMB_QUALITY = 0.82;
const DELETE_BATCH_SIZE = 100;
const GRID_BATCH_SIZE = 240;
const SAVE_BATCH_SIZE = 500;
const MONTH_DIVIDER_THRESHOLD = 60;

const state = {
  library: { id: "photo-library", version: 1, updatedAt: "", photos: [] },
  albums: [],
  selectedIds: new Set(),
  activeId: "",
  view: "library",
  filter: "all",
  albumFilter: "archive",
  tagFilter: "",
  search: "",
  saving: false,
  uploading: false,
  detailOpen: false,
  renderLimit: GRID_BATCH_SIZE,
  dirtyIds: new Set(),
  deletedIds: new Set(),
  loadMoreObserver: null,
  timelineGroups: [],
  activeMonthKey: "",
  pendingTimelineKey: "",
  suppressNextTimelineClick: false,
};

const els = {
  body: document.body,
  grid: document.querySelector(".admin-grid"),
  detail: document.querySelector(".admin-detail"),
  timeline: document.querySelector(".admin-timeline"),
  search: document.querySelector(".admin-search"),
  filter: document.querySelector(".admin-filter"),
  albumFilter: document.querySelector(".admin-album-filter"),
  tagFilter: document.querySelector(".admin-tag-filter"),
  selectVisibleButton: document.querySelector('[data-action="select-visible"]'),
  saveButton: document.querySelector('[data-action="save-library"]'),
  fileInput: document.querySelector(".admin-file-input"),
  uploadStatus: document.querySelector(".admin-upload-status"),
  selectionBar: document.querySelector(".admin-selection-bar"),
  selectionCount: document.querySelector("[data-selection-count]"),
  selectionAlbum: document.querySelector(".admin-selection-album"),
  selectionTags: document.querySelector(".admin-selection-tags"),
  librarySelectionActions: Array.from(
    document.querySelectorAll(
      '[data-action="add-selected-to-album"], [data-action="add-tags-selected"], [data-action="favorite-selected"], [data-action="unfavorite-selected"], [data-action="portfolio-selected"], [data-action="unportfolio-selected"], [data-action="trash-selected"], .admin-selection-tags'
    )
  ),
  trashSelectionActions: Array.from(document.querySelectorAll('[data-action="restore-selected"], [data-action="delete-selected"]')),
  navButtons: Array.from(document.querySelectorAll("[data-admin-view]")),
  stats: {
    visible: document.querySelector('[data-stat="visible"]'),
    selected: document.querySelector('[data-stat="selected"]'),
    stored: document.querySelector('[data-stat="stored"]'),
    trash: document.querySelector('[data-stat="trash"]'),
    unsaved: document.querySelector('[data-stat="unsaved"]'),
  },
};

const normalizeSettingsPath = (value) => String(value || "").replace(/^\/+/, "");

const getLibraryPath = () => normalizeSettingsPath(els.body.dataset.photoLibrary || LIBRARY_SETTINGS_PATH);

const sanitizeStem = (value) =>
  String(value || "photo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 110) || "photo";

const getExtension = (file) => {
  const match = String(file?.name || "").match(/\.([a-zA-Z0-9]+)$/);
  if (match) {
    return match[1].toLowerCase();
  }
  if (file?.type === "image/png") {
    return "png";
  }
  if (file?.type === "image/webp") {
    return "webp";
  }
  return "jpg";
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
};

const formatExposure = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  if (seconds >= 1) {
    return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
  }
  return `1/${Math.round(1 / seconds)}s`;
};

const formatNumber = (value, suffix = "") => {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "";
  }
  return `${Number.isInteger(number) ? number : number.toFixed(1)}${suffix}`;
};

const formatCoordinate = (value) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "";
  }
  return number.toFixed(6);
};

const splitTags = (value) =>
  String(value || "")
    .split(";")
    .map((tag) => tag.trim())
    .filter(Boolean);

const joinTags = (tags) => (Array.isArray(tags) ? tags.join("; ") : "");

const normalizeMetadata = (metadata) => {
  const source = metadata && typeof metadata === "object" ? metadata : {};
  return {
    takenAt: String(source.takenAt || ""),
    cameraMake: String(source.cameraMake || ""),
    cameraModel: String(source.cameraModel || ""),
    lensMake: String(source.lensMake || ""),
    lensModel: String(source.lensModel || ""),
    software: String(source.software || ""),
    orientation: Number(source.orientation) || null,
    iso: Number(source.iso) || null,
    exposureTime: Number(source.exposureTime) || null,
    aperture: Number(source.aperture) || null,
    focalLength: Number(source.focalLength) || null,
    gpsLatitude: Number(source.gpsLatitude) || null,
    gpsLongitude: Number(source.gpsLongitude) || null,
    gpsAltitude: Number(source.gpsAltitude) || null,
  };
};

const normalizePhoto = (photo) => ({
  id: String(photo?.id || photo?.src || crypto.randomUUID()),
  src: String(photo?.src || ""),
  previewSrc: String(photo?.previewSrc || photo?.src || ""),
  s3Key: String(photo?.s3Key || ""),
  thumbS3Key: String(photo?.thumbS3Key || ""),
  originalName: String(photo?.originalName || photo?.filename || ""),
  displayName: String(photo?.displayName || photo?.originalName || photo?.filename || "Untitled photo"),
  internalName: String(photo?.internalName || ""),
  type: String(photo?.type || ""),
  size: Number(photo?.size) || 0,
  width: Number(photo?.width) || null,
  height: Number(photo?.height) || null,
  aspectRatio: Number(photo?.aspectRatio) || null,
  uploadedAt: String(photo?.uploadedAt || ""),
  lastModified: Number(photo?.lastModified) || null,
  tags: Array.isArray(photo?.tags) ? photo.tags.map(String).filter(Boolean) : [],
  albumIds: Array.isArray(photo?.albumIds) ? photo.albumIds.map(String).filter(Boolean) : [],
  favorite: photo?.favorite === true,
  inPortfolio: photo?.inPortfolio === true,
  trashed: photo?.trashed === true,
  trashedAt: String(photo?.trashedAt || ""),
  metadata: normalizeMetadata(photo?.metadata),
  contentSha256: String(photo?.contentSha256 || ""),
  archiveSha256: String(photo?.archiveSha256 || ""),
  sourcePaths: Array.isArray(photo?.sourcePaths) ? photo.sourcePaths.map(String).filter(Boolean) : [],
  sourceRoots: Array.isArray(photo?.sourceRoots) ? photo.sourceRoots.map(String).filter(Boolean) : [],
  organizedPaths: Array.isArray(photo?.organizedPaths) ? photo.organizedPaths.map(String).filter(Boolean) : [],
  archiveTags: Array.isArray(photo?.archiveTags) ? photo.archiveTags.map(String).filter(Boolean) : [],
  archiveImportedAt: String(photo?.archiveImportedAt || ""),
});

const setStatus = (message) => {
  if (els.uploadStatus) {
    els.uploadStatus.textContent = message || "";
  }
};

const redirectToLogin = () => {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/admin-login.html?next=${encodeURIComponent(next)}`);
};

const fetchAdminJson = async (url, options) => {
  const response = await fetch(url, options);
  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Admin session expired. Redirecting to login.");
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  return { response, payload };
};

const getPhotoName = (photo) => photo.internalName || photo.displayName || photo.originalName || "Untitled photo";

const getPhotoById = (id) => state.library.photos.find((photo) => photo.id === id) || null;

const getAlbumTitle = (albumId) => state.albums.find((album) => album.id === albumId)?.title || albumId;

const getUnsavedCount = () => state.dirtyIds.size + state.deletedIds.size;

const updateUnsavedState = () => {
  const count = getUnsavedCount();
  if (els.stats.unsaved) {
    els.stats.unsaved.textContent = count ? `${count} unsaved` : "Saved";
    els.stats.unsaved.classList.toggle("is-warning", count > 0);
  }
  if (els.saveButton) {
    els.saveButton.textContent = count ? `Save ${count}` : "Save";
    els.saveButton.disabled = state.saving || state.uploading || count === 0;
  }
};

const markDirty = (ids) => {
  ids.filter(Boolean).forEach((id) => state.dirtyIds.add(id));
  updateUnsavedState();
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const createSaveBatches = ({ upserts, deleteIds }) => {
  const upsertBatches = chunkArray(upserts, SAVE_BATCH_SIZE);
  const deleteBatches = chunkArray(deleteIds, SAVE_BATCH_SIZE);
  const totalBatches = Math.max(upsertBatches.length, deleteBatches.length, 1);
  return Array.from({ length: totalBatches }, (_, index) => ({
    upserts: upsertBatches[index] || [],
    deleteIds: deleteBatches[index] || [],
  }));
};

const isArchivePhoto = (photo) => Boolean(photo.archiveSha256 || photo.sourcePaths?.length || String(photo.s3Key || "").startsWith("albums/ARCHIVE/"));

const deriveThumbnailPath = (src) => {
  const value = String(src || "");
  if (!value.startsWith("/images/") || value.includes("/thumbs/")) {
    return "";
  }
  const slashIndex = value.lastIndexOf("/");
  if (slashIndex < 0) {
    return "";
  }
  return `${value.slice(0, slashIndex)}/thumbs/${value.slice(slashIndex + 1)}`;
};

const getGridImageSrc = (photo) => {
  const previewSrc = String(photo.previewSrc || "");
  if (previewSrc && previewSrc !== photo.src) {
    return previewSrc;
  }
  if (isArchivePhoto(photo)) {
    return "";
  }
  return deriveThumbnailPath(photo.src) || photo.src;
};

const getDetailImageSrc = (photo) => photo.src || photo.previewSrc;

const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getFileNameFromPath = (value) => {
  const fileName = String(value || "").split("/").pop() || "Untitled photo";
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
};

const normalizeAlbumPhoto = ({ photo, album }) => {
  const src = String(photo?.src || photo?.id || "");
  if (!src.startsWith("/images/")) {
    return null;
  }

  const previewSrc = String(photo?.previewSrc || photo?.src || "");
  const fileName = getFileNameFromPath(src);
  const aspectRatio = Number(photo?.aspectRatio) || null;
  const landscape = typeof photo?.landscape === "boolean" ? photo.landscape : null;

  return normalizePhoto({
    id: src,
    src,
    previewSrc: previewSrc.startsWith("/images/") ? previewSrc : src,
    originalName: fileName,
    displayName: String(photo?.alt || fileName).replace(new RegExp(`^${escapeRegExp(album.title)}\\s+-\\s+`, "i"), ""),
    width: null,
    height: null,
    aspectRatio,
    uploadedAt: "",
    albumIds: [album.id],
    trashed: photo?.deleted === true,
    trashedAt: photo?.deleted === true ? "Album deleted flag" : "",
    metadata: normalizeMetadata(photo?.metadata),
    favorite: photo?.favorite === true,
    inPortfolio: photo?.inPortfolio === true,
    type: "image/jpeg",
    size: 0,
    ...(landscape !== null && !aspectRatio ? { aspectRatio: landscape ? 1.5 : 0.667 } : {}),
  });
};

const mergeLibraryPhotos = (libraryPhotos, albumPhotos) => {
  const mergedBySrc = new Map();

  [...albumPhotos, ...libraryPhotos].forEach((photo) => {
    const normalized = normalizePhoto(photo);
    if (!normalized.src) {
      return;
    }
    const key = normalized.src;
    const existing = mergedBySrc.get(key);
    if (!existing) {
      mergedBySrc.set(key, normalized);
      return;
    }

    mergedBySrc.set(
      key,
      normalizePhoto({
        ...existing,
        ...normalized,
        id: existing.id || normalized.id,
        previewSrc: normalized.previewSrc || existing.previewSrc,
        s3Key: normalized.s3Key || existing.s3Key,
        thumbS3Key: normalized.thumbS3Key || existing.thumbS3Key,
        originalName: normalized.originalName || existing.originalName,
        displayName: normalized.displayName || existing.displayName,
        type: normalized.type || existing.type,
        size: normalized.size || existing.size,
        width: normalized.width || existing.width,
        height: normalized.height || existing.height,
        aspectRatio: normalized.aspectRatio || existing.aspectRatio,
        uploadedAt: normalized.uploadedAt || existing.uploadedAt,
        lastModified: normalized.lastModified || existing.lastModified,
        tags: Array.from(new Set([...(existing.tags || []), ...(normalized.tags || [])])),
        albumIds: Array.from(new Set([...(existing.albumIds || []), ...(normalized.albumIds || [])])),
        metadata: normalizeMetadata({ ...(existing.metadata || {}), ...(normalized.metadata || {}) }),
        favorite: existing.favorite || normalized.favorite,
        inPortfolio: existing.inPortfolio || normalized.inPortfolio,
        trashed: normalized.trashed,
        trashedAt: normalized.trashedAt || existing.trashedAt,
        contentSha256: normalized.contentSha256 || existing.contentSha256,
        archiveSha256: normalized.archiveSha256 || existing.archiveSha256,
        sourcePaths: Array.from(new Set([...(existing.sourcePaths || []), ...(normalized.sourcePaths || [])])),
        sourceRoots: Array.from(new Set([...(existing.sourceRoots || []), ...(normalized.sourceRoots || [])])),
        organizedPaths: Array.from(new Set([...(existing.organizedPaths || []), ...(normalized.organizedPaths || [])])),
        archiveTags: Array.from(new Set([...(existing.archiveTags || []), ...(normalized.archiveTags || [])])),
        archiveImportedAt: normalized.archiveImportedAt || existing.archiveImportedAt,
      })
    );
  });

  return Array.from(mergedBySrc.values());
};

const renderAlbumPicker = () => {
  if (!els.selectionAlbum) {
    return;
  }
  const currentValue = els.selectionAlbum.value;
  els.selectionAlbum.replaceChildren(
    Object.assign(document.createElement("option"), {
      value: "",
      textContent: "Choose album...",
    }),
    ...state.albums.map((album) =>
      Object.assign(document.createElement("option"), {
        value: album.id,
        textContent: album.title,
      })
    )
  );
  if (state.albums.some((album) => album.id === currentValue)) {
    els.selectionAlbum.value = currentValue;
  }
};

const renderGalleryAlbumFilter = () => {
  if (!els.albumFilter) {
    return;
  }
  const currentValue = state.albumFilter || "archive";
  els.albumFilter.replaceChildren(
    Object.assign(document.createElement("option"), {
      value: "archive",
      textContent: "Archive",
    }),
    Object.assign(document.createElement("option"), {
      value: "all",
      textContent: "All photos",
    }),
    ...state.albums.map((album) =>
      Object.assign(document.createElement("option"), {
        value: album.id,
        textContent: album.title,
      })
    )
  );
  els.albumFilter.value = ["archive", "all", ...state.albums.map((album) => album.id)].includes(currentValue) ? currentValue : "archive";
};

const getPhotoTags = (photo) => Array.from(new Set([...(photo.tags || []), ...(photo.archiveTags || [])].map(String).filter(Boolean)));

const renderTagFilter = () => {
  if (!els.tagFilter) {
    return;
  }
  const currentValue = state.tagFilter || "";
  const tags = Array.from(new Set(state.library.photos.flatMap(getPhotoTags))).sort((left, right) => left.localeCompare(right));
  els.tagFilter.replaceChildren(
    Object.assign(document.createElement("option"), {
      value: "",
      textContent: "All tags",
    }),
    ...tags.map((tag) =>
      Object.assign(document.createElement("option"), {
        value: tag,
        textContent: tag,
      })
    )
  );
  els.tagFilter.value = tags.includes(currentValue) ? currentValue : "";
  state.tagFilter = els.tagFilter.value;
  els.tagFilter.disabled = tags.length === 0;
};

const photoMatchesSearch = (photo) => {
  const query = state.search.trim().toLowerCase();
  if (!query) {
    return true;
  }
  const albumTitles = photo.albumIds.map(getAlbumTitle).join(" ");
  const metadata = photo.metadata || {};
  return [
    getPhotoName(photo),
    photo.originalName,
    photo.tags.join(" "),
    albumTitles,
    photo.contentSha256,
    photo.archiveSha256,
    photo.sourcePaths.join(" "),
    photo.sourceRoots.join(" "),
    photo.organizedPaths.join(" "),
    photo.archiveTags.join(" "),
    metadata.takenAt,
    metadata.cameraMake,
    metadata.cameraModel,
    metadata.lensMake,
    metadata.lensModel,
    metadata.software,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
};

const photoMatchesFilter = (photo) => {
  if (state.view === "trash") {
    return photo.trashed;
  }
  if (photo.trashed) {
    return false;
  }
  if (state.albumFilter === "archive") {
    if (!isArchivePhoto(photo)) {
      return false;
    }
  } else if (state.albumFilter && state.albumFilter !== "all") {
    if (!photo.albumIds.includes(state.albumFilter)) {
      return false;
    }
  }
  if (state.tagFilter && !getPhotoTags(photo).includes(state.tagFilter)) {
    return false;
  }
  if (state.filter === "favorites") {
    return photo.favorite;
  }
  if (state.filter === "portfolio") {
    return photo.inPortfolio;
  }
  if (state.filter === "untagged") {
    return !photo.tags.length;
  }
  return true;
};

const parsePhotoTimestamp = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return 0;
  }
  const normalizedExifValue = rawValue.replace(
    /^(\d{4}):(\d{2}):(\d{2})(?:\s+|T)(\d{2}):(\d{2}):(\d{2})/,
    "$1-$2-$3T$4:$5:$6"
  );
  const timestamp = Date.parse(normalizedExifValue);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getPhotoTimestamp = (photo) => {
  const values = [
    photo.metadata?.takenAt,
    photo.lastModified ? new Date(photo.lastModified).toISOString() : "",
    photo.uploadedAt,
    photo.archiveImportedAt,
  ];
  for (const value of values) {
    const timestamp = parsePhotoTimestamp(value);
    if (timestamp) {
      return timestamp;
    }
  }
  return 0;
};

const getPhotoMonthKey = (photo) => {
  const timestamp = getPhotoTimestamp(photo);
  if (!timestamp) {
    return "undated";
  }
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const formatPhotoMonth = (photo) => {
  const timestamp = getPhotoTimestamp(photo);
  if (!timestamp) {
    return "Undated";
  }
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(timestamp));
};

const formatPhotoMonthShort = (photo) => {
  const timestamp = getPhotoTimestamp(photo);
  if (!timestamp) {
    return { month: "Undated", year: "" };
  }
  const date = new Date(timestamp);
  return {
    month: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date),
    year: new Intl.DateTimeFormat(undefined, { year: "numeric" }).format(date),
  };
};

const getVisibleMonthGroups = (photos) => {
  const groups = [];
  let lastMonthKey = "";
  photos.forEach((photo, index) => {
    const monthKey = getPhotoMonthKey(photo);
    if (monthKey === lastMonthKey) {
      return;
    }
    const shortLabel = formatPhotoMonthShort(photo);
    groups.push({
      key: monthKey,
      label: formatPhotoMonth(photo),
      month: shortLabel.month,
      year: shortLabel.year,
      firstIndex: index,
    });
    lastMonthKey = monthKey;
  });
  return groups;
};

const getVisiblePhotos = () => {
  const visiblePhotos = state.library.photos.filter((photo) => photoMatchesFilter(photo) && photoMatchesSearch(photo));
  return [...visiblePhotos].sort((left, right) => getPhotoTimestamp(right) - getPhotoTimestamp(left));
};

const getVisiblePhotoIds = () => getVisiblePhotos().map((photo) => photo.id);

const resetRenderLimit = () => {
  state.renderLimit = GRID_BATCH_SIZE;
};

const updateStats = (visiblePhotos, renderedCount = visiblePhotos.length) => {
  const stored = state.library.photos.filter((photo) => !photo.trashed).length;
  const trash = state.library.photos.filter((photo) => photo.trashed).length;
  els.stats.visible.textContent =
    renderedCount < visiblePhotos.length ? `${renderedCount} of ${visiblePhotos.length} visible` : `${visiblePhotos.length} visible`;
  els.stats.selected.textContent = `${state.selectedIds.size} selected`;
  els.stats.stored.textContent = `${stored} stored`;
  els.stats.trash.textContent = `${trash} trash`;
  els.selectionBar.hidden = state.selectedIds.size === 0;
  els.selectionCount.textContent = `${state.selectedIds.size} selected`;
  els.librarySelectionActions.forEach((element) => {
    element.hidden = state.view === "trash";
  });
  els.trashSelectionActions.forEach((element) => {
    element.hidden = state.view !== "trash";
  });
  if (els.selectionAlbum) {
    els.selectionAlbum.hidden = state.view === "trash";
  }
  if (els.selectVisibleButton) {
    const visibleIds = visiblePhotos.map((photo) => photo.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => state.selectedIds.has(id));
    els.selectVisibleButton.textContent = allVisibleSelected ? "Deselect visible" : "Select visible";
    els.selectVisibleButton.disabled = visibleIds.length === 0;
  }
  updateUnsavedState();
};

const updatePhotoCardStates = () => {
  els.grid.querySelectorAll(".admin-photo-card").forEach((card) => {
    const photoId = card.dataset.photoId || "";
    card.classList.toggle("is-selected", state.selectedIds.has(photoId));
    card.classList.toggle("is-active", photoId === state.activeId);
  });
};

const restoreScrollPosition = (scrollX, scrollY) => {
  requestAnimationFrame(() => {
    window.scrollTo(scrollX, scrollY);
  });
};

const createPhotoCard = (photo) => {
  const card = document.createElement("article");
  card.className = `admin-photo-card${state.selectedIds.has(photo.id) ? " is-selected" : ""}${photo.id === state.activeId ? " is-active" : ""}`;
  card.dataset.photoId = photo.id;

  const imageButton = document.createElement("button");
  imageButton.className = "admin-photo-thumb";
  imageButton.type = "button";
  imageButton.dataset.action = "inspect-photo";
  imageButton.dataset.photoId = photo.id;
  imageButton.setAttribute("aria-label", `Inspect ${getPhotoName(photo)}`);

  const img = document.createElement("img");
  const gridImageSrc = getGridImageSrc(photo);
  if (gridImageSrc) {
    img.loading = "lazy";
    img.alt = getPhotoName(photo);
    img.src = resolveAssetUrl(gridImageSrc);
    if (photo.aspectRatio) {
      img.style.aspectRatio = String(photo.aspectRatio);
    }
    imageButton.append(img);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "admin-photo-placeholder";
    placeholder.textContent = "No thumbnail";
    imageButton.append(placeholder);
  }

  if (state.selectedIds.has(photo.id)) {
    const selectedMark = document.createElement("span");
    selectedMark.className = "admin-photo-selected-mark";
    selectedMark.textContent = "Selected";
    card.append(imageButton, selectedMark);
  } else {
    card.append(imageButton);
  }
  return card;
};

const createFlag = (label) => {
  const flag = document.createElement("span");
  flag.textContent = label;
  return flag;
};

const createLoadMoreControl = ({ renderedCount, totalCount }) => {
  const holder = document.createElement("div");
  holder.className = "admin-grid-more";
  holder.dataset.loadMoreSentinel = "true";
  holder.textContent = `Loading more (${renderedCount} of ${totalCount})`;
  return holder;
};

const createMonthDivider = ({ key, label }) => {
  const divider = document.createElement("div");
  divider.className = "admin-month-divider";
  divider.dataset.monthKey = key;
  divider.textContent = label;
  return divider;
};

const updateTimelineActiveState = (activeKey = state.activeMonthKey) => {
  state.activeMonthKey = activeKey || "";
  if (!els.timeline) {
    return;
  }
  let activeButton = null;
  els.timeline.querySelectorAll(".admin-timeline-button").forEach((button) => {
    const isActive = button.dataset.monthKey === state.activeMonthKey;
    const isPending = button.dataset.monthKey === state.pendingTimelineKey;
    button.classList.toggle("is-active", isActive);
    button.classList.toggle("is-pending", isPending);
    button.setAttribute("aria-current", isActive ? "true" : "false");
    if (isActive) {
      activeButton = button;
    }
  });
  if (activeButton && !state.pendingTimelineKey) {
    activeButton.scrollIntoView({ block: "nearest" });
  }
};

const renderTimeline = (visiblePhotos) => {
  if (!els.timeline) {
    return;
  }
  state.timelineGroups = getVisibleMonthGroups(visiblePhotos);
  state.pendingTimelineKey = "";
  els.timeline.hidden = state.view === "trash" || state.timelineGroups.length <= 1;
  if (els.timeline.hidden) {
    els.timeline.replaceChildren();
    state.activeMonthKey = "";
    return;
  }
  const buttons = state.timelineGroups.map((group) => {
    const button = document.createElement("button");
    button.className = "admin-timeline-button";
    button.type = "button";
    button.dataset.action = "timeline-jump";
    button.dataset.monthKey = group.key;
    button.dataset.timelineIndex = String(group.firstIndex);
    button.setAttribute("aria-label", `Jump to ${group.label}`);
    button.innerHTML = `<span>${escapeHtml(group.month)}</span>${group.year ? `<small>${escapeHtml(group.year)}</small>` : ""}`;
    return button;
  });
  els.timeline.replaceChildren(...buttons);
  updateTimelineActiveState(state.activeMonthKey || state.timelineGroups[0]?.key || "");
};

const getMonthDivider = (monthKey) => Array.from(els.grid.querySelectorAll(".admin-month-divider")).find((item) => item.dataset.monthKey === monthKey);

const scrollToMonthKey = (monthKey, { settle = false, attempt = 0 } = {}) => {
  const divider = getMonthDivider(monthKey);
  if (!divider) {
    return;
  }
  const offset = 18;
  const targetTop = Math.max(0, divider.getBoundingClientRect().top + window.scrollY - offset);
  window.scrollTo({ top: targetTop, behavior: attempt ? "auto" : "smooth" });
  if (settle && attempt < 10) {
    window.setTimeout(() => {
      const currentDivider = getMonthDivider(monthKey);
      if (!currentDivider) {
        return;
      }
      const distance = currentDivider.getBoundingClientRect().top - offset;
      if (Math.abs(distance) > 2) {
        scrollToMonthKey(monthKey, { settle: true, attempt: attempt + 1 });
      }
    }, 220);
  }
};

const jumpToTimelineGroup = (group) => {
  if (!group) {
    return;
  }
  if (group.firstIndex >= state.renderLimit) {
    state.renderLimit = Math.ceil((group.firstIndex + 1) / GRID_BATCH_SIZE) * GRID_BATCH_SIZE;
    renderGrid();
  }
  requestAnimationFrame(() => {
    updateTimelineActiveState(group.key);
    scrollToMonthKey(group.key, { settle: true });
  });
};

const getTimelineGroupFromY = (clientY) => {
  if (!els.timeline || !state.timelineGroups.length) {
    return null;
  }
  const buttons = Array.from(els.timeline.querySelectorAll(".admin-timeline-button"));
  if (!buttons.length) {
    return null;
  }
  let closest = null;
  let closestDistance = Infinity;
  buttons.forEach((button) => {
    const rect = button.getBoundingClientRect();
    const distance = Math.abs(clientY - (rect.top + rect.height / 2));
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = button;
    }
  });
  const monthKey = closest?.dataset.monthKey || "";
  return state.timelineGroups.find((group) => group.key === monthKey) || null;
};

const setPendingTimelineGroup = (group) => {
  state.pendingTimelineKey = group?.key || "";
  updateTimelineActiveState();
};

const updateActiveTimelineFromScroll = () => {
  if (!els.timeline || els.timeline.hidden || state.pendingTimelineKey) {
    return;
  }
  const dividers = Array.from(els.grid.querySelectorAll(".admin-month-divider"));
  if (!dividers.length) {
    updateTimelineActiveState(state.timelineGroups[0]?.key || "");
    return;
  }
  const anchorY = window.innerHeight * 0.24;
  let activeKey = dividers[0].dataset.monthKey || "";
  dividers.forEach((divider) => {
    if (divider.getBoundingClientRect().top <= anchorY) {
      activeKey = divider.dataset.monthKey || activeKey;
    }
  });
  updateTimelineActiveState(activeKey);
};

const observeLoadMore = () => {
  if (state.loadMoreObserver) {
    state.loadMoreObserver.disconnect();
    state.loadMoreObserver = null;
  }
  const sentinel = els.grid.querySelector("[data-load-more-sentinel]");
  if (!sentinel) {
    return;
  }
  state.loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }
      state.renderLimit += GRID_BATCH_SIZE;
      renderGrid();
    },
    { rootMargin: "900px 0px" }
  );
  state.loadMoreObserver.observe(sentinel);
};

const createMetadataRows = (photo) => {
  const metadata = normalizeMetadata(photo?.metadata);
  const rows = [
    ["Storage key", photo.s3Key || "Album asset"],
    ["Content hash", photo.contentSha256],
    ["Archive hash", photo.archiveSha256],
    ["Archive tags", photo.archiveTags?.join("; ")],
    ["Dimensions", `${photo.width || "?"} x ${photo.height || "?"}`],
    ["Type", photo.type || "Unknown"],
    ["Size", photo.size ? formatBytes(photo.size) : "Unknown"],
    ["Uploaded", photo.uploadedAt ? new Date(photo.uploadedAt).toLocaleString() : "Imported from album settings"],
    ["Archived", photo.archiveImportedAt ? new Date(photo.archiveImportedAt).toLocaleString() : ""],
    ["Taken", metadata.takenAt || ""],
    ["Camera", [metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(" ")],
    ["Lens", [metadata.lensMake, metadata.lensModel].filter(Boolean).join(" ")],
    ["Exposure", formatExposure(metadata.exposureTime)],
    ["Aperture", metadata.aperture ? `f/${formatNumber(metadata.aperture)}` : ""],
    ["ISO", formatNumber(metadata.iso)],
    ["Focal length", formatNumber(metadata.focalLength, "mm")],
    ["GPS", [formatCoordinate(metadata.gpsLatitude), formatCoordinate(metadata.gpsLongitude)].filter(Boolean).join(", ")],
    ["Altitude", formatNumber(metadata.gpsAltitude, "m")],
    ["Orientation", formatNumber(metadata.orientation)],
    ["Software", metadata.software],
  ];

  return rows
    .filter(([, value]) => String(value || "").trim())
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");
};

const renderGrid = ({ reset = false } = {}) => {
  if (reset) {
    resetRenderLimit();
  }
  const visiblePhotos = getVisiblePhotos();
  const renderedPhotos = visiblePhotos.slice(0, state.renderLimit);
  const visibleMonthGroups = getVisibleMonthGroups(visiblePhotos);
  updateStats(visiblePhotos, renderedPhotos.length);
  els.navButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.adminView === state.view));
  els.grid.hidden = false;
  renderDetail();
  renderTimeline(visiblePhotos);

  if (!visiblePhotos.length) {
    els.grid.innerHTML = `<p class="admin-empty">${state.view === "trash" ? "Trash is empty." : "No photos match this view yet."}</p>`;
    observeLoadMore();
    return;
  }

  const gridItems = renderedPhotos.map(createPhotoCard);
  if (visiblePhotos.length >= MONTH_DIVIDER_THRESHOLD || visibleMonthGroups.length > 1) {
    let lastMonthKey = "";
    gridItems.length = 0;
    renderedPhotos.forEach((photo) => {
      const monthKey = getPhotoMonthKey(photo);
      if (monthKey !== lastMonthKey) {
        gridItems.push(createMonthDivider({ key: monthKey, label: formatPhotoMonth(photo) }));
        lastMonthKey = monthKey;
      }
      gridItems.push(createPhotoCard(photo));
    });
  }
  if (renderedPhotos.length < visiblePhotos.length) {
    gridItems.push(createLoadMoreControl({ renderedCount: renderedPhotos.length, totalCount: visiblePhotos.length }));
  }
  els.grid.replaceChildren(...gridItems);
  observeLoadMore();
  updateActiveTimelineFromScroll();
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const getLocalFileUrl = (localPath) => `file://${String(localPath || "").split("/").map(encodeURIComponent).join("/")}`;

const getLocalFolderUrl = (localPath) => {
  const value = String(localPath || "");
  const slashIndex = value.lastIndexOf("/");
  return slashIndex > 0 ? getLocalFileUrl(value.slice(0, slashIndex)) : getLocalFileUrl(value);
};

const createSourceLocationList = (photo) => {
  const groups = [
    ["Original locations", photo.sourcePaths || []],
    ["Organized references", photo.organizedPaths || []],
  ]
    .map(([title, paths]) => [
      title,
      Array.from(new Set((Array.isArray(paths) ? paths : []).map(String).filter(Boolean))),
    ])
    .filter(([, paths]) => paths.length);

  if (!groups.length) {
    return "";
  }

  return `
    <section class="admin-source-locations" aria-label="Source locations">
      <h3>Source locations</h3>
      ${groups
        .map(
          ([title, paths]) => `
            <div class="admin-source-group">
              <span>${escapeHtml(title)}</span>
              <ul>
                ${paths
                  .map(
                    (sourcePath) => `
                      <li>
                        <a class="admin-source-path-link" href="${escapeAttribute(getLocalFileUrl(sourcePath))}" target="_blank" rel="noreferrer">
                          <code>${escapeHtml(sourcePath)}</code>
                        </a>
                        <div class="admin-source-actions">
                          <a class="admin-mini-button" href="${escapeAttribute(getLocalFolderUrl(sourcePath))}" target="_blank" rel="noreferrer">Open folder</a>
                          <button class="admin-mini-button" type="button" data-action="copy-source-path" data-source-path="${escapeAttribute(sourcePath)}">Copy path</button>
                        </div>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            </div>
          `
        )
        .join("")}
    </section>
  `;
};

const renderDetail = () => {
  if (!els.detail) {
    return;
  }
  els.detail.hidden = !state.detailOpen;
  const photo = getPhotoById(state.activeId);
  if (!state.detailOpen || !photo) {
    els.detail.innerHTML = "";
    return;
  }

  const albumOptions = state.albums
    .map((album) => {
      const selected = photo.albumIds.includes(album.id) ? " selected" : "";
      return `<option value="${album.id}"${selected}>${album.title}</option>`;
    })
    .join("");

  els.detail.innerHTML = `
    <div class="admin-detail-top">
      <button class="admin-button" type="button" data-action="close-detail">Back to grid</button>
      <div class="admin-inspector-actions">
        ${
          photo.trashed
            ? `<button class="admin-button" type="button" data-action="restore-photo" data-photo-id="${photo.id}">Recover</button>
               <button class="admin-button is-danger" type="button" data-action="delete-photo" data-photo-id="${photo.id}">Delete permanently</button>`
            : `<button class="admin-button" type="button" data-action="trash-photo" data-photo-id="${photo.id}">Move to trash</button>`
        }
      </div>
    </div>
    <div class="admin-detail-layout">
      <div class="admin-detail-media">
        <img alt="${escapeAttribute(getPhotoName(photo))}" src="${resolveAssetUrl(getDetailImageSrc(photo))}" />
      </div>
      <div class="admin-detail-info">
        <div class="admin-inspector-header">
          <h2>${escapeHtml(getPhotoName(photo))}</h2>
          <p>${escapeHtml(photo.originalName || "No original filename")}</p>
        </div>
        <label class="admin-field">
          <span>Internal name</span>
          <input type="text" data-field="internalName" value="${escapeAttribute(photo.internalName)}" placeholder="${escapeAttribute(photo.displayName)}" />
        </label>
        <label class="admin-field">
          <span>Tags</span>
          <input type="text" data-field="tags" value="${escapeAttribute(joinTags(photo.tags))}" placeholder="memories; reportage" />
        </label>
        <label class="admin-field">
          <span>Album candidates</span>
          <select data-field="albumIds" multiple size="6">
            ${albumOptions}
          </select>
        </label>
        <div class="admin-toggle-row">
          <label><input type="checkbox" data-field="favorite"${photo.favorite ? " checked" : ""} /> Favorite</label>
          <label><input type="checkbox" data-field="inPortfolio"${photo.inPortfolio ? " checked" : ""} /> Portfolio page</label>
        </div>
        ${createSourceLocationList(photo)}
        <dl class="admin-metadata">
          ${createMetadataRows(photo)}
        </dl>
      </div>
    </div>
  `;
};

const escapeAttribute = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const TIFF_TYPES = {
  BYTE: 1,
  ASCII: 2,
  SHORT: 3,
  LONG: 4,
  RATIONAL: 5,
  UNDEFINED: 7,
  SLONG: 9,
  SRATIONAL: 10,
};

const TIFF_TYPE_BYTES = {
  [TIFF_TYPES.BYTE]: 1,
  [TIFF_TYPES.ASCII]: 1,
  [TIFF_TYPES.SHORT]: 2,
  [TIFF_TYPES.LONG]: 4,
  [TIFF_TYPES.RATIONAL]: 8,
  [TIFF_TYPES.UNDEFINED]: 1,
  [TIFF_TYPES.SLONG]: 4,
  [TIFF_TYPES.SRATIONAL]: 8,
};

const EXIF_TAGS = {
  image: {
    0x010f: "cameraMake",
    0x0110: "cameraModel",
    0x0112: "orientation",
    0x0131: "software",
    0x0132: "modifiedAt",
    0x8769: "exifOffset",
    0x8825: "gpsOffset",
  },
  exif: {
    0x829a: "exposureTime",
    0x829d: "aperture",
    0x8827: "iso",
    0x9003: "takenAt",
    0x920a: "focalLength",
    0xa433: "lensMake",
    0xa434: "lensModel",
  },
  gps: {
    0x0001: "gpsLatitudeRef",
    0x0002: "gpsLatitudeParts",
    0x0003: "gpsLongitudeRef",
    0x0004: "gpsLongitudeParts",
    0x0005: "gpsAltitudeRef",
    0x0006: "gpsAltitudeRaw",
  },
};

const readAscii = (view, offset, count) => {
  let output = "";
  for (let index = 0; index < count; index += 1) {
    const charCode = view.getUint8(offset + index);
    if (charCode === 0) {
      break;
    }
    output += String.fromCharCode(charCode);
  }
  return output.trim();
};

const readRational = (view, offset, littleEndian, signed = false) => {
  const numerator = signed ? view.getInt32(offset, littleEndian) : view.getUint32(offset, littleEndian);
  const denominator = signed ? view.getInt32(offset + 4, littleEndian) : view.getUint32(offset + 4, littleEndian);
  return denominator ? numerator / denominator : null;
};

const readTiffValue = ({ view, tiffStart, valueOffset, type, count, littleEndian }) => {
  const bytes = (TIFF_TYPE_BYTES[type] || 0) * count;
  const dataOffset = bytes <= 4 ? valueOffset : tiffStart + view.getUint32(valueOffset, littleEndian);
  if (dataOffset < 0 || dataOffset + Math.max(bytes, 1) > view.byteLength) {
    return null;
  }

  if (type === TIFF_TYPES.ASCII) {
    return readAscii(view, dataOffset, count);
  }
  if (type === TIFF_TYPES.SHORT) {
    const values = Array.from({ length: count }, (_, index) => view.getUint16(dataOffset + index * 2, littleEndian));
    return count === 1 ? values[0] : values;
  }
  if (type === TIFF_TYPES.LONG) {
    const values = Array.from({ length: count }, (_, index) => view.getUint32(dataOffset + index * 4, littleEndian));
    return count === 1 ? values[0] : values;
  }
  if (type === TIFF_TYPES.SLONG) {
    const values = Array.from({ length: count }, (_, index) => view.getInt32(dataOffset + index * 4, littleEndian));
    return count === 1 ? values[0] : values;
  }
  if (type === TIFF_TYPES.RATIONAL || type === TIFF_TYPES.SRATIONAL) {
    const signed = type === TIFF_TYPES.SRATIONAL;
    const values = Array.from({ length: count }, (_, index) => readRational(view, dataOffset + index * 8, littleEndian, signed)).filter(
      (value) => value !== null
    );
    return count === 1 ? values[0] || null : values;
  }
  if (type === TIFF_TYPES.BYTE || type === TIFF_TYPES.UNDEFINED) {
    const values = Array.from({ length: count }, (_, index) => view.getUint8(dataOffset + index));
    return count === 1 ? values[0] : values;
  }
  return null;
};

const readIfd = ({ view, tiffStart, offset, littleEndian, tags }) => {
  const directoryOffset = tiffStart + offset;
  if (directoryOffset < 0 || directoryOffset + 2 > view.byteLength) {
    return {};
  }

  const entries = view.getUint16(directoryOffset, littleEndian);
  const values = {};
  for (let index = 0; index < entries; index += 1) {
    const entryOffset = directoryOffset + 2 + index * 12;
    if (entryOffset + 12 > view.byteLength) {
      break;
    }
    const tag = view.getUint16(entryOffset, littleEndian);
    const name = tags[tag];
    if (!name) {
      continue;
    }
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    values[name] = readTiffValue({
      view,
      tiffStart,
      valueOffset: entryOffset + 8,
      type,
      count,
      littleEndian,
    });
  }
  return values;
};

const findExifSegmentOffset = (view) => {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
    return -1;
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    offset += 2;
    if (marker === 0xffda || marker === 0xffd9) {
      break;
    }
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > view.byteLength) {
      break;
    }
    if (marker === 0xffe1 && length >= 8 && readAscii(view, offset + 2, 6) === "Exif") {
      return offset + 8;
    }
    offset += length;
  }
  return -1;
};

const decimalGps = (parts, ref) => {
  if (!Array.isArray(parts) || parts.length < 3) {
    return null;
  }
  const value = Number(parts[0]) + Number(parts[1]) / 60 + Number(parts[2]) / 3600;
  if (!Number.isFinite(value)) {
    return null;
  }
  return ["S", "W"].includes(String(ref || "").toUpperCase()) ? -value : value;
};

const normalizeExifDate = (value) => {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) {
    return text;
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
};

const parseExifMetadata = (arrayBuffer) => {
  const view = new DataView(arrayBuffer);
  const tiffStart = findExifSegmentOffset(view);
  if (tiffStart < 0 || tiffStart + 8 > view.byteLength) {
    return {};
  }

  const byteOrder = readAscii(view, tiffStart, 2);
  const littleEndian = byteOrder === "II";
  if (!littleEndian && byteOrder !== "MM") {
    return {};
  }
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) {
    return {};
  }

  const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
  const imageValues = readIfd({ view, tiffStart, offset: firstIfdOffset, littleEndian, tags: EXIF_TAGS.image });
  const exifValues = Number.isFinite(imageValues.exifOffset)
    ? readIfd({ view, tiffStart, offset: imageValues.exifOffset, littleEndian, tags: EXIF_TAGS.exif })
    : {};
  const gpsValues = Number.isFinite(imageValues.gpsOffset)
    ? readIfd({ view, tiffStart, offset: imageValues.gpsOffset, littleEndian, tags: EXIF_TAGS.gps })
    : {};

  const gpsLatitude = decimalGps(gpsValues.gpsLatitudeParts, gpsValues.gpsLatitudeRef);
  const gpsLongitude = decimalGps(gpsValues.gpsLongitudeParts, gpsValues.gpsLongitudeRef);
  const gpsAltitudeMultiplier = Number(gpsValues.gpsAltitudeRef) === 1 ? -1 : 1;
  const gpsAltitude = Number.isFinite(gpsValues.gpsAltitudeRaw) ? gpsValues.gpsAltitudeRaw * gpsAltitudeMultiplier : null;

  return normalizeMetadata({
    takenAt: normalizeExifDate(exifValues.takenAt || imageValues.modifiedAt),
    cameraMake: imageValues.cameraMake,
    cameraModel: imageValues.cameraModel,
    lensMake: exifValues.lensMake,
    lensModel: exifValues.lensModel,
    software: imageValues.software,
    orientation: imageValues.orientation,
    iso: Array.isArray(exifValues.iso) ? exifValues.iso[0] : exifValues.iso,
    exposureTime: exifValues.exposureTime,
    aperture: exifValues.aperture,
    focalLength: exifValues.focalLength,
    gpsLatitude,
    gpsLongitude,
    gpsAltitude,
  });
};

const loadPhotoMetadata = async (file) => {
  if (!file?.type || !["image/jpeg", "image/tiff"].includes(file.type)) {
    return normalizeMetadata({});
  }
  try {
    return parseExifMetadata(await file.arrayBuffer());
  } catch {
    return normalizeMetadata({});
  }
};

const loadImageInfo = async (file) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = reject;
    });
    image.src = objectUrl;
    await loaded;
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const createThumbnailBlob = async (file, { width, height }) => {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = reject;
    });
    image.src = objectUrl;
    await loaded;
    const scale = Math.min(1, MAX_THUMB_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", THUMB_QUALITY));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const ensureUniqueKey = (filename, folder, usedKeys) => {
  const existingKeys = usedKeys || new Set(state.library.photos.flatMap((photo) => [photo.s3Key, photo.thumbS3Key]).filter(Boolean));
  const extensionIndex = filename.lastIndexOf(".");
  const base = extensionIndex >= 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex >= 0 ? filename.slice(extensionIndex) : "";
  let candidate = `${folder}/${filename}`;
  let counter = 2;
  while (existingKeys.has(candidate)) {
    candidate = `${folder}/${base}-${counter}${extension}`;
    counter += 1;
  }
  existingKeys.add(candidate);
  return candidate;
};

const getSignedUploads = async (files) => {
  const { response, payload } = await fetchAdminJson("/api/admin-sign-s3-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.details || payload?.error || "Could not sign upload");
  }
  return payload.uploads;
};

const putSignedObject = async ({ signedUpload, body }) => {
  const response = await fetch(signedUpload.url, {
    method: "PUT",
    headers: signedUpload.headers,
    body,
  });
  if (!response.ok) {
    throw new Error(`S3 upload failed: ${response.status}`);
  }
};

const arrayBufferToHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const hashFile = async (file) => {
  if (!crypto?.subtle?.digest) {
    return "";
  }
  return arrayBufferToHex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
};

const getPhotoContentHash = (photo) => photo.contentSha256 || photo.archiveSha256 || "";

const copyTextToClipboard = async (text) => {
  const value = String(text || "");
  if (!value) {
    return false;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  return copied;
};

const selectSourcePathText = (button) => {
  const code = button?.closest("li")?.querySelector("code");
  if (!code) {
    return false;
  }
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(code);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
};

const uploadFiles = async (files) => {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) {
    setStatus("No image files selected.");
    return;
  }

  state.uploading = true;
  setStatus(`Preparing ${imageFiles.length} upload${imageFiles.length === 1 ? "" : "s"}...`);

  try {
    const uploadedPhotos = [];
    const skippedDuplicates = [];
    const reservedKeys = new Set(state.library.photos.flatMap((photo) => [photo.s3Key, photo.thumbS3Key]).filter(Boolean));
    const knownContentHashes = new Set(state.library.photos.map(getPhotoContentHash).filter(Boolean));
    for (const [index, file] of imageFiles.entries()) {
      setStatus(`Checking ${index + 1}/${imageFiles.length}: ${file.name}`);
      const contentSha256 = await hashFile(file);
      if (contentSha256 && knownContentHashes.has(contentSha256)) {
        skippedDuplicates.push(file.name);
        continue;
      }
      if (contentSha256) {
        knownContentHashes.add(contentSha256);
      }

      setStatus(`Uploading ${index + 1}/${imageFiles.length}: ${file.name}`);
      const [dimensions, metadata] = await Promise.all([loadImageInfo(file), loadPhotoMetadata(file)]);
      const extension = getExtension(file);
      const baseName = `${sanitizeStem(file.name)}.${extension}`;
      const thumbName = `${sanitizeStem(file.name)}.jpg`;
      const s3Key = ensureUniqueKey(baseName, ORIGINALS_PREFIX, reservedKeys);
      const thumbS3Key = ensureUniqueKey(thumbName, THUMBS_PREFIX, reservedKeys);
      const thumbnailBlob = await createThumbnailBlob(file, dimensions);
      if (!thumbnailBlob) {
        throw new Error(`Could not create thumbnail for ${file.name}`);
      }
      const [originalUpload, thumbUpload] = await getSignedUploads([
        { key: s3Key, contentType: file.type || "image/jpeg" },
        { key: thumbS3Key, contentType: "image/jpeg" },
      ]);
      await putSignedObject({ signedUpload: originalUpload, body: file });
      await putSignedObject({ signedUpload: thumbUpload, body: thumbnailBlob });

      uploadedPhotos.push(
        normalizePhoto({
          id: crypto.randomUUID(),
          src: originalUpload.publicPath,
          previewSrc: thumbUpload.publicPath,
          s3Key,
          thumbS3Key,
          originalName: file.name,
          displayName: sanitizeStem(file.name).replace(/[-_]+/g, " "),
          type: file.type,
          size: file.size,
          width: dimensions.width,
          height: dimensions.height,
          aspectRatio: dimensions.height ? dimensions.width / dimensions.height : null,
          uploadedAt: new Date().toISOString(),
          lastModified: file.lastModified,
          contentSha256,
          metadata,
        })
      );
    }

    if (uploadedPhotos.length) {
      state.library.photos = [...uploadedPhotos, ...state.library.photos];
      markDirty(uploadedPhotos.map((photo) => photo.id));
      state.activeId = uploadedPhotos[0]?.id || state.activeId;
    }
    const uploadedText = uploadedPhotos.length
      ? `Uploaded ${uploadedPhotos.length} photo${uploadedPhotos.length === 1 ? "" : "s"} to S3`
      : "No new photos uploaded";
    const skippedText = skippedDuplicates.length
      ? `; skipped ${skippedDuplicates.length} duplicate${skippedDuplicates.length === 1 ? "" : "s"} by content hash`
      : "";
    setStatus(`${uploadedText}${skippedText}${uploadedPhotos.length ? ". Save metadata to keep them in the library." : "."}`);
    renderGrid();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    state.uploading = false;
    if (els.fileInput) {
      els.fileInput.value = "";
    }
  }
};

const saveLibrary = async () => {
  const upserts = Array.from(state.dirtyIds)
    .map(getPhotoById)
    .filter(Boolean);
  const deleteIds = Array.from(state.deletedIds);
  if (!upserts.length && !deleteIds.length) {
    setStatus("No library metadata changes to save.");
    return;
  }
  state.saving = true;
  updateUnsavedState();
  const saveBatches = createSaveBatches({ upserts, deleteIds });
  setStatus(`Saving ${upserts.length} changed and ${deleteIds.length} deleted photo record${upserts.length + deleteIds.length === 1 ? "" : "s"}...`);
  try {
    let latestUpdatedAt = "";
    for (const [index, batch] of saveBatches.entries()) {
      setStatus(
        saveBatches.length > 1
          ? `Saving metadata batch ${index + 1}/${saveBatches.length}...`
          : `Saving ${upserts.length} changed and ${deleteIds.length} deleted photo record${upserts.length + deleteIds.length === 1 ? "" : "s"}...`
      );
      const { response, payload } = await fetchAdminJson("/api/update-photo-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: "photo-library",
          settingsPath: getLibraryPath(),
          upserts: batch.upserts,
          deleteIds: batch.deleteIds,
        }),
      });
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.details || payload?.error || "Could not save library");
      }
      if (payload.library) {
        state.library = {
          ...payload.library,
          photos: (payload.library?.photos || []).map(normalizePhoto),
        };
      } else {
        latestUpdatedAt = payload.updatedAt || latestUpdatedAt;
      }
    }
    if (latestUpdatedAt) {
      state.library = {
        ...state.library,
        updatedAt: latestUpdatedAt,
      };
    }
    state.dirtyIds.clear();
    state.deletedIds.clear();
    setStatus(saveBatches.length > 1 ? `Library metadata saved in ${saveBatches.length} batches.` : "Library metadata saved.");
    renderGrid();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    state.saving = false;
    updateUnsavedState();
  }
};

const addSelectedPhotosToAlbum = async () => {
  const albumId = els.selectionAlbum?.value || "";
  const selectedPhotos = Array.from(state.selectedIds)
    .map(getPhotoById)
    .filter((photo) => photo && !photo.trashed);

  if (!albumId) {
    setStatus("Choose an album first.");
    return;
  }
  if (!selectedPhotos.length) {
    setStatus("Select at least one stored photo first.");
    return;
  }

  setStatus(`Adding ${selectedPhotos.length} photo${selectedPhotos.length === 1 ? "" : "s"} to ${getAlbumTitle(albumId)}...`);
  try {
    const { response, payload } = await fetchAdminJson("/api/admin-add-photos-to-album", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryId: albumId,
        photos: selectedPhotos,
      }),
    });
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.details || payload?.error || "Could not add photos to album");
    }

    const selectedIds = selectedPhotos.map((photo) => photo.id);
    patchPhotos(selectedIds, (photo) => ({
      albumIds: photo.albumIds.includes(albumId) ? photo.albumIds : [...photo.albumIds, albumId],
    }));
    await saveLibrary();
    setStatus(`Added ${payload.addedPhotos?.length || 0} new photo${payload.addedPhotos?.length === 1 ? "" : "s"} to ${getAlbumTitle(albumId)}${payload.skipped ? `; ${payload.skipped} already present` : ""}.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
};

const addTagsToSelectedPhotos = () => {
  const tags = splitTags(els.selectionTags?.value || "");
  const selectedIds = Array.from(state.selectedIds).filter((id) => {
    const photo = getPhotoById(id);
    return photo && !photo.trashed;
  });

  if (!selectedIds.length) {
    setStatus("Select at least one stored photo first.");
    return;
  }
  if (!tags.length) {
    setStatus("Enter one or more tags separated by semicolons.");
    return;
  }

  patchPhotos(selectedIds, (photo) => ({
    tags: Array.from(new Set([...(photo.tags || []), ...tags])),
  }));
  renderTagFilter();
  if (els.selectionTags) {
    els.selectionTags.value = "";
  }
  setStatus(`Added ${tags.length} tag${tags.length === 1 ? "" : "s"} to ${selectedIds.length} selected photo${selectedIds.length === 1 ? "" : "s"}. Save metadata to keep them.`);
};

const patchPhotos = (ids, patch) => {
  const idSet = new Set(ids);
  state.library.photos = state.library.photos.map((photo) => (idSet.has(photo.id) ? normalizePhoto({ ...photo, ...patch(photo) }) : photo));
  markDirty(Array.from(idSet));
};

const deletePhotosPermanently = async (ids) => {
  const idSet = new Set(ids);
  const photos = state.library.photos.filter((photo) => idSet.has(photo.id));
  const keys = photos.flatMap((photo) => [photo.s3Key, photo.thumbS3Key]).filter(Boolean);
  if (keys.length) {
    for (const batch of chunkArray(keys, DELETE_BATCH_SIZE)) {
      const { response, payload } = await fetchAdminJson("/api/admin-delete-s3-objects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: batch }),
      });
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.details || payload?.error || "Could not delete S3 objects");
      }
    }
  }
  state.library.photos = state.library.photos.filter((photo) => !idSet.has(photo.id));
  ids.forEach((id) => state.selectedIds.delete(id));
  ids.forEach((id) => {
    state.dirtyIds.delete(id);
    state.deletedIds.add(id);
  });
  if (idSet.has(state.activeId)) {
    state.activeId = "";
  }
  updateUnsavedState();
};

const toggleVisibleSelection = () => {
  const visibleIds = getVisiblePhotoIds();
  if (!visibleIds.length) {
    setStatus("No visible photos to select.");
    return;
  }

  const allVisibleSelected = visibleIds.every((id) => state.selectedIds.has(id));
  if (allVisibleSelected) {
    visibleIds.forEach((id) => state.selectedIds.delete(id));
    setStatus(`Deselected ${visibleIds.length} visible photo${visibleIds.length === 1 ? "" : "s"}.`);
  } else {
    visibleIds.forEach((id) => state.selectedIds.add(id));
    setStatus(`Selected ${visibleIds.length} visible photo${visibleIds.length === 1 ? "" : "s"}.`);
  }
  state.detailOpen = false;
  renderGrid();
};

const handleTimelinePointer = (event) => {
  if (!els.timeline || els.timeline.hidden) {
    return;
  }
  const startedOnButton = Boolean(event.target.closest(".admin-timeline-button"));
  const startY = event.clientY;
  let isDragging = !startedOnButton;
  if (!startedOnButton) {
    event.preventDefault();
  }
  els.timeline.setPointerCapture?.(event.pointerId);
  const updatePending = (clientY) => {
    const group = getTimelineGroupFromY(clientY);
    setPendingTimelineGroup(group);
    return group;
  };
  let pendingGroup = updatePending(event.clientY);
  const handlePointerMove = (moveEvent) => {
    if (Math.abs(moveEvent.clientY - startY) > 4) {
      isDragging = true;
    }
    if (!isDragging) {
      return;
    }
    moveEvent.preventDefault();
    pendingGroup = updatePending(moveEvent.clientY);
  };
  const finish = () => {
    els.timeline.releasePointerCapture?.(event.pointerId);
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", cancel);
    state.pendingTimelineKey = "";
    if (isDragging) {
      state.suppressNextTimelineClick = startedOnButton;
      jumpToTimelineGroup(pendingGroup);
    } else {
      setPendingTimelineGroup(null);
    }
  };
  const cancel = () => {
    els.timeline.releasePointerCapture?.(event.pointerId);
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", cancel);
    setPendingTimelineGroup(null);
  };
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerup", finish, { once: true });
  document.addEventListener("pointercancel", cancel, { once: true });
};

const handleAction = async (target, event) => {
  const action = target.dataset.action;
  const photoId = target.dataset.photoId;
  if (action === "timeline-jump") {
    event?.preventDefault();
    if (state.suppressNextTimelineClick) {
      state.suppressNextTimelineClick = false;
      return;
    }
    const group = state.timelineGroups.find((item) => item.key === target.dataset.monthKey);
    jumpToTimelineGroup(group);
    return;
  }
  if (action === "copy-source-path") {
    event?.preventDefault();
    try {
      const copied = await copyTextToClipboard(target.dataset.sourcePath || "");
      if (copied) {
        setStatus("Copied source path.");
        return;
      }
      setStatus(selectSourcePathText(target) ? "Clipboard was blocked; path selected for manual copy." : "Could not copy source path.");
    } catch {
      setStatus(selectSourcePathText(target) ? "Clipboard was blocked; path selected for manual copy." : "Could not copy source path.");
    }
    return;
  }
  if (action === "inspect-photo") {
    event?.preventDefault();
    if (event?.shiftKey) {
      state.selectedIds.has(photoId) ? state.selectedIds.delete(photoId) : state.selectedIds.add(photoId);
      renderGrid();
    } else {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      state.activeId = photoId;
      state.detailOpen = true;
      renderDetail();
      updatePhotoCardStates();
      restoreScrollPosition(scrollX, scrollY);
    }
    return;
  }
  if (action === "close-detail") {
    event?.preventDefault();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    state.detailOpen = false;
    renderDetail();
    updatePhotoCardStates();
    restoreScrollPosition(scrollX, scrollY);
    return;
  }
  if (action === "toggle-select") {
    state.selectedIds.has(photoId) ? state.selectedIds.delete(photoId) : state.selectedIds.add(photoId);
    state.activeId = photoId;
    renderGrid();
    return;
  }
  if (action === "clear-selection") {
    state.selectedIds.clear();
    renderGrid();
    return;
  }
  if (action === "select-visible") {
    toggleVisibleSelection();
    return;
  }
  if (action === "save-library") {
    await saveLibrary();
    return;
  }
  if (action === "add-selected-to-album") {
    await addSelectedPhotosToAlbum();
    return;
  }
  if (action === "add-tags-selected") {
    addTagsToSelectedPhotos();
    renderGrid();
    return;
  }

  const isDetailAction = Boolean(target.closest(".admin-detail"));
  const targetIds = isDetailAction || !state.selectedIds.size ? (photoId ? [photoId] : []) : Array.from(state.selectedIds);
  if (!targetIds.length) {
    return;
  }

  if (action === "favorite-selected") {
    patchPhotos(targetIds, () => ({ favorite: true }));
  } else if (action === "unfavorite-selected") {
    patchPhotos(targetIds, () => ({ favorite: false }));
  } else if (action === "portfolio-selected") {
    patchPhotos(targetIds, () => ({ inPortfolio: true }));
  } else if (action === "unportfolio-selected") {
    patchPhotos(targetIds, () => ({ inPortfolio: false }));
  } else if (action === "trash-selected" || action === "trash-photo") {
    patchPhotos(targetIds, () => ({ trashed: true, trashedAt: new Date().toISOString() }));
  } else if (action === "restore-photo" || action === "restore-selected") {
    patchPhotos(targetIds, () => ({ trashed: false, trashedAt: "" }));
  } else if (action === "delete-photo" || action === "delete-selected") {
    if (!window.confirm(`Permanently delete ${targetIds.length} photo${targetIds.length === 1 ? "" : "s"} and matching thumbnails from S3?`)) {
      return;
    }
    await deletePhotosPermanently(targetIds);
  }
  renderGrid();
};

const handleInspectorInput = (target, { rerender = false } = {}) => {
  const photo = getPhotoById(state.activeId);
  if (!photo) {
    return;
  }
  const field = target.dataset.field;
  const nextPhoto = { ...photo };
  if (field === "internalName") {
    nextPhoto.internalName = target.value;
  } else if (field === "tags") {
    nextPhoto.tags = splitTags(target.value);
  } else if (field === "favorite") {
    nextPhoto.favorite = target.checked;
  } else if (field === "inPortfolio") {
    nextPhoto.inPortfolio = target.checked;
  } else if (field === "albumIds") {
    nextPhoto.albumIds = Array.from(target.selectedOptions).map((option) => option.value);
  }
  state.library.photos = state.library.photos.map((item) => (item.id === photo.id ? normalizePhoto(nextPhoto) : item));
  markDirty([photo.id]);
  if (field === "tags") {
    renderTagFilter();
  }
  if (rerender) {
    renderGrid();
  }
};

const withCacheBust = (path) => {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("adminCacheBust", String(Date.now()));
  return `${url.pathname}${url.search}`;
};

const loadJson = async (path) => {
  const response = await fetch(withCacheBust(path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }
  return response.json();
};

const normalizeAlbumId = (href) =>
  String(href || "")
    .split("/")
    .pop()
    ?.replace(/^album-/, "")
    .replace(/\.html$/, "") || "";

const getAlbumSettingsPath = (albumId) => `/data/galleries/${albumId}.settings.json`;

const loadCurrentAlbumPhotos = async (albums) => {
  const results = await Promise.allSettled(
    albums.map(async (album) => {
      const settings = await loadJson(getAlbumSettingsPath(album.id));
      return (Array.isArray(settings?.photos) ? settings.photos : [])
        .map((photo) => normalizeAlbumPhoto({ photo, album }))
        .filter(Boolean);
    })
  );

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
};

const init = async () => {
  try {
    const [library, homepage] = await Promise.all([loadJson(`/${getLibraryPath()}`), loadJson("/data/homepage.settings.json")]);
    state.albums = (homepage?.albumCards || [])
      .map((album) => ({
        id: normalizeAlbumId(album.href),
        title: album.title || normalizeAlbumId(album.href),
      }))
      .filter((album) => album.id);
    const albumPhotos = await loadCurrentAlbumPhotos(state.albums);
    const libraryPhotos = (library?.photos || []).map(normalizePhoto);
    state.library = {
      ...library,
      photos: mergeLibraryPhotos(libraryPhotos, albumPhotos),
    };
    setStatus(`Loaded ${albumPhotos.length} current album photo${albumPhotos.length === 1 ? "" : "s"} into the admin view.`);
    renderAlbumPicker();
    renderGalleryAlbumFilter();
    renderTagFilter();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }

  els.search?.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderGrid({ reset: true });
  });
  els.filter?.addEventListener("change", (event) => {
    state.filter = event.target.value;
    renderGrid({ reset: true });
  });
  els.albumFilter?.addEventListener("change", (event) => {
    state.albumFilter = event.target.value;
    state.selectedIds.clear();
    state.detailOpen = false;
    renderGrid({ reset: true });
  });
  els.tagFilter?.addEventListener("change", (event) => {
    state.tagFilter = event.target.value;
    state.selectedIds.clear();
    state.detailOpen = false;
    renderGrid({ reset: true });
  });
  els.fileInput?.addEventListener("change", (event) => uploadFiles(event.target.files));
  els.timeline?.addEventListener("pointerdown", handleTimelinePointer);
  window.addEventListener("scroll", updateActiveTimelineFromScroll, { passive: true });
  window.addEventListener("resize", updateActiveTimelineFromScroll);
  els.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.adminView || "library";
      state.selectedIds.clear();
      state.detailOpen = false;
      renderGrid({ reset: true });
    });
  });
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }
    await handleAction(target, event);
  });
  els.detail?.addEventListener("input", (event) => {
    if (event.target.matches("[data-field]")) {
      handleInspectorInput(event.target);
    }
  });
  els.detail?.addEventListener("change", (event) => {
    if (event.target.matches("[data-field]")) {
      handleInspectorInput(event.target, { rerender: true });
    }
  });

  renderGrid();
};

init();
