---
title: "Same ticker, two scores"
date: 2026-05-04
summary: "Spot-checking RF surfaced a 4-point gap between Scanner and Lookup. Three PRs to make scoring universal, then a long debug chain to make the math actually agree. Two load-bearing bugs in there."
category: nova-dev
tags: ["nova", "screener", "war-story", "architecture"]
readMinutes: 9
---

<p>RF scored 70.7 in Swing Confluence and 66 on Lookup. MSFT scored 79 on Scanner and 81 on Lookup. Same ticker, same scoring system, different numbers. The post that wraps up Phase 8 closed with a consistency audit queued for "after Phase 12." That schedule didn't survive the day. Here's what came out of moving it up.</p>

<h2>The first gap: layers (PR #51)</h2>

<p>Lookup uses <code>explainSymbol()</code>, which always fetches all twelve layers. Scanner and AI Picks use <code>runScan()</code>, which only fetches a layer when its preset weight is greater than zero. The <a href="/blog/one-nova-score-twelve-layers" target="_blank" rel="noopener">7.7-arc layers</a> &mdash; <code>track_record</code>, <code>support</code>, <code>fund_quality</code> &mdash; were wired into <code>presets.ts</code> with non-zero weights. They were never wired into <code>runScan</code>'s conditional-fetch convention. Same ticker, two paths, different inputs.</p>

<p>The fix wired all three into the existing fetch pattern, gated on preset weight greater than zero, fetched only for the top-60 enrichSet, reusing the 1-hour TTL caches. The <code>support</code> layer also got upgraded to use the same 10-year bars Lookup uses (vs the 1-year Scanner had), so its full 200-week-MA reading fires in both paths.</p>

<p>Banked: when adding a new score layer, the audit checklist must include both <code>presets.ts</code> and <code>runScan</code>, not just <code>explainSymbol</code>. The 7.7 arc got into Lookup three times and missed <code>runScan</code> three times.</p>

<h2>The second gap: language (PR #52)</h2>

<p>After #51 the math agreed across paths, but the LLM was still describing a 5-6 layer view. Agent system prompt didn't enumerate the new layers. Screener skill manifest didn't either. AI Picks' LLM prompt named the wrong subset. The <code>save_preset</code> schema only exposed weight fields for five layers &mdash; so chat couldn't even create a preset that touched <code>track_record</code>, <code>support</code>, or <code>fund_quality</code>.</p>

<p>PR #52 fixed all four narrative surfaces in one shot. The agent prompt now enumerates twelve layers grouped by family. Skill manifest names the twelve. AI Picks' LLM prompt names the twelve <em>and</em> sends per-layer signal summaries in the body so the model can actually reference layer reads in narrative. <code>save_preset</code> exposes weights for all twelve. <code>buildTemplateThesis</code> got three new clauses for the missing layers.</p>

<p>Banked: when a new score layer ships, the audit checklist must include the narrative surfaces (system prompt, skill descriptions, AI Picks prompt, deterministic template thesis). Otherwise the LLM describes a score it doesn't actually see.</p>

<h2>The architectural shift: PR #53</h2>

<p>Spot-checking RF surfaced a deeper problem. RF scored 70.7 in Swing Confluence and 66 on Lookup not because of a layer gap (#51 had fixed that) but because the <em>weights</em> were different. Every preset had its own weight scheme. Same ticker, two presets, two scores by design.</p>

<p>Luke's framing is the right one: <em>"the score is always supposed to be based on my investing principles. the scans should be tools to find opportunities through various means."</em></p>

<p>PR #53 made <code>NOVA_SCORE_WEIGHTS</code> the single canonical weight scheme. Every blender call &mdash; <code>runScan</code>, <code>explainSymbol</code>, AI Picks, chat &mdash; reads the same weights. Presets become discovery tools rather than re-weightings: they express identity via <code>filters.layerFloors</code> (per-layer score floors), <code>strategy</code> hooks, and <code>universeSpec</code> (their natural universe). <code>ScreenerPreset.weights</code> is deprecated; smart-money lens presets force <code>direction = "long"</code> matching the Lookup behavior.</p>

<p>The same PR added the new flagship preset, <strong>Nova Conviction</strong>: no lens filter, ranks the sp500&cup;sp400 union by universal Nova Score. The cleanest expression of "show me my best candidates by my investing principles." It also added Lookup deep-links from every Scanner and AI Picks result &mdash; clickable symbol headers and explicit "Open in Lookup" buttons &mdash; mirroring what Smart Money already does.</p>

<p>And then we spot-checked again. MSFT scored 79 on Scanner. 81 on Lookup. Same architecture. Same universal weights. Same data sources. Different number.</p>

<h2>The chain</h2>

<p>What followed was the kind of debug arc you remember. Eleven commits to chase down why two paths reading the same weights against the same data still produced different numbers.</p>

<p>The first few were structural rather than buggy &mdash; the kind of thing that's been fine because the answer was always "tech-driven enrichSet works." Under the universal-scoring world, it stopped working.</p>

<ul>
  <li>Nova Conviction's <code>minConviction: 70</code> floor returned zero ideas. Universal scoring with a -0.25 contrarian tech weight rarely lets routine large-caps blend to 70+. Floor dropped, pure rank top-N.</li>
  <li><code>ENRICH_TOP_N</code> bumped 60 to 250 as a band-aid. The tech-only enrichSet was systematically selecting <em>against</em> the names most likely to top a smart-money blend &mdash; MSFT at long-bias tech ~67 missed the top 60 in sp500+sp400, so its enriched layers never even fired in Scanner.</li>
  <li>Real fix: a smart-money-aware enrichSet pre-filter. New <code>smart-money-prefilter.ts</code> builds a per-symbol proxy from already-cached data &mdash; no new network calls. 13F holder count, Form 4 cache freshness, congress trade count. Blend 0.4 &times; tech + 0.6 &times; smart-money proxy, pick top-N. <code>ENRICH_TOP_N</code> back to 100. The enriched set is now a real candidate set, not a tech-momentum proxy.</li>
  <li><code>warmAllFunds</code> was only triggered by visiting Lookup or Smart Money. Scanner-first sessions found a cold cache. Now it auto-warms at app startup, fire-and-forget.</li>
  <li>Per-fund timeout in <code>warmAllFunds</code> bumped 12s to 30s. The previous timeout was firing on stuck OpenFIGI calls and silently dropping funds. The "5 of 26 still hydrating" status had been stuck for hours.</li>
  <li>SEC rate-limit handling. Rapid Electron restarts during debugging tripped SEC's 10/sec cap, which produced a 10-minute IP block returning the string <em>"Request Rate Threshold Exceeded"</em> as HTML. We were caching that as the response. Now: 8/sec global throttle and an explicit detector for the throttle HTML so we never poison cache with empty results during a block.</li>
  <li>Broken-fund skip-list. Three consecutive failures puts a fund on a one-week skip. Manual reset via <code>brokenFundsClear()</code>.</li>
</ul>

<h2>The 13F XML parser bug</h2>

<p>This is the load-bearing one for the "five funds stuck" mystery.</p>

<p>Five major funds &mdash; Bridgewater, Baupost, Third Point, Oaktree, Altimeter &mdash; all file their 13F-HR XMLs with <strong>namespace-prefixed tags</strong>. Where the others use <code>&lt;infoTable&gt;</code>, those five use <code>&lt;ns1:infoTable&gt;</code>. Our regex parser was matching the bare tag only. It silently returned zero matches. <code>getHydratedFiling</code> returned <code>null</code>. No error thrown.</p>

<p>The funds appeared to "fail." They weren't failing. The parser was blind to their tag style.</p>

<p>The fix is one regex change: match optional <code>xx:</code> prefix on every tag. After the fix, those five funds returned full holdings. <strong>Five funds &times; every ticker they collectively held had been silently under-scoring on the 13F layer for weeks.</strong> That's not a small data issue &mdash; it's most of the smart-money universe missing one-fifth of its named-fund coverage.</p>

<h2>The Finnhub 429-poisons-cache bug</h2>

<p>Diagnostic logs &mdash; the right answer for divergence bugs &mdash; showed MSFT in <code>runScan</code> with <code>fundamental = 50 (abs)</code> and <code>valuation = 50 (abs)</code>. Both abstaining. Fundamental and valuation are the two heaviest weights in the universal scheme (1.0 and 0.9). Half the universe was missing both layers and we hadn't noticed because the score still came out plausible.</p>

<p>The cause: Finnhub's free tier caps at 60 req/min. <code>runScan</code> was firing about 100 symbol fetches at concurrency 4 &mdash; bursting over the cap immediately. 429 responses poisoned the in-memory cache with empty snapshots for 30 minutes (the negative-cache TTL). Fundamental and valuation signals abstained on every poisoned ticker for the next half hour, which on a typical scan means "for the rest of the session."</p>

<p>This is the bug behind both "MSFT scoring 79 vs 81 on Lookup" and "Nova Conviction tops at 66 while AI Picks shows 70+." Half the universe was scoring its two heaviest layers as abstain because of a 60/min rate limit we'd been quietly stomping every scan.</p>

<p>The fix: a 1.1-second minimum interval between Finnhub calls (~55/min, comfortably under the cap), and 429 responses no longer write to the cache at all. They retry after the minimum interval.</p>

<h2>One more: the parallel rebuild explosion</h2>

<p>Even with Finnhub throttled, <code>runScan</code> reported "13F holders = 9 of 22" while <code>explainSymbol</code> reported "13 of 26" for the same ticker. <code>runScan</code>'s 100 parallel <code>getSymbolFundOwnership</code> calls &times; 26 cached funds = 2,600 concurrent fund-detail rebuilds. Under load some of those hit the 12-second timeout and dropped out. Different scan run, different dropouts, different reported holder count.</p>

<p>Fix: a module-level memo with 1-hour TTL plus in-flight promise dedupe. When 100 callers ask for the same fund detail, they all wait on the same in-flight build instead of triggering 100 of them. The 2,600-rebuild fan-out collapses to about 26 builds.</p>

<h2>End-to-end parity</h2>

<p>After all of it: <code>runScan</code> and <code>explainSymbol</code> both produce MSFT score 80.6. Identical layer breakdown except catalyst (50 abs in scan, 64 in Lookup &mdash; cosmetic only, since the universal weight on catalyst is 0). The score is finally truly universal across every surface.</p>

<p>The pattern that came out of this, banked as a memory: <strong>"silent data degradation" audit.</strong> When scoring looks off, audit every data source for four failure modes: (a) parser bugs that produce zero-results silently, (b) rate limits that poison caches with empty data, (c) parallel-call patterns that exceed implicit limits, (d) per-call rebuilds that should be memoized. Today's chain hit all four.</p>

<p>The other thing worth keeping: <strong>diagnostic logging is the right answer for divergence bugs.</strong> Side-by-side logging of MSFT's per-layer reads from both <code>runScan</code> and <code>explainSymbol</code> pinpointed the Finnhub bug in seconds after weeks of speculation about what was wrong. When two paths produce different numbers, log both, then remove the logs once parity is confirmed.</p>

<h2>Where this leaves Nova</h2>

<p>The score is universal. Same number on every surface. Twelve layers, one canonical weight scheme, abstain semantics throughout, smart-money-aware candidate selection, every fund actually parsed, no rate-limit cache poisoning, no parallel-rebuild fan-out.</p>

<p>Two things shipped on top while we were here, which will get their own posts soon: a <strong>relative scoring lens</strong> for "hidden gems" mode (universal score stays the anchor; a separate per-peer-group percentile chip surfaces small/mid-caps that score lower under universal but rank highly within their slice), and the <strong>Phase 10 Macro tab</strong> (Economic Dashboard via FRED, Volatility Dashboard via Yahoo VIX/SKEW/term-structure, Polymarket via the Gamma API with a macro-relevance filter).</p>

<p>Phase 11 is next: sector rotation, market heatmap, themes library. Mostly UI on data Nova already has.</p>
