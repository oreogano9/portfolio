export const config = {
  runtime: "nodejs",
};

import crypto from "node:crypto";

const DEFAULT_BUCKET = "konrad-photo-portfolio-082237395700-eu-west-3-an";
const DEFAULT_REGION = "eu-west-3";
const LIBRARY_PREFIX = "albums/library/";
const MAX_KEYS = 100;

const hmac = (key, value, encoding) => crypto.createHmac("sha256", key).update(value).digest(encoding);
const sha256 = (value, encoding = "hex") => crypto.createHash("sha256").update(value).digest(encoding);

const getS3Config = () => {
  const bucket = process.env.PHOTO_LIBRARY_BUCKET || process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || DEFAULT_BUCKET;
  const region = process.env.AWS_REGION || process.env.S3_REGION || DEFAULT_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY");
  }

  return { bucket, region, accessKeyId, secretAccessKey, sessionToken };
};

const encodePath = (value) =>
  String(value || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

const getSigningKey = ({ secretAccessKey, dateStamp, region }) => {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
};

const sanitizeKey = (key) => {
  const normalized = String(key || "").replace(/^\/+/, "");
  if (!normalized.startsWith(LIBRARY_PREFIX) || normalized.includes("..") || /[\r\n]/.test(normalized)) {
    return "";
  }
  return normalized;
};

const signDeleteRequest = ({ bucket, region, accessKeyId, secretAccessKey, sessionToken, key }) => {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const signedHeaders = sessionToken ? "host;x-amz-content-sha256;x-amz-date;x-amz-security-token" : "host;x-amz-content-sha256;x-amz-date";
  const headers = {
    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    "x-amz-date": amzDate,
    ...(sessionToken ? { "x-amz-security-token": sessionToken } : {}),
  };
  const canonicalHeaders = [
    `host:${host}`,
    "x-amz-content-sha256:UNSIGNED-PAYLOAD",
    `x-amz-date:${amzDate}`,
    ...(sessionToken ? [`x-amz-security-token:${sessionToken}`] : []),
  ].join("\n");
  const canonicalRequest = ["DELETE", `/${encodePath(key)}`, "", `${canonicalHeaders}\n`, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(getSigningKey({ secretAccessKey, dateStamp, region }), stringToSign, "hex");
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    url: `https://${host}/${encodePath(key)}`,
    headers,
  };
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const { keys } = request.body || {};
  if (!Array.isArray(keys) || !keys.length || keys.length > MAX_KEYS) {
    return response.status(400).json({ error: "Invalid keys payload" });
  }

  try {
    const s3Config = getS3Config();
    const deleted = [];
    for (const rawKey of keys) {
      const key = sanitizeKey(rawKey);
      if (!key) {
        throw new Error("Invalid S3 key");
      }
      const signed = signDeleteRequest({ ...s3Config, key });
      const deleteResponse = await fetch(signed.url, {
        method: "DELETE",
        headers: signed.headers,
      });
      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        throw new Error(`Failed to delete ${key}: ${deleteResponse.status} ${await deleteResponse.text()}`);
      }
      deleted.push(key);
    }

    return response.status(200).json({ ok: true, deleted });
  } catch (error) {
    return response.status(500).json({
      error: "Could not delete S3 objects",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
