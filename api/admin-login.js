export const config = {
  runtime: "nodejs",
};

import crypto from "node:crypto";

const SESSION_COOKIE = "kp_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

const base64url = (value) => Buffer.from(value).toString("base64url");

const sign = (payload, secret) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");

const safeNextPath = (value) => {
  const next = String(value || "/admin/");
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\n") && !next.includes("\r") ? next : "/admin/";
};

const parseBody = async (request) => {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (request.headers?.["content-type"]?.includes("application/json")) {
    return JSON.parse(text || "{}");
  }
  return Object.fromEntries(new URLSearchParams(text));
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_AUTH_SECRET;
  if (!password || !secret) {
    return response.status(500).json({ error: "Missing admin auth environment variables" });
  }

  const body = await parseBody(request);
  const next = safeNextPath(body.next);
  const submittedPassword = String(body.password || "");
  const passwordBuffer = Buffer.from(password);
  const submittedBuffer = Buffer.from(submittedPassword);
  const valid =
    passwordBuffer.length === submittedBuffer.length && crypto.timingSafeEqual(passwordBuffer, submittedBuffer);

  if (!valid) {
    return response.status(401).send("Invalid password");
  }

  const payload = base64url(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    })
  );
  const token = `${payload}.${sign(payload, secret)}`;
  const secure = request.headers?.["x-forwarded-proto"] === "https" || process.env.VERCEL === "1";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
  );
  response.writeHead(303, { Location: next });
  response.end();
}
