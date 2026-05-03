---
title: "One Nova Score, twelve layers"
date: 2026-05-03
summary: "Eleven PRs after the UBER spot-check, the score architecture is settled. Dual trading/investing scores collapsed to one. Six layers grew to twelve. The abstain semantics from earlier finally pay."
category: nova-dev
tags: ["nova", "screener", "architecture"]
readMinutes: 8
---

<p>The score got smaller and bigger in the same arc.</p>

<p>Smaller because we collapsed the dual trading/investing score into a single number per ticker. Bigger because the single score now reads off twelve layers instead of six. Eleven PRs landed between <a href="/blog/what-uber-taught-the-scorers" target="_blank" rel="noopener">the UBER spot-check post</a> and now; this is what shape Nova Score ended up in.</p>

<h2>Why the dual was redundant</h2>

<p>The trigger was a one-line observation from Luke: <em>"the trading scores and investing scores are always pretty close. might just be better to just stick to one score?"</em> Going to look at why exposed everything that needed to change.</p>

<p>The two scores diverged on three layers — technical (Trading 0.2, Investing −0.25), catalyst, and flow. After the catalyst-decouple cleanup from <a href="/blog/three-audits-three-layers" target="_blank" rel="noopener">a few posts back</a>, the Smart Money Cluster preset had catalyst and flow at zero — so neither contributed to either score. That left technical as the only actual difference. And technical only matters when it's far from 50; for most names, it sits in the middle and the two "different" scores converge to the same number.</p>

<p>The dual was a vestige of an earlier framing where Trading and Investing were genuinely different lenses. After the smart-money pivot, they weren't. They were the same score with a thin technical-orientation flavor on top. Phase 7.7i (PR #40) collapsed them. Net <strong>−338 lines</strong>, mostly dead-code removal. Schema dropped <code>tradingScore</code> / <code>investingScore</code> / <code>tradingZone</code> / <code>investingZone</code> from <code>ScreenerIdea</code>. Every dual-chip in the UI became a single chip. The agent system prompt and skill descriptions stopped mentioning the dual.</p>

<h2>The twelve layers</h2>

<p>Counting from the post on no-data drag, we had eight: technical, fundamental, catalyst, flow, regime, insider, congress, 13F. Four landed in this arc:</p>

<ul>
  <li><strong>valuation</strong> (Phase 7.7b2) — current forward P/E vs the ticker's <em>own</em> 5-year median, sourced from FMP's free <code>/stable/ratios</code> endpoint. Compares against history, not against sector. Quality stocks trade at a premium to their sector permanently — sector-relative valuation would punish them for being good. UBER's fwd P/E 22.3 vs its 5y median 16.9 reads as +32% premium and pulls the score down 73 → 70. AMD's fwd P/E 52.6 vs its 5y median 80.5 reads as −35% cheap, despite the absolute number looking expensive — AMD historically traded at 80x. Score 49.9 → 55.6, exactly the nuance Luke wanted.</li>
  <li><strong>support</strong> (Phase 7.7b3) — proximity to the 200-week and 200-day moving averages. Asymmetric: rewards near-MA, doesn't punish distance. Quality stocks at the 200wma is the "no-brainer buy zone" Luke trades around. Made it a separate layer rather than reusing technical because technical has a contrarian weight (−0.25) in smart-money lenses, which would invert the read.</li>
  <li><strong>track_record</strong> (Phase 7.7h) — weighted-average annualized return across 3y / 5y / 10y horizons. A tiny scoring nudge anchored on the long-run S&P (~10%/yr); composite impact is around +3 to +6 for quality compounders, −3 for flat names. Background music, not a headline. MSFT at 17.7%/yr earns 78 → 82.5; UBER at 14.2%/yr barely moves at 69.6.</li>
  <li><strong>fund_quality</strong> (Phase 7.7j-c) — expense ratio for ETFs and mutual funds. Equity tickers abstain. Architectural call worth flagging: <em>structural cost</em> (expense ratio) is different from <em>empirical returns</em> (track_record); they're separate layers, not one. The "is this a great long-term fund" answer comes from the blend, not any single layer.</li>
</ul>

<h2>The abstain payoff</h2>

<p>The no-data-drag fix from <a href="/blog/insider-chips-and-the-no-data-drag" target="_blank" rel="noopener">post #11</a> finally pays its rent.</p>

<p>ETFs entering the system don't punish themselves on insider / congress / 13F — those layers abstain, the denominator recomputes, and the score blends meaningfully from technical (contrarian) + track_record + support + fund_quality + regime. Equities entering don't punish themselves on fund_quality. Each layer answers "do I have an opinion here?" and contributes only if yes. Without abstain, twelve layers would mean five-or-six redundant "neutral 50" pulls per scoring call — exactly the bug we banked the lesson on six weeks ago.</p>

<p>The cross-signal confluence bonus rides on top: when multiple <em>independent</em> smart-money sources (insider buys, congress buys, 13F new positions) all light up on the same name, that gets a small score nudge for heterogeneous confirmation. Two insider sources stacking doesn't qualify; insider + congress + 13F does.</p>

<h2>Lookup got a Details rail to tell the story</h2>

<p>Phase 7.7e built the rail on the Lookup tab. Setup, Levels, Technicals (with WMA200), Fundamentals (color-coded against the rubric), Valuation vs 5y, Analyst consensus + price targets, Buy-and-hold Returns at 1y / 3y / 5y / 10y / max, and Thesis. Each block surfaces the inputs that fed the corresponding score layer, so a curious user can see <em>why</em> the score said what it did.</p>

<p>Two specific fixes inside that work, both from spot-checking real tickers:</p>

<ul>
  <li><strong>True forward P/E.</strong> Finnhub's free tier exposes <code>forwardPE</code> directly, but the prior code was reading <code>peNormalizedAnnual</code> and labeling it "forward." UBER showed as a misleading "cheap 15.2" when it was actually a more honest 22.3. Now both are fetched and the UI shows them as separate rows.</li>
  <li><strong>Analyst price targets via Yahoo.</strong> Finnhub's price-target endpoint is paid. Yahoo's <code>quoteSummary financialData</code> module gives target mean / high / low + analyst count for free, behind a crumb dance. UBER: $104 mean (+38% upside, 51 analysts). AMD: $384 mean (+5.6% upside, 46 analysts) — appropriately tepid for an at-ATH name.</li>
</ul>

<p>The chart got EMAs (5/10/21/50/200), an anchored VWAP (cyan, distinct from the EMAs), and an RSI(14) sub-pane. MACD shipped initially and got cut after Luke's feedback ("just drop the macd honestly") — too noisy, RSI alone covers the momentum read. All indicators compute in the renderer from existing bars; no new IPC plumbing.</p>

<p>The thesis got rewritten with mixed-smart-money phrasing. Old thesis hid AMD's $74.8M of insider distribution behind generic "smart money is positioned" language. New thesis reads honestly: <em>"Smart money is mixed — funds are accumulating but six insiders dumped $74.8M into the rip."</em> That phrasing was the gap.</p>

<h2>ETFs are first-class now</h2>

<p>Three sub-phases. Phase 7.7j-a was a single-line fix — search was filtering Yahoo's typeahead to <code>quoteType === "EQUITY"</code> only; opened it to a whitelist of <code>EQUITY | ETF | MUTUALFUND | INDEX</code>. The asset-type badge shows on the Lookup header so it's clear which signals do and don't apply.</p>

<p>Phase 7.7j-b shipped the ETF / mutual-fund profile block on the Details rail (expense ratio, AUM, top 10 holdings, family, category) via the same Yahoo crumb dance the analyst-targets path uses. The crumb logic got extracted into a shared module so both endpoints share one cookie+crumb session.</p>

<p>Phase 7.7j-c added the <code>fund_quality</code> scoring layer. Initial map had QQQ at 65; Luke spot-checked and pushed back ("QQQ is obviously a great long term fund"). Retuned in the same PR — cheap band widened from 0.10–0.20% → 0.10–0.30% so QQQ-tier ETFs land at 70 instead of 65, and the expensive threshold bumped 0.50% → 0.60% so ARKK (0.75%) stays in "expensive" rather than crossing into "very expensive." Final map: under 0.10% → 80 (VOO/SPY); 0.10–0.30% → 70 (QQQ); 0.30–0.60% → 50; 0.60–1.00% → 35; ≥1.00% → 20.</p>

<h2>Documenting what the score IS vs ISN'T</h2>

<p>Phase 7.7z (PR #44) shipped <code>docs/scoring.md</code> — about 490 lines covering what the score is doing, all twelve layers in detail with their score maps and abstain conditions, the cross-signal confluence bonus, preset weights, the data-freshness profile of each source, and a UBER worked example contrasting the current ~67 Accumulation against the pre-7.7b1 ~38.</p>

<p>The most important section is what the score <em>isn't</em>: a price-prediction model. <a href="/blog/what-ten-years-of-bars-said" target="_blank" rel="noopener">Phase 7's credibility loop</a> already showed the technical-only baseline doesn't beat coin-flip on forward returns — and even the multi-layer score's job isn't to predict next month's price. The score is a clean way to ask "is this name in the kind of shape I'd trade?" Not "will it go up tomorrow." Calling that out explicitly in the docs matters because it's the first thing anyone reading the score will assume otherwise.</p>

<h2>Where this leaves Nova</h2>

<p>The 7.7 arc closed at PR #44. Eleven PRs deep, score architecture is settled: single 0–100 Nova Score, twelve layers (technical / fundamental / valuation / track_record / support / fund_quality / catalyst / flow / regime / insider / congress / 13F), abstain semantics throughout, cross-signal confluence bonus for heterogeneous smart-money clusters, asset-type-aware so ETFs and equities both score meaningfully without dragging each other.</p>

<p>Next major work: Phase 8, Options Flow — the last Smart Money feed, promoted up the order per the smart-money pivot. That's a multi-PR data-source build, not next-PR material. Between here and there: small Lookup polish, the empirical weight calibration the plan has been waiting on (now that the layers are in their final shape and abstain is universal), and probably an audit pass on whether the cross-signal confluence bonus is sized right.</p>
