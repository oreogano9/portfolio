export const config = {
  runtime: "nodejs",
};

const SETTINGS_PATH = "data/homepage.settings.json";

const isSafeSettingsPath = (value) => value === SETTINGS_PATH;

const isSafeGallerySettingsPath = (value) =>
  typeof value === "string" &&
  value.startsWith("data/galleries/") &&
  value.endsWith(".settings.json") &&
  !value.includes("..");

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

const getGallerySettingsPathFromHref = (href) => {
  if (typeof href !== "string") {
    return "";
  }

  const match = href.match(/^\/albums\/album-(.+)\.html$/);
  if (!match) {
    return "";
  }

  return `data/galleries/${match[1]}.settings.json`;
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

  if (documentId !== "homepage" || !settings || !isSafeSettingsPath(settingsPath)) {
    return response.status(400).json({ error: "Invalid homepage payload" });
  }

  try {
    const existingHomepage = await fetchRepoJson({
      owner,
      repo,
      branch,
      token,
      path: SETTINGS_PATH,
    });

    if (!existingHomepage) {
      const fallbackRead = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${SETTINGS_PATH}?ref=${branch}`, {
        headers: githubHeaders(token),
      });
      if (!fallbackRead.ok && fallbackRead.status !== 404) {
        const details = await fallbackRead.text();
        return response.status(500).json({ error: "Failed to read existing homepage settings", details });
      }
    }

    const homepageWrite = await writeRepoJson({
      owner,
      repo,
      branch,
      token,
      path: SETTINGS_PATH,
      sha: existingHomepage?.sha,
      message: "Update homepage settings",
      json: settings,
    });

    if (!homepageWrite.ok) {
      return response.status(500).json({ error: "Failed to write homepage settings to GitHub", details: homepageWrite.details });
    }

    const syncedGalleries = [];
    for (const card of Array.isArray(settings.albumCards) ? settings.albumCards : []) {
      const gallerySettingsPath = getGallerySettingsPathFromHref(card?.href);
      if (!gallerySettingsPath || !isSafeGallerySettingsPath(gallerySettingsPath) || typeof card?.title !== "string") {
        continue;
      }

      const existingGallery = await fetchRepoJson({
        owner,
        repo,
        branch,
        token,
        path: gallerySettingsPath,
      });

      if (!existingGallery?.parsed || typeof existingGallery.parsed !== "object") {
        continue;
      }

      if (existingGallery.parsed.title === card.title) {
        continue;
      }

      const syncedGallery = {
        ...existingGallery.parsed,
        title: card.title,
      };

      const galleryWrite = await writeRepoJson({
        owner,
        repo,
        branch,
        token,
        path: gallerySettingsPath,
        sha: existingGallery.sha,
        message: `Sync gallery title from homepage: ${card.href}`,
        json: syncedGallery,
      });

      if (!galleryWrite.ok) {
        return response.status(500).json({
          error: "Failed to sync homepage title into gallery settings",
          details: galleryWrite.details,
          path: gallerySettingsPath,
        });
      }

      syncedGalleries.push(gallerySettingsPath);
    }

    return response.status(200).json({
      ok: true,
      commitSha: homepageWrite.commitSha,
      path: SETTINGS_PATH,
      syncedGalleries,
    });
  } catch (error) {
    return response.status(500).json({
      error: "Unexpected save error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
