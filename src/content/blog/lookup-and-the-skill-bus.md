---
title: "Lookup, Cmd+K, and the skill-bus pattern"
date: 2026-05-01
summary: "A TradingView-style symbol panel, a global Cmd+K palette, and a small architectural pattern that lets skills broadcast renderer events without becoming Electron-aware."
category: nova-dev
tags: ["nova", "skills", "ux"]
readMinutes: 6
---

<p>For a couple of months, "pull up a ticker quickly" was the gap in Nova. The screener is a screener — it ranks the market, it doesn't show you a single symbol cleanly. The chat is a chat — it can answer questions about a ticker, but it's not where I want to <em>see</em> a chart and three news items and the next earnings date at a glance. So I built Lookup.</p>

<p>Lookup is a TradingView-style ticker panel that lives as a top-level dashboard tab between Screener and Calendar. Search, autocomplete, key-stats strip, big chart in the center, right rail for News / Filings / Insider / Earnings / Watchlist. Type a ticker, see the picture. Twenty hours of build, including the global keyboard palette and the skill-bus pattern that I'll spend the rest of this post on.</p>

<h2>Search that finds anything</h2>

<p>The screener's universe is vendored — concrete JSON files for sp500 / sp400 / sp600 / ndx / r2000 / r3000. Fast to scan, but capped to U.S. constituents I've curated. For Lookup I needed something broader. If I type "UBER" I want it to work, even though Uber isn't in any of the screener's constituent sets.</p>

<p>Yahoo's <code>query1.finance.yahoo.com/v1/finance/search</code> turned out to be the right primitive. It's free, no auth required, returns a clean JSON list of equities matching either symbol or company name. Type "uber" → matches UBER. Type "rocket lab" → matches RKLB. Both shapes work.</p>

<p>The autocomplete is debounced at 200ms — fast enough to feel live, slow enough that I'm not hammering the endpoint mid-typing. Results render in a popover under the search box. Arrow keys navigate, Enter selects, Esc closes.</p>

<h2>The right-rail tabs</h2>

<p>Five tabs, each backed by a fetcher I already had from the screener:</p>

<ul>
  <li><strong>Watchlist</strong> — toggleable add/remove. State persists to <code>{vault}/Lookup/state.json</code>.</li>
  <li><strong>News</strong> — <code>fetchNews</code> across the same multi-source RSS aggregator the screener uses.</li>
  <li><strong>Filings</strong> — <code>fetchFilings</code> against SEC EDGAR.</li>
  <li><strong>Insider</strong> — <code>fetchInsider</code> via Finnhub when a key is set, soft-fail otherwise.</li>
  <li><strong>Earnings</strong> — <code>fetchNextEarnings</code> with the same stale-data filter that nearly bit me last week.</li>
</ul>

<p>Reusing the screener's fetchers was the single biggest accelerator on this build. New IPC namespace (<code>nova.lookup.*</code>), new shared DTOs (<code>packages/shared/src/lookup.ts</code>), new UI (<code>LookupPanel.tsx</code>) — but every actual data call was already battle-tested code from the screener. I touched 13 workspaces and didn't add a single new HTTP fetcher.</p>

<h2>Cmd+K from anywhere</h2>

<p><code>Ctrl+K</code> (Cmd+K on macOS, when I get there) opens a global palette overlay. It's the same Yahoo search, same autocomplete, but it floats in front of whatever tab I'm on, including chat. Pick a result and it routes me into Lookup with the symbol pre-loaded.</p>

<p>The shortcut is registered through Electron's <code>globalShortcut</code> API and works even when Nova isn't focused. So I can be in Cursor, hit <code>Ctrl+K</code> twice (once to focus Nova, once to open the palette — actually, no: I wired focus into the same shortcut so one press does both), type a ticker, hit Enter, and the chart's already up by the time my eyes finish moving.</p>

<p>The header also got a subtle watchlist count pill (★ N) that opens Lookup directly when clicked. Small touch, big actual usage.</p>

<h2>The skill-bus pattern</h2>

<p>Here's the architectural piece I'm proudest of on this build.</p>

<p>I want the chat agent to be able to say "show me UBER" and have the Lookup panel switch to UBER. That means the <code>lookup</code> skill — which is a Node-only package, no Electron, no IPC awareness — needs to broadcast something the renderer can hear.</p>

<p>The naive way: import Electron's <code>ipcMain</code> in the skill. Bad. Now the skill package depends on Electron, can't be tested in isolation, can't be imported by anything that isn't running inside the main process. I've worked hard to keep skill packages clean of platform leaks, and I wasn't going to break that for one feature.</p>

<p>The pattern I landed on:</p>

<pre><code>// packages/skills/lookup/src/events.ts
import { EventEmitter } from 'node:events';

export const lookupEvents = new EventEmitter();

// packages/skills/lookup/src/index.ts
export const skill: SkillDefinition = {
  id: 'lookup',
  // ...
  tools: {
    pull_up_symbol: {
      description: 'Open the Lookup panel with a specific ticker',
      parameters: z.object({ symbol: z.string() }),
      execute: async ({ symbol }) =&gt; {
        lookupEvents.emit('symbol-selected', symbol);
        return { ok: true, symbol };
      },
    },
  },
};</code></pre>

<p>The skill emits to a plain Node EventEmitter it owns. No Electron import. Nothing platform-specific. Now in the main process — which <em>is</em> Electron-aware — there's a small bridge:</p>

<pre><code>// apps/desktop/src/main/lookup-bridge.ts
import { lookupEvents } from '@nova/skill-lookup';
import { mainWindow } from './windows';

lookupEvents.on('symbol-selected', (symbol) =&gt; {
  mainWindow?.webContents.send('nova:lookup:symbol-selected', symbol);
});</code></pre>

<p>The bridge lives in the Electron layer, where it belongs. The skill stays pure. The renderer subscribes to the IPC event and the Dashboard switches tabs and seeds the symbol.</p>

<p>The trick generalizes: any skill that needs side-effects in the renderer can own its own EventEmitter and let an Electron-aware bridge do the IPC translation. The skill is testable. The bridge is thin. The contract between them is one event type per side-effect.</p>

<h2>The misroute that taught me about prompt hints</h2>

<p>First day after I shipped Lookup, "pull up UBER" in chat misrouted to <code>screener.scan_universe</code>. The model saw "pull" and "screener" had recently received the most prompt-tuning, so it picked the screener tool and started a sweep of UBER's industry. Wrong tool entirely.</p>

<p>Fix: explicit negative-space prompt hints on the lookup skill, contrasting it against screener:</p>

<pre><code>promptHints: `
  Use lookup.pull_up_symbol when the user asks to view, see, look at,
  or "pull up" a single ticker. This is a single-symbol view tool.
  Do NOT use screener.scan_universe for these phrases — that tool is
  for scanning the market for new ideas, not for displaying one symbol.
`</code></pre>

<p>Verbose. Effective. Models tune themselves around the words you actually use, not the words you wish you used. If two skills could plausibly answer the same phrase, you have to <em>tell</em> the model which one wins.</p>

<h2>Where Nova is now</h2>

<p>Three months in. Phases 0–2b shipped. Stock Screener and AI Picks shipped on top. Lookup shipped. Production builds carry the orb icon, the killChildTree fix, and the maximize-on-launch behavior. AI date-grounding is standard for every prose-generating call. Token cost on AI Picks is seven cents on Sonnet and zero on the Max router. <code>pnpm -r typecheck</code> clean across thirteen workspaces.</p>

<p>What's left from the original PLAN.md:</p>

<ul>
  <li>Phase 3 — wake-word ("Hey Nova") via Porcupine + always-on-top HUD window.</li>
  <li>Phase 4 — semantic memory (SQLite-backed embeddings + recall tools).</li>
  <li>Phase 5 — trunk skills (web-search, time/weather, fs-safe, app-launcher).</li>
  <li>Phase 6 — onboarding, installer polish, autostart.</li>
</ul>

<p>I'm aiming wake-word and HUD next. The current trigger is push-to-talk, which is fine when I'm at the desk and the wrong tool when I'm not. Once "Hey Nova" works reliably, this stops being a desktop app I open and starts being something I just talk to.</p>

<p>That'll be the next post. Until then — thanks for reading. If you're building something similar, my inbox is open.</p>
