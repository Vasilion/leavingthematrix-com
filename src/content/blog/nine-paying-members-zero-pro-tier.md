---
title: "Nine paying members, zero Pro tier"
date: 2026-05-06
summary: "Sandbox testing surfaced nine active Stripe subscriptions and zero Pro-tier rows in Neon. The bug was one wrong word in a webhook URL. The fix that mattered was the tier gate that should have been there from the start."
category: nova-dev
tags: ["nova", "war-story", "architecture"]
readMinutes: 7
---

<p>Late-night sandbox testing on the new members portal. Nine beta users had clicked through LTM's "Help Me Test For Free!" button, signed up via Clerk, paid with the test card, and gotten back to <code>/macro</code>. On the surface everything looked fine.</p>

<p>Then I checked Neon. Nine users in the <code>users</code> table. Zero rows in the <code>subscriptions</code> table. Every <code>tier</code> column read <code>'free'</code>. Stripe disagreed: nine active subscriptions, money in the test ledger, no failed payments.</p>

<p>The members area was letting them through anyway because the gate was leaky &mdash; which is the more important half of this story. But first, the bug.</p>

<h2>Cross-referencing Stripe against Neon</h2>

<p>I needed ground truth from both systems before guessing at the cause. Wrote two scripts and put them under <code>apps/web/scripts/</code>:</p>

<ul>
  <li><code>debug-user-tier-state.mjs</code> &mdash; dumps every row from <code>users</code> and <code>subscriptions</code> in Neon, with email, tier, and Stripe customer ID.</li>
  <li><code>debug-stripe-subscriptions.mjs</code> &mdash; for each user in Neon, queries Stripe's API for their customer, lists every subscription on that customer, prints the diff against what Neon thinks.</li>
</ul>

<p>The output was unambiguous. Nine users with active Stripe subscriptions. Zero matching rows in Neon's <code>subscriptions</code> table. Several of the test users had multiple Stripe subscriptions on the same customer &mdash; one had three, one had four &mdash; because they had retried checkout when the Pro role didn't kick in. Same payment method, same email, multiple successful charges, still no Pro tier.</p>

<p>The pattern said webhook. Stripe was processing payments, but whatever was supposed to write to Neon on <code>customer.subscription.created</code> wasn't running.</p>

<h2>The misdiagnosis</h2>

<p>Before the cross-ref script came back, I'd guessed wrong. The symptom &mdash; users defaulting to <code>'free'</code> &mdash; looked like the new-user default was set to free, and the subscription write was the only path that flipped them to Pro. So I changed <code>DEFAULT_NEW_USER_TIER</code> in <code>apps/web/lib/auth.ts</code> from <code>'free'</code> to <code>'pro'</code>, on the reasoning that anyone going through the Clerk sign-up flow is by definition signing up for the paid product.</p>

<p>This was the wrong fix. Luke clarified: the original sign-up &rarr; Stripe checkout &rarr; tier-flip flow was intentional and correct. Free users existed as a state &mdash; they just shouldn't have been getting <em>past the checkout page</em>. Reverted the default, kept reading the cross-ref output.</p>

<p>The detour is worth keeping in the post because it's a recurring pattern: when a payment-flow bug surfaces, the temptation is to fix it at whatever layer you happen to be staring at. Defaulting everyone to Pro would have papered over the symptom for new sign-ups while leaving every <em>real</em> failed webhook silently broken behind it. The cross-ref script was the right move; the default-tier change was a stall.</p>

<h2>The root cause</h2>

<p>Stripe Dashboard &rarr; Webhooks. There was a single destination configured. URL: <code>https://nova.leavingthematrix.io/api/clerk/webhook</code>.</p>

<p>That route doesn't exist. The actual Stripe handler in the codebase is at <code>/api/stripe/webhook</code>. The wrong URL had been there the entire time. Stripe's own delivery log showed <strong>257/257</strong> deliveries failing &mdash; almost certainly all 404s &mdash; over the lifetime of the sandbox testing window.</p>

<p>How a typo this clean lasts that long is its own little lesson. The webhook secret in Vercel's env had also been copied from Clerk's webhook destination at some point, so even if I'd noticed the URL mismatch I would have had a stale signing secret to confuse the picture. The two errors masked each other.</p>

<p>Corrected the URL on the existing destination &mdash; same destination ID, just <code>/api/stripe/webhook</code> swapped in &mdash; and rotated the signing secret to the one Stripe actually generated. Next test signup fired all four expected events end-to-end (user row inserted &rarr; Stripe customer linked &rarr; subscription row inserted &rarr; tier flipped <code>free</code> &rarr; <code>pro</code>) within forty seconds.</p>

<p>Backfill: a third script, <code>backfill-subscriptions-from-stripe.mjs</code>, walked the existing nine users, pulled their Stripe truth, and wrote the missing rows into Neon. <code>tier</code> on each user updated by the same script. After it ran the cross-ref came back clean.</p>

<h2>The fix that actually mattered</h2>

<p>The webhook typo was a one-character bug. The reason it mattered &mdash; the reason nine users sat in the members area for hours without anyone noticing &mdash; was structural: <strong>nothing was checking tier when they hit a protected route.</strong></p>

<p>The middleware was checking auth: signed in or redirect to <code>/sign-in</code>. The <code>/checkout</code> page was supposed to be the tier gate, and Clerk's <code>SignIn.forceRedirectUrl</code> and <code>SignUp.forceRedirectUrl</code> were what was supposed to push new sign-ups through it. But <code>forceRedirectUrl</code> is best-effort. OAuth callbacks (Google sign-in) take a different code path and skipped it. Anyone pasting <code>/macro</code> into the URL bar bypassed it. Once the webhook was broken, every newly-paid user landed in the same shape as a user who never paid &mdash; signed in, free tier &mdash; and the gate let them through.</p>

<p>Fix: a second route matcher in <code>apps/web/middleware.ts</code>, called <code>isTierGated</code>. Pro and Elite users pass through. Free users get redirected to <code>/checkout</code>. The tier read is a single Neon SELECT through <code>@neondatabase/serverless</code> &mdash; Edge-compatible, single-digit milliseconds. Fails open on a DB error: better to let a paying member through during a Neon flicker than lock them out, and the page-level <code>getCurrentUser()</code> is still there as a second check. <code>/checkout</code> itself is intentionally <em>not</em> in the matcher &mdash; free users have to be able to reach it to pay.</p>

<p>The lesson, banked: <strong><code>forceRedirectUrl</code> is a UX hint, not a security boundary.</strong> If a paid feature requires a tier check, the check has to live at the network layer where every code path goes through it &mdash; not at one specific Clerk hook that only fires on one specific sign-up flow.</p>

<h2>Tooling that survived</h2>

<p>The diagnostic scripts didn't get deleted after the bug closed. They live on under <code>apps/web/scripts/</code> as standing incident-response gear:</p>

<ul>
  <li><code>debug-user-tier-state.mjs</code> &mdash; Neon dump.</li>
  <li><code>debug-stripe-subscriptions.mjs</code> &mdash; cross-reference Stripe vs Neon.</li>
  <li><code>backfill-subscriptions-from-stripe.mjs</code> &mdash; reconstruct missing Neon rows from Stripe truth.</li>
  <li><code>watch-signup-flow.mjs</code> &mdash; polls Neon every two seconds and emits state-change events while a sign-up is in progress.</li>
  <li><code>delete-test-users.mjs</code> &mdash; tears down a single test user across Stripe + Neon + Clerk in one shot.</li>
  <li><code>wipe-all-users.mjs</code> &mdash; bulk version of the above; dry-run by default, <code>--confirm</code> to actually destroy.</li>
</ul>

<p>The wipe script ran at the end of the session: nine test users gone from Stripe (subscriptions cancelled, customers deleted), gone from Neon, gone from Clerk. Beta testing restarts from a known-empty state.</p>

<h2>Where this leaves the launch</h2>

<p>Self-serve cancellation UX shipped in the same session &mdash; a hand-rolled <code>ManageMembershipModal</code> with cancel-at-period-end (the standard SaaS pattern: keep paid access through the current period, no renewal after) plus a Stripe Customer Portal link for everything we don't build (update card, invoices, payment history). Stripe webhook already handles <code>customer.subscription.updated</code> for the cancel-at-period-end flip and <code>customer.subscription.deleted</code> for the final tier &rarr; free at period end, so no webhook code changed.</p>

<p>The Phase D launch checklist now lives as a six-item comment block above <code>DEFAULT_NEW_USER_TIER</code> in <code>apps/web/lib/auth.ts</code>: live Stripe keys + new live-mode webhook destination, LTM <code>/membership</code> sandbox-banner revert, Stripe Customer Portal config, our own Google OAuth credentials (Clerk's shared dev creds make the consent screen say "signing in to Clerk"), delete the orphan Clerk webhook destination, and a single real-card end-to-end test. Anyone touching auth code before launch can't miss it.</p>

<p>Nova Fund inception is still Sunday, May 10. Four days. The members area is now demo-ready, sandbox-clean, and gated at the right layer for the first time.</p>
