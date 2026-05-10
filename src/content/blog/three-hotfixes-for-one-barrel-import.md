---
title: "Three hotfixes for one barrel import: Web Lookup goes to prod"
date: 2026-05-10
summary: "Pillar B 1.1 shipped: members can now research tickers on their phones. The squash-merge to main built clean, deployed clean, and 500'd on first request with ERR_MODULE_NOT_FOUND: playwright. Two hotfixes failed before the real one landed."
category: nova-dev
tags: ["nova", "war-story", "architecture", "lookup"]
readMinutes: 8
---

<p>The Web Lookup port shipped last night. Pillar B 1.1 done. Nova members on phones can finally research tickers without leaving the app &mdash; same chart, same scoring, same smart-money markers, port of the desktop Lookup down to mobile width. PR #71 squash-merged to main as <code>b347266</code>. Vercel auto-deploys main on push.</p>

<p>Then runtime exploded.</p>

<h2>CI green, prod red</h2>

<p>The squash-merge was clean. <code>pnpm build</code> ran locally without complaint. Vercel's build picked up the push, ran its own <code>next build</code>, finished green. Deploy went through. The <code>/lookup/[symbol]</code> route 500'd on first request with <code>ERR_MODULE_NOT_FOUND: playwright</code>.</p>

<p>Playwright doesn't ship to web. Web has no use for playwright. Web's bundle should not contain a single byte of playwright code. The fact that a Next.js serverless function on Vercel was trying to load playwright at runtime was the surprise.</p>

<h2>Hotfix 1: tracing excludes</h2>

<p>First attempt was the obvious one. Next.js's <code>outputFileTracingExcludes</code> in <code>next.config.mjs</code> tells the build to drop specific modules from the per-route trace it bundles into each serverless function. Dropped electron, playwright, electron-builder, esbuild, sharp, plus the entire <code>apps/desktop</code> and <code>apps/ui</code> directories. Commit <code>a00c3e7</code>. Build succeeded. Runtime threw the same error.</p>

<h2>Hotfix 2: webpack alias stubs</h2>

<p>Second attempt: tell webpack to stub out the offending modules at compile time. <code>config.resolve.alias = { ...alias, playwright: false, electron: false }</code>. Setting an alias to <code>false</code> in webpack-land means "resolve this import as the empty module." Commit <code>9517d12</code>. Build succeeded. Runtime threw the same error.</p>

<p>The stubs were too late. Some path in the dependency graph was importing playwright before webpack's alias rules took effect &mdash; a server-side import that bypassed the bundler's resolution entirely. The bundle had the alias applied where webpack could see it; the runtime path didn't.</p>

<h2>The actual fix</h2>

<p><code>apps/web/lib/data/lookup.ts</code> imports from <code>@nova/core</code>. The barrel.</p>

<p>The <code>@nova/core</code> barrel re-exports everything in <code>packages/core/src/index.ts</code>. That includes <code>./clickcapital/*</code> (uses playwright for headless browser scraping of ClickCapital portfolios), <code>./voice/*</code> (uses cartesia and whisper for voice synthesis and transcription), the full agent / skills surface, and a half-dozen other modules that target the desktop runtime where Electron and native binaries live.</p>

<p>Even though <code>lookup.ts</code> only references the screener exports, the bundler statically analyzes the barrel and pulls in everything reachable through it. Tree-shaking helps with unused values, but module-level side effects (dynamic imports inside a re-exported module, top-level <code>require</code> calls in a transitive dep) still fire. Tracing excludes and webpack aliases are blunt instruments &mdash; they tell the bundler what not to bundle, but they don't tell the source what not to ask for.</p>

<p>The fix is a subpath import. Added an explicit export to <code>packages/core/package.json</code>:</p>

<pre><code>"exports": {
  ".": "./src/index.ts",
  "./screener": "./src/screener/index.ts"
}
</code></pre>

<p>Then changed the import in <code>apps/web/lib/data/lookup.ts</code> from <code>@nova/core</code> to <code>@nova/core/screener</code>. The subpath maps directly to <code>./src/screener/index.ts</code>. The bundler doesn't see the barrel; it sees the screener module and its real dependencies. Playwright never enters the trace. Voice never enters the trace. The Vercel serverless function bundle is what it should be.</p>

<p>Commit <code>f139afe</code>. Build succeeded. Runtime worked.</p>

<h2>What this means for the rest of the web app</h2>

<p><code>@nova/core</code> is the shared package the desktop app and the web app both depend on. The desktop app pulls the barrel because it wants the whole surface &mdash; every IPC handler, every skill, every data fetcher. The web app needs slices: screener for Lookup, insiders / congress / 13F for the smart-money tables, fund-quality scoring for ETF pages, and a few utilities. Importing the barrel everywhere on web is how playwright ends up in a serverless function.</p>

<p>The pattern, banked: any package shared between two runtimes with different native-dep requirements needs an exports map with explicit subpaths, and the consumer with the narrower runtime imports only those subpaths. Barrel = whole package = whole runtime requirement. Subpath = a slice = the slice's runtime requirement.</p>

<p>Future-self touching <code>apps/web/lib/data/</code>: import from <code>@nova/core/screener</code>, <code>@nova/core/insiders</code>, <code>@nova/core/congress</code>, <code>@nova/core/thirteenf</code>, <code>@nova/core/fund-quality</code>. Add a new subpath when web needs a new module. Don't reach for the barrel. The tracing excludes and the webpack alias stubs from hotfixes 1 and 2 are still in <code>next.config.mjs</code> as belt-and-suspenders, but the subpath import is what actually keeps the runtime clean.</p>

<h2>What actually shipped</h2>

<p>The feature that all that hotfixing protected, in one paragraph: <code>/lookup/[symbol]</code> route, mobile + desktop responsive, tier-gated. <code>lightweight-charts</code> parity with the desktop chart &mdash; candles, EMA cloud, 200-week MA, VWAP, RSI, volume, earnings hex badges with click-to-popover, insider / congress / 13F arrow markers with per-day rollup and USD-weighted sizing and hover tooltips, timeframe picker. Five-tab right rail: Details (12-layer score breakdown, key stats, Wall Street consensus, fundamentals, valuation vs 5y, Nova Fair Value SVG gauge, buy-and-hold returns, options flow, fund profile for ETFs, thesis), News, Earnings, Filings, Insider &mdash; accordion-style on mobile. SmartMoneyStrip below the chart. Top-nav symbol search backed by Yahoo, debounced and AbortController-race-safe so stale responses can't overwrite fresh ones. Mobile search modal. PWA install &mdash; Android native prompt path, iOS three-step instruction bottom-sheet (Safari has no JS install API). A <code>--color-bone-mute</code> bump from <code>#7a7a78</code> to <code>#b8b8b5</code> for AA contrast.</p>

<p>Members paying for the platform can now research tickers on their phones. That's the gap 1.1 was supposed to close.</p>

<p>Slice 1.2 is Web Screener &mdash; same data, sortable table, click a row to land on Lookup. The hotfix lessons should make it shorter than 1.1 was.</p>
