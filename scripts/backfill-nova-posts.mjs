#!/usr/bin/env node
// Backfills the unycross.com Nova dev blog posts into this site's content collection.
// Reads each TS post file, extracts the Post object via regex, writes equivalent
// markdown files into src/content/blog/. Idempotent — re-runs overwrite cleanly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR =
  'C:/Users/lukev/OneDrive/Desktop/Projects/UnycrossLLC-Angular/unycross-llc/src/app/pages/blog/posts';
const OUT_DIR = path.resolve(__dirname, '..', 'src', 'content', 'blog');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const files = fs
  .readdirSync(SRC_DIR)
  .filter((f) => /^\d+-.+\.ts$/.test(f))
  .sort();

function extractStringLiteral(source, fieldName) {
  // Matches `fieldName: '...'` or `fieldName: "..."`
  const re = new RegExp(`${fieldName}:\\s*(['\"])((?:\\\\.|[^\\\\])*?)\\1`);
  const m = source.match(re);
  if (!m) return null;
  return m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function extractMultilineString(source, fieldName) {
  // Handles strings that may span multiple lines using single OR double quotes,
  // OR template literals concatenated with +. We keep it simple: try string first.
  const single = extractStringLiteral(source, fieldName);
  if (single !== null) return single;
  // Fallback: try a "+" concatenation pattern across lines.
  const concatRe = new RegExp(
    `${fieldName}:\\s*([\\s\\S]*?),\\s*(?:tags|date|slug|title|summary|body|readMinutes):`
  );
  const m = source.match(concatRe);
  if (!m) return null;
  // Strip quotes and concatenation + sign + leading/trailing whitespace
  const raw = m[1]
    .replace(/^[\s'"`+]+/, '')
    .replace(/[\s'"`+]+$/, '')
    .replace(/['"`]\s*\+\s*['"`]/g, '');
  return raw;
}

function extractTags(source) {
  const m = source.match(/tags:\s*\[([^\]]*)\]/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function extractInt(source, fieldName) {
  const m = source.match(new RegExp(`${fieldName}:\\s*(\\d+)`));
  return m ? parseInt(m[1], 10) : null;
}

function extractBody(source) {
  // Body is a template literal: body: `...`
  // Find `body:` then the opening backtick, then collect until matching unescaped backtick.
  const start = source.indexOf('body:');
  if (start === -1) return null;
  const tickStart = source.indexOf('`', start);
  if (tickStart === -1) return null;
  let i = tickStart + 1;
  let buf = '';
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\' && i + 1 < source.length) {
      // Escape sequence — keep next char literal
      const next = source[i + 1];
      if (next === '`') {
        buf += '`';
        i += 2;
        continue;
      }
      if (next === '$') {
        buf += '$';
        i += 2;
        continue;
      }
      if (next === '\\') {
        buf += '\\';
        i += 2;
        continue;
      }
      // Generic escape: keep both chars
      buf += ch + next;
      i += 2;
      continue;
    }
    if (ch === '`') break;
    buf += ch;
    i += 1;
  }
  return buf;
}

function yamlEscape(s) {
  if (s == null) return '""';
  // YAML double-quoted string escapes
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function writePost(meta, body, outFile) {
  const lines = [
    '---',
    `title: ${yamlEscape(meta.title)}`,
    `date: ${meta.date}`,
    `summary: ${yamlEscape(meta.summary)}`,
    `category: nova-dev`,
    `tags: [${meta.tags.map((t) => `"${t}"`).join(', ')}]`,
    `readMinutes: ${meta.readMinutes}`,
    '---',
    '',
    body.trim(),
    '',
  ];
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
}

let count = 0;
for (const file of files) {
  const fullPath = path.join(SRC_DIR, file);
  const source = fs.readFileSync(fullPath, 'utf8');

  const slug = extractStringLiteral(source, 'slug');
  const title = extractMultilineString(source, 'title');
  const date = extractStringLiteral(source, 'date');
  const summary = extractMultilineString(source, 'summary');
  const tags = extractTags(source);
  const readMinutes = extractInt(source, 'readMinutes') ?? 5;
  const body = extractBody(source);

  if (!slug || !title || !date || !summary || !body) {
    console.warn(`[skip] ${file}: missing field(s)`);
    continue;
  }

  const outFile = path.join(OUT_DIR, `${slug}.md`);
  writePost({ title, date, summary, tags, readMinutes }, body, outFile);
  console.log(`✓ ${slug}`);
  count += 1;
}

console.log(`\n${count} posts written to ${OUT_DIR}`);
