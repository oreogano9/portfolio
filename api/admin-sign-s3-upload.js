export const config = {
  runtime: "nodejs",
};

import crypto from "node:crypto";

const DEFAULT_BUCKET = "konrad-photo-portfolio-082237395700-eu-west-3-an";
const DEFAULT_REGION = "eu-west-3";
const MAX_FILES = 200;
const MAX_EXPIRES_SECONDS = 900;
const LIBRARY_PREFIX = "albums/library/";
const CLOUDFRONT_BASE_URL = "https://d2gue6esbiyjpv.cloudfront.net";

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

const hmac = (key, value, encoding) => crypto.createHmac("sha256", key).update(value).digest(encoding);
const sha256 = (value, encoding = "hex") => crypto.createHash("sha256").update(value).digest(encoding);

const encodePath = (value) =>
  String(value || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

const encodeQuery = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

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

const buildPublicPath = (key) => `/images/${key.replace(/^albums\//, "").split("/").map(encodeURIComponent).join("/")}`;
const buildCloudFrontUrl = (key) => `${CLOUDFRONT_BASE_URL}/${key.replace(/^albums\//, "").split("/").map(encodeURIComponent).join("/")}`;

const createPresignedPut = ({ bucket, region, accessKeyId, secretAccessKey, sessionToken, key, contentType }) => {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-server-side-encryption";
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const expires = String(MAX_EXPIRES_SECONDS);
  const safeContentType = contentType || "application/octet-stream";
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": expires,
    "X-Amz-SignedHeaders": signedHeaders,
    ...(sessionToken ? { "X-Amz-Security-Token": sessionToken } : {}),
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${encodeQuery(name)}=${encodeQuery(query[name])}`)
    .join("&");
  const canonicalHeaders = [
    `content-type:${safeContentType}`,
    `host:${host}`,
    "x-amz-content-sha256:UNSIGNED-PAYLOAD",
    "x-amz-server-side-encryption:AES256",
  ].join("\n");
  const canonicalRequest = [
    "PUT",
    `/${encodePath(key)}`,
    canonicalQuery,
    `${canonicalHeaders}\n`,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(getSigningKey({ secretAccessKey, dateStamp, region }), stringToSign, "hex");
  const url = `https://${host}/${encodePath(key)}?${canonicalQuery}&X-Amz-Signature=${signature}`;

  return {
    key,
    url,
    publicPath: buildPublicPath(key),
    publicUrl: buildCloudFrontUrl(key),
    headers: {
      "Content-Type": safeContentType,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      "x-amz-server-side-encryption": "AES256",
    },
  };
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const { files } = request.body || {};
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) {
    return response.status(400).json({ error: "Invalid files payload" });
  }

  try {
    const s3Config = getS3Config();
    const uploads = files.map((file) => {
      const key = sanitizeKey(file?.key);
      if (!key) {
        throw new Error("Invalid S3 key");
      }
      return createPresignedPut({
        ...s3Config,
        key,
        contentType: typeof file?.contentType === "string" ? file.contentType : "",
      });
    });

    return response.status(200).json({ ok: true, uploads });
  } catch (error) {
    return response.status(500).json({
      error: "Could not create S3 upload URLs",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
