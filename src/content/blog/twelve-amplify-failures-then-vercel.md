---
title: "Twelve Amplify failures, then five minutes on Vercel"
date: 2026-05-06
summary: "The members portal at nova.leavingthematrix.io is live, in sandbox mode. Two hours of deploy debugging, twelve consecutive Amplify failures, then a host swap that worked first try."
category: nova-dev
tags: ["nova", "war-story", "architecture"]
readMinutes: 7
---

<p>Nova's members portal is live at <code>nova.leavingthematrix.io</code>. Sandbox mode for now &mdash; Stripe test keys, the LTM <code>/membership</code> page is recruiting beta testers with a "Help Me Test For Free!" button and the 4242 4242 4242 4242 card details inline. Public launch is one Stripe live-keys swap away.</p>

<p>The interesting story isn't the launch itself. It's the four hours between "deploy to Amplify" and "live on Vercel," and what that taught me about picking the right host for the right shape of app.</p>

<h2>The plan was Amplify</h2>

<p>Vasilion's GitHub org already has Amplify set up. The LTM site lives there. Trajectory lives there. Unycross lives there. The natural answer for the new Next.js app at <code>apps/web</code> was "just put it on Amplify too." Same workflow, same console, same DNS pattern.</p>

<p>First deploy attempt: failed. Second: failed. The error was the same on both: Amplify's SSR validator rejecting the artifact with "Server trace files are not found."</p>

<h2>Twelve consecutive failures</h2>

<p>Over the next two hours I tried every reasonable combination I could find:</p>

<ul>
  <li>Vanilla <code>pnpm install</code> in the build phase.</li>
  <li>Next.js <code>output: "standalone"</code>.</li>
  <li>Hoisted <code>node-linker = "hoisted"</code> in <code>.npmrc</code>.</li>
  <li><code>pnpm deploy --legacy</code> to flatten dependencies.</li>
  <li>Custom <code>amplify.yml</code> restructuring &mdash; rebuilding the artifact in a deploy directory with manually placed <code>server.js</code>, <code>required-server-files.json</code>, and a real flat <code>node_modules</code>.</li>
  <li>Build-inside-deploy-dir patterns where the <code>cd</code> happened before the build, after the build, and around the validator.</li>
</ul>

<p>Same error every time. The artifact had textbook structure on multiple attempts &mdash; 60+ MB of real flat <code>node_modules</code>, <code>.next/server/app/*</code> with every manifest the docs called out, <code>server.js</code> at the root, <code>required-server-files.json</code> hoisted properly. The Amplify SSR validator was rejecting it with the same string each time, and the string didn't change between attempts that produced structurally different artifacts.</p>

<p>That last detail was the actual diagnosis. When four meaningfully different artifact shapes produce the same error, the error isn't telling you what's wrong. It's telling you the validator can't recognize what it's looking at.</p>

<h2>The pivot</h2>

<p>Dropped Amplify. Connected the same repo to Vercel.</p>

<p>Five minutes later it was live. No <code>amplify.yml</code>, no standalone-output dance, no node-linker tweaks, no manual artifact restructuring. The same code that Amplify had rejected twelve times deployed cleanly on first try. <code>nova.leavingthematrix.io</code> wired in via Route 53 CNAME, SSL auto-provisioned, working portal.</p>

<p>Vercel's pricing: Hobby covers all the technical limits for an app this size. Going to flip to Pro ($20/mo) before public launch since Hobby ToS technically requires non-commercial use, but for sandbox testing the free tier is fine.</p>

<h2>Why this happened</h2>

<p>I want to be careful not to dunk on Amplify here. Amplify is genuinely excellent for static sites and standard Node apps &mdash; the LTM site lives there happily, Trajectory lives there happily, the unycross blog you're reading on the unycross side lives there happily. The shape of app that made it fall down is specific:</p>

<blockquote><strong>pnpm monorepo + Next.js 15.5 + SSR + standalone output</strong></blockquote>

<p>That combination has a lot of moving parts. The pnpm side wants a workspace-aware install with hoisted dependencies. The Next.js standalone-output side wants its build artifact restructured into a specific shape. Amplify's SSR validator is conservative about what it accepts. The intersection of those three constraints didn't converge for us in any of the twelve attempts.</p>

<p>Vercel built that exact intersection as a first-class workflow because Next.js is their product. They've solved the workspace-detection, the standalone-output handling, and the SSR-edge integration in code that's been hardened by every Next.js app on the platform. Picking Vercel for a Next.js SSR app is not "Vercel is better" &mdash; it's "right tool for the right job." Picking Amplify for a static Astro site (which is what LTM is) was the right call for the same reason. Different tools, different shapes.</p>

<p>The lesson, banked: <strong>when an error message stops changing across structurally-different attempts, stop tweaking and consider whether the tool is wrong for the workflow.</strong> Sometimes the answer is "this stack doesn't support that natively." Two hours of <code>amplify.yml</code> iteration would have been better spent on the host swap that took five minutes.</p>

<h2>Two collateral changes</h2>

<p>While the deploy was unblocking, two other things shifted shape:</p>

<p><strong>FRED dropped from the web <code>/macro</code> page.</strong> Vercel's <code>iad1</code> region apparently has unreliable connectivity to FRED's CSV endpoint. CSV fetches timed out, cache got poisoned with empty results, aggressive <code>AbortSignal</code> handling didn't fix it. Spent about thirty minutes on timeout bumps and throw-on-empty handling before deciding that if FRED can't render reliably from the web, it shouldn't render at all there. Removed all FRED-dependent sections (rates / yield curve / growth + inflation / labor) from the web <code>/macro</code> page. 439 lines deleted. The page is now Polymarket + Volatility Dashboard only.</p>

<p>Nova desktop still has FRED via its own cache &mdash; this isn't a Nova-wide regression, just a web-side one. Future option if web ever needs FRED back: mirror FRED snapshots into Neon (same pattern we already use for ClickCapital data), have Nova desktop push, web reads from DB. About thirty minutes of refactor when needed. Not blocking launch.</p>

<p><strong>Forced Stripe checkout flow.</strong> Luke's wife test-signed-up the new portal and got into the members area immediately &mdash; full access, no payment, no tier check. The Clerk sign-up flow was redirecting straight to <code>/macro</code> rather than gating on payment. Real launch-blocker.</p>

<p>New <code>/checkout</code> page (server component) checks the user's tier on every visit. Pro and Elite users redirect straight to <code>/macro</code>. Free users land on a client component that fires <code>POST /api/checkout</code> on mount and follows the returned Stripe URL via <code>window.location</code>. Clerk's <code>SignIn</code> and <code>SignUp</code> <code>forceRedirectUrl</code> changed from <code>/macro</code> to <code>/checkout</code>; the page self-routes pro users so it works for both new sign-ups and returning sign-ins. Tested end-to-end with the test card &mdash; webhook fires, <code>users.tier</code> flips to <code>pro</code> in Neon, user lands at <code>/macro?checkout=success</code>.</p>

<h2>Where this leaves Nova</h2>

<p>Members portal live in sandbox mode at <code>nova.leavingthematrix.io</code>. Anyone who hits LTM <code>/membership</code> can click "Help Me Test For Free!" → sign up via Clerk → get redirected to Stripe with the test card details visible on the previous page → land in the members area as a Pro tier. Mobile UX got a parallel overhaul this session (a different post; the short version is hamburger menu, hand-rolled click-toggle popover with viewport clamping for the info bubbles, wrapping-chip sub-tabs, and the <code>h-screen</code> → <code>h-dvh</code> trick for mobile Chrome's URL-bar handling).</p>

<p>Last technical step before public launch is the Stripe live-keys swap. About ten minutes of work: create live Product + Price in the Stripe dashboard, swap five env vars in the Vercel project (<code>sk_test_*</code> → <code>sk_live_*</code>, <code>pk_test_*</code> → <code>pk_live_*</code>, the live price IDs and webhook secret), revert the LTM sandbox banner, push.</p>

<p>Nova Fund inception is still Sunday, May 10. Four days out. Sunday morning, the simulator runs its first <code>weekly_run</code>, proposes its first trades against universal Nova Score, the click-to-approve UI surfaces them, the memo gets voiced and published. Public track record starts from zero. The diagnostic <a href="/blog/role-playing-tool-calls" target="_blank" rel="noopener">log from last post</a> will be watching.</p>
