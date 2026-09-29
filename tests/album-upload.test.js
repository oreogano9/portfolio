import test from "node:test";
import assert from "node:assert/strict";
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

test("upload prepares a draft without any GitHub or other network writes", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Uploads must not save"); };
  try {
    const old = { id: "old", src: "/images/old.jpg" };
    const res = response();
    await handler({ method: "POST", body: {
      galleryId: "test", settingsPath: "data/galleries/test.settings.json",
      settings: { photos: [old], intro: { mode: "hero" } }, files: [file],
    } }, res);
    assert.equal(res.code, 200);
    assert.equal(calls, 0);
    assert.equal(res.payload.saved, false);
    assert.deepEqual(res.payload.settings.photos[0], old);
    assert.equal(res.payload.settings.photos[1].src, file.src);
    assert.equal(res.payload.settings.photos[1].aspectRatio, 2 / 3);
    assert.equal(res.payload.settings.blocks.length, 2);
    assert.equal(res.payload.uploadedPhotos.length, 1);
    assert.equal(res.payload.settings.intro.heroImageSrc, file.src);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
