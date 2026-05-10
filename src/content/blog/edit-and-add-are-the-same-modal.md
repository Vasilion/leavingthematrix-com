---
title: "Edit and add are the same modal: notes from a Portfolio polish pass"
date: 2026-05-09
summary: "A polish-only pass on the Portfolio panel: a wheel retheme, a nested-scroll trap fixed, four stacked Add forms collapsed into one modal that also handles edit, and a default-tab fix on Nova Fund. The strategic depth got deferred on purpose."
category: nova-dev
tags: ["nova", "ux", "architecture"]
readMinutes: 7
---

<p>A.7.4 was earmarked as a Portfolio overhaul with strategic features: tax-lot tracking, vs-SPY benchmark line, dividend schedule with DRIP, CSV import for the major brokerages, sector and factor exposure breakdown. Each of those is a multi-day PR. Greenlit a polish-and-restructure pass first &mdash; fix the structural issues, then ship the depth as separate work. PR #65 is what landed: six fixes, no new strategic features. Three of them banked patterns worth keeping.</p>

<h2>The wheel got a retheme</h2>

<p>The <code>RadialAllocation</code> doughnut on each portfolio bucket was using random hash-of-id hues with 0.18&ndash;0.32 alpha. The intent had been to give every bucket a visually distinct slice without manual color choice; the result was that nothing read as deliberate. The alpha trick washed everything out against the ink-deep panel background.</p>

<p>Replaced with a curated 6-color rotation against the LTM palette: signal mint &rarr; pulse violet &rarr; warn amber &rarr; signal-dim &rarr; pulse-dim &rarr; bone-dim. Largest bucket always gets primary mint; the rest fall into rotation order. Dropped the alpha &mdash; full saturation against an ink-deep stroke separator reads cleaner. Negative-net buckets get loss color through a <code>tone</code> prop that was already on the component but unused (<code>strokeFor(tone) { void tone }</code> was the actual contents of the function &mdash; banked that as a small reminder to wire props you set up).</p>

<p>Hover lifts the active slice by +4 and shrinks the others by &minus;2, fades non-active to 32% opacity, and adds a Gaussian glow filter; the percentage renders in the center. "+ N more" instead of silent legend truncation past 6, so the user knows there's stuff hidden. Three of the five stacked decorative effects also got removed; only <code>nova-panel</code> survived. Less is more on a chart that has to render 30+ holdings without becoming noise.</p>

<h2>Edit and add are the same modal</h2>

<p>This is the cleanest pattern the PR shipped. The original Portfolio panel had four stacked Add forms below the asset list &mdash; Stock, Stocks total, Cash, Real estate &mdash; and adding a position when you already had thirty holdings meant scrolling past all of them. Vehicle was supported in the data model but had no form. Edit didn't exist at all; you could only add or delete.</p>

<p><code>AddAssetModal</code> got renamed to <code>AssetModal</code> and grew an optional <code>existing</code> prop. Title swaps Add &rarr; Edit. Submit button swaps Add &rarr; Save. Per-kind field state initializes from the existing values when present, blank when not. Kind tabs lock on edit (changing a Cash asset to a Stock would orphan the price-fetch state, so a tooltip explains and the tabs are disabled). The single <code>handleUpsertAsset</code> handler takes an optional <code>existingId</code> so submit preserves the row id on edit and creates a new one on add.</p>

<p>The same shape worked for <code>RenameBucketModal</code> &mdash; Rename button in the bucket header, modal opens with the current name pre-filled. Six-card kind picker on AssetModal includes Vehicle and Other now.</p>

<p>Banked: when an upsert API exists in the data layer, the create + edit UIs can be the same surface with one optional prop discriminating mode. The cost of a separate EditAssetModal would have been duplicate field state, duplicate validation, duplicate per-kind branching &mdash; all of which would drift apart over time.</p>

<h2>Nested scroll containers don't resolve</h2>

<p>The Portfolio panel had two <code>overflow-y-auto</code> containers nested inside <code>flex-1 / min-h-0</code> parents that never resolved to a hard height. Both wanted to scroll; neither could, because neither knew how tall it was supposed to be. The user got either no scroll bar or a scroll bar that scrolled the wrong slab.</p>

<p>Fix: only one scroll container in any vertical stack. The single scroll container is now on <code>&lt;main&gt;</code>. The sidebar has its own scroll container too &mdash; separate column &mdash; with the Add-bucket form pinned to the bottom via <code>border-t shrink-0</code>.</p>

<p>Banked: nested <code>flex-1 / min-h-0</code> + nested <code>overflow-y-auto</code> is a scroll trap. When two scroll containers nest inside flex-1 parents that haven't resolved a hard height, the inner one has nothing to scroll against. Push scroll to the outermost or the innermost, never both.</p>

<h2>Header tightened, sparklines dropped</h2>

<p>A few smaller cuts. The header had a debug line ("Stored in your vault &middot; updates Portfolio/Portfolio.md"), a standalone news-source line, and three action buttons (Refresh prices, Reload, Add bucket). The debug line is gone; the news-source is now a small inline label next to the actions; the Reload button got dropped (redundant with Refresh prices). Net worth is the headline (26px mono); Total assets is secondary. Bucket-delete prompts for confirmation now.</p>

<p>The bucket-row sparklines got dropped entirely. They were mini trend lines next to each bucket's dollar amount. The math worked, but most buckets only had a handful of history points &mdash; the lines mostly looked like a slope artifact rather than a real trend. Removed the Sparkline import, the <code>historyGet</code> effect that fetched the data, and the <code>history</code> state. Dropping a feature that doesn't have enough data to be useful is a real fix; cluttered noise costs more than the empty space it replaces.</p>

<h2>And one fix on the Nova Fund tab</h2>

<p>Separate PR (#66), same theme. Nova Fund had an "auto-switch on initial load" effect that landed you on whatever tab was "most actionable" &mdash; pending trades &gt; draft memo &gt; holdings &gt; pending. The intent was helpful; the effect was that you'd navigate to Nova Fund and end up somewhere unexpected, mid-page through a flow you didn't initiate.</p>

<p>Initial tab is Holdings now. Period. Pending and Memo carry their own work via badge counts on the tab bar; that's enough signal. The auto-switch effect and its <code>tabAutoSet</code> state are gone.</p>

<p>Banked: auto-switching tabs on initial load is too clever. Prefer a stable default plus signal-via-badge over auto-routing the user.</p>

<h2>What got deferred</h2>

<p>The strategic depth that A.7.4 originally scoped is still owed: tax-lot tracking + realized P&amp;L, vs-SPY benchmark line on a perf chart, dividend schedule + DRIP toggle, CSV import (Fidelity / Schwab / Robinhood transaction CSVs), sector + factor exposure breakdown. Each is its own PR. Tax lots is probably the highest leverage if the goal is real P&amp;L tracking. None of them block this polish work; they queue separately.</p>

<p>The polish pass made the Portfolio panel feel deliberate. The depth that turns it into a real investing UX is next.</p>
