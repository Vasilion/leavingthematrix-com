#!/usr/bin/env node
// Generates static images that need to live in /public from the in-repo source assets.
// Sources:
//   src/assets/banner.png (1248×832, the cyan-glow brand banner)
//   src/assets/logo.png   (the white-on-black logo)
//
// Outputs:
//   public/og-default.png            - 1200×630 social share card (banner cover-fit on black)
//   public/twitter-card.png          - 1200×600 (Twitter alt size, same composition)
//   public/favicon-16x16.png         - browser tab favicon
//   public/favicon-32x32.png         - browser tab favicon (higher dpi)
//   public/favicon-48x48.png         - browser shortcut/Windows tile
//   public/apple-touch-icon.png      - 180×180, logo on black with padding
//   public/android-chrome-192x192.png
//   public/android-chrome-512x512.png
//   public/site.webmanifest          - PWA manifest
//
// Re-run when source assets change:
//   node scripts/build-static-images.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BANNER = path.join(ROOT, 'src', 'assets', 'banner.png');
const LOGO = path.join(ROOT, 'src', 'assets', 'logo.png');
const PUBLIC_DIR = path.join(ROOT, 'public');

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// --- Helpers ----------------------------------------------------------

async function logoOnBlack(size, paddingRatio = 0.12) {
  // Composite logo (centered, padded) onto a solid black square.
  const inner = Math.floor(size * (1 - paddingRatio * 2));
  const pad = Math.floor((size - inner) / 2);
  const logoBuf = await sharp(LOGO)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: logoBuf, top: pad, left: pad }])
    .png({ compressionLevel: 9 });
}

// --- 1. Social share cards --------------------------------------------

await sharp(BANNER)
  .resize(1200, 630, {
    fit: 'cover',
    position: 'centre',
    background: { r: 0, g: 0, b: 0, alpha: 1 },
  })
  .png({ quality: 92, compressionLevel: 9 })
  .toFile(path.join(PUBLIC_DIR, 'og-default.png'));
console.log('✓ og-default.png (1200×630, banner cover)');

await sharp(BANNER)
  .resize(1200, 600, {
    fit: 'cover',
    position: 'centre',
    background: { r: 0, g: 0, b: 0, alpha: 1 },
  })
  .png({ quality: 92, compressionLevel: 9 })
  .toFile(path.join(PUBLIC_DIR, 'twitter-card.png'));
console.log('✓ twitter-card.png (1200×600, banner cover)');

// --- 2. Favicons (browser tab) ----------------------------------------
// Note: the logo composition (LEAVING THE MATRIX text + bull/bear) does not read
// well at 16×16 — the text becomes illegible. We give the small favicons a touch
// less padding so the bull/bear silhouettes are recognizable as a brand mark.

for (const size of [16, 32, 48]) {
  const padding = size <= 32 ? 0.06 : 0.08;
  await (await logoOnBlack(size, padding)).toFile(
    path.join(PUBLIC_DIR, `favicon-${size}x${size}.png`)
  );
  console.log(`✓ favicon-${size}x${size}.png`);
}

// --- 3. Apple touch icon + Android Chrome -----------------------------

await (await logoOnBlack(180, 0.11)).toFile(
  path.join(PUBLIC_DIR, 'apple-touch-icon.png')
);
console.log('✓ apple-touch-icon.png (180×180)');

for (const size of [192, 512]) {
  await (await logoOnBlack(size, 0.11)).toFile(
    path.join(PUBLIC_DIR, `android-chrome-${size}x${size}.png`)
  );
  console.log(`✓ android-chrome-${size}x${size}.png`);
}

// --- 4. SVG favicon (vector mark for modern browsers) -----------------
// A simplified, legible-at-16px abstraction of the logo: stylized bull silhouette
// + LTM monogram. Renders sharp at any size; modern browsers prefer this.

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="#000"/>
  <!-- Bull silhouette stylized as bold L+M angles -->
  <path d="M5 9.5L5 22.5L9 22.5L9 16L13 16L13 22.5L17 22.5L17 9.5L13 9.5L13 12.5L9 12.5L9 9.5Z" fill="#00ffc6"/>
  <path d="M19 9.5L19 22.5L23 22.5L23 14L26 22.5L27.5 22.5L27.5 9.5L24.5 9.5L24.5 17L21.5 9.5Z" fill="#00ffc6"/>
</svg>
`;
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), faviconSvg);
console.log('✓ favicon.svg (vector)');

// --- 5. Web manifest --------------------------------------------------

const manifest = {
  name: 'Leaving The Matrix',
  short_name: 'LTM',
  description:
    'Investing education, market signals, and a community of traders — from set-and-forget portfolios to monthly options gambles.',
  icons: [
    { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
  theme_color: '#000000',
  background_color: '#000000',
  display: 'standalone',
  start_url: '/',
};
fs.writeFileSync(
  path.join(PUBLIC_DIR, 'site.webmanifest'),
  JSON.stringify(manifest, null, 2)
);
console.log('✓ site.webmanifest');

console.log('\nStatic image build complete.');
