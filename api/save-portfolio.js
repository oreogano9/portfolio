export const config = {
  runtime: "nodejs",
};

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SETTINGS_PATH = "data/portfolio.settings.json";

const isSafeSettingsPath = (value) => value === SETTINGS_PATH;

const githubHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
});

const fetchRepoJson = async ({ owner, repo, branch, token, path }) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const response = await fetch(url, { headers: githubHeaders(token) });
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
  return { sha: payload.sha, parsed };
};

const writeRepoJson = async ({ owner, repo, branch, token, path, sha, message, json }) => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
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
    return { ok: false, details: await response.text() };
  }
  const payload = await response.json();
  return { ok: true, commitSha: payload.commit?.sha || null };
};

const writeLocalRepoJson = async (relativePath, json) => {
  const absolutePath = path.join(process.cwd(), relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(json, null, 2)}\n`);
};

const parseBody = async (request) => {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
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

  const { documentId, settingsPath, settings } = await parseBody(request);
  if (documentId !== "portfolio" || !settings || !isSafeSettingsPath(settingsPath)) {
    return response.status(400).json({ error: "Invalid portfolio payload" });
  }

  try {
    const existing = await fetchRepoJson({ owner, repo, branch, token, path: SETTINGS_PATH });
    const saved = await writeRepoJson({
      owner,
      repo,
      branch,
      token,
      path: SETTINGS_PATH,
      sha: existing?.sha,
      message: "Update portfolio settings",
      json: settings,
    });

    if (!saved.ok) {
      return response.status(500).json({ error: "Failed to write portfolio settings", details: saved.details });
    }

    try {
      await writeLocalRepoJson(SETTINGS_PATH, settings);
    } catch {
      // Local writes are best-effort in production.
    }

    return response.status(200).json({ ok: true, commitSha: saved.commitSha, path: SETTINGS_PATH });
  } catch (error) {
    return response.status(500).json({
      error: "Unexpected portfolio save error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
