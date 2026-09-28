import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin-sign-s3-upload.js";

test("bucket region is independent of the Vercel runtime region", async () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, {
      AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "AKIA0000000000000000", AWS_SECRET_ACCESS_KEY: "test-secret",
    });
    delete process.env.S3_REGION;
    const response = {
      status(code) { this.code = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    await handler({ method: "POST", body: { files: [{ key: "albums/library/originals/test.jpg", contentType: "image/jpeg" }] } }, response);
    assert.equal(response.code, 200);
    assert.equal(new URL(response.payload.uploads[0].url).hostname,
      "konrad-photo-portfolio-082237395700-eu-west-3-an.s3.eu-west-3.amazonaws.com");
    process.env.AWS_ACCESS_KEY_ID = "not-an-access-key";
    await handler({ method: "POST", body: { files: [{ key: "albums/library/originals/test.jpg" }] } }, response);
    assert.equal(response.code, 500);
    assert.match(response.payload.details, /AWS access key ID/);
  } finally {
    process.env = original;
  }
});
