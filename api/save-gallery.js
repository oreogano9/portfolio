export const config = {
  runtime: "nodejs",
};

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const isSafeSettingsPath = (value) =>
  typeof value === "string" &&
  value.startsWith("data/galleries/") &&
  value.endsWith(".settings.json") &&
  !value.includes("..");

const HOMEPAGE_SETTINGS_PATH = "data/homepage.settings.json";

const githubHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
});

const fetchRepoJson = async ({ owner, repo, branch, token, path }) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const response = await fetch(url, {
    headers: githubHeaders(token),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  let parsed = null;

  try {
    const content = Buffer.from(payload.content || "", "base64").toString("utf8");
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  return {
    sha: payload.sha,
    parsed,
  };
};

const writeRepoJson = async ({ owner, repo, branch, token, path, sha, message, json }) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(json, null, 2)).toString("base64"),
      branch,
      sha,
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

  const { galleryId, settingsPath, settings } = request.body || {};

  if (!galleryId || !settings || !isSafeSettingsPath(settingsPath)) {
    return response.status(400).json({ error: "Invalid gallery payload" });
  }

  try {
    const existing = await fetchRepoJson({
      owner,
      repo,
      branch,
      token,
      path: settingsPath,
    });

    if (!existing) {
      const fallbackRead = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${settingsPath}?ref=${branch}`, {
        headers: githubHeaders(token),
      });
      if (!fallbackRead.ok && fallbackRead.status !== 404) {
        const details = await fallbackRead.text();
        return response.status(500).json({ error: "Failed to read existing settings file", details });
      }
    }

    const galleryWrite = await writeRepoJson({
      owner,
      repo,
      branch,
      token,
      path: settingsPath,
      sha: existing?.sha,
      message: `Update gallery settings: ${galleryId}`,
      json: settings,
    });

    if (!galleryWrite.ok) {
      return response.status(500).json({ error: "Failed to write settings file to GitHub", details: galleryWrite.details });
    }

    await tryWriteLocal(() => writeLocalRepoJson(settingsPath, settings));

    let syncedHomepage = false;
    if (typeof settings.title === "string") {
      const existingHomepage = await fetchRepoJson({
        owner,
        repo,
        branch,
        token,
        path: HOMEPAGE_SETTINGS_PATH,
      });

      if (!existingHomepage?.parsed || typeof existingHomepage.parsed !== "object") {
        return response.status(500).json({ error: "Failed to read homepage settings for title sync" });
      }

      const expectedHref = `/albums/album-${galleryId}.html`;
      const albumCards = Array.isArray(existingHomepage.parsed.albumCards) ? existingHomepage.parsed.albumCards : [];
      let changed = false;
      const syncedAlbumCards = albumCards.map((card) => {
        if (card?.href !== expectedHref || card?.title === settings.title) {
          return card;
        }
        changed = true;
        return {
          ...card,
          title: settings.title,
        };
      });

      if (changed) {
        const homepageWrite = await writeRepoJson({
          owner,
          repo,
          branch,
          token,
          path: HOMEPAGE_SETTINGS_PATH,
          sha: existingHomepage.sha,
          message: `Sync homepage title from gallery: ${galleryId}`,
          json: {
            ...existingHomepage.parsed,
            albumCards: syncedAlbumCards,
          },
        });

        if (!homepageWrite.ok) {
          return response.status(500).json({
            error: "Failed to sync gallery title into homepage settings",
            details: homepageWrite.details,
          });
        }

        syncedHomepage = true;
        await tryWriteLocal(() => writeLocalRepoJson(HOMEPAGE_SETTINGS_PATH, {
          ...existingHomepage.parsed,
          albumCards: syncedAlbumCards,
        }));
      }
    }

    return response.status(200).json({
      ok: true,
      commitSha: galleryWrite.commitSha,
      path: settingsPath,
      syncedHomepage,
    });
  } catch (error) {
    return response.status(500).json({
      error: "Unexpected save error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
