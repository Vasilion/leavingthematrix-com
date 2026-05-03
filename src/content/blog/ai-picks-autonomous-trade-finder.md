---
title: "AI Picks: an autonomous trade-finder, in seven cents per run"
date: 2026-04-30
summary: "Macro regime → AI slice selection → universe scan → backtest sweep → top-5 enrichment → AI thesis per pick. The full pipeline that turns 'screen the market' into one keystroke."
category: nova-dev
tags: ["nova", "screener", "ai", "finance"]
readMinutes: 8
---

<p>The screener I shipped last week was a tool I'd point. AI Picks is a tool that points itself. I press one button and ten seconds later there's a curated five-card view of the most interesting ideas in the U.S. market right now, with full theses and historical edge, costing about seven cents in tokens.</p>

<p>Same primitives. Different orchestration. Here's how the pipeline runs.</p>

<h2>Phase 1: macro regime</h2>

<p>Every run starts with a check of the current macro environment. <code>macro_regime</code> pulls a small set of FRED series — VIX, 2s/10s spread, ISM, financial-conditions index, real yields — and a few derived indicators (regime-shift detection on VIX, yield-curve direction). The output is a one-paragraph macro summary plus a tagged regime: <em>risk-on</em>, <em>risk-off</em>, <em>neutral</em>, <em>defensive</em>. Same data feeds as the screener's macro layer; this is just the standalone read.</p>

<p>Why start here? Because the slice you should screen depends on the regime. In risk-off you don't want momentum longs. In risk-on you don't want defensive shorts. The regime tag is an input to the next step.</p>

<h2>Phase 2: AI slice selection</h2>

<p>Universe selection used to mean "scan the S&P 500." That's lazy. The real question is: <em>given the current macro regime, what slice of the U.S. market is most likely to throw clean setups right now?</em></p>

<p>Phase 2 hands the macro summary, the regime tag, and a list of available slices to the active brain with one tool call: <code>select_universe_slice(macro)</code>. The slices are composable via a <code>UniverseSpec</code> DTO — sp500, sp400, sp600, r2000, r3000, ndx, all_us_liquid, optionally narrowed by sector, industry, or a liquidity floor. The model returns a <code>UniverseSpec</code>, the resolver expands it to a concrete list of tickers, and the scan begins.</p>

<p>This is the cheapest, most leveraged use of AI in the whole pipeline. The model isn't generating prose. It's making one structured decision: "given regime X, scan slice Y." The decision is logged so I can audit it later. Most of the time it's reasonable. Sometimes it surprises me — recently it picked <em>sp600 + healthcare + liquidity > $5M</em> in a defensive regime and the scan threw two clean shorts I'd have missed in a generic SPX sweep.</p>

<h2>Phase 3: scan with awaited backtest</h2>

<p>Same screener orchestrator from the previous post, run over the selected universe. New behavior: the backtest sweep is <em>awaited</em>, not deferred. Every idea that clears the confluence bar comes back with its <code>historicalEdge</code> already populated — the bucket's win rate, expectancy, average hold, exit-reason distribution. No "click to backtest" button on the AI Picks cards. The number is just there.</p>

<p>Awaiting the backtest cost me about 4 seconds on a 500-ticker sweep. Worth every millisecond. Once you see backtest stats next to every idea, evaluating them takes half the time.</p>

<h2>Phase 4: top-5 selection and enrichment</h2>

<p>The full scan typically returns 8–25 ideas. AI Picks ranks them by a composite of confluence × backtest expectancy × R:R, then keeps the top five. Each of those five gets enriched with:</p>

<ul>
  <li>News from the last 7 days (Yahoo + Benzinga + Seeking Alpha + Google News).</li>
  <li>Recent SEC filings (8-Ks, S-1s, 13Ds — anything that's likely to move price).</li>
  <li>Insider transactions (Finnhub if available; soft-fail to neutral).</li>
  <li>Reddit sentiment — top r/wallstreetbets and r/investing posts mentioning the ticker.</li>
  <li>Options unusual-activity flags from the existing options layer.</li>
  <li>Next earnings date with stale-data protection (more on that in the next post).</li>
</ul>

<p>Enrichment runs in parallel — five tickers, six fetchers each, all <code>Promise.all</code>'d. Disk caches under <code>{NOVA_VAULT_PATH}/cache/</code> mean repeat scans warm up quickly.</p>

<h2>Phase 5: AI thesis per pick</h2>

<p>Now we spend tokens. Each of the five enriched ideas goes into a <code>thesis-pro</code> generator. The model receives the screener layer scores, the levels, the historical edge stats, the news/filings/insider/sentiment summaries, the options flags, and the next earnings date. It returns:</p>

<ul>
  <li><code>narrative</code> — 3–4 sentences explaining the setup in prose.</li>
  <li><code>riskNotes</code> — what would invalidate it, beyond just hitting the technical stop.</li>
  <li><code>primaryCatalyst</code> — what to watch over the next 24–48 hours.</li>
  <li><code>invalidation</code> — the level or condition that says "thesis is dead."</li>
</ul>

<p>Two of those fields — <code>primaryCatalyst</code> and <code>invalidation</code> — used to be model-generated. They're now <strong>fully deterministic</strong>, built from <code>enrichment.earningsNext</code> + the top signal layer + the levels. The LLM only writes <code>narrative</code> and <code>riskNotes</code>. The reason: the model fabricated a date once, I caught it, I fixed the entire class of bug. That's the next post's story.</p>

<p>Every prompt has explicit date grounding ("Today is YYYY-MM-DD; do not invent dates not in the data"). Every output is post-validated by a regex that catches stale-year mentions and falls back to the deterministic template if it finds one. The model writes prose. The numbers and dates come from the data.</p>

<h2>Phase 6: persistence and UI</h2>

<p>The five picks land in the AI Picks tab as a curated five-card view, each with the full detail rail one click away. They also persist to the vault:</p>

<ul>
  <li><code>{vault}/Screener/AI-Picks/&lt;timestamp&gt;.json</code> — full pipeline output for posterity.</li>
  <li><code>{vault}/Screener/AI-Picks/Latest.md</code> — markdown render, opens cleanly in Obsidian.</li>
</ul>

<p>I can scroll back through last week's AI Picks the same way I scroll back through any other vault note. They link to the news items they cited. The graph view shows me which tickers have come up multiple times.</p>

<h2>Cost</h2>

<p>Token usage per run, on Sonnet:</p>

<ul>
  <li>Phase 2 slice selection: ~2K in / 200 out</li>
  <li>Phase 5 thesis × 5 picks: ~15K in / 1.2K out</li>
  <li>Total: ~17K in / 1.4K out — about <strong>$0.07 per run</strong> on Sonnet 4.6</li>
</ul>

<p>On the Anthropic Max router, it's <strong>$0</strong>. I run AI Picks several times a day at zero marginal cost, which has changed how I use it. It's no longer a "give me an answer" tool — it's a "what's the market like right now" check that I run between coffees.</p>

<h2>Quick prompts</h2>

<p>Ten curated quick prompts in the HUD. "Run AI Picks." "What does the macro regime look like?" "Show me the latest scan filtered to short setups only." "Open the top idea." Each one is a tool-call shortcut. They've replaced about 80% of my manual screener interaction.</p>

<h2>What I learned</h2>

<p>Two takeaways generalizable to any agent feature:</p>

<ul>
  <li><strong>Make the model do decisions, not data.</strong> Phase 2 is the model picking a slice. Phase 5 is the model writing prose around hard numbers. Anywhere a number is the answer, compute the number deterministically. The AI is for judgment, not arithmetic.</li>
  <li><strong>Cache aggressively before parallelizing.</strong> Disk caches for OHLC, sector tags, news. Without them, ten ticker enrichments × six fetchers each would hit Yahoo three thousand times an hour.</li>
</ul>

<p>One regret: I didn't make the pipeline observable enough on day one. When something goes wrong — a fetch fails, a thesis generates garbage — I'm still scrolling through dev.log to figure out which phase. A proper trace UI is on the list.</p>

<p>Next up: the date-hallucination story. The bug that proved Phase 5 needed to lock down its dates the hard way.</p>
