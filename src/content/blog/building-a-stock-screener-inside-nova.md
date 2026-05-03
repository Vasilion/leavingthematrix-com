---
title: "Building a stock screener inside Nova"
date: 2026-04-28
summary: "Multi-confluence ranked ideas, free-data-first, hybrid AI/template thesis, ATR-based levels, and a backtest engine that turns a chat tool into something I'd actually trade off of."
category: nova-dev
tags: ["nova", "screener", "finance"]
readMinutes: 8
---

<p>I've spent enough years staring at TradingView screeners to know what bugs me about them. They surface lots of names. They tell you almost nothing about why a name passed the filter. They certainly don't tell you whether names like this one have made money historically. And once you find a candidate, you bounce to a second tool to write the trade plan.</p>

<p>The stock screener was supposed to be a small Nova feature. It became one of the most ambitious things I've shipped this year — and the one I use every day.</p>

<h2>The pitch</h2>

<p>A screener that:</p>

<ul>
  <li>Ranks ideas by <strong>confluence</strong> across multiple independent layers — technical, fundamental, news/catalyst, options flow, social sentiment, macro regime.</li>
  <li>Is opinionated about <strong>direction</strong>: long or short, with the layers flipping accordingly.</li>
  <li>Generates a full <strong>trade plan</strong> per idea: entry, stop, target, risk-reward, primary catalyst, invalidation conditions.</li>
  <li>Backs every idea with <strong>historical backtest stats</strong>: setup-bucket win rate, avg R, expectancy, on a free-data daily-bar replay over five years.</li>
  <li>Costs <strong>nothing</strong> to run on day one. No paid data feeds. Free fallbacks for everything.</li>
</ul>

<p>That last constraint is what shaped most of the architecture.</p>

<h2>Free-data-first</h2>

<p>Paid market data is great. It's also a hard pre-condition that excludes 90% of users (and me, sometimes). So the first cut had to work with free sources only:</p>

<ul>
  <li><strong>OHLC daily bars:</strong> Yahoo Finance's <code>query1.finance.yahoo.com/v8/finance/chart</code>. (Stooq's history endpoint went paid mid-implementation, which I learned on the day I tried to use it. Yahoo took its place; the portfolio code still uses Stooq's quote endpoint, which remains free.)</li>
  <li><strong>Options chain:</strong> Yahoo, same domain.</li>
  <li><strong>News:</strong> Google News RSS aggregating across publishers, plus Yahoo, Benzinga, Seeking Alpha RSS feeds.</li>
  <li><strong>Filings:</strong> SEC EDGAR.</li>
  <li><strong>Insider transactions:</strong> Finnhub when <code>FINNHUB_API_KEY</code> is set; soft-fail to neutral score otherwise.</li>
  <li><strong>Social sentiment:</strong> StockTwits public message stream.</li>
  <li><strong>Macro regime:</strong> FRED.</li>
  <li><strong>Earnings calendar:</strong> Yahoo Finance.</li>
</ul>

<p>Every layer is wrapped in a small <code>Fetcher&lt;TKey, TValue&gt;</code> contract that keeps the public-API shape stable. The day I pay for a Polygon subscription, the only thing that changes is which fetcher I plug in. The rest of the stack — confluence math, levels, backtest, UI — doesn't move.</p>

<h2>Confluence and the directional flip</h2>

<p>Each layer scores from 0–100 in long mode. Confluence is a weighted average. An idea passes the bar at 65+, which is conservative enough that a typical S&P 500 sweep returns 8–25 names, not 200.</p>

<p>The interesting wrinkle: long-bias and short-bias share the same scaffolding. The technical layer detects directional setups (mean reversion long, mean reversion short, momentum continuation, breakout, breakdown — five buckets). The screener picks the primary direction per ticker, then evaluates each layer in that direction's polarity. A bearish news layer is a positive contribution to a short setup and a negative contribution to a long setup. Same code, different sign.</p>

<h2>Levels: ATR-based, R:R-gated</h2>

<p>For every ranked idea, the screener computes:</p>

<ul>
  <li><strong>Entry:</strong> last close (the "ideal" entry; UI shows current price too).</li>
  <li><strong>Stop:</strong> 1.5 × ATR from entry, clamped to the nearest support/resistance level if one exists within range.</li>
  <li><strong>Target:</strong> 2× the entry-to-stop distance (the 2R default), unless an obvious S/R level caps it sooner.</li>
  <li><strong>Risk-reward:</strong> the ratio.</li>
</ul>

<p>Important behavior change shipped with phase 2a: <strong>cards with R:R below 1.5 still surface, but they don't get a trade plan.</strong> The idea might still be informative; the trade just isn't worth it. This was a deliberate choice — I'd rather see the underwhelming setup than have the tool silently swallow it.</p>

<h2>Hybrid thesis: template by default, AI on demand</h2>

<p>This is the one design decision I'm most proud of.</p>

<p>An AI thesis on every card sounds great. It is also expensive (every name in a 25-result scan = 25 LLM calls) and unreliable (the model can fabricate a date or misread a chart and you have to babysit it). A pure-template thesis sounds boring. It is also free, fast, and grounded in real numbers.</p>

<p>So Nova does both:</p>

<ul>
  <li>Every card gets a <strong>deterministic template thesis</strong> — built from the actual signal layers, levels, primary catalyst from news, invalidation from levels. No LLM. Renders instantly. Numbers are guaranteed correct.</li>
  <li>Every card has an <strong>"Expand with AI" button</strong> — on click, the active brain rewrites the narrative and risk notes in prose, citing the same underlying data. Per-card, on demand. I pay for the AI thesis only on the names I'm actually about to take action on.</li>
</ul>

<p>The hybrid means a 30-result scan is a $0 cost most of the time. When I expand three of them with AI, that's three calls. Not 30. I'll never go back to expand-everything-by-default.</p>

<h2>Backtest engine</h2>

<p>"This setup looks good" is opinion. "This setup has 0.11R expectancy across 413 trades over the last 10 years" is decision-grade information. So I built a small backtest engine that replays the technical signal layer over Yahoo's daily bars.</p>

<p>The engine takes a setup bucket, walks each ticker's daily history, fires a synthetic trade every time the signal triggers <em>fresh</em> (only on threshold cross from below — re-entries are not counted), applies entry/stop/target via the same <code>levels.ts</code> code the live screener uses, and tracks exit reason. Slippage is 0.1% of price. Max-hold caps per bucket: 10 days for mean reversion, 40 for momentum, 40 for breakout, 30 for misc.</p>

<p>Smoke run on 10 large-caps × 10 years: 413 trades, +0.11R expectancy, average hold 10.4 days, timeout exits under 13% across buckets. That's not Renaissance Technologies. It's also not noise.</p>

<p>Caveats I'm explicit about: technical-only replay (other layers don't have history I can reconstruct cheaply); daily-bar slippage simplification; current S&P-500 survivorship bias because the universe list isn't time-aware. Every limitation is in <code>EDITORIAL.md</code>-style docs in the project. I want to know what the number means before I trust it.</p>

<h2>The UI</h2>

<p>Initial cards: ranked grid. Filter row across the top — direction, setup type, min R:R, min confluence, symbol search, has-trade-plan toggle, has-historical-edge toggle. Click a card and a side rail opens with full detail: layered scores with explanations, levels visualized, news links, options unusual-activity flags, a per-card backtest button (replay this exact setup over history with one click), expand-with-AI button.</p>

<p>The Watchlist tab and Dismissed tab in the side rail let me triage. Click a name to watchlist it, click a name to dismiss it. Both tabs show the same full card so I can revisit decisions.</p>

<p>Every Detail view embeds a <code>TradingViewChart</code> with default RSI/MACD/EMA studies. I tried to do per-instance EMA20/50/200 and learned the hard way that custom-length studies require the licensed TradingView Charting Library. Default-param studies it is.</p>

<h2>Persistence</h2>

<p>Every scan writes:</p>

<ul>
  <li><code>{vault}/Screener/scans/&lt;timestamp&gt;.json</code> — the full scan output.</li>
  <li><code>{vault}/Screener/last-scan.json</code> — pointer to the most recent.</li>
  <li><code>{vault}/Screener/Latest.md</code> — markdown summary, opens nicely in Obsidian.</li>
  <li><code>{vault}/Screener/state.json</code> — watchlist + dismissed list.</li>
</ul>

<p>So my scans are part of my Obsidian vault now. They show up in graph view. They link to news items. The data is on disk in plain text in a folder I picked. Same principle as everywhere else.</p>

<h2>What it shipped as</h2>

<p>One <code>screener</code> skill. Eleven tools. One IPC namespace. One Dashboard tab. <code>pnpm -r typecheck</code> clean across 13 workspaces. Full S&P 500 large-cap scan with all five layers in about ten seconds. Fits in the same chat agent that does my calendar and reads my notes.</p>

<p>And then a few days later I started thinking about whether the screener could run itself. Which is how AI Picks happened — the autonomous trade-finder, in the next post.</p>
