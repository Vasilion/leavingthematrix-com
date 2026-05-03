---
title: "What UBER taught the scorers"
date: 2026-05-03
summary: "A single-ticker spot-check on UBER scored 38 and 35 across Trading and Investing modes. Three days later it scored 67.5 and 68.9. The fix needed a written investing rubric, three converging scorer bugs, and one structural one."
category: nova-dev
tags: ["nova", "screener", "war-story", "architecture"]
readMinutes: 8
---

<p>UBER scored 38 in Trading mode. 35 in Investing.</p>

<p>That's a textbook quality-with-runway business — recently profitable, growing revenue at fifteen-plus percent, improving margins, low debt, and visible institutional accumulation in the latest 13Fs. The Nova Score said neutral-leaning-sell on both modes. My gut said this was a "no-brainer buy zone" stock you'd hold for years.</p>

<p>When the score and your gut disagree on a ticker you'd trade either way, one of them is wrong. You can't tell which without a written rubric to check against. We didn't have one. So before fixing the scorer, we had to write it.</p>

<h2>The three converging issues</h2>

<p>A spot-check via the diagnostic scripts pointed at three things, all visible on UBER specifically.</p>

<p><strong>Issue 1: the fundamental thresholds were too tight.</strong> <code>fundamental.ts</code> had a hard <code>fwd P/E &lt; 18</code> gate as the first credit tier. UBER trades at 21.76. Zero credit on the fundamental layer, despite the rest of the picture being strong. The threshold collapsed every "growth at reasonable price" stock into the same bucket as a 50-P/E hype name.</p>

<p><strong>Issue 2: the smart-money window was 60 days.</strong> UBER's CFO bought stock at day 68. The buy was visible in the Lookup chart strip and rendered as a green arrow on the candlestick. The scorer didn't see it — its lookback window cut off at day 60. So a layer that was supposed to be saying "the people closest to the company are buying" was saying "no recent activity."</p>

<p><strong>Issue 3 — the structural one:</strong> <code>orientForShort</code> was flipping the smart-money layers around 50 when the chart was below SMA200. UBER's thirteenf score was 73, reflecting real institutional accumulation. UBER's price was below its 200-day moving average. The orchestrator interpreted the chart as bearish, called <code>orientForShort</code> on every layer to "orient" for a short trade, and flipped 73 to 27. The smart-money signal got inverted because the chart looked bad.</p>

<p>That last one is the kind of bug that hides for a while because each piece is locally correct. <code>orientForShort</code> flipping technical signals makes sense — a strong-uptrend signal in a downtrend is bearish. Flipping smart-money signals is wrong: sells already score negatively within each signal, so insider/congress/13F sells already pull the score down naturally. Flipping was double-counting the bearishness.</p>

<h2>Why we couldn't just patch the thresholds</h2>

<p>The first instinct was: bump the fundamental threshold from 18 to 25 and call it a day. But every threshold in every scorer is somebody's frozen intuition. What's a "good" P/E? Sector-relative or absolute? What about recently-profitable companies — should they be punished for the gap years? Should drawdown count, and if so, against what baseline? Should "below SMA200" be a buy zone or a warning?</p>

<p>The honest answer was: I didn't know what <em>I</em> thought, much less what the scorer should encode. Six layers had been wired up using best-guess weights and best-guess thresholds, and the UBER spot-check exposed that the underlying philosophy wasn't written down anywhere. So I wrote it.</p>

<h2>The vault file</h2>

<p>It lives at <code>profile/investing-philosophy.md</code>. The pattern is <strong>Quality × Discount × Smart-money confirmation</strong>. Trading mode leans technicals + options + catalyst; Investing mode leans fundamentals with valuation discount + smart-money cluster. Sentiment divergence is a flavor: narrative-driven weakness on a fundamentally healthy business is opportunity, not warning.</p>

<p>The plan-locking conversation produced five clarifications I'd been winging on:</p>

<ol>
  <li>The fundamental anchor for a "90" score: forward P/E under 15, revenue growth above 15%, improving margins, low debt.</li>
  <li>The valuation discount compares the ticker against <strong>its own</strong> five-year median forward P/E — not against the sector. Good stocks trade at a premium to their sector, so a sector benchmark would penalize quality.</li>
  <li>Drawdown is situational. The actual signal Luke uses for quality stocks is <strong>proximity to the 200-week moving average</strong> — that's the "no-brainer buy zone." 200-day SMA is more trading-mode focused.</li>
  <li>200wma gets high weight in Investing mode; 200sma gets high weight in Trading mode; both are non-zero in the other mode.</li>
  <li>Narrative-weakness combined with smart-money buying is an explicit bonus, not an implicit one — encode it.</li>
</ol>

<p>Without those answers, every fix to the scorer would have been the same kind of intuition-wrapped-in-code that produced the original problem. With them, Phase 7.7b had a clean spec.</p>

<h2>Phase 7.7b1 — the rewrite</h2>

<p>Phase 7.7b1 is the first of three: fix the scorer bugs the rubric exposes (b1), then a new <code>valuation</code> layer comparing current fwd P/E to the ticker's five-year median (b2), then enhanced technical with 200wma + 200sma proximity, mode-weighted (b3). PR #34 is b1 — landed today.</p>

<ul>
  <li><strong><code>fundamental.ts</code> rewritten</strong> to the 90 / 50 / 20 anchors. Tiered scheme widens to forward P/E under 25 with growth and margin emphasis. Recently-profitable companies are no longer punished for their gap years. A growth-at-reasonable-price cross-bonus fires when growth is above 20% and P/E is below 25 — the UBER archetype.</li>
  <li><strong>Insider and congress windows extended</strong> from 60 days to 90 days. The CFO buy at day 68 now contributes.</li>
  <li><strong><code>orientForShort</code> no longer flips smart-money signals.</strong> Insider, congress, and 13F stay un-flipped through the orient pass. Technical signals still flip, because their meaning genuinely inverts in a downtrend. Smart-money signals don't.</li>
  <li><strong><code>flipSignal</code> was silently dropping the abstain flag</strong> through its return path. Fixed to preserve it. This one's an unsung callback to the <a href="/blog/insider-chips-and-the-no-data-drag" target="_blank" rel="noopener">no-data drag</a> work — abstain semantics only matter if every code path that touches a signal also respects them. The flip path didn't, so an abstaining layer that got flipped came back as a 50 — exactly the "neutral 50" pull we'd built abstain to avoid.</li>
  <li><strong><code>explainSymbol</code> now forces <code>direction = "long"</code></strong> for the Lookup view. Lookup is a lens, not a long/short trade routing surface — orienting for short on a Lookup query was a leak from the screener pipeline that doesn't belong there.</li>
</ul>

<p>Four new diagnostic scripts shipped alongside: <code>fundamental-smoke</code>, <code>insider-debug</code>, <code>thirteenf-debug</code>, <code>explain-debug</code>. Each one runs the relevant scorer in isolation against a single ticker with verbose output, so the next "wrong score on X" repro doesn't need a full Electron boot.</p>

<h2>Validation</h2>

<p>UBER's Trading score went from 38 to 67.5. Its Investing score went from 35 to 68.9. Both land in the Accumulation zone — exactly where the underlying picture said they should have been all along.</p>

<p>Spot-checked MSFT in both modes. Came back strong on both, in line with what you'd expect for a megacap-quality compounder. No false positives that I could find on the handful I checked next, but the universe sweep against zone-stats hasn't run yet — that's the credibility check the <a href="/blog/what-ten-years-of-bars-said" target="_blank" rel="noopener">previous post</a>'s engine exists to do, and it'll get re-run once Phase 7.7b2 and b3 land.</p>

<h2>The lesson</h2>

<p>A scorer threshold is just frozen intuition. When the score and your gut disagree on a ticker you'd trade either way, one of them is wrong. You can't tell which without a written rubric.</p>

<p>We'd built six confluence layers without ever writing down what "good" means in each one. The thresholds got picked because they "felt right" at the time. UBER was the first ticker the gap mattered enough on for me to notice. The structural bug — smart-money flipping with technical orientation — would have stayed hidden indefinitely without it, because most stocks where smart-money cares about them are also above SMA200.</p>

<p>The fix wasn't really the code. The fix was the file at <code>profile/investing-philosophy.md</code>. Every scorer revision after this one starts there.</p>

<h2>Where this goes</h2>

<p>Phase 7.7b2: new <code>valuation</code> layer comparing current forward P/E against the ticker's own five-year median. Phase 7.7b3: technical scorer enhanced with 200wma + 200sma proximity, weighted by mode. After both land, re-run the zone-stats engine on the multi-layer score and see what the histograms say now — Phase 7's credibility loop closing on the rewritten scorers.</p>

<p>Lookup also gets its own focused PR (Phase 7.7e). Right now Lookup shows less detail than the Scanner cards — the gaps Luke wants closed are a technicals snapshot (price vs SMA50/200, RSI, ATR%, the new 200wma proximity), a levels block (entry/stop/target when computed), news and catalyst panels, options-flow and social, regime context, and fundamentals laid out as actual numbers (P/E, growth, margins, debt) rather than a single "fundamental: 73" pill. Lookup is supposed to be the per-ticker details page; right now it's a quick-look. That's the next surface to sharpen.</p>
