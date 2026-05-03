---
title: "The case of the hallucinated earnings date"
date: 2026-05-01
summary: "A thesis card claimed an earnings date in April 2024 while it was May 2026. Here is the full root cause, the three-layer fix, and the reusable date-grounding helper that is now standard issue for every Nova LLM call."
category: nova-dev
tags: ["nova", "ai", "war-story"]
readMinutes: 7
---

<p>I was reviewing a fresh AI Picks run yesterday and one of the cards said:</p>

<blockquote>"Upcoming earnings report on April 10, 2024."</blockquote>

<p>It was May 1, 2026.</p>

<p>This is the kind of bug that I cannot ship in a tool I trade off of. The whole point of AI Picks is to let me make decisions faster. A confidently stated, confidently wrong date is worse than no date — at least no date forces me to look it up. A hallucinated one slides past me and into a position.</p>

<p>So we stopped feature work and root-caused the entire class of bug.</p>

<h2>Where it came from</h2>

<p>The thesis pipeline lives in <code>packages/core/src/screener/ai-picks/thesis-pro.ts</code>. It's the function that, for each of the top-5 enriched picks, asks the active brain to write the narrative, risk notes, primary catalyst, and invalidation conditions. The relevant inputs include <code>enrichment.earningsNext</code> — the next earnings date, fetched from Yahoo's earnings calendar.</p>

<p>For the offending ticker, <code>enrichment.earningsNext</code> was correctly <code>null</code>. The upstream fetcher had a stale-data filter — if the only "next" earnings was in the past, it filtered the result rather than returning a stale date. Good gate. The wrong layer to count on alone.</p>

<p>The prompt sent to the model had no "today's date" anchor. There was no rule against inventing dates. The schema asked for <code>primaryCatalyst</code> as a free-form string. The model, faced with a missing field and a request for a primary catalyst, did what models do: it filled in something plausible. April 10, 2024 was a real earnings date for that ticker — pulled, presumably, from the model's training memory. Plausible. Wrong. And nothing in the pipeline validated it.</p>

<h2>The audit</h2>

<p>Before fixing the one site, I sent a side agent to audit every LLM call site in the codebase for the same gap: "no today's-date anchor + no rule against inventing dates + a free-form output that could include a date."</p>

<p>The audit returned two more sites. <code>packages/core/src/screener/thesis.ts:generateAiThesis</code> — the simpler quick-thesis fallback — had the same gap. The chat agent (<code>packages/core/src/agent/system-prompt.ts</code>) and the AI Picks slice selector (<code>packages/core/src/screener/ai-picks/slice-selector.ts</code>) both already injected today's date into the prompt and were safe.</p>

<p>So: two known-vulnerable sites, two known-safe sites. The fix needed to make the safe pattern reusable so future call sites would default to safe.</p>

<h2>The fix, layer one: a date-grounding helper</h2>

<p>I extracted the safe pattern into <code>packages/core/src/screener/text-guard.ts</code>:</p>

<pre><code>// dateGroundingRules(now) returns reusable system-prompt copy
// to inject into any LLM call where the output may contain dates.
export function dateGroundingRules(now: Date): string {
  const iso = now.toISOString().slice(0, 10);
  const year = now.getFullYear();
  return `
    Today is ${iso} (year ${year}).
    Do not invent dates that are not present in the input data.
    If a date is requested but not provided, write "TBD" or omit the field.
    Treat any year more than one calendar year from ${year} as suspect.
  `;
}

// findStaleYear(text, now) returns the offending substring if the
// text mentions a year more than ±1 year from now, else null.
export function findStaleYear(text: string, now: Date): string | null {
  const year = now.getFullYear();
  const allowed = new Set([year - 1, year, year + 1]);
  // Match standalone years 19xx-20xx, with negative lookbehind for
  // currency/volume contexts ($2024.50, 2,024,500) which are not dates.
  const re = /(?&lt;![\d.,$])(19\d{2}|20\d{2})(?![\d,])/g;
  for (const match of text.matchAll(re)) {
    const y = Number(match[1]);
    if (!allowed.has(y)) return match[0];
  }
  return null;
}</code></pre>

<p>The regex took a few iterations. Stocks have prices like <code>$2024.50</code> and volume rows like <code>2,024,500</code>. Both contain "2024" but neither is a date. The negative lookbehind on <code>$</code>, digits, dots, and commas — combined with the negative lookahead — gates those out without false negatives on actual date contexts. Smoke test: 14 cases including the original bug repro, fiscal-year refs (FY-2025, FY-2027), ISO dates, prices, volumes, and multi-year strings. All 14 correct.</p>

<h2>The fix, layer two: deterministic fields</h2>

<p>The most leveraged fix is to <strong>not let the model write the field at all</strong>. The original schema had <code>primaryCatalyst</code> and <code>invalidation</code> as model-generated strings. Both are derivable from data:</p>

<ul>
  <li><code>primaryCatalyst</code> = next earnings date (from <code>enrichment.earningsNext</code>) if it falls in the next 14 days, else the top signal layer's reason ("RSI mean-reversion at level X" / "earnings beat reaction" / etc.).</li>
  <li><code>invalidation</code> = the technical stop level + the price condition ("close below $X invalidates").</li>
</ul>

<p>So <code>thesis-pro.ts</code> got refactored. Both fields are now built deterministically before the LLM is called. The model only writes <code>narrative</code> and <code>riskNotes</code>. With those two fields off the table, the LLM's surface area for date hallucination shrinks to just the prose — which is also where the date-grounding rules apply hardest.</p>

<h2>The fix, layer three: post-validation</h2>

<p>Even with the rules in the prompt, models can still slip. So <code>narrative</code> and <code>riskNotes</code> get post-validated:</p>

<pre><code>const stale = findStaleYear(result.narrative + ' ' + result.riskNotes, now);
if (stale) {
  console.warn(`[thesis-pro] stale year ${stale} detected; falling back to template`);
  return buildTemplateThesis(input);  // deterministic, dateless
}
return result;</code></pre>

<p>If the model emits a stale year, we throw the output away and fall back to the deterministic template thesis. The user gets a less colorful response, but never a wrong one. <code>thesis.ts:generateAiThesis</code> got the same treatment.</p>

<h2>The pattern, generalized</h2>

<p>I keep coming back to the same shape for guarded LLM calls:</p>

<ul>
  <li><strong>Inject context the model needs to be correct.</strong> Today's date. The list of valid tickers. The schema for the response.</li>
  <li><strong>Use deterministic computation for fields that have a right answer.</strong> The model is good at judgment, bad at arithmetic and dates.</li>
  <li><strong>Post-validate.</strong> Run a cheap check on the output before trusting it. Fall back to a deterministic alternative if the check fails.</li>
</ul>

<p>The first two were obvious in hindsight. The third is the one I keep forgetting and re-learning. A model is a function from prompts to outputs that's <em>usually</em> right. The pipeline around it has to assume "usually" and bound the failure mode.</p>

<h2>The cost of the bug</h2>

<p>Real money? None — I caught it before trading on it. Engineering time: about three hours total. Code added: <code>text-guard.ts</code> (60 lines), refactor of two thesis files (~200 lines net change). Smoke tests: 14 cases on the regex, all green. <code>pnpm -r typecheck</code> clean.</p>

<p>The bug taught me to treat any LLM-generated date the same way I treat any LLM-generated SQL — as suggestion, not source of truth. <code>text-guard.ts</code> is now the canonical helper for any future call site that produces user-facing prose with date risk. It's the first defense I bolt on before I write the prompt.</p>

<p>Next up: production polish. Custom app icons that almost shipped without working, an orphaned Node process holding port 3000 across Nova restarts, and the Windows process tree that reminded me why people avoid Electron.</p>
