import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import handler from "../api/upload-gallery-images.js";

const response = () => ({
  code: 200,
  setHeader() {},
  status(code) { this.code = code; return this; },
  json(payload) { this.payload = payload; return this; },
});
const file = {
  src: "/images/library/originals/photo-123.jpg",
  previewSrc: "/images/library/thumbs/photo-123.jpg",
  name: "photo.jpg", width: 600, height: 900,
};

test("legacy binary upload payloads are rejected", async () => {
  const res = response();
  await handler({ method: "POST", body: { settings: {}, files: [{ ...file, fullDataUrl: "data:image/jpeg;base64,AAAA" }] } }, res);
  assert.equal(res.code, 400);
});

test("invalid S3 paths are rejected", async () => {
  for (const src of ["/images/../../secret.jpg", "https://example.com/a.jpg", "/images/album/a.jpg"]) {
    const res = response();
    await handler({ method: "POST", body: { settings: {}, files: [{ ...file, src }] } }, res);
    assert.equal(res.code, 400);
  }
});

test("append preserves existing photos and writes only JSON to GitHub", async () => {
  const cwd = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), "album-upload-test-"));
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const writes = [];
  try {
    process.chdir(directory);
    Object.assign(process.env, { GITHUB_OWNER: "test", GITHUB_REPO: "test", GITHUB_TOKEN: "test" });
    globalThis.fetch = async (url, options) => {
      assert.ok(String(url).includes("/contents/data/galleries/test.settings.json"));
      if (options.method === "PUT") {
        const body = JSON.parse(options.body);
        writes.push(JSON.parse(Buffer.from(body.content, "base64").toString()));
        return { ok: true, json: async () => ({ commit: { sha: "saved" } }) };
      }
      return { ok: true, json: async () => ({ sha: "previous", content: Buffer.from(JSON.stringify({
        photos: [], removedPhotoSources: ["/images/library/originals/deleted.jpg"],
      })).toString("base64") }) };
    };
    const old = { id: "old", src: "/images/old.jpg" };
    const deleted = { id: "deleted", src: "/images/library/originals/deleted.jpg", deleted: false };
    const res = response();
    await handler({ method: "POST", body: {
      galleryId: "test", settingsPath: "data/galleries/test.settings.json",
      settings: { photos: [old, deleted], intro: { mode: "hero" } }, files: [file],
    } }, res);
    assert.equal(res.code, 200);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].photos[0], old);
    assert.equal(writes[0].photos[1].src, file.src);
    assert.equal(writes[0].photos[1].aspectRatio, 2 / 3);
    assert.equal(writes[0].blocks.length, 2);
    assert.equal(writes[0].photos.length, 2);
    assert.deepEqual(res.payload.settings.photos, writes[0].photos);
    assert.deepEqual(res.payload.settings.removedPhotoSources, [deleted.src]);
    assert.equal(res.payload.uploadedPhotos.length, 1);
    assert.equal(res.payload.settings.intro.heroImageSrc, file.src);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    process.chdir(cwd);
    await rm(directory, { recursive: true, force: true });
  }
});
