import saveGallery from "./save-gallery.js";

export const config = { runtime: "nodejs" };

const isUploadedPath = (value) =>
  typeof value === "string" && /^\/images\/library\/(originals|thumbs)\/[a-zA-Z0-9._-]+$/.test(value);

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }
  const { settings, files } = request.body || {};
  if (!settings || !Array.isArray(files) || !files.length || files.length > 100 ||
      files.some((file) => !isUploadedPath(file?.src) || !isUploadedPath(file?.previewSrc) ||
        file.fullDataUrl || file.thumbDataUrl || !(file.width > 0) || !(file.height > 0))) {
    return response.status(400).json({ error: "Upload images to S3 before saving album metadata" });
  }
  const existingPhotos = Array.isArray(settings.photos) ? settings.photos : [];
  const existingSources = new Set(existingPhotos.map((photo) => photo.src));
  const uploadedPhotos = files.filter((file) => !existingSources.has(file.src)).map((file) => ({
    id: file.src, src: file.src, previewSrc: file.previewSrc, alt: file.name || "",
    section: "", size: "full", spacerAfter: 0, effect: "none", joinWithPrevious: false,
    deleted: false, landscape: file.width > file.height, aspectRatio: file.width / file.height,
  }));
  const nextSettings = {
    ...settings,
    photos: [...existingPhotos, ...uploadedPhotos],
    blocks: [...(Array.isArray(settings.blocks) ? settings.blocks : existingPhotos.map((photo) => ({
      type: "photo", photoId: photo.id,
    }))), ...uploadedPhotos.map((photo) => ({ type: "photo", photoId: photo.id }))],
    intro: {
      ...(settings.intro || {}),
      heroImageSrc: settings.intro?.heroImageSrc || (settings.intro?.mode === "hero" ? uploadedPhotos[0]?.src || "" : ""),
    },
  };
  // Reuse the settings writer; image bytes never pass through GitHub.
  const originalJson = response.json.bind(response);
  response.json = (payload) => originalJson(payload.ok ? { ...payload, settings: nextSettings, uploadedPhotos } : payload);
  return saveGallery({ method: "POST", body: { ...request.body, settings: nextSettings } }, response);
}
