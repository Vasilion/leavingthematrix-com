// One-off brand-asset generator. Reads src/assets/logo.png (white-stroke
// bull/bear + LEAVING THE MATRIX wordmark) and produces:
//
//   - Favicon PNGs at 16/32/48/180/192/512 — logo on dark bg
//   - OG / Twitter share cards at 1200x630 — logo centered on dark canvas
//
// Output:
//   - leavingthematrix-com/public/<file>      (LTM site)
//   - AI-Assistant/apps/web/app/<file>        (Nova web — Next.js conventions)
//   - AI-Assistant/apps/web/public/<file>     (Nova web — fallback / legacy)
//
// Run from leavingthematrix-com root:
//   node scripts/generate-brand-assets.mjs

import sharp from "sharp";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SRC_LOGO = path.join(root, "src/assets/logo.png");

const LTM_PUBLIC = path.join(root, "public");
const NOVA_ROOT = path.resolve(root, "../AI-Assistant");
const NOVA_APP = path.join(NOVA_ROOT, "apps/web/app");
const NOVA_PUBLIC = path.join(NOVA_ROOT, "apps/web/public");

if (!existsSync(SRC_LOGO)) {
  console.error("missing source logo:", SRC_LOGO);
  process.exit(1);
}
if (!existsSync(NOVA_ROOT)) {
  console.error("missing Nova repo:", NOVA_ROOT);
  process.exit(1);
}

await mkdir(LTM_PUBLIC, { recursive: true });
await mkdir(NOVA_APP, { recursive: true });
await mkdir(NOVA_PUBLIC, { recursive: true });

// Brand colors
const INK_900 = { r: 10, g: 10, b: 13, alpha: 1 };

// --- Favicon: dark square with logo centered (90% width, vertically centered) ---
async function makeFavicon(size, outFile) {
  const padding = Math.round(size * 0.1);
  const innerSize = size - padding * 2;

  const logo = await sharp(SRC_LOGO)
    .resize(innerSize, innerSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: INK_900,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(outFile);
}

// --- OG / Twitter card: 1200x630, dark canvas with logo centered, subtle accent ---
async function makeShareCard(outFile) {
  const W = 1200;
  const H = 630;

  // Logo at ~55% of card width, vertically centered
  const logoW = Math.round(W * 0.55);
  const logo = await sharp(SRC_LOGO)
    .resize(logoW, null, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const { height: logoH } = await sharp(logo).metadata();

  // SVG accent: top + bottom signal-mint hairlines + soft radial glow
  const accentSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#00ffc6" stop-opacity="0.10"/>
      <stop offset="60%" stop-color="#00ffc6" stop-opacity="0.0"/>
    </radialGradient>
    <linearGradient id="hair" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00ffc6" stop-opacity="0"/>
      <stop offset="50%" stop-color="#00ffc6" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#00ffc6" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="2" fill="url(#hair)"/>
  <rect x="0" y="${H - 2}" width="${W}" height="2" fill="url(#hair)"/>
</svg>
`);

  await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: INK_900,
    },
  })
    .composite([
      { input: accentSvg, top: 0, left: 0 },
      {
        input: logo,
        top: Math.round((H - (logoH ?? 0)) / 2),
        left: Math.round((W - logoW) / 2),
      },
    ])
    .png()
    .toFile(outFile);
}

const FAVICON_SIZES = [
  { size: 16, name: "favicon-16x16.png" },
  { size: 32, name: "favicon-32x32.png" },
  { size: 48, name: "favicon-48x48.png" },
  { size: 180, name: "apple-touch-icon.png" },
  { size: 192, name: "android-chrome-192x192.png" },
  { size: 512, name: "android-chrome-512x512.png" },
];

console.log("Generating LTM brand assets...");
for (const f of FAVICON_SIZES) {
  const out = path.join(LTM_PUBLIC, f.name);
  await makeFavicon(f.size, out);
  console.log("  wrote", path.relative(root, out));
}
await makeShareCard(path.join(LTM_PUBLIC, "og-default.png"));
console.log("  wrote public/og-default.png");
await makeShareCard(path.join(LTM_PUBLIC, "twitter-card.png"));
console.log("  wrote public/twitter-card.png");

console.log("Generating Nova web brand assets...");
// Next.js App Router conventions in apps/web/app/
const NOVA_APP_FILES = [
  // Next picks these up as <link rel="icon"> automatically by file name.
  { size: 32, name: "icon.png" },
  { size: 180, name: "apple-icon.png" },
];
for (const f of NOVA_APP_FILES) {
  const out = path.join(NOVA_APP, f.name);
  await makeFavicon(f.size, out);
  console.log("  wrote", path.relative(NOVA_ROOT, out));
}
// OG + Twitter live in /app as well — Next auto-wires them into metadata.
await makeShareCard(path.join(NOVA_APP, "opengraph-image.png"));
console.log("  wrote apps/web/app/opengraph-image.png");
await makeShareCard(path.join(NOVA_APP, "twitter-image.png"));
console.log("  wrote apps/web/app/twitter-image.png");

// Also place legacy public/ favicons for compatibility (browsers that hit /favicon.ico etc).
const NOVA_PUBLIC_FILES = [
  { size: 16, name: "favicon-16x16.png" },
  { size: 32, name: "favicon-32x32.png" },
  { size: 192, name: "android-chrome-192x192.png" },
  { size: 512, name: "android-chrome-512x512.png" },
];
for (const f of NOVA_PUBLIC_FILES) {
  const out = path.join(NOVA_PUBLIC, f.name);
  await makeFavicon(f.size, out);
  console.log("  wrote", path.relative(NOVA_ROOT, out));
}

// Copy the existing favicon.ico (LTM's already correct ICO) into Nova so
// /favicon.ico requests resolve. We leave LTM's .ico untouched — sharp can't
// produce .ico files.
const LTM_ICO = path.join(LTM_PUBLIC, "favicon.ico");
const NOVA_ICO = path.join(NOVA_PUBLIC, "favicon.ico");
if (existsSync(LTM_ICO)) {
  await copyFile(LTM_ICO, NOVA_ICO);
  console.log("  copied favicon.ico to apps/web/public/");
}

console.log("Done.");
