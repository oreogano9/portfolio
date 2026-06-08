import { next } from "@vercel/functions";

const SESSION_COOKIE = "kp_admin_session";

const textEncoder = new TextEncoder();

const base64urlToBytes = (value) => {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const bytesToBase64url = (bytes) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const timingSafeEqual = (left, right) => {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
};

const getCookie = (request, name) => {
  const cookieHeader = request.headers.get("cookie") || "";
  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
};

const sign = async (payload, secret) => {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return bytesToBase64url(new Uint8Array(signature));
};

const getAdminPassword = () => process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || process.env.KP_ADMIN_PASSWORD || "";

const getAuthSecret = () => process.env.ADMIN_AUTH_SECRET || getAdminPassword();

const hasValidSession = async (request) => {
  const secret = getAuthSecret();
  if (!secret) {
    return false;
  }
  const token = getCookie(request, SESSION_COOKIE);
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) {
    return false;
  }
  try {
    const expected = await sign(payload, secret);
    if (!timingSafeEqual(base64urlToBytes(signature), base64urlToBytes(expected))) {
      return false;
    }
    const parsed = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload)));
    return Number(parsed.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

const isApiRequest = (pathname) =>
  pathname.startsWith("/api/admin-") || pathname === "/api/update-photo-library" || pathname === "/api/save-photo-library";

export default async function middleware(request) {
  const url = new URL(request.url);
  if (await hasValidSession(request)) {
    return next();
  }
  if (isApiRequest(url.pathname)) {
    return new Response(JSON.stringify({ error: "Admin authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const loginUrl = new URL("/admin-login.html", request.url);
  loginUrl.searchParams.set("next", `${url.pathname}${url.search}`);
  return Response.redirect(loginUrl, 303);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin-add-photos-to-album",
    "/api/admin-delete-s3-objects",
    "/api/admin-sign-s3-upload",
    "/api/update-photo-library",
    "/api/save-photo-library",
  ],
};
