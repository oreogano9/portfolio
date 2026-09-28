const CDN = "https://d2gue6esbiyjpv.cloudfront.net/";

export const imageKey = (value) => {
  if (typeof value !== "string") return "";
  const relative = value.startsWith("/images/") ? value.slice(8) : value.startsWith(CDN) ? value.slice(CDN.length) : value.startsWith("albums/") ? value.slice(7) : "";
  if (!relative) return "";
  try {
    const key = `albums/${decodeURIComponent(relative)}`;
    return key.includes("..") || /[\r\n?#]/.test(key) ? "" : key;
  } catch { return ""; }
};

const collectKeys = (value, keys = new Set()) => {
  if (typeof value === "string") {
    const key = imageKey(value);
    if (key) keys.add(key);
  } else if (Array.isArray(value)) value.forEach((entry) => collectKeys(entry, keys));
  else if (value && typeof value === "object") {
    Object.entries(value).forEach(([name, entry]) => {
      if (name !== "pendingS3Deletes" && name !== "removedPhotoSources") collectKeys(entry, keys);
    });
  }
  return keys;
};

export const planAlbumCleanup = (existing, incoming, otherDocuments, removeDeleted) => {
  const knownPhotos = new Map((existing.photos || []).map((photo) => [photo.id, photo]));
  const removed = removeDeleted ? (incoming.photos || []).filter((photo) => photo.deleted && knownPhotos.has(photo.id)) : [];
  const removedPhotoSources = [...new Set([...(existing.removedPhotoSources || []), ...removed.map((photo) => knownPhotos.get(photo.id).src)])];
  const removedKeys = new Set(removedPhotoSources.map((src) => imageKey(src) || src));
  const wasRemoved = (src) => removedKeys.has(imageKey(src) || src);
  const ids = new Set([...removed.map((photo) => photo.id), ...(incoming.photos || []).filter((photo) => wasRemoved(photo.src)).map((photo) => photo.id)]);
  const photos = (incoming.photos || []).filter((photo) => !ids.has(photo.id));
  const settings = { ...incoming, photos,
    blocks: (incoming.blocks || []).filter((block) => !ids.has(block.photoId)),
    pendingS3Deletes: [],
    removedPhotoSources,
  };
  if (wasRemoved(settings.intro?.heroImageSrc)) {
    settings.intro = { ...settings.intro, heroImageSrc: photos.find((photo) => !photo.deleted)?.src || "" };
  }
  const references = collectKeys([settings, ...otherDocuments]);
  // Only library uploads are eligible; archive originals are never removed here.
  const candidates = [...(existing.pendingS3Deletes || []), ...removed.map((photo) => {
    const saved = knownPhotos.get(photo.id);
    return [imageKey(saved.src), imageKey(saved.previewSrc)].filter(Boolean);
  })];
  const retained = [];
  const groups = candidates.filter((keys) => {
    const safe = Array.isArray(keys) && keys.length && keys.every((key) => /^albums\/library\/(originals|thumbs)\//.test(key) && !key.includes(".."));
    if (!safe || keys.some((key) => references.has(key))) {
      retained.push(keys);
      return false;
    }
    return true;
  });
  settings.pendingS3Deletes = groups;
  return { settings, keys: [...new Set(groups.flat())], retained };
};

export const readOtherImageDocuments = async ({ owner, repo, branch, token, settingsPath }) => {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const treeResponse = await fetch(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers });
  if (!treeResponse.ok) throw new Error("Could not verify shared image references; no S3 files were deleted.");
  const tree = await treeResponse.json();
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("Incomplete image reference index; no S3 files were deleted.");
  const documents = [];
  for (const entry of tree.tree.filter((entry) => entry.type === "blob" && entry.path.startsWith("data/") && entry.path.endsWith(".json") && entry.path !== settingsPath)) {
    const blobResponse = await fetch(`${base}/git/blobs/${entry.sha}`, { headers });
    if (!blobResponse.ok) throw new Error(`Could not verify references in ${entry.path}; no S3 files were deleted.`);
    const blob = await blobResponse.json();
    documents.push(JSON.parse(Buffer.from(blob.content, "base64").toString("utf8")));
  }
  return documents;
};
