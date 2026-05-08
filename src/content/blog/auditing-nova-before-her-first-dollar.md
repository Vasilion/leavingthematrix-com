---
title: "Auditing Nova before her first dollar: five fixes and a 13th layer"
date: 2026-05-08
summary: "Three days before the Nova Fund portfolio simulator goes live with a real ledger, a pre-inception audit found one real bug, four hardenings worth shipping, and one architectural shift that touched every score on every surface."
category: nova-dev
tags: ["nova", "finance", "architecture", "screener"]
readMinutes: 8
---

<p>The Nova Fund portfolio simulator goes live Sunday, May 10. Three days out. Before any of that hits a real ledger, did a full audit pass on the engine. Found one bug worth fixing, four hardenings worth shipping, and one architectural shift that touched every score on every surface.</p>

<h2>What the audit found</h2>

<p>The signal that triggered the read-through was simple: Nova's <code>weekly_run</code> proposes new buys every Sunday, but I'd never seen her propose a top-up to a name she already held. Stronger conviction in a name week-over-week should mean more shares, not zero.</p>

<p>The cause is at <code>engine.ts:317-320</code>. The allocator pulls a <code>heldSymbols</code> set from the current ledger and explicitly filters them out of the candidate list before sector-bucket allocation. Side effect: any ticker Nova owns is invisible to the weekly proposer.</p>

<p>The underlying buy function in <code>nova-fund</code> correctly merges adds into existing positions. The bug isn't in the math &mdash; it's in what reaches the math. The filter was meant to prevent re-proposing names you already pitched the same week, not to permanently exclude winners. It just lived in the wrong place.</p>

<p>Lens decision before the fix: Nova's headline is quality + smart-money, not momentum chasing. So the add-to-position branch isn't "stack into anything green." Held tickers compete for the same sector slots as new candidates, with <code>validateBuy</code>'s sharesAfter math + per-trade headroom clamping (<code>maxPosDollars - currentDollars</code>) keeping the per-position cap intact. Tickers that hit a triggered-sell are still excluded. New <code>addToExisting</code> boolean on the trade record so the UI can render an <code>ADD</code> chip instead of a <code>BUY</code> chip; reason text prefixes "add to held &middot;".</p>

<p>That was Path B+ item 1. Four more items behind it.</p>

<h2>Score visibility, universe expansion, constitution cleanup</h2>

<p>Three of the five items were short.</p>

<p><strong>Score visibility.</strong> Memos already showed a single composite Nova Score per ticker, but no breakdown of the layers that produced it. Added <code>FundCandidateScore.layerScores</code> extracted from <code>idea.signals</code>, with a synthesized <code>smart_money</code> aggregate combining insider + congress + 13F. New <code>formatLayerBreakdown</code> in <code>@nova/shared</code> produces an inline string like <code>fund 80 &middot; val 75 &middot; SM 65 (3) &middot; mom 72 &middot; sup 70 &middot; tech 35</code>. Memo gained a "Recommended trades" section that didn't render before. Desktop UI Candidates Browser got a new Breakdown column.</p>

<p><strong>Universe expansion.</strong> Default fund universe was <code>sp500</code>. Widened to <code>sp500 + sp400 + r2000</code> &mdash; small caps reachable through the same universal scoring. Fund-local override; no change to <code>nova_conviction</code> itself.</p>

<p><strong>Constitution cleanup.</strong> <code>forceTrimAt</code> (10pp above <code>maxPct</code>) is intentional hysteresis &mdash; you don't want to trim immediately when a position drifts up to cap because you'll just have to re-buy on the next dip. Documented it. The hardcoded <code>Math.min(3, ...)</code> at the top of <code>proposeWeeklyTrades</code> got promoted to a real config field, <code>constitution.weeklyMaxBuys</code>. <code>loadConstitution</code> now deep-merges defaults so older <code>constitution.json</code> files don't break when new fields land.</p>

<p>That left the two big ones.</p>

<h2>A 13th layer, not a re-weighting</h2>

<p>Nova was twelve signal layers &mdash; Quality, Discount, Smart Money, Context groups, weighted toward institutional indicators with <code>technical -0.25</code> as the only timing signal. The lens was effectively anti-momentum: a stock running up was, on net, scored slightly lower than the same stock standing still.</p>

<p>That's wrong for the actual lens. The lens is "buy quality on sale where institutions are accumulating." A name running up because institutions are buying is the <em>exact</em> setup the lens describes. But the score didn't see momentum, only the technical penalty.</p>

<p>New file: <code>packages/core/src/screener/signals/momentum.ts</code>. Score = relative strength vs SPY over 60 days (&plusmn;15) + trend vs 200d moving average (&plusmn;10) + proximity to 52-week high (+8 confirming, -6 if extended). Universal weight 0.3 &mdash; light touch, additive overlay, not re-weighting. The lens still anchors on quality + smart-money; momentum confirms the setup, doesn't dominate it.</p>

<p>The hard part wasn't the math. It was making sure the new layer showed up everywhere a score is shown &mdash; same ticker, same score, every surface. <code>MacroSnapshot</code> extended with <code>spyMom60</code>. Wired into both screener signal blocks (bulk and <code>explainSymbol</code>) so the Lookup chip row + AI Picks + Nova chat all see momentum automatically. AI Picks thesis prompt + Nova system prompt + <code>docs/scoring.md</code> + README + screener skill description all updated to "13 signal layers."</p>

<p>Net effect: quality-on-sale "narrative weakness" patterns still surface (the score doesn't <em>require</em> momentum), but a quality + smart-money + RS leader now ranks above a quality + smart-money name still in a base. Closer to the real lens.</p>

<h2>ETFs as a real UniverseBase</h2>

<p>The audit had budgeted 28 ETFs as a fund-side watchlist. Smoke-testing pushback was sharper: themes I'd missed entirely &mdash; REMX, UFO &mdash; and a deeper question. Do scanners see the same ETFs as the fund? Answer: no. ETFs were fund-local. Two separate problems with one fix.</p>

<p>New file: <code>packages/core/src/screener/data/universe-constituents/etfs.json</code>. 233 curated tickers across broad market, sectors, thematic, country, style. Robotics has its own bucket (BOTZ/ROBO/IRBO/THNQ); EVs and autonomous (DRIV/IDRV/KARS/LIT); hydrogen (HDRO/HYDR); rare earth (REMX); space (UFO/ROKT/ARKX); uranium (URA/URNM/NLR); travel recovery (JETS/AWAY/CRUZ); broader international (ILF/EWP/EWQ/VNM/KSA/EZA/EPI/SMIN). Excluded by design: leveraged + inverse (TQQQ/SQQQ/SOXL &mdash; wrong lens), pure spot crypto vehicles (BITO/IBIT &mdash; vehicle-type mismatch; equity blockchain plays like BLOK/BITQ kept), bond ETFs.</p>

<p><code>"etfs"</code> is now a <code>UniverseBase</code> and a <code>ScreenerUniverseName</code>. Wired into the screener universe loader. Universe dropdown got an "ETFs (~230 themed)" option. New <code>ETF_ROTATION</code> preset: <code>bases: ["etfs"]</code>, no layer floors (smart-money signals abstain on ETFs since insider/congress/13F data doesn't exist for funds), ranks by universal Nova Score on what's available &mdash; technical, momentum, support, regime, fund quality, track record. The fund engine reads from the same <code>UniverseBase</code> via <code>runScan({ universeSpec: { bases: ["etfs"] } })</code>. Single source of truth, no drift between fund and screener. Edit the JSON when themes shift.</p>

<h2>Universe dropdown was eating presets</h2>

<p>This one wasn't on the audit list &mdash; it surfaced from the screener UX while smoke-testing the new presets.</p>

<p>The screener panel's universe dropdown was hardcoded to default to <code>"sp500"</code>. Picking a preset like Nova Conviction (which declares <code>universeSpec: { bases: ["sp500", "sp400"] }</code> in its definition) silently lost the <code>sp400</code> half because the dropdown's <code>universe: "sp500"</code> was overriding the preset's <code>universeSpec</code> in the IPC request. Tooltip said one thing, scan did another.</p>

<p>Fix is a sentinel option: dropdown defaults to <code>"preset_default"</code>. When the sentinel is active, the IPC request omits <code>universe</code> entirely so the preset's own <code>universeSpec</code> flows through. Picking a real universe in the dropdown still works as a deliberate override.</p>

<p>Banked the precedence rule: <code>req.universeSpec &gt; req.universe &gt; preset.universeSpec</code>. UI dropdowns sitting over system defaults need an explicit "do nothing" option, otherwise they become silent overrides.</p>

<h2>Where this leaves Sunday</h2>

<p>Path B+ shipped in one commit, NOVA <code>a583a8f</code>: 18 files, +1042 / &minus;178. LTM site updated to "13 signal layers" in the same arc, LTM <code>c83846d</code>. The blog posts that talked about twelve are intentionally left as-is &mdash; they were correct when written, rewriting them would be revisionist.</p>

<p>The fund still needs a clean slate before inception. There's a DEV-ONLY <code>nova:fund:resetDev</code> IPC that wipes <code>&lt;vault&gt;/projects/nova/fund/</code> and DELETEs the web sync. Firing it Sunday morning, then <code>init_fund</code>, then the first real <code>weekly_run</code> against an actual ledger.</p>

<p>Three days. The audit was the right call.</p>
