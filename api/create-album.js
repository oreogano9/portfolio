export const config = {
  runtime: "nodejs",
};

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SETTINGS_PATH = "data/homepage.settings.json";

const isSafeSettingsPath = (value) => value === SETTINGS_PATH;

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

const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildAlbumHtml = ({ title, galleryId }) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta
      name="description"
      content="Standalone photography album for ${title}."
    />
    <link rel="icon" type="image/jpeg" href="/assets/favicon.jpg" />
    <style>
      body.album-page:not(.is-ready) {
        opacity: 0;
      }
    </style>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body
    class="album-page"
    data-gallery-id="${galleryId}"
    data-gallery-settings="/data/galleries/${galleryId}.settings.json"
  >
    <div class="floating-editor-actions" aria-label="Album editor actions">
      <button class="preview-toggle" type="button" data-album-action="preview" aria-pressed="false">Preview</button>
      <button class="preview-toggle" type="button" data-album-action="edit">Edit</button>
      <button class="preview-toggle" type="button" data-album-action="save">Save</button>
      <button class="preview-toggle" type="button" data-album-action="export">Export JSON</button>
    </div>
    <div class="album-top-nav">
      <button class="album-sideview-toggle-button" type="button" data-album-action="toggle-sideview" aria-label="Switch to side view" title="Switch to side view">&#8635;</button>
      <a class="album-back-link" href="/index.html">Home</a>
    </div>
    <div class="site-frame">
      <main class="content-column" id="album-top">
        <section class="album-top-spacer" aria-hidden="true"></section>
        <section class="album-page-header section">
          <h1 class="masthead-title">${title}</h1>
        </section>

        <section class="section album-detail-section" id="album-grid">
          <div class="album-detail-grid"></div>
        </section>

        <section class="section mobile-home-section">
          <div class="subalbum-index subalbum-footer-index is-hidden" aria-label="Sub-album navigation"></div>
          <a class="mobile-home-button" href="/index.html">Home</a>
          <button class="mobile-home-button album-edit-button" type="button" data-album-action="edit">Edit</button>
          <button class="mobile-home-button album-save-button" type="button" data-album-action="save">Save</button>
          <button class="mobile-home-button album-export-button" type="button" data-album-action="export">Export JSON</button>
        </section>
      </main>
    </div>

    <div class="lightbox" id="lightbox" aria-hidden="true">
      <button class="lightbox-close" type="button" aria-label="Close image view">Close</button>
      <img class="lightbox-image" alt="" />
    </div>

    <script type="module" src="/script/main.js"></script>
  </body>
</html>
`;

const buildGallerySettings = ({ galleryId, title }) => ({
  id: galleryId,
  title,
  titleFontFamily: "libre-baskerville",
  titleScale: 0.6,
  mobileRotateClockwise: false,
  spacing: "tight",
  topSpacer: 7,
  effect: "none",
  effectSettings: {
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
  },
  intro: {
    mode: "default",
    heroImageSrc: "",
    showArrow: true,
  },
  sections: [],
  photos: [],
  blocks: [],
});

const writeLocalRepoFile = async (relativePath, contents) => {
  const absolutePath = path.join(process.cwd(), relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
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

  const { settingsPath, settings, title } = request.body || {};

  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  if (!normalizedTitle || !settings || !isSafeSettingsPath(settingsPath)) {
    return response.status(400).json({ error: "Invalid album payload" });
  }

  try {
    const galleryId = slugify(normalizedTitle);
    if (!galleryId) {
      return response.status(400).json({ error: "Could not build a valid album slug" });
    }

    const href = `/albums/album-${galleryId}.html`;
    const albumHtmlPath = `albums/album-${galleryId}.html`;
    const gallerySettingsPath = `data/galleries/${galleryId}.settings.json`;

    const existingAlbum = await fetchRepoEntry({
      owner,
      repo,
      branch,
      token,
      path: albumHtmlPath,
    });
    const homepageEntry = await fetchRepoEntry({
      owner,
      repo,
      branch,
      token,
      path: SETTINGS_PATH,
    });
    const homepageSettings = settings;
    const nextCard = {
      href,
      title: normalizedTitle,
      date: "",
      category: "",
      description: "",
    };

    if (existingAlbum) {
      const existingCards = Array.isArray(homepageSettings.albumCards) ? homepageSettings.albumCards : [];
      const alreadyListed = existingCards.some((card) => card?.href === href);
      if (alreadyListed) {
        return response.status(409).json({ error: "Album already exists", href, galleryId });
      }

      const repairedHomepageSettings = {
        ...homepageSettings,
        albumCards: [...existingCards, nextCard],
      };

      const homepageRepair = await writeRepoFile({
        owner,
        repo,
        branch,
        token,
        path: SETTINGS_PATH,
        sha: homepageEntry?.sha || null,
        message: `Repair homepage album entry: ${galleryId}`,
        base64Content: Buffer.from(JSON.stringify(repairedHomepageSettings, null, 2)).toString("base64"),
      });

      await writeLocalRepoFile(SETTINGS_PATH, `${JSON.stringify(repairedHomepageSettings, null, 2)}\n`);

      return response.status(200).json({
        ok: true,
        repaired: true,
        album: {
          galleryId,
          href,
          title: normalizedTitle,
          settingsPath: gallerySettingsPath,
        },
        homepageSettings: repairedHomepageSettings,
        commitShas: [homepageRepair.commitSha].filter(Boolean),
      });
    }

    const nextHomepageSettings = {
      ...homepageSettings,
      albumCards: [...(Array.isArray(homepageSettings.albumCards) ? homepageSettings.albumCards : []), nextCard],
    };

    const gallerySettings = buildGallerySettings({
      galleryId,
      title: normalizedTitle,
    });

    const commits = [];
    commits.push(
      (
        await writeRepoFile({
          owner,
          repo,
          branch,
          token,
          path: albumHtmlPath,
          sha: null,
          message: `Create album page: ${galleryId}`,
          base64Content: Buffer.from(buildAlbumHtml({ title: normalizedTitle, galleryId })).toString("base64"),
        })
      ).commitSha
    );

    commits.push(
      (
        await writeRepoFile({
          owner,
          repo,
          branch,
          token,
          path: gallerySettingsPath,
          sha: null,
          message: `Create gallery settings: ${galleryId}`,
          base64Content: Buffer.from(JSON.stringify(gallerySettings, null, 2)).toString("base64"),
        })
      ).commitSha
    );

    commits.push(
      (
        await writeRepoFile({
          owner,
          repo,
          branch,
          token,
          path: SETTINGS_PATH,
          sha: homepageEntry?.sha || null,
          message: `Add homepage album: ${galleryId}`,
          base64Content: Buffer.from(JSON.stringify(nextHomepageSettings, null, 2)).toString("base64"),
        })
      ).commitSha
    );

    await writeLocalRepoFile(albumHtmlPath, buildAlbumHtml({ title: normalizedTitle, galleryId }));
    await writeLocalRepoFile(gallerySettingsPath, `${JSON.stringify(gallerySettings, null, 2)}\n`);
    await writeLocalRepoFile(SETTINGS_PATH, `${JSON.stringify(nextHomepageSettings, null, 2)}\n`);

    return response.status(200).json({
      ok: true,
      album: {
        galleryId,
        href,
        title: normalizedTitle,
        settingsPath: gallerySettingsPath,
      },
      homepageSettings: nextHomepageSettings,
      commitShas: commits.filter(Boolean),
    });
  } catch (error) {
    return response.status(500).json({
      error: "Unexpected create album error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
