const S3_IMAGE_BASE_URL = "https://d2gue6esbiyjpv.cloudfront.net";

const isAbsoluteAssetUrl = (value) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value) || /^(?:data|blob):/i.test(value);

const normalizeImagePath = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed || isAbsoluteAssetUrl(trimmed)) {
    return "";
  }

  return trimmed.replace(/^\/+/, "").replace(/^images\/?/, "");
};

export const resolveAssetUrl = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed || isAbsoluteAssetUrl(trimmed) || trimmed.startsWith("/assets/")) {
    return trimmed;
  }

  const imagePath = normalizeImagePath(trimmed);
  if (!imagePath || imagePath === trimmed) {
    return trimmed;
  }

  return `${S3_IMAGE_BASE_URL}/${imagePath}`;
};
