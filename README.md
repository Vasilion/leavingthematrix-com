# leavingthematrix.com

Public site for **Leaving The Matrix** — investing education, signals, and community.

## Stack

- Astro 4 (static, content collections)
- Tailwind CSS v3
- Svelte (for interactive islands when needed)
- MDX (blog)
- Sharp (image optimization)
- Sitemap + RSS

## Develop

```sh
npm install
npm run dev
```

Default port 4321. Pass `--port <n>` if it conflicts with another vite-shaped tool you have running.

## Build

```sh
npm run build
npm run preview
```

## Deploy

Designed for Vercel. Push to the connected GitHub repo, Vercel handles the rest. Sitemap and RSS regenerate at build time.

## Content

Blog posts live in `src/content/blog/*.md(x)`. Frontmatter shape lives in `src/content/config.ts`:

```yaml
---
title: "..."
date: 2026-05-03
summary: "..."
category: "nova-dev" | "market-notes" | "education" | "trade-reviews" | "announcements"
tags: ["..."]
readMinutes: 7
draft: false
---
```

The `nova-dev` category is auto-fed by the `/nova-blog-update` skill — same source of truth as unycross.com, dual-published.
