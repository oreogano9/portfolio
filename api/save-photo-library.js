export const config = {
  runtime: "nodejs",
};

import { mkdir, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const SETTINGS_PATH = "data/photo-library.json";

const githubHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
});

const fetchRepoJson = async ({ owner, repo, branch, token, path: repoPath }) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}?ref=${branch}`;
  const response = await fetch(url, {
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

const normalizeLibrary = (settings) => {
  const photos = Array.isArray(settings?.photos) ? settings.photos : [];
  return {
    id: "photo-library",
    version: 1,
    updatedAt: new Date().toISOString(),
    photos: photos.map((photo) => ({
      ...photo,
      id: String(photo?.id || photo?.src || crypto.randomUUID()),
      tags: Array.isArray(photo?.tags) ? photo.tags.map(String).filter(Boolean) : [],
      albumIds: Array.isArray(photo?.albumIds) ? photo.albumIds.map(String).filter(Boolean) : [],
      favorite: photo?.favorite === true,
      inPortfolio: photo?.inPortfolio === true,
      trashed: photo?.trashed === true,
    })),
  };
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

  const { documentId, settingsPath, settings } = request.body || {};
  if (documentId !== "photo-library" || settingsPath !== SETTINGS_PATH || !settings) {
    return response.status(400).json({ error: "Invalid photo library payload" });
  }

  try {
    const existing = await fetchRepoJson({ owner, repo, branch, token, path: SETTINGS_PATH });
    const nextSettings = normalizeLibrary(settings);
    const writeResult = await writeRepoJson({
      owner,
      repo,
      branch,
      token,
      path: SETTINGS_PATH,
      sha: existing?.sha,
      message: "Update photo library",
      json: nextSettings,
    });

    if (!writeResult.ok) {
      return response.status(500).json({ error: "Failed to write photo library", details: writeResult.details });
    }

    await tryWriteLocal(() => writeLocalRepoJson(SETTINGS_PATH, nextSettings));

    return response.status(200).json({
      ok: true,
      commitSha: writeResult.commitSha,
      path: SETTINGS_PATH,
      library: nextSettings,
    });
  } catch (error) {
    return response.status(500).json({
      error: "Unexpected photo library save error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
