---
title: "DRIP for Nova Fund"
date: 2026-05-04
summary: "Dividend reinvestment shipped for the Nova Fund portfolio simulator, plus a SPY benchmark that walks the same DRIP path. The smoke test caught a timestamp bug worth keeping a note about."
category: nova-dev
tags: ["nova", "finance", "war-story"]
readMinutes: 7
---

<p>The blog hasn't talked about Nova Fund yet. Quick context: it's a real portfolio simulator inside Nova that takes weekly deposits, picks names off the screener, and tracks them as a real ledger you can replay. It's separate from the screener and Lookup &mdash; those are research surfaces; Nova Fund is the "actually live with the score" surface. Inception is May 10. Until then everything ships against synthetic data.</p>

<p>Today's slice was Phase 5 prereq #3: DRIP. Dividend reinvestment, plus a SPY benchmark that walks the same path. The smoke test caught a date bug along the way.</p>

<h2>Why DRIP matters</h2>

<p>Without reinvested dividends, a portfolio simulator holding dividend-paying names systematically under-reports return. Worse, if you're benchmarking against SPY without DRIP-ing the benchmark too, the comparison is tilted &mdash; SPY pays dividends in real life, and not crediting them on the benchmark side makes any simulator look better than it is.</p>

<p>Apples to apples means: if Nova reinvests its dividends, the SPY benchmark must reinvest its dividends. Otherwise the alpha number is fake.</p>

<h2>The data source</h2>

<p>Yahoo's <code>events=div</code> chart endpoint. Same provider as OHLC, free, no new API key. Per-symbol disk cache with a 24-hour TTL at <code>{vault}/Screener/cache/dividends/</code>. We already trust Yahoo for daily bars; trusting it for dividend history is just consistency. The endpoint returns ex-date and dividend amount per share, which is exactly what DRIP needs.</p>

<h2>The ledger model</h2>

<p>New entry kind <code>"dividend"</code> with <code>cashDelta = 0</code> (immediately reinvested). The <code>position.shares</code> field grows by the reinvested-shares count; <code>position.costBasisTotal</code> grows by the reinvested-cash amount. State mutates in place.</p>

<p>Worth flagging the naming choice: kind is <code>"dividend"</code>, not <code>"drip"</code>. The ledger records economic events; DRIP is what the simulator does with them. If we ever want a no-DRIP variant later, the data model already supports it &mdash; same dividend events, different downstream behavior. Naming the kind after the policy would have locked us into one policy.</p>

<h2>Idempotency</h2>

<p>Dedupe on <code>(symbol, ex-date)</code>. Re-running <code>syncDividends</code> is safe; running it twice doesn't double-credit. This matters because <code>executeWeeklyRun</code> calls it every Sunday morning &mdash; we don't want to re-credit AAPL's August 2024 dividend every week from now until forever.</p>

<p>The smoke verified it: first run recorded 8 AAPL dividends across two synthetic years; second run added zero entries.</p>

<h2>The SPY benchmark</h2>

<p>New <code>simulateSpyDrip</code> in <code>analytics.ts</code>. Interleaves deposits and SPY ex-dividends in time order, walks forward accumulating shares as both happen. Same logic Nova Fund uses for its own DRIP, applied to a single benchmark holding.</p>

<p>The benchmark needs the same temporal honesty Nova Fund does: a deposit on day N buys SPY at day N's price; a SPY dividend on day M reinvests at day M's price; deposits and dividends interleave according to their actual dates rather than batching. Otherwise the benchmark drifts from a simple "what would buying SPY have done" answer.</p>

<h2>The smoke test setup</h2>

<p>Real Nova Fund is empty pre-inception, so I built a temp-vault script:</p>

<ul>
  <li>Init fund on 2024-05-04.</li>
  <li>Three $1,000 deposits spread across two years.</li>
  <li>Buy five AAPL at $170 on inception (held flat for the whole run).</li>
  <li>Run <code>syncDividends</code>, then re-run it (idempotency check).</li>
  <li>Run <code>simulateSpyDrip</code> across the same two years.</li>
</ul>

<p>Synthetic, but the right shape: deposits, a long-held position, dividends to reinvest, and a benchmark to compare against.</p>

<h2>The timestamp that lied</h2>

<p>Then the bug.</p>

<p><code>sharesHeldAt(entries, t)</code> is supposed to return the share count held at time <code>t</code>. Used to walk a ledger forward and answer "as of this date, how many shares did the fund hold?" The implementation used <code>e.at</code> directly &mdash; the timestamp on each ledger entry &mdash; to decide whether the entry was "before" or "after" <code>t</code>.</p>

<p>The problem: <code>applyBuy</code> stamps <code>e.at = now()</code> when it creates the entry, regardless of <code>e.decisionDate</code>. For a fresh buy "right now," those two are the same and nothing is wrong. For a backdated buy &mdash; say, recording inception on 2024-05-04 from a script running in 2026 &mdash; <code>at</code> is 2026 and <code>decisionDate</code> is 2024. The journal-ordering field was telling the truth (it's when we wrote the entry). The "occurrence" question got the wrong answer.</p>

<p>DRIP made it worse. DRIP entries carry historical ex-dates as <code>at</code>, because the entry's reason for existing is the dividend's ex-date, not the moment we synced it. So an AAPL dividend from August 2024 has <code>at = 2024-08-15</code> &mdash; correct economically, but it broke the assumption baked into <code>sharesHeldAt</code> that <code>at</code> was always "wall-clock at insertion time."</p>

<p>You had two timestamps that meant different things, the function was using the wrong one, and the answer happened to look plausible because the synthetic SPY return curve was monotone enough to mask small drift. The smoke test caught it because the AAPL dividend for August 2024 reinvested at a share count that wasn't yet five (the buy hadn't "occurred" yet by the broken time logic).</p>

<p>The fix: <code>min(at, decisionDate)</code> for replay-time questions. <code>at</code> still wins for journal ordering &mdash; that's its job. Replay uses <code>min(at, decisionDate)</code> because that's the actual moment the economic event occurred. Fixed in <code>dividends.ts:sharesHeldAt</code> and <code>analytics.ts:ledgerEntryTime</code>.</p>

<p>The pattern, banked: when a system has a creation timestamp and an event-occurrence timestamp, replay logic should use whichever is the truthful occurrence. <code>at</code> for ordering is fine; replay needs the right "when did this happen." The bug stays hidden until you have either backdated entries or events whose <code>at</code> is intentionally historical &mdash; both of which DRIP introduced for the first time.</p>

<h2>Final smoke results</h2>

<p>Nova final value $3,007.68 against $3,000 deposited (held five shares of AAPL flat at $170, plus 0.045 reinvested-dividend shares from $10.24 of cash). SPY benchmark: $3,716.19 final value, with $41.85 of dividends reinvested over the two years. Alpha: -23.6%, exactly what should show up when you hold AAPL flat for two years while SPY runs +20%. Synthetic, but the math agrees.</p>

<p>Typecheck clean across all 17 packages. Smoke-test scripts deleted after verification. The DRIP plumbing is on the working tree pending review and commit; not pushed yet.</p>

<h2>What this unblocks</h2>

<p>Phase 5 of the portfolio-product arc had three prereqs: ledger correctness, the weekly-run engine, and dividend reinvestment. Ledger correctness shipped first; weekly-run shipped second; DRIP is the third. With it landed, Nova Fund's inception on May 10 has a complete simulator behind it &mdash; deposits, position tracking, weekly-run scheduling, dividends, benchmark.</p>

<p>The next prereqs ahead of the broader Phase 5 work: deploying Nova web to Amplify under <code>nova.leavingthematrix.io</code>, and a desktop-to-web data sync (Sunday cron pushes the local vault state into a Postgres mirror so the web view sees the same numbers the desktop does). Both gating issues are practical, not architectural.</p>

<p>Then May 10 inception. Real deposits, real dividends, real SPY comparison. The simulator stops being synthetic.</p>
