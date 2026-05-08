---
title: "Three custom series, one revert: a Lookup chart polish run"
date: 2026-05-08
summary: "A long Lookup chart polish run: EMA cloud as a custom lightweight-charts series, 200W SMA with an indicator-warmup fix, a TradingView-style earnings badge row with a click-to-popover, and one premium marker overlay that earned itself a revert."
category: nova-dev
tags: ["nova", "lookup", "ux", "war-story"]
readMinutes: 8
---

<p>The Lookup screen is Nova's "what is this ticker, in one view" surface &mdash; price + score + smart-money in a single pane. Spent most of today extending it. Three new custom series in the chart, one indicator-warmup fix that should have been in there from day one, and a premium marker overlay that earned itself a revert by the end of the session.</p>

<h2>EMA cloud (custom series #1)</h2>

<p>The chart had three EMAs (5, 9, 21) drawn as lines. Useful, but the eye reads "regime" faster from a tinted band than from three lines crossing each other. New file <code>apps/ui/components/CloudSeries.ts</code> registers a custom series via the lightweight-charts v5 plug-in API. Two cloud layers (5/9 fast, 9/21 slow). Color is signal mint when fast &gt; slow, loss red when fast &lt; slow.</p>

<p>The renderer walks consecutive same-color bars and emits one polygon per regime, flushing at every crossover so polygons stitch with no visual gap. Pre-resolves coordinates per bar; bars where <code>priceConverter</code> returns null become segment breaks rather than extending polygons to invalid y values. That second part fixed a real artifact: when the visible price scale clipped a bar, the polygon would lunge to a coordinate outside the canvas and produce a stripe.</p>

<p>The other artifact &mdash; visible-range scoping &mdash; is worth a paragraph. Without it, off-screen warmup bars (the 200-day lookback you need for EMA200 to be valid) rendered with extreme y coordinates at the chart's left edge and produced a separate stripe. Fix: the renderer reads <code>data.visibleRange</code> and limits its work to bars in view with a 1-bar buffer on each side. Banked this as <code>feedback_lightweight_charts_custom_series_visible_range</code>: a custom series renderer must scope to <code>visibleRange</code>, not iterate the full data array, or warmup bars bite.</p>

<h2>200W SMA and the warmup pattern</h2>

<p>200-week SMA is the long-cycle anchor on this chart. <code>compute200WeekSMA</code> in <code>apps/ui/lib/indicators.ts</code> aggregates daily bars to weekly buckets keyed by ISO Sunday, runs SMA(200) on weekly closes, and emits one point per week. Plotted alongside EMA200 (now relabeled "200D") so the two long-term anchors read symmetrically.</p>

<p>Then the real fix. EMA200 <em>looked</em> like it was working, but on the 1Y view it only had values for the last ~50 bars. The reason was structural: the chart was fetching the user-selected timeframe's bars and feeding those into the indicator computation, so on 1Y you got 252 bars and EMA200 needed at least 200 of them just to warm up.</p>

<p>The fix is: always fetch <code>range="10y"</code>, regardless of what the user picked. EMAs and 200WSMA always have full coverage. Then constrain the visible window client-side via <code>chart.timeScale().setVisibleLogicalRange()</code>. Switching timeframes is now instant &mdash; no refetch &mdash; and every indicator reads correctly on every visible window from 1M up. Banked as <code>feedback_indicator_warmup_pattern</code>: the indicator's lookback dictates the fetch window, the user's UI picker dictates the visible window, and those are two different concerns.</p>

<h2>Markers, three attempts</h2>

<p>Insider, congress, and 13F transactions render as markers on the chart. Three problems with the original implementation, addressed in three steps with one revert in the middle.</p>

<p><strong>Aggregation.</strong> Heavy insider-cluster days (one symbol, twelve transactions, all on the same day) produced vertical piles of markers. Now markers bucket by (UTC-day, direction); N transactions on the same day collapse to one marker with a count badge ("5"). The pile is gone.</p>

<p><strong>The premium overlay attempt (reverted).</strong> Wanted shape language: chevrons-in-circles for insider, capsules for congress, diamonds for 13F. Built <code>MarkerOverlay</code> as an SVG layer above the canvas, position-synced via <code>chart.subscribeVisibleTimeRangeChange</code>. The animation lag during pan/zoom couldn't keep up. RAF loop helped but not enough &mdash; markers visibly trailed the bars they were attached to. Worse, the overall visual treatment read more "emoji set" than "chart indicator." Two commits in (<code>9cea9b9</code>, <code>fc6e4bf</code>), reverted (<code>6204986</code>).</p>

<p><strong>Native arrows, color-encoded source.</strong> Back to lightweight-charts' built-in <code>SeriesMarker</code> arrow shapes. Color carries source: green/rose for insider buys/sells, cyan/violet for congress, pink/fuchsia/amber for 13F. Count badge via <code>SeriesMarker.text</code>. Native canvas rendering means zero lag on pan/zoom. The information density is the same as the SVG overlay would have given; the visual is calmer; the perf is right.</p>

<p>Banked two memories from this. <code>feedback_lightweight_charts_overlay_lag</code> is the narrow lesson: DOM overlays don't keep up with canvas pan/zoom in a series chart, period. The broader one, <code>feedback_visual_iteration_when_to_revert</code>, is when to give up on a treatment instead of polishing it: if the perf problem is structural (DOM-vs-canvas) and the visual still reads "wrong," you're not one tweak away.</p>

<h2>Earnings as a custom series and a popover</h2>

<p>Earnings dates were already on the chart as colored vertical lines. TradingView's treatment is cleaner: a fixed row of "E" hex badges at the bottom of the price pane, color-coded by surprise (beat, miss, in-line). Wanted that.</p>

<p>Two pieces. First the data: <code>yahoo-earnings-history.ts</code> in <code>packages/core</code> fetches Yahoo's <code>/quoteSummary?modules=earnings</code> via the same crumb-auth dance we already use for analyst targets. Returns past-quarter EPS actual/estimate/surprise, revenue from <code>financialsChart.quarterly</code>, and the next upcoming event with its estimate. New shared type <code>LookupEarningsHistory</code>, new IPC channel <code>nova:lookup:earnings-history</code>. Cache key bumped to <code>v2:</code> so existing entries from the legacy fetcher get bypassed.</p>

<p>Second piece is the badge series. <code>EarningsBadgeSeries</code> is custom series #3, also via the v5 plug-in API. Badges sit in a fixed row at the bottom of the price pane &mdash; not stacked on candles &mdash; so they don't fight with the price action. Color: signal mint for a beat, loss red for a miss, pulse violet for in-line or unknown.</p>

<p>Then the popover. <code>chart.subscribeClick</code> with time-proximity matching (within 5 days of the nearest earnings event) fires an <code>onEarningsClick</code> callback with the click coordinates. <code>LookupPanel</code> renders <code>EarningsDetailPopover</code> anchored near the click, clamped to chart bounds, click-outside or Esc to close. Content is Date &middot; Period &middot; EPS reported/estimate/surprise (color-coded) &middot; Revenue reported (and estimate when Yahoo exposes it, which is rarely for past quarters).</p>

<p>Click-handler bug worth flagging. First version clamped <code>param.point.y</code> to within &plusmn;14px of <code>(containerRef.clientHeight - 36)</code> on the theory that's where the badge row lives. But <code>containerRef</code> includes the RSI sub-pane, so the y-bounds never overlapped where clicks actually landed. Dropped the y-clamp; rely on time-proximity only. Solved.</p>

<h2>What got dropped</h2>

<p>Year-over-year columns disappeared from both the badge popover and the right-rail Earnings tab. Reason is honest: Yahoo's <code>earnings.financialsChart</code> module returns exactly four quarters, and YoY needs eight. Showing always-blank columns is worse UX than removing them. The follow-up is documented as <code>reference_yahoo_earnings_module_limits</code> &mdash; a second-pass fetch of <code>incomeStatementHistoryQuarterly</code> can extend revenue history when this becomes important. Lower priority than the things that did ship.</p>

<p>The right-rail Earnings tab itself was actually broken before this work: legacy <code>fetchNextEarnings</code> hit Yahoo without crumb auth and got 401/403 silently, so the tab was always empty. Now it uses the same earnings-history feed as the badges and shows next upcoming + last four quarters of EPS + last four quarters of revenue.</p>

<h2>Where this leaves Lookup</h2>

<p>The chart now has three custom series stacked into one pane: EMA cloud (regime), native arrow markers (smart-money flow), earnings badges (event surprise). Defaults are tuned: cloud + 200W + VWAP + 5/9/21 EMAs visible by default; 50D and 200D off. The smart-money summary strip moved below the chart to free ~80px of vertical room; the chart now <code>fillContainer</code>s the rest. Switching timeframes is instant.</p>

<p>Open work for tomorrow is Pillar A.6: split <code>LookupPanel.tsx</code>'s 2,960 lines into proper sub-components and tighten the layout polish. The chart visual layer is done.</p>
