import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COVER = path.join(ROOT, 'src', 'assets', 'books', 'disqualified-cover.jpg');
const OUT = path.join(ROOT, 'public', 'og', 'disqualified.jpg');
const WIDTH = 1200;
const HEIGHT = 630;
const COVER_HEIGHT = 550;
const COVER_WIDTH = Math.round((COVER_HEIGHT * 1600) / 2560);

const text = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${WIDTH}" height="6" fill="#D7192F"/>
  <text x="520" y="200" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="74" fill="#E9E6DF" letter-spacing="1">DISQUALIFIED</text>
  <text x="522" y="262" font-family="Arial, sans-serif" font-size="29" fill="#E9E6DF" opacity="0.85">From Financially Clueless to Financially Free,</text>
  <text x="522" y="300" font-family="Arial, sans-serif" font-size="29" fill="#E9E6DF" opacity="0.85">One Hard Lesson at a Time</text>
  <rect x="522" y="340" width="72" height="5" fill="#D7192F"/>
  <text x="522" y="400" font-family="Arial, sans-serif" font-size="27" fill="#E9E6DF" opacity="0.7">A memoir that teaches money.</text>
  <text x="522" y="440" font-family="Arial, sans-serif" font-size="27" fill="#E9E6DF" opacity="0.7">PDF + EPUB, delivered instantly.</text>
  <text x="522" y="545" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="26" fill="#D7192F">LUKE VASILION</text>
</svg>`;

sharp(COVER)
  .resize(COVER_WIDTH, COVER_HEIGHT)
  .toBuffer()
  .then((cover) =>
    sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#0a0a0a' } })
      .composite([
        { input: cover, left: 100, top: Math.round((HEIGHT - COVER_HEIGHT) / 2) },
        { input: Buffer.from(text), left: 0, top: 0 },
      ])
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(OUT),
  )
  .then((info) => console.log(`wrote ${OUT} (${info.width}x${info.height}, ${info.size} bytes)`));
