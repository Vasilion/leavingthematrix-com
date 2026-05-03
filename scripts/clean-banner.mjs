#!/usr/bin/env node
// Removes the small sparkle/star artifact in the bottom-right of banner.png by
// clone-stamping a clean patch of grid-floor texture (sampled from below the
// bull, at a verified-uniform region) over the sparkle position with a feathered
// alpha mask. Result blends with the surrounding texture instead of leaving
// a noticeable dark blob.
//
//   node scripts/clean-banner.mjs
//
// Idempotent — re-runs do nothing visible since the sparkle is already covered.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANNER = path.resolve(__dirname, '..', 'src', 'assets', 'banner.png');

// Target: sparkle CENTER is at (1180, 754) in the 1248x832 banner.
// Empirical sparkle bounding box (lum>150 pixels): approx (1135-1220) x (720-790).
// We size the patch to cover that with a small margin and tight feather.
const TARGET_X = 1180;
const TARGET_Y = 758;

// Source: clean grid-floor texture below the bull, verified max-luminance < 100.
const SOURCE_X = 200;
const SOURCE_Y = 720;

// Bigger patch with tighter feather: inner 80% fully opaque, only outer 20% fades.
const PATCH_W = 120;
const PATCH_H = 110;

// Extract clean source texture
const cleanPatch = await sharp(BANNER)
  .extract({ left: SOURCE_X, top: SOURCE_Y, width: PATCH_W, height: PATCH_H })
  .toBuffer();

// Feathered alpha mask: opaque inner 80%, only the outer 20% fades to zero.
// dest-in keeps the destination (clean texture) only where the mask is opaque.
const mask = `<svg width="${PATCH_W}" height="${PATCH_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="m" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="80%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${PATCH_W}" height="${PATCH_H}" fill="url(#m)"/>
</svg>`;

const featheredPatch = await sharp(cleanPatch)
  .ensureAlpha()
  .composite([{ input: Buffer.from(mask), blend: 'dest-in' }])
  .png()
  .toBuffer();

// Composite the feathered clean patch over the original at the sparkle position.
const left = TARGET_X - Math.floor(PATCH_W / 2);
const top = TARGET_Y - Math.floor(PATCH_H / 2);

const result = await sharp(BANNER)
  .composite([{ input: featheredPatch, top, left, blend: 'over' }])
  .png()
  .toBuffer();

await sharp(result).toFile(BANNER);

// Verify the sparkle pixel is no longer near-white.
const { data, info } = await sharp(BANNER).raw().toBuffer({ resolveWithObject: true });
const i = (TARGET_Y * info.width + TARGET_X) * info.channels;
const px = [data[i], data[i + 1], data[i + 2]];
console.log(`✓ banner.png cleaned. Pixel at (${TARGET_X}, ${TARGET_Y}) now: [${px.join(', ')}]`);
console.log(`  Source: clean grid-floor texture from (${SOURCE_X}, ${SOURCE_Y}) ${PATCH_W}x${PATCH_H}`);
console.log(`  Target: composited at (${left}, ${top}) with feathered alpha`);
