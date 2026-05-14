export const config = {
  runtime: "nodejs",
};

const isSafeSettingsPath = (value) =>
  typeof value === "string" &&
  value.startsWith("data/galleries/") &&
  value.endsWith(".settings.json") &&
  !value.includes("..");

const githubHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
});

const fetchRepoEntry = async ({ owner, repo, branch, token, path }) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const response = await fetch(url, {
    headers: githubHeaders(token),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to read ${path}: ${await response.text()}`);
  }

  const payload = await response.json();
  return {
    sha: payload.sha,
    content: payload.content || "",
  };
};

const writeRepoFile = async ({ owner, repo, branch, token, path, sha, message, base64Content }) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify({
      message,
      content: base64Content,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to write ${path}: ${await response.text()}`);
  }

  const payload = await response.json();
  return {
    commitSha: payload.commit?.sha || null,
  };
};

const sanitizeFileStem = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120) || "image";

const sanitizeExtension = (name, type = "") => {
  const match = String(name || "").match(/\.([a-zA-Z0-9]+)$/);
  if (match) {
    return match[1].toLowerCase();
  }
  if (type === "image/png") {
    return "png";
  }
  if (type === "image/webp") {
    return "webp";
  }
  return "jpg";
};

const buildPublicAssetPath = (repoPath) => `/${repoPath.split("/").map(encodeURIComponent).join("/")}`;

const decodeDataUrlBase64 = (value) => {
  const match = String(value || "").match(/^data:.*?;base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL payload");
  }
  return match[1];
};

const ensureUniqueFilename = (filename, used) => {
  const extensionIndex = filename.lastIndexOf(".");
  const base = extensionIndex >= 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex >= 0 ? filename.slice(extensionIndex) : "";
  let candidate = filename;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}${extension}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
};

const deriveGalleryFolder = ({ settings, galleryId }) => {
  const firstAsset = Array.isArray(settings?.photos)
    ? settings.photos.find((photo) => typeof photo?.src === "string" && photo.src.includes("/images/"))
    : null;

  if (typeof firstAsset?.src === "string") {
    const normalized = firstAsset.src.replace(/^\/+/, "");
    const pathMatch = normalized.match(/^images\/(.+)\/[^/]+$/);
    if (pathMatch) {
      return decodeURIComponent(pathMatch[1]);
    }
  }

  if (typeof settings?.title === "string" && settings.title.trim()) {
    return settings.title.trim();
  }

  return galleryId;
};

const appendPhotosToBlocks = (blocks, photos) => {
  const normalizedBlocks = Array.isArray(blocks) ? [...blocks] : [];
  photos.forEach((photo) => {
    normalizedBlocks.push({
      type: "photo",
      photoId: photo.id,
    });
  });
  return normalizedBlocks;
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    return response.status(500).json({ error: "Missing GitHub environment variables" });
  }

  const { galleryId, settingsPath, settings, files } = request.body || {};

  if (!galleryId || !settings || !isSafeSettingsPath(settingsPath) || !Array.isArray(files) || !files.length) {
    return response.status(400).json({ error: "Invalid upload payload" });
  }

  try {
    const existingSettings = await fetchRepoEntry({
      owner,
      repo,
      branch,
      token,
      path: settingsPath,
    });

    const galleryFolder = deriveGalleryFolder({ settings, galleryId });
    const repoImageFolder = `images/${galleryFolder}`;
    const repoThumbFolder = `${repoImageFolder}/thumbs`;
    const usedNames = new Set(
      (Array.isArray(settings.photos) ? settings.photos : [])
        .map((photo) => String(photo?.src || "").split("/").pop()?.toLowerCase())
        .filter(Boolean)
    );

    const uploadedPhotos = [];
    const commits = [];

    for (const file of files) {
      const extension = sanitizeExtension(file?.name, file?.type);
      const stem = sanitizeFileStem(file?.name || "image");
      const filename = ensureUniqueFilename(`${stem}.${extension}`, usedNames);
      const fullRepoPath = `${repoImageFolder}/${filename}`;
      const thumbRepoPath = `${repoThumbFolder}/${filename}`;

      const fullBase64 = decodeDataUrlBase64(file?.fullDataUrl);
      const thumbBase64 = decodeDataUrlBase64(file?.thumbDataUrl);

      const fullWrite = await writeRepoFile({
        owner,
        repo,
        branch,
        token,
        path: fullRepoPath,
        sha: null,
        message: `Upload image to gallery: ${galleryId}`,
        base64Content: fullBase64,
      });
      commits.push(fullWrite.commitSha);

      const thumbWrite = await writeRepoFile({
        owner,
        repo,
        branch,
        token,
        path: thumbRepoPath,
        sha: null,
        message: `Upload thumbnail to gallery: ${galleryId}`,
        base64Content: thumbBase64,
      });
      commits.push(thumbWrite.commitSha);

      const width = Number(file?.width);
      const height = Number(file?.height);
      uploadedPhotos.push({
        id: buildPublicAssetPath(fullRepoPath),
        src: buildPublicAssetPath(fullRepoPath),
        previewSrc: buildPublicAssetPath(thumbRepoPath),
        alt: `${settings.title || galleryId} - ${filename}`,
        section: "",
        size: "full",
        spacerAfter: 0,
        effect: "none",
        joinWithPrevious: false,
        deleted: false,
        landscape: Number.isFinite(width) && Number.isFinite(height) ? width > height : null,
        aspectRatio: Number.isFinite(width) && Number.isFinite(height) && height > 0 ? width / height : null,
      });
    }

    const nextSettings = {
      ...settings,
      photos: [...(Array.isArray(settings.photos) ? settings.photos : []), ...uploadedPhotos],
      blocks: appendPhotosToBlocks(settings.blocks, uploadedPhotos),
      intro: {
        ...(settings.intro || {}),
        heroImageSrc:
          settings?.intro?.heroImageSrc ||
          settings?.intro?.mode !== "hero"
            ? settings?.intro?.heroImageSrc || ""
            : uploadedPhotos[0]?.src || "",
      },
    };

    const settingsWrite = await writeRepoFile({
      owner,
      repo,
      branch,
      token,
      path: settingsPath,
      sha: existingSettings?.sha || null,
      message: `Add uploaded images to gallery: ${galleryId}`,
      base64Content: Buffer.from(JSON.stringify(nextSettings, null, 2)).toString("base64"),
    });
    commits.push(settingsWrite.commitSha);

    return response.status(200).json({
      ok: true,
      settings: nextSettings,
      uploadedPhotos,
      commitShas: commits.filter(Boolean),
    });
  } catch (error) {
    return response.status(500).json({
      error: "Unexpected upload error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
