import test from "node:test";
import assert from "node:assert/strict";
import { imageKey, planAlbumCleanup, readOtherImageDocuments } from "../server/album-cleanup.js";

const photo = { id: "new", src: "/images/library/originals/new.jpg", previewSrc: "/images/library/thumbs/new.jpg" };
const existing = { photos: [photo], intro: { heroImageSrc: photo.src } };
const incoming = { photos: [{ ...photo, deleted: true }], blocks: [{ type: "photo", photoId: "new" }], intro: existing.intro };

test("confirmed removal queues both files, removes photo/block/hero and records tombstone", () => {
  const plan = planAlbumCleanup(existing, incoming, [], true);
  assert.deepEqual(plan.keys, ["albums/library/originals/new.jpg", "albums/library/thumbs/new.jpg"]);
  assert.deepEqual(plan.settings.photos, []);
  assert.deepEqual(plan.settings.blocks, []);
  assert.equal(plan.settings.intro.heroImageSrc, "");
  assert.deepEqual(plan.settings.removedPhotoSources, [photo.src]);
});

test("shared originals or thumbnails protect the entire pair", () => {
  for (const reference of [photo.src, photo.previewSrc, "https://d2gue6esbiyjpv.cloudfront.net/library/originals/new.jpg", "albums/library/originals/new.jpg"]) {
    assert.deepEqual(planAlbumCleanup(existing, incoming, [{ photos: [{ src: reference }] }], true).keys, []);
  }
});

test("archive files, unconfirmed removals and forged new photos are not deleted", () => {
  const archived = { ...photo, src: "/images/ARCHIVE/new.jpg" };
  assert.deepEqual(planAlbumCleanup({ photos: [archived] }, { photos: [{ ...archived, deleted: true }] }, [], true).keys, []);
  assert.deepEqual(planAlbumCleanup(existing, incoming, [], false).keys, []);
  assert.deepEqual(planAlbumCleanup({ photos: [] }, incoming, [], true).keys, []);
});

test("pending deletions survive failures and can be retried without trusting incoming queues", () => {
  const pending = planAlbumCleanup(existing, incoming, [], true).settings;
  assert.equal(planAlbumCleanup(pending, { photos: [], pendingS3Deletes: [["albums/library/originals/forged.jpg"]] }, [], false).keys.length, 2);
  assert.deepEqual(planAlbumCleanup({ photos: [] }, { photos: [], pendingS3Deletes: [["albums/library/originals/forged.jpg"]] }, [], false).keys, []);
});

test("reference checks fail closed and unsafe paths are ignored", async () => {
  assert.equal(imageKey("/images/library/../secret.jpg"), "");
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(readOtherImageDocuments({ owner: "test", repo: "test", branch: "main", token: "test", settingsPath: "data/test.json" }), /no S3 files were deleted/);
  } finally { globalThis.fetch = originalFetch; }
});
