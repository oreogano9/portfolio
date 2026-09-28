import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "site-output");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Album photographs are served by CloudFront, never bundled with the site.
const entries = [
  "admin", "albums", "assets", "blog", "data", "fonts", "index",
  "portfolio", "script", "splash", "admin-login.html", "index.html", "styles.css",
];
for (const entry of entries) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}
console.log("Built site-output without local album photographs.");
