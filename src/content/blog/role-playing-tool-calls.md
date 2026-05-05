---
title: "Role-playing tool calls"
date: 2026-05-04
summary: "Nova Fund confirmed a $1,000 deposit and a SPY buy in chat. State on disk said the fund had zero cash and no positions. The LLM was narrating tool calls without invoking them."
category: nova-dev
tags: ["nova", "ai", "war-story"]
readMinutes: 6
---

<p>Nova Fund's decision engine landed this week. <a href="/blog/drip-for-nova-fund" target="_blank" rel="noopener">DRIP shipped last post</a>; phases 1, 2, and 3 of the broader portfolio-product arc shipped on top of it. The fund now has a ledger, state, validators, a sector tagging utility, analytics, memos with a draft &rarr; voiced &rarr; published lifecycle, a weekly proposal builder that calls the screener and ranks candidates against a constitution, click-to-approve trade commit, a sector-aware allocator that diversifies instead of stacking the top-scoring tech names, and a single <code>weekly_run</code> command that wraps the whole Sunday-night routine. Twenty-one chat-callable skill tools.</p>

<p>This post isn't really about any of that. It's about the smoke test that almost ate four hours of my evening and the one-line diagnostic that didn't.</p>

<h2>The smoke test</h2>

<p>The recommended verification path for Nova Fund is "fire up Nova, drive the skill from chat." There's no standalone TS runner in the repo, no <code>tsx</code> harness, no node REPL convenience. The shape of the smoke is:</p>

<ol>
  <li>Init the fund with today's date.</li>
  <li>Deposit $1,000.</li>
  <li>Read state. Should show cash = 1000.</li>
  <li>Buy 1 SPY at $580. ETF, sector etf-broad.</li>
  <li>Read state. Should show cash = 420, position = 1 SPY @ $580 cost basis.</li>
  <li>Read ledger. Should show three entries: init, deposit, buy.</li>
</ol>

<p>Luke ran it. Nova confirmed everything in chat:</p>

<blockquote>"Initialized fund. $1,000 deposited &mdash; cash balance now $1,000. Bought 1 share of SPY at $580. Position open, cost basis $580. NAV: $1,000."</blockquote>

<p>Then he ran <code>state</code> again to double-check. Cash = 0. Positions empty. NAV = 0.</p>

<p>Then <code>ledger</code>. One entry: the init line. No deposit. No buy.</p>

<h2>The bug-hunt that almost happened</h2>

<p>This is the kind of thing where the first instinct is a write bug. The lock isn't releasing. <code>appendLedger</code> is throwing into a swallowed catch. <code>applyDeposit</code> is mutating an in-memory copy and the persist path is broken. <code>fs.writeFileSync</code> is hitting an EBUSY because OneDrive is syncing the vault directory underneath us.</p>

<p>I had <code>state.ts</code> and <code>ledger.ts</code> open and was reading through the lock + persist sequence before the smarter instinct showed up.</p>

<h2>The smarter instinct</h2>

<p>Before reading the implementation: <em>verify the tool was actually called</em>.</p>

<p>One line at the top of the skill's <code>invoke</code> handler:</p>

<pre><code>console.log(`[nova-fund] invoke ${tool} ${JSON.stringify(args)}`);</code></pre>

<p>Restart Nova. Re-run the smoke. Watch <code>dev.log</code>.</p>

<p>The init call fired the log: <code>[nova-fund] invoke init {"inceptionDate":"2026-05-05"}</code>. Then the chat said "Depositing $1,000…" and there was nothing in the log. No <code>[nova-fund] invoke deposit ...</code> line. The chat continued to "Bought 1 SPY at $580…" — still no log line. Then "$1,000 NAV, SPY position confirmed, ledger has 3 entries."</p>

<p>The skill had been called exactly once. The LLM had narrated the rest of the conversation as if the tools had fired. Confidently. With "✓" marks.</p>

<h2>What was actually happening</h2>

<p>The model had learned, somewhere in its training, that confirming the result of a tool call is a reasonable response shape when a tool call is in flight. Apparently it occasionally interprets <em>"a tool call should happen here"</em> as <em>"narrate what the tool call would have returned."</em> The actual tool-use block never makes it into the output. The model produces text that looks like a tool result, the user reads it as one, and the side effect that should have happened never did.</p>

<p>I don't know exactly what triggers this. The first call (init) fired correctly, so it's not a structural problem with the skill registration or the tool catalog. Something about the conversational rhythm after the init &mdash; maybe "deposit" reads as more conversational than "init" and the model picked the wrong response shape. Maybe a context-cache quirk. Hard to characterize.</p>

<p>The practical answer is more useful than the theoretical one: <strong>don't trust the LLM's chat narrative about tool calls. Trust the side effect.</strong> The chat is a description of what the model thinks happened. The persisted artifact is the only authority for what did.</p>

<h2>The pattern, banked</h2>

<p>When on-disk artifacts disagree with the LLM's chat narrative, <strong>first verify the tool was actually called.</strong> A single console.log at the top of the skill's invoke handler is the right diagnostic. It's authoritative &mdash; it only fires when <code>execute()</code> runs. It tells you the args the model passed (so you can also catch schema-mismatch issues, which were my second guess after this episode). And the cost is measurable in microseconds; you can leave it in production indefinitely.</p>

<p>Cheaper than reading the implementation looking for a bug that's not there. Cheaper than instrumenting the lock. Cheaper than walking through OneDrive's sync behavior.</p>

<p>The diagnostic stays in. <code>dev.log</code> now shows a real trace of every Nova Fund tool invocation. The LLM's chat narrative is still useful for human readability, but it's no longer the source of truth for "did the deposit happen." The log line is.</p>

<p>This is also a generalization of a much older lesson about model output. A model is a function from prompts to outputs that's <em>usually</em> right about the world. It is, by construction, unable to be authoritative about whether code ran. Anything load-bearing about side effects has to be checked at the side-effect site, not at the model's description of the side effect.</p>

<h2>What's next</h2>

<p>Phase 4 of the portfolio product also shipped this session &mdash; Clerk + Neon + Stripe wired together end-to-end into a Next.js app at <code>apps/web</code>. Subscription flow proven in dev: sign up, hit Checkout with the Stripe test card, watch the user's <code>tier</code> column flip from <code>free</code> to <code>pro</code>, watch the badge in the header update on refresh. That's a different post; this one's already long enough.</p>

<p>Inception is May 10. Phases 1, 2, 3, and 4 are done. The simulator is real, the decision engine is real, the click-to-approve flow is real, the web app is real. Sunday morning, Nova Fund will hold its first weekly_run, propose its first trades, voice its first memo, and start a public track record from zero. The diagnostic log will be watching.</p>
