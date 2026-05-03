#!/usr/bin/env node
// One-shot: paint over the sparkle/star artifact in the bottom-right of banner.png.
// The sparkle sits on a relatively uniform dark area, so a feathered black blob
// blends without visible patching.
//
//   node scripts/clean-banner.mjs
//
// Re-runnable. Idempotent — running twice just paints over the already-clean spot.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANNER = path.resolve(__dirname, '..', 'src', 'assets', 'banner.png');

// Banner is 1248x832. Sparkle sits in bottom-right around the bear's hindquarters.
// Target a 200x200 feathered patch centered at roughly (1080, 695).
const PATCH_SIZE = 220;
const CENTER_X = 1085;
const CENTER_Y = 700;

const overlay = `<svg width="${PATCH_SIZE}" height="${PATCH_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="1"/>
      <stop offset="55%" stop-color="#000" stop-opacity="0.98"/>
      <stop offset="80%" stop-color="#000" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${PATCH_SIZE}" height="${PATCH_SIZE}" fill="url(#g)"/>
</svg>`;

const left = Math.max(0, CENTER_X - Math.floor(PATCH_SIZE / 2));
const top = Math.max(0, CENTER_Y - Math.floor(PATCH_SIZE / 2));

const cleaned = await sharp(BANNER)
  .composite([
    {
      input: Buffer.from(overlay),
      top,
      left,
      blend: 'over',
    },
  ])
  .png()
  .toBuffer();

await sharp(cleaned).toFile(BANNER);

const meta = await sharp(BANNER).metadata();
console.log(`✓ banner.png cleaned (${meta.width}x${meta.height}). Patch at (${CENTER_X}, ${CENTER_Y}) radius ${PATCH_SIZE / 2}.`);
