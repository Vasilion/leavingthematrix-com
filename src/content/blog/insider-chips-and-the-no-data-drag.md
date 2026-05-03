---
title: "Insider chips, and the no-data drag"
date: 2026-05-02
summary: "Phase 4 of a smart-money pivot shipped: insider activity is now a confluence layer and insider trades render as chart overlays. Then the top-picks sort started favoring the symbols with the least data. Four bugs deep, one structural lesson."
category: nova-dev
tags: ["nova", "screener", "war-story", "architecture"]
readMinutes: 8
---

<p>The last post closed with "wake-word and HUD next." That's not what happened.</p>

<p>The day after I shipped that post, we pivoted Nova's market layer into a smart-money platform. The personal-assistant identity (chat, orb, voice, notes, CRM) stays — that's the moat. But Screener, AI Picks, and Lookup are being rebuilt around institutional-flow data, scored through a single integrating concept called <em>Nova Score</em>: 0–100, five zones, color tokens in the theme. The full plan is twelve phases, one branch per phase, one PR per phase. Wake-word goes back on the queue.</p>

<p>Four phases have shipped this week:</p>

<ul>
  <li><strong>Phase 1 — Nova Score zones.</strong> Five zones (Buying / Accumulation / Neutral / Distribution / Selling). <code>zoneOf(score)</code> in <code>packages/core/src/screener/zones.ts</code> as the single source of truth. Every score in the UI now carries zone color and label.</li>
  <li><strong>Phase 2 — NovaChart foundation.</strong> <code>lightweight-charts</code> (TradingView's MIT-licensed sibling, ~50KB) wired into the Lookup detail view. Exposed <code>markers</code> prop on top of <code>seriesApi.setMarkers</code>.</li>
  <li><strong>Phase 3 — Smart Money tab + Insiders feed.</strong> New top-level tab between Lookup and Calendar. First feed is Insiders, scraped from openinsider.com (free, no key). Congress / Trailblazers / Billionaires / Options Flow are placeholder slots queued for later phases. Click a row, deep-link to Lookup.</li>
  <li><strong>Phase 4 — Lookup chart overlays + insider score layer.</strong> Insider trades render as buy/sell markers on the Lookup chart, and insider activity is the sixth confluence layer in the screener alongside technical, fundamental, catalyst, flow, and regime.</li>
</ul>

<p>Phase 4 is the one I want to talk about. Three small bugs, one structural one, and a generalized lesson that's been waiting longer than I realized.</p>

<h2>Gotcha 1: the openinsider parser had two layouts</h2>

<p>Phase 3's parser handled the "latest" pages (<code>/latest-buys</code>, <code>/latest-sells</code>) which return a 17-column table. Phase 4 needed per-ticker queries — <code>/screener?s=TICKER</code> — for the chart overlays. Same site, same scrape pattern. Returned zero rows.</p>

<p>The per-ticker pages collapse the company-name column. Sixteen cells, not seventeen. Every index ≥4 was off by one. The parser was reading <code>cells[7] = "Dir"</code> (a title) instead of <code>"P - Purchase"</code>, so every row failed the type filter silently.</p>

<p>The fix is to detect layout per-row from a stable structural signal — cell count — rather than threading a flag through the call site:</p>

<pre><code>function parseRow(row: HTMLTableRowElement): InsiderTx | null {
  const cells = row.querySelectorAll('td');
  const offset = cells.length === 16 ? 0 : 1;  // company column collapsed?
  const txType = cells[7 + offset]?.textContent;
  // ...
}</code></pre>

<p>Lesson: when an HTML scrape has multiple page templates, detect the layout from the row's structure, not from the URL the call originated at. Less coupling, less drift, fewer regressions when the next template variant lands.</p>

<h2>Gotcha 2: marker pile-up on the chart's left edge</h2>

<p>The first pass at chart overlays fed every insider trade for the symbol — going back years — straight into <code>seriesApi.setMarkers(...)</code>. The chart's visible window is roughly the last twelve months. Lightweight-charts handles markers outside the range by clamping them to the nearest visible bar.</p>

<p>Result: every insider trade from 2019, 2020, 2021 stacked vertically on the leftmost bar. Christmas tree of red and green right where the chart begins.</p>

<pre><code>const cutoff = Date.now() - 400 * 24 * 60 * 60 * 1000;
const visible = transactions.filter((t) =&gt; t.date.getTime() &gt;= cutoff);
chart.setMarkers(visible.map(toMarker));</code></pre>

<p>Lesson: for any chart-marker overlay, filter the input to the visible chart range yourself. The library will not save you. It will draw whatever you hand it, somewhere.</p>

<h2>Gotcha 3: hover tooltip wasn't matching trade dates</h2>

<p>Hover the chart over an insider marker, see who bought what for how much. Worked in concept. In practice, the tooltip showed nothing on roughly half the markers.</p>

<p>Trades were dated correctly. Chart bars were dated correctly. But hovering Monday's bar over a Saturday-dated trade returned no match — lightweight-charts had snapped the weekend marker forward to Monday's bar, while the lookup did an exact-date match against the Saturday timestamp.</p>

<p>Fuzzy match within a small window solves it:</p>

<pre><code>const FUZZY_MS = 3 * 24 * 60 * 60 * 1000;  // ±3 days
function findTradeForBar(barTime: Date, trades: InsiderTx[]) {
  return trades.find((t) =&gt; Math.abs(t.date.getTime() - barTime.getTime()) &lt;= FUZZY_MS);
}</code></pre>

<p>Three days catches weekend and holiday snaps without picking up trades from a different week.</p>

<h2>The big one: insider chips broke the conviction sort</h2>

<p>With the layer wired, all four screener presets — Swing Confluence, Oversold Quality, Breakout Volume, Momentum Leader — should now display six chips per card: <code>tech</code>, <code>fund</code>, <code>cat</code>, <code>flow</code>, <code>regime</code>, <code>insider</code>. All four presets have non-zero weights for all six layers.</p>

<p>What actually showed up: Swing Confluence cards displayed two chips. <code>tech</code> and <code>regime</code>. Nothing else. The other three presets looked fine.</p>

<p>First bad hypothesis: the new insider layer broke enrichment. It didn't. Looking at the cards, <em>none</em> of the enrichment chips were displaying — not just insider. The whole enrichment block was empty.</p>

<p>The actual chain of cause:</p>

<ul>
  <li>Swing Confluence has no strategy filter. Its <code>techRows</code> is the full universe (~150 large-caps).</li>
  <li>The orchestrator only enriches the top 60 by technical score (<code>ENRICH_TOP_N = 60</code>). The bottom 90 stay un-enriched. Their <code>signals</code> array contains only <code>tech</code> and <code>regime</code>.</li>
  <li>For a typical un-enriched SPX large-cap, conviction lands around <strong>79.4</strong>.</li>
  <li>For the same symbol with enrichment on but no FINNHUB key, the missing-data layers all return a <strong>neutral 50</strong>, which drags conviction to around <strong>61.2</strong>.</li>
  <li>Top-25 by conviction is therefore dominated by un-enriched symbols. Their cards have only <code>tech</code> and <code>regime</code> chips because that's all they have.</li>
</ul>

<p>The other three presets weren't affected because each has a strategy filter that trims <code>techRows</code> to ≤60 symbols before enrichment runs. Every survivor gets enriched. No un-enriched candidates make the conviction sort.</p>

<p>The fix is a single line in the orchestrator's idea-build loop:</p>

<pre><code>for (const row of techRows) {
  if (enrichEnabled &amp;&amp; !enrichSet.has(row.symbol)) continue;
  // ... build idea card
}</code></pre>

<p>When enrichment is on, only the enriched 60 are eligible for the display sort. Trade-off accepted: a symbol with high <code>tech</code> but missing enrichment data won't surface in the top picks. Which is probably fine — if its score would be dominated by missing data anyway, it shouldn't be in the top idea list.</p>

<h2>The lesson: missing data is not "neutral 50"</h2>

<p>The fix is local. The lesson is bigger and more general.</p>

<p>A confluence score that averages <code>[layer1, layer2, layer3, …]</code> assumes every layer has an opinion. Some don't. Sometimes there's no FINNHUB key set. Sometimes the SEC EDGAR fetcher rate-limited. Sometimes the news feed has nothing for the ticker. Returning <em>neutral 50</em> from a missing-data layer feels safe — it's the middle of the scale, it shouldn't bias anything.</p>

<p>It does bias things. It drags the composite score toward the middle, which silently penalizes symbols against thinner-data peers in any sort that mixes the two cohorts. The right behavior is for missing layers to <em>abstain</em> — exclude themselves from the average entirely, recompute the denominator, let the score reflect what we actually know.</p>

<p>That's a bigger refactor: every layer signals "I have an opinion" or "I don't," and the orchestrator weights accordingly. It's queued. The current fix sidesteps the problem by ensuring the enriched and un-enriched cohorts never compete in the same sort, which is sufficient until the abstention work lands.</p>

<p>Generalizable shape: any composite score should treat missing data as an abstention, not as a neutral vote. If your scoring system has a fallback value for "no data," it has a silent bias. Find every place that fallback fires and ask whether the score would mean something different if you dropped that layer entirely instead.</p>

<h2>Where this goes next</h2>

<p>Phase 4.5 is on a branch right now. Smart Money rows are getting sector + market-cap columns and a min-cap filter, so a buy by a director at a $50M biotech doesn't sit visually next to a $50B megacap-CEO buy with no distinguishing detail. The Smart Money table is also getting sortable column headers — modern table conventions are baseline, not bonuses.</p>

<p>After 4.5: Phase 5, Congressional trades. Then 13F filings. Then options flow. Then back to the abstention refactor.</p>

<p>The smart-money pivot is a bet that retail tools should look at what institutions are doing, not just what charts are doing. Charts still matter. But the picture's incomplete without the flow.</p>
