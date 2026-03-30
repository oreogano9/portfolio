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

  const readUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${settingsPath}?ref=${branch}`;

  try {
    const existing = await fetch(readUrl, {
      headers: githubHeaders(token),
    });

    let sha;
    if (existing.ok) {
      const existingJson = await existing.json();
      sha = existingJson.sha;
    } else if (existing.status !== 404) {
      const details = await existing.text();
      return response.status(500).json({ error: "Failed to read existing settings file", details });
    }

    const content = Buffer.from(JSON.stringify(settings, null, 2)).toString("base64");
    const writeUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${settingsPath}`;

    const writeResponse = await fetch(writeUrl, {
      method: "PUT",
      headers: githubHeaders(token),
      body: JSON.stringify({
        message: `Update gallery settings: ${galleryId}`,
        content,
        branch,
        sha,
      }),
    });

    if (!writeResponse.ok) {
      const details = await writeResponse.text();
      return response.status(500).json({ error: "Failed to write settings file to GitHub", details });
    }

    const writeJson = await writeResponse.json();

    return response.status(200).json({
      ok: true,
      commitSha: writeJson.commit?.sha || null,
      path: settingsPath,
    });
  } catch (error) {
    return response.status(500).json({
      error: "Unexpected save error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
