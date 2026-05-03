#!/usr/bin/env node
// Generates static images that need to live in /public (OG card, apple-touch-icon)
// from the in-repo source assets. Run when the source assets change.
//
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

// 1. OG card — 1200×630, banner cover-fitted with black padding
await sharp(BANNER)
  .resize(1200, 630, {
    fit: 'cover',
    position: 'centre',
    background: { r: 0, g: 0, b: 0, alpha: 1 },
  })
  .png({ quality: 88, compressionLevel: 9 })
  .toFile(path.join(PUBLIC_DIR, 'og-default.png'));
console.log('✓ og-default.png (1200×630)');

// 2. Apple touch icon — 180×180, logo on black with padding
const padding = 20;
const inner = 180 - padding * 2;
const logoBuf = await sharp(LOGO)
  .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

await sharp({
  create: {
    width: 180,
    height: 180,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 1 },
  },
})
  .composite([{ input: logoBuf, top: padding, left: padding }])
  .png()
  .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
console.log('✓ apple-touch-icon.png (180×180)');

// 3. Android chrome icons — 192 + 512, same treatment as apple
for (const size of [192, 512]) {
  const innerSize = size - Math.floor(size * 0.11) * 2;
  const pad = Math.floor((size - innerSize) / 2);
  const buf = await sharp(LOGO)
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .composite([{ input: buf, top: pad, left: pad }])
    .png()
    .toFile(path.join(PUBLIC_DIR, `android-chrome-${size}x${size}.png`));
  console.log(`✓ android-chrome-${size}x${size}.png`);
}

// 4. Web manifest
const manifest = {
  name: 'Leaving The Matrix',
  short_name: 'LTM',
  icons: [
    { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
  ],
  theme_color: '#000000',
  background_color: '#000000',
  display: 'standalone',
};
fs.writeFileSync(path.join(PUBLIC_DIR, 'site.webmanifest'), JSON.stringify(manifest, null, 2));
console.log('✓ site.webmanifest');

console.log('\nStatic image build complete.');
