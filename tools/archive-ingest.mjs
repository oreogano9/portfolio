#!/usr/bin/env node
import { createHash, createHmac } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import https from "node:https";
import process from "node:process";

const BUCKET = "konrad-photo-portfolio-082237395700-eu-west-3-an";
const REGION = "eu-west-3";
const PROFILE = "codex-album-uploader";
const CLOUDFRONT_BASE_URL = "https://d2gue6esbiyjpv.cloudfront.net";
const WORK_DIR = ".archive-ingest";
const MANIFEST_PATH = path.join(WORK_DIR, "archive-manifest.json");
const EXIF_PATH = path.join(WORK_DIR, "archive-exif.json");
const LIBRARY_PATH = "data/photo-library.json";
const ARCHIVE_PREFIX = "albums/ARCHIVE";
const SOURCE_ROOTS = ["/Volumes/SSDisky/Lightroom Export", "/Volumes/PHOTO HDD/Lightroom Export"];
const ORGANIZED_ROOT = "/Volumes/SSDisky/Exports Organized";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".heif"]);

const args = new Set(process.argv.slice(2));
const hasArg = (name) => args.has(name);
const getArgValue = (name, fallback) => {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const shouldBuild = hasArg("--build") || hasArg("--all") || process.argv.length <= 2;
const shouldUpload = hasArg("--upload") || hasArg("--all") || process.argv.length <= 2;
const shouldWriteLibrary = hasArg("--write-library") || hasArg("--all") || process.argv.length <= 2;
const originalsOnly = hasArg("--originals-only");
const thumbsOnly = hasArg("--thumbs-only");
const syncMode = hasArg("--sync-mode") && !hasArg("--copy-mode");
const awsCliMode = hasArg("--aws-cli");
const uploadConcurrency = Math.max(1, Math.min(12, Number(getArgValue("--concurrency", "4")) || 4));
const fileLimit = Math.max(0, Number(getArgValue("--limit", "0")) || 0);
const sourceRootFilter = String(getArgValue("--source-root", "") || "").trim();
const shaFilter = String(getArgValue("--sha", "") || "").trim();

const log = (message) => {
  process.stdout.write(`${message}\n`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      ...options,
    });
    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited ${code}${stderr ? `\n${stderr}` : ""}`));
      }
    });
  });

const isImageFile = (filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());

async function walkImages(root) {
  const files = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && isImageFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  await walk(root);
  return files;
}

const hashFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });

const toPosix = (value) => value.split(path.sep).join("/");

const sourceNameForRoot = (root) => (root.includes("PHOTO HDD") ? "PHOTO HDD Lightroom Export" : "SSDisky Lightroom Export");

const tagsFromOrganizedPath = (filePath) => {
  const relative = toPosix(path.relative(ORGANIZED_ROOT, path.dirname(filePath)));
  return relative
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== ".")
    .map((part) => part.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
};

const extensionForArchive = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".jpeg" ? ".jpg" : extension || ".jpg";
};

const archiveKeyFor = (sha256, filePath) => `${ARCHIVE_PREFIX}/originals/${sha256.slice(0, 2)}/${sha256}${extensionForArchive(filePath)}`;
const thumbKeyFor = (sha256) => `${ARCHIVE_PREFIX}/thumbs/${sha256.slice(0, 2)}/${sha256}.jpg`;
const thumbPathFor = (sha256) => path.join(WORK_DIR, "thumbs", sha256.slice(0, 2), `${sha256}.jpg`);
const publicPathForKey = (key) => `/images/${key.replace(/^albums\//, "")}`;
const cloudFrontUrlForKey = (key) => `${CLOUDFRONT_BASE_URL}/${key.replace(/^albums\//, "")}`;

const readJson = async (filePath, fallback) => {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

async function buildManifest() {
  await mkdir(WORK_DIR, { recursive: true });

  log("Scanning organized folder for tag hints...");
  const organizedFiles = await walkImages(ORGANIZED_ROOT);
  const organizedByHash = new Map();
  let organizedIndex = 0;
  for (const filePath of organizedFiles) {
    organizedIndex += 1;
    if (organizedIndex % 250 === 0) {
      log(`Hashed organized tags ${organizedIndex}/${organizedFiles.length}`);
    }
    const sha256 = await hashFile(filePath);
    const existing = organizedByHash.get(sha256) || { organizedPaths: [], tags: new Set() };
    existing.organizedPaths.push(filePath);
    tagsFromOrganizedPath(filePath).forEach((tag) => existing.tags.add(tag));
    organizedByHash.set(sha256, existing);
  }

  log("Scanning Lightroom export roots...");
  const sourceFiles = [];
  for (const root of SOURCE_ROOTS) {
    const files = await walkImages(root);
    files.forEach((filePath) => sourceFiles.push({ root, filePath }));
  }

  const byHash = new Map();
  let sourceIndex = 0;
  for (const source of sourceFiles) {
    sourceIndex += 1;
    if (sourceIndex % 250 === 0) {
      log(`Hashed archive source ${sourceIndex}/${sourceFiles.length}`);
    }
    const fileStat = await stat(source.filePath);
    const sha256 = await hashFile(source.filePath);
    const organized = organizedByHash.get(sha256);
    const existing = byHash.get(sha256) || {
      sha256,
      canonicalPath: source.filePath,
      s3Key: archiveKeyFor(sha256, source.filePath),
      thumbS3Key: thumbKeyFor(sha256),
      size: fileStat.size,
      sourcePaths: [],
      sourceRoots: [],
      organizedPaths: [],
      tags: [],
      originalNames: [],
      lastModified: 0,
    };
    existing.sourcePaths.push(source.filePath);
    existing.sourceRoots.push(sourceNameForRoot(source.root));
    existing.originalNames.push(path.basename(source.filePath));
    existing.lastModified = Math.max(existing.lastModified || 0, Math.round(fileStat.mtimeMs));
    if (organized) {
      existing.organizedPaths.push(...organized.organizedPaths);
      existing.tags.push(...Array.from(organized.tags));
    }
    byHash.set(sha256, existing);
  }

  const uniqueFiles = Array.from(byHash.values()).map((entry) => ({
    ...entry,
    sourcePaths: Array.from(new Set(entry.sourcePaths)),
    sourceRoots: Array.from(new Set(entry.sourceRoots)),
    organizedPaths: Array.from(new Set(entry.organizedPaths)),
    tags: Array.from(new Set(entry.tags)).sort((a, b) => a.localeCompare(b)),
    originalNames: Array.from(new Set(entry.originalNames)),
    duplicateCount: entry.sourcePaths.length - 1,
  }));

  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    archivePrefix: ARCHIVE_PREFIX,
    sourceRoots: SOURCE_ROOTS,
    organizedRoot: ORGANIZED_ROOT,
    sourceFileCount: sourceFiles.length,
    organizedFileCount: organizedFiles.length,
    uniqueFileCount: uniqueFiles.length,
    duplicateFileCount: sourceFiles.length - uniqueFiles.length,
    taggedUniqueFileCount: uniqueFiles.filter((entry) => entry.tags.length).length,
    files: uniqueFiles,
  };

  await writeJson(MANIFEST_PATH, manifest);
  log(`Wrote ${MANIFEST_PATH}`);
  log(`Unique originals: ${manifest.uniqueFileCount}; duplicates skipped: ${manifest.duplicateFileCount}; tagged: ${manifest.taggedUniqueFileCount}`);
  return manifest;
}

async function loadManifest() {
  return readJson(MANIFEST_PATH, null);
}

async function loadExistingArchiveKeys() {
  try {
    const { stdout } = await run(
      "aws",
      ["s3", "ls", `s3://${BUCKET}/${ARCHIVE_PREFIX}/`, "--recursive", "--profile", PROFILE, "--region", REGION],
      { capture: true }
    );
    return new Set(
      stdout
        .split("\n")
        .map((line) => line.trim().split(/\s+/).slice(3).join(" "))
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

async function ensureSymlink(targetPath, linkPath) {
  try {
    await lstat(linkPath);
    return;
  } catch {
    // Continue and create it.
  }
  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(targetPath, linkPath);
}

async function stageOriginalLinks(manifest) {
  const originalsRoot = path.join(WORK_DIR, "originals");
  let count = 0;
  for (const entry of manifest.files) {
    const relativeKey = entry.s3Key.replace(`${ARCHIVE_PREFIX}/originals/`, "");
    await ensureSymlink(entry.canonicalPath, path.join(originalsRoot, relativeKey));
    count += 1;
    if (count % 500 === 0 || count === manifest.files.length) {
      log(`Staged original links ${count}/${manifest.files.length}`);
    }
  }
  return originalsRoot;
}

async function createThumbnail(entry) {
  const outputPath = thumbPathFor(entry.sha256);
  try {
    await stat(outputPath);
    return outputPath;
  } catch {
    // Continue and create it.
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await run("sips", ["-s", "format", "jpeg", "-Z", "900", entry.canonicalPath, "--out", outputPath], { capture: true });
    return outputPath;
  } catch {
    return "";
  }
}

const contentTypeFor = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".tif" || extension === ".tiff") return "image/tiff";
  if (extension === ".heic" || extension === ".heif") return "image/heic";
  return "image/jpeg";
};

const hmac = (key, value, encoding) => createHmac("sha256", key).update(value).digest(encoding);
const sha256 = (value, encoding = "hex") => createHash("sha256").update(value).digest(encoding);

const encodePath = (value) =>
  String(value || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

let cachedAwsCredentials = null;

const getAwsValue = async (name) => {
  const { stdout } = await run("aws", ["configure", "get", name, "--profile", PROFILE], { capture: true });
  return stdout.trim();
};

const getAwsCredentials = async () => {
  if (cachedAwsCredentials) {
    return cachedAwsCredentials;
  }
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || (await getAwsValue("aws_access_key_id"));
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || (await getAwsValue("aws_secret_access_key"));
  const sessionToken = process.env.AWS_SESSION_TOKEN || (await getAwsValue("aws_session_token").catch(() => ""));
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(`Missing AWS credentials for profile ${PROFILE}`);
  }
  cachedAwsCredentials = { accessKeyId, secretAccessKey, sessionToken };
  return cachedAwsCredentials;
};

const getSigningKey = ({ secretAccessKey, dateStamp }) => {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
};

async function putS3Object({ key, body, contentType, contentLength, archiveSha256 }) {
  const { accessKeyId, secretAccessKey, sessionToken } = await getAwsCredentials();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = `${BUCKET}.s3.${REGION}.amazonaws.com`;
  const credentialScope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const canonicalHeadersList = [
    ["content-length", String(contentLength)],
    ["content-type", contentType],
    ["host", host],
    ["x-amz-content-sha256", "UNSIGNED-PAYLOAD"],
    ["x-amz-date", amzDate],
    ["x-amz-meta-archive-sha256", archiveSha256],
    ["x-amz-server-side-encryption", "AES256"],
    ...(sessionToken ? [["x-amz-security-token", sessionToken]] : []),
  ].sort(([left], [right]) => left.localeCompare(right));
  const canonicalHeaders = canonicalHeadersList.map(([name, value]) => `${name}:${value}`).join("\n");
  const signedHeaders = canonicalHeadersList.map(([name]) => name).join(";");
  const canonicalRequest = [
    "PUT",
    `/${encodePath(key)}`,
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const signature = hmac(getSigningKey({ secretAccessKey, dateStamp }), stringToSign, "hex");
  const headers = {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Length": String(contentLength),
      "Content-Type": contentType,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      "x-amz-date": amzDate,
      "x-amz-meta-archive-sha256": archiveSha256,
      "x-amz-server-side-encryption": "AES256",
      ...(sessionToken ? { "x-amz-security-token": sessionToken } : {}),
  };

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      body.destroy(new Error(`Source read timed out for ${key}`));
      request?.destroy(new Error(`S3 PUT timed out for ${key}`));
    }, 30000);
    let request = null;
    const finish = (callback, value) => {
      clearTimeout(timeout);
      callback(value);
    };
    request = https.request(
      {
        method: "PUT",
        hostname: host,
        path: `/${encodePath(key)}`,
        headers,
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            finish(resolve);
          } else {
            finish(reject, new Error(`S3 PUT failed for ${key}: ${response.statusCode} ${responseBody}`));
          }
        });
      }
    );
    request.setTimeout(30000, () => {
      request.destroy(new Error(`S3 PUT timed out for ${key}`));
    });
    request.on("error", (error) => finish(reject, error));
    body.on("error", (error) => {
      request.destroy(error);
    });
    body.pipe(request);
  });
}

async function uploadOne(localPath, key, contentType) {
  let lastError = null;
  const { size } = await stat(localPath);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await putS3Object({
        key,
        body: createReadStream(localPath),
        contentType,
        contentLength: size,
        archiveSha256: path.basename(key).replace(/\.[^.]+$/, ""),
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function uploadOneWithAwsCli(localPath, key, contentType) {
  const archiveSha256 = path.basename(key).replace(/\.[^.]+$/, "");
  await run("aws", [
    "s3",
    "cp",
    localPath,
    `s3://${BUCKET}/${key}`,
    "--metadata",
    `archive-sha256=${archiveSha256}`,
    "--sse",
    "AES256",
    "--content-type",
    contentType,
    "--only-show-errors",
    "--profile",
    PROFILE,
    "--region",
    REGION,
  ]);
}

async function runWithConcurrency(items, worker, concurrency) {
  let index = 0;
  let completed = 0;
  const failures = [];
  async function next() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      try {
        await worker(items[currentIndex], currentIndex);
      } catch (error) {
        failures.push({ item: items[currentIndex], error: error instanceof Error ? error.message : String(error) });
      } finally {
        completed += 1;
        if (completed % 50 === 0 || completed === items.length) {
          log(`Processed uploads ${completed}/${items.length}`);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  if (failures.length) {
    await writeJson(path.join(WORK_DIR, "upload-failures.json"), failures);
    throw new Error(`${failures.length} upload operation(s) failed; see ${path.join(WORK_DIR, "upload-failures.json")}`);
  }
}

async function uploadArchive(manifest) {
  const originalsRoot = await stageOriginalLinks(manifest);
  const existingKeys = await loadExistingArchiveKeys();
  const thumbnailEntries = manifest.files.filter((entry) => !existingKeys.has(entry.thumbS3Key));

  if (!syncMode) {
    const uploadJobs = [];
    if (!thumbsOnly) {
      manifest.files.forEach((entry) => {
        if (!existingKeys.has(entry.s3Key)) {
          uploadJobs.push({
            localPath: entry.canonicalPath,
            key: entry.s3Key,
            contentType: contentTypeFor(entry.canonicalPath),
          });
        }
      });
    }
    if (!originalsOnly) {
      const thumbnailJobs = [];
      await runWithConcurrency(thumbnailEntries, async (entry) => {
        const thumbPath = await createThumbnail(entry);
        if (thumbPath) {
          thumbnailJobs.push({
            localPath: thumbPath,
            key: entry.thumbS3Key,
            contentType: "image/jpeg",
          });
        }
      }, uploadConcurrency);
      uploadJobs.push(...thumbnailJobs);
    }
    log(
      `Uploading ${uploadJobs.length} object(s) with ${
        awsCliMode ? "AWS CLI cp" : "direct S3 PUT"
      } concurrency ${uploadConcurrency}`
    );
    await runWithConcurrency(
      uploadJobs,
      (job) => (awsCliMode ? uploadOneWithAwsCli(job.localPath, job.key, job.contentType) : uploadOne(job.localPath, job.key, job.contentType)),
      uploadConcurrency
    );
    return;
  }

  if (!thumbsOnly) {
    log(`Syncing originals to s3://${BUCKET}/${ARCHIVE_PREFIX}/originals/`);
    await run("aws", [
      "s3",
      "sync",
      originalsRoot,
      `s3://${BUCKET}/${ARCHIVE_PREFIX}/originals/`,
      "--follow-symlinks",
      "--size-only",
      "--only-show-errors",
      "--profile",
      PROFILE,
      "--region",
      REGION,
    ]);
  }

  if (!originalsOnly) {
    log(`Creating ${thumbnailEntries.length} missing thumbnail(s) with concurrency ${uploadConcurrency}`);
    await runWithConcurrency(thumbnailEntries, createThumbnail, uploadConcurrency);

    log(`Syncing thumbnails to s3://${BUCKET}/${ARCHIVE_PREFIX}/thumbs/`);
    await run("aws", [
      "s3",
      "sync",
      path.join(WORK_DIR, "thumbs"),
      `s3://${BUCKET}/${ARCHIVE_PREFIX}/thumbs/`,
      "--size-only",
      "--only-show-errors",
      "--content-type",
      "image/jpeg",
      "--profile",
      PROFILE,
      "--region",
      REGION,
    ]);
  }
}

async function extractExif(manifest) {
  const existing = await readJson(EXIF_PATH, null);
  if (existing?.version === 1 && Array.isArray(existing.items) && existing.items.length === manifest.files.length) {
    return existing;
  }

  const fileListPath = path.join(WORK_DIR, "exif-files.txt");
  await writeFile(fileListPath, manifest.files.map((entry) => entry.canonicalPath).join("\n"));
  const { stdout } = await run(
    "exiftool",
    [
      "-json",
      "-charset",
      "filename=UTF8",
      "-DateTimeOriginal",
      "-CreateDate",
      "-ModifyDate",
      "-Make",
      "-Model",
      "-LensMake",
      "-LensModel",
      "-Software",
      "-Orientation",
      "-ISO",
      "-ExposureTime",
      "-FNumber",
      "-FocalLength",
      "-GPSLatitude",
      "-GPSLongitude",
      "-GPSAltitude",
      "-@",
      fileListPath,
    ],
    { capture: true, maxBuffer: 1024 * 1024 * 200 }
  );
  const exif = {
    version: 1,
    createdAt: new Date().toISOString(),
    items: JSON.parse(stdout),
  };
  await writeJson(EXIF_PATH, exif);
  return exif;
}

const normalizeExifNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const parseExposure = (value) => {
  if (typeof value === "number") {
    return value;
  }
  const text = String(value || "").trim();
  const fraction = text.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/);
  if (fraction) {
    return Number(fraction[1]) / Number(fraction[2]);
  }
  return normalizeExifNumber(text);
};

const normalizeExifDate = (value) => {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}` : text;
};

const parseGps = (value) => {
  if (typeof value === "number") {
    return value;
  }
  const text = String(value || "").trim();
  const direction = text.match(/[NSEW]$/i)?.[0]?.toUpperCase() || "";
  const numbers = Array.from(text.matchAll(/-?\d+(?:\.\d+)?/g)).map((match) => Number(match[0]));
  if (!numbers.length) {
    return null;
  }
  const decimal = numbers.length >= 3 ? numbers[0] + numbers[1] / 60 + numbers[2] / 3600 : numbers[0];
  return ["S", "W"].includes(direction) ? -decimal : decimal;
};

const photoRecordFromEntry = (entry, exifByPath) => {
  const exif = exifByPath.get(entry.canonicalPath) || {};
  const fileName = entry.originalNames[0] || path.basename(entry.canonicalPath);
  const thumbExists = entry.thumbS3Key && existsSync(thumbPathFor(entry.sha256));
  return {
    id: `archive:${entry.sha256}`,
    src: publicPathForKey(entry.s3Key),
    previewSrc: thumbExists ? publicPathForKey(entry.thumbS3Key) : "",
    s3Key: entry.s3Key,
    thumbS3Key: thumbExists ? entry.thumbS3Key : "",
    originalName: fileName,
    displayName: fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
    type: contentTypeFor(entry.canonicalPath),
    size: entry.size,
    width: null,
    height: null,
    aspectRatio: null,
    uploadedAt: new Date().toISOString(),
    lastModified: entry.lastModified || null,
    tags: entry.tags,
    albumIds: [],
    favorite: false,
    inPortfolio: false,
    trashed: false,
    trashedAt: "",
    archiveSha256: entry.sha256,
    sourcePaths: entry.sourcePaths,
    sourceRoots: entry.sourceRoots,
    organizedPaths: entry.organizedPaths,
    archiveTags: entry.tags,
    archiveImportedAt: new Date().toISOString(),
    metadata: {
      takenAt: normalizeExifDate(exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate || ""),
      cameraMake: exif.Make || "",
      cameraModel: exif.Model || "",
      lensMake: exif.LensMake || "",
      lensModel: exif.LensModel || "",
      software: exif.Software || "",
      orientation: normalizeExifNumber(exif.Orientation),
      iso: normalizeExifNumber(exif.ISO),
      exposureTime: parseExposure(exif.ExposureTime),
      aperture: normalizeExifNumber(exif.FNumber),
      focalLength: normalizeExifNumber(exif.FocalLength),
      gpsLatitude: parseGps(exif.GPSLatitude),
      gpsLongitude: parseGps(exif.GPSLongitude),
      gpsAltitude: normalizeExifNumber(exif.GPSAltitude),
    },
  };
};

async function writeLibrary(manifest) {
  const exif = await extractExif(manifest);
  const exifByPath = new Map(exif.items.map((item) => [item.SourceFile, item]));
  const archivePhotos = manifest.files.map((entry) => photoRecordFromEntry(entry, exifByPath));
  const library = await readJson(LIBRARY_PATH, { id: "photo-library", version: 1, updatedAt: "", photos: [] });
  const bySrc = new Map();
  [...archivePhotos, ...(library.photos || [])].forEach((photo) => {
    if (photo?.src) {
      bySrc.set(photo.src, { ...(bySrc.get(photo.src) || {}), ...photo });
    }
  });
  const nextLibrary = {
    ...library,
    id: library.id || "photo-library",
    version: Math.max(Number(library.version) || 1, 2),
    updatedAt: new Date().toISOString(),
    photos: Array.from(bySrc.values()),
  };
  await writeJson(LIBRARY_PATH, nextLibrary);
  log(`Wrote ${LIBRARY_PATH} with ${nextLibrary.photos.length} photo record(s).`);
}

const main = async () => {
  let manifest = shouldBuild ? await buildManifest() : await loadManifest();
  if (!manifest) {
    throw new Error(`No manifest found at ${MANIFEST_PATH}. Run with --build first.`);
  }
  if (fileLimit > 0) {
    manifest = {
      ...manifest,
      files: manifest.files.slice(0, fileLimit),
    };
    log(`Using first ${manifest.files.length} manifest file(s) because --limit=${fileLimit}`);
  }
  if (sourceRootFilter) {
    manifest = {
      ...manifest,
      files: manifest.files.filter((entry) => entry.canonicalPath.includes(sourceRootFilter)),
    };
    log(`Using ${manifest.files.length} manifest file(s) matching --source-root=${sourceRootFilter}`);
  }
  if (shaFilter) {
    manifest = {
      ...manifest,
      files: manifest.files.filter((entry) => entry.sha256.startsWith(shaFilter)),
    };
    log(`Using ${manifest.files.length} manifest file(s) matching --sha=${shaFilter}`);
  }
  if (shouldUpload) {
    await uploadArchive(manifest);
  }
  if (shouldWriteLibrary) {
    await writeLibrary(manifest);
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
