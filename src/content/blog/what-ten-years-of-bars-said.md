---
title: "What ten years of bars said about Nova Score"
date: 2026-05-02
summary: "Phase 7 closed the credibility loop on Nova Score by measuring how each zone has actually performed at +5d/+10d/+20d/+30d/+50d across the universe. The answer was uncomfortable."
category: nova-dev
tags: ["nova", "screener", "architecture"]
readMinutes: 8
---

<p>The <a href="/blog/three-audits-three-layers" target="_blank" rel="noopener">last post</a> closed with Phase 7 next: forward-return histograms per zone. The plan called it "closing the credibility loop on Nova Score." If the Buying zone doesn't actually outperform Neutral on forward returns, the zones are decoration. Phase 7 was the test.</p>

<p>Phase 7 shipped. Phase 7.5a shipped. The credibility loop closed. The answer was uncomfortable.</p>

<h2>Phase 7 — what we built</h2>

<p>The engine lives at <code>packages/core/src/screener/backtest/zone-stats.ts</code>. Walk every symbol bar-by-bar through ten years of OHLC. At each bar, compute the technical-only Nova Score, run it through <code>zoneOf</code>, and check whether the zone changed from the prior bar. If yes, that's a zone-entry event. Record the symbol's forward return at +5, +10, +20, +30, and +50 trading days. Aggregate per-zone × per-horizon: <code>n</code>, <code>avg%</code>, <code>median%</code>, win rate, best, worst.</p>

<p>Storage is a flat JSON file at <code>{vault}/Screener/zone-stats/{universe-slug}.json</code> with a 30-day staleness threshold (constant lives in <code>@nova/shared</code> so renderer and main agree). Three new IPC channels: <code>zoneStats.{get, compute, status}</code>. An in-process mutex serializes concurrent computes — there's only one of these per universe, no point racing.</p>

<p>The UI is a <code>ZoneStatsBlock</code> below the candlestick in Lookup. Five rows (one per zone, color-coded by the existing zone meta), five columns (one per horizon). Avg cell tinted green or red on sign. Hover surfaces median, best, and worst. A small "v1 · technical score" disclaimer chip in the header — because what came back next was specifically a v1 finding.</p>

<p>First production compute: S&amp;P 500 × ten years × 1d bars. 41 seconds wall time. <strong>236,547 zone-entry events.</strong> Cached.</p>

<h2>The headline finding</h2>

<p>Technical-only Nova Score has near-zero predictive edge across zones at every horizon I measured.</p>

<p>Win rate by zone × horizon, S&amp;P 500 × 10y:</p>

<ul>
  <li>5d: Buying barely beats Selling (53% vs 52%).</li>
  <li>10d: Buying 55%, Selling 53%.</li>
  <li>20d: Buying 56%, Selling 54%.</li>
  <li>30d: <strong>Selling 58%, Buying 57%.</strong></li>
  <li>50d: <strong>Selling 60%, Buying 58%.</strong></li>
</ul>

<p>And Distribution outperforms Buying at every horizon past 10d. The whole zone language was implying "Buying = good, Selling = bad" — empirically, on a technical-only score across a decade of S&amp;P 500 bars, that ordering inverts at the horizons most equity holders actually live at.</p>

<p>This was the entire reason Phase 7 existed. The plan's "Weight calibration" section had been waiting on data like this for six phases of weight tuning. Six phases of tuning by intuition, and the technical-only baseline turns out to be approximately a coin flip — biased <em>against</em> the score's own labeling at longer horizons.</p>

<p>Two ways to read it. One: the score is broken. Two: the score's technical-only proxy is doing roughly nothing, and the smart-money layers (insider, congress, 13F, regime) need to be doing real work for the live multi-layer score to mean anything. The next phase tests which.</p>

<h2>Phase 7.5a — the response</h2>

<p>Three things landed on the same branch (<code>feat/phase7.5-multilayer-replay</code>, PR #14, <code>b44c495</code>):</p>

<ol>
  <li>A two-axis storage key. Histograms now key on <code>(universe, scoreSource)</code> where <code>scoreSource</code> is <code>"technical"</code> or <code>"tech_thirteenf"</code>. Both coexist on disk for direct comparison; nothing recomputes that doesn't have to.</li>
  <li>Historical 13F replay. New <code>historical-context.ts</code> walks <code>{vault}/ThirteenF/cache/</code> to build per-fund time-sorted filing lists. The function that mattered was <code>ownershipAtDate(symbol, dateMs, ctx)</code> — reconstruct <code>SymbolFundOwnership</code> for any (symbol, asOfDate) pair using only filings where <code>filedAt &lt;= asOfDate</code>. No lookahead bias. The bar dated 2018-04-15 sees only what was actually public on 2018-04-15.</li>
  <li><strong>Abstain semantics.</strong> This one's the structural payoff. The post about <a href="/blog/insider-chips-and-the-no-data-drag" target="_blank" rel="noopener">no-data drag</a> banked the lesson: layers without data shouldn't return a "neutral 50" — they should drop out of the weighted average and let the score reflect what we actually know. Phase 7.5a finally implements it, on the histogram side. When 13F has no filings visible at a given bar, the layer abstains; the score collapses to whatever layers do have data. The denominator gets recomputed, not padded.</li>
</ol>

<p>Lookup defaults to <code>tech_thirteenf</code> mode. The chip below the chart reads "tech + 13F" instead of "technical only." The hover tooltip explains the abstain semantics so a reader knows why a Selling-zone bar's stats are sometimes computed off thinner data than its Buying-zone neighbor.</p>

<h2>The second surprise</h2>

<p>Re-ran the same compute. S&amp;P 500 × 10y × 1d bars, multi-layer mode. 45 seconds, <strong>233,110 zone-entry events</strong> (slightly fewer because some bars now have different scores under the multi-layer math, so fewer zone-entry transitions).</p>

<p>The histograms are nearly identical to technical-only. Selling 5d moved from +0.04% / 53% to −0.09% / 52% — a directional improvement, but barely. Buying barely changed. The 30d and 50d "Selling beats Buying" finding survived intact.</p>

<p>I expected more movement. We just stitched in an entire smart-money layer with proper temporal correctness and abstention. And the histograms shrugged.</p>

<p>The diagnostic took about three minutes of staring at the cache. We have one to two quarters of 13F per fund cached locally — out of roughly forty quarters in ten years. For roughly 95% of historical bars in the test, no cached fund has a visible filing as of that date. The 13F layer correctly abstains. The score collapses back to pure technical. The histograms are technical-only histograms with an abstention rounding error.</p>

<p>The architecture is right. The data coverage is the bottleneck.</p>

<h2>Reordering the roadmap</h2>

<p>The pre-Phase-7 plan had Phase 7.5b (insider historical replay via Finnhub Form 4) and Phase 7.5c (regime historical replay via FRED) queued ahead of any aggressive 13F backfill. Phase 7.5a's empirical result inverts that. Bulk-fetch historical 13F quarters from EDGAR is now <em>the</em> next move — ten minutes of fetches against a free endpoint, cached forever, and suddenly forty quarters of smart-money signal exist on every historical bar instead of one or two.</p>

<p>Get the data coverage. Re-run the histograms. <em>Then</em> see whether 13F has any signal worth weighting. <em>Then</em> add insider replay. <em>Then</em> add regime. Each addition gets measured the same way, with the same engine, and either earns its weight or doesn't.</p>

<h2>Two pitfalls that cost time</h2>

<p>Both are about Electron's hot-reload boundary.</p>

<p>The first hit during Phase 7. Renderer happily picked up the new <code>ZoneStatsBlock</code> via Vite HMR and started calling <code>novaApi.zoneStats.status</code>. The running Electron's main and preload bundles, however, were the pre-Phase-7 versions — main didn't have the new IPC handlers. The renderer's status calls landed on a missing handler, the response got swallowed into a try/catch I'd written defensively, and the UI sat in "loading zone stats…" indefinitely. No errors. No warnings. Just a stuck spinner.</p>

<p>The second hit during Phase 7.5a. The IPC payload changed shape — from <code>{universe}</code> to <code>{universe, scoreSource}</code>. Renderer HMR'd in the new shape. Old main decoded only <code>universe</code>, defaulted <code>scoreSource</code> to <code>"technical"</code>, and loaded the legacy <code>sp500.json</code> file. Chip read "technical only" with 236,547 entries. Looked plausible. Was wrong.</p>

<p>Pattern: when the IPC contract changes shape (new field, removed field, renamed field), kill the entire dev process tree and restart clean. Renderer HMR alone gives the appearance of progress while silently falling back to old defaults. <code>electron-vite</code> rebuilds main and preload on save, but the running Electron is already loaded — only a fresh launch picks them up. The orphan <code>node.exe</code> holding the max-router on port 3000 has to die too, or <code>pnpm dev</code> can't re-bind.</p>

<h2>Where this goes</h2>

<p>Phase 7.5b: backfill historical 13F. Then re-run histograms in multi-layer mode and see if the smart-money layer earns its weight on real coverage. If it does, on to insider historical replay. If it doesn't, harder questions.</p>

<p>The bigger lesson from this session, banked: ship the measurement layer even when the limitations make the answer partial. The shock value of "technical-only score doesn't beat coin-flip" was worth more than waiting six months to ship the perfect version. The data tells you whether the rest of the work is even worth doing. Now we know it is — but only if we can get the smart-money signal onto more bars than we have today.</p>
