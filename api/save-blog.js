export const config = {
  runtime: "nodejs",
};

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SETTINGS_PATH = "data/blog.settings.json";

const isSafeSettingsPath = (value) => value === SETTINGS_PATH;

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

const writeRepoJson = async ({ owner, repo, branch, token, path: repoPath, sha, message, json }) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`;
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

  const { documentId, settingsPath, settings } = request.body || {};

  if (documentId !== "blog" || !settings || !isSafeSettingsPath(settingsPath)) {
    return response.status(400).json({ error: "Invalid blog payload" });
  }

  try {
    const existing = await fetchRepoJson({
      owner,
      repo,
      branch,
      token,
      path: SETTINGS_PATH,
    });

    if (!existing) {
      const fallbackRead = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${SETTINGS_PATH}?ref=${branch}`, {
        headers: githubHeaders(token),
      });
      if (!fallbackRead.ok && fallbackRead.status !== 404) {
        const details = await fallbackRead.text();
        return response.status(500).json({ error: "Failed to read existing blog settings", details });
      }
    }

    const blogWrite = await writeRepoJson({
      owner,
      repo,
      branch,
      token,
      path: SETTINGS_PATH,
      sha: existing?.sha,
      message: "Update blog settings",
      json: settings,
    });

    if (!blogWrite.ok) {
      return response.status(500).json({ error: "Failed to write blog settings to GitHub", details: blogWrite.details });
    }

    await tryWriteLocal(() => writeLocalRepoJson(SETTINGS_PATH, settings));

    return response.status(200).json({
      ok: true,
      commitSha: blogWrite.commitSha,
      path: SETTINGS_PATH,
      blogSettings: settings,
    });
  } catch (error) {
    return response.status(500).json({
      error: "Unexpected save error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
