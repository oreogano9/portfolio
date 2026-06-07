export const config = {
  runtime: "nodejs",
};

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const isSafeGalleryId = (value) => typeof value === "string" && /^[a-z0-9-]+$/i.test(value);
const getSettingsPath = (galleryId) => `data/galleries/${galleryId}.settings.json`;

const githubHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
});

const fetchRepoJson = async ({ owner, repo, branch, token, path: repoPath }) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}?ref=${branch}`, {
    headers: githubHeaders(token),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  let parsed = null;
  try {
    parsed = JSON.parse(Buffer.from(payload.content || "", "base64").toString("utf8"));
  } catch {
    parsed = null;
  }

  return {
    sha: payload.sha,
    parsed,
  };
};

const writeRepoJson = async ({ owner, repo, branch, token, path: repoPath, sha, message, json }) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`, {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(json, null, 2)).toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      details: await response.text(),
    };
  }

  const payload = await response.json();
  return {
    ok: true,
    commitSha: payload.commit?.sha || null,
  };
};

const writeLocalRepoJson = async (relativePath, json) => {
  const absolutePath = path.join(process.cwd(), relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(json, null, 2)}\n`);
};

const tryWriteLocal = async (writer) => {
  try {
    await writer();
  } catch {
    return false;
  }
  return true;
};

const normalizeAssetPath = (value) => {
  const pathValue = String(value || "").trim();
  if (!pathValue || !pathValue.startsWith("/images/") || pathValue.includes("..")) {
    return "";
  }
  return pathValue;
};

const normalizeIncomingPhoto = ({ photo, galleryTitle, galleryId }) => {
  const src = normalizeAssetPath(photo?.src);
  const previewSrc = normalizeAssetPath(photo?.previewSrc || photo?.src);
  if (!src) {
    return null;
  }

  const width = Number(photo?.width);
  const height = Number(photo?.height);
  const aspectRatio = Number(photo?.aspectRatio) || (Number.isFinite(width) && Number.isFinite(height) && height > 0 ? width / height : null);
  const name = String(photo?.internalName || photo?.displayName || photo?.originalName || src.split("/").pop() || "photo");

  return {
    id: src,
    src,
    previewSrc: previewSrc || src,
    alt: `${galleryTitle || galleryId} - ${name}`,
    section: "",
    size: "full",
    spacerAfter: 0,
    effect: "none",
    joinWithPrevious: false,
    deleted: false,
    landscape: Number.isFinite(width) && Number.isFinite(height) ? width > height : null,
    aspectRatio,
  };
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

  const { galleryId, photos } = request.body || {};
  if (!isSafeGalleryId(galleryId) || !Array.isArray(photos) || !photos.length) {
    return response.status(400).json({ error: "Invalid album append payload" });
  }

  const settingsPath = getSettingsPath(galleryId);

  try {
    const existing = await fetchRepoJson({ owner, repo, branch, token, path: settingsPath });
    if (!existing?.parsed || typeof existing.parsed !== "object") {
      return response.status(404).json({ error: "Album settings not found", settingsPath });
    }

    const existingPhotos = Array.isArray(existing.parsed.photos) ? existing.parsed.photos : [];
    const existingIds = new Set(existingPhotos.map((photo) => String(photo?.id || photo?.src || "")));
    const nextIds = new Set(existingIds);
    const incomingPhotos = [];
    photos
      .map((photo) => normalizeIncomingPhoto({ photo, galleryTitle: existing.parsed.title, galleryId }))
      .filter(Boolean)
      .forEach((photo) => {
        if (nextIds.has(photo.id)) {
          return;
        }
        nextIds.add(photo.id);
        incomingPhotos.push(photo);
      });

    if (!incomingPhotos.length) {
      return response.status(200).json({
        ok: true,
        settings: existing.parsed,
        addedPhotos: [],
        skipped: photos.length,
        path: settingsPath,
      });
    }

    const shouldSeedHeroImage = !existing.parsed?.intro?.heroImageSrc && existing.parsed?.intro?.mode === "hero";
    const nextSettings = {
      ...existing.parsed,
      photos: [...existingPhotos, ...incomingPhotos],
      blocks: appendPhotosToBlocks(existing.parsed.blocks, incomingPhotos),
      intro: {
        ...(existing.parsed.intro || {}),
        heroImageSrc: shouldSeedHeroImage ? incomingPhotos[0]?.src || "" : existing.parsed?.intro?.heroImageSrc || "",
      },
    };

    const writeResult = await writeRepoJson({
      owner,
      repo,
      branch,
      token,
      path: settingsPath,
      sha: existing.sha,
      message: `Add library photos to album: ${galleryId}`,
      json: nextSettings,
    });

    if (!writeResult.ok) {
      return response.status(500).json({ error: "Failed to write album settings", details: writeResult.details });
    }

    await tryWriteLocal(() => writeLocalRepoJson(settingsPath, nextSettings));

    return response.status(200).json({
      ok: true,
      commitSha: writeResult.commitSha,
      path: settingsPath,
      settings: nextSettings,
      addedPhotos: incomingPhotos,
      skipped: photos.length - incomingPhotos.length,
    });
  } catch (error) {
    return response.status(500).json({
      error: "Unexpected album append error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
