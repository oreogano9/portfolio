import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import handler from "../api/save-gallery.js";

test("album saves before S3 deletion and keeps a retry queue on deletion failure", async () => {
  const cwd = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), "album-cleanup-save-"));
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const photo = { id: "new", src: "/images/library/originals/new.jpg", previewSrc: "/images/library/thumbs/new.jpg" };
  const writes = [];
  try {
    process.chdir(directory);
    Object.assign(process.env, { GITHUB_OWNER: "test", GITHUB_REPO: "test", GITHUB_TOKEN: "test",
      AWS_ACCESS_KEY_ID: "AKIA0000000000000000", AWS_SECRET_ACCESS_KEY: "test" });
    globalThis.fetch = async (url, options) => {
      if (options.method === "DELETE") {
        assert.equal(writes.length, 1);
        assert.equal(writes[0].photos.length, 0);
        assert.equal(writes[0].pendingS3Deletes.length, 1);
        return { ok: false, status: 403, text: async () => "Denied" };
      }
      if (String(url).includes("/git/trees/")) return { ok: true, json: async () => ({ tree: [] }) };
      if (options.method === "PUT") {
        writes.push(JSON.parse(Buffer.from(JSON.parse(options.body).content, "base64").toString()));
        return { ok: true, json: async () => ({ commit: { sha: "saved" } }) };
      }
      return { ok: true, json: async () => ({ sha: "old", content: Buffer.from(JSON.stringify({ photos: [photo] })).toString("base64") }) };
    };
    const response = {
      status(code) { this.code = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    await handler({ method: "POST", body: { galleryId: "test", settingsPath: "data/galleries/test.settings.json",
      deleteRemovedImages: true, settings: { photos: [{ ...photo, deleted: true }] } } }, response);
    assert.equal(response.code, 200);
    assert.match(response.payload.cleanupWarning, /Save again to retry/);
    assert.equal(response.payload.settings.pendingS3Deletes.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    process.chdir(cwd);
    await rm(directory, { recursive: true, force: true });
  }
});
