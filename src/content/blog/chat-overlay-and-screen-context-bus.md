---
title: "What Nova's looking at: a chat overlay and a screen-context bus"
date: 2026-05-09
summary: "The chat is no longer a tab you navigate to. It's an overlay that opens over whatever panel you're on, and Nova reads the panel's state before she answers. The validating moment came when she criticized her own fund picks."
category: nova-dev
tags: ["nova", "architecture", "ux"]
readMinutes: 7
---

<p>The chat tab has been there for a while: a panel inside Nova's left sidebar where you can talk to her, run skills, get an answer. It works fine if you remember what you were looking at and re-name it for her. The thing that's been missing: she can't see your screen. You ask her about "this stock" and she has to ask which one.</p>

<p>Path B+ shipped Friday. Pillar A.6 (LookupPanel sub-component split) was on deck. We took A.7.1 instead: promote the chat from "tab you navigate to" to "overlay you open over whatever's already on the screen," and add a context bus so Nova reads what panel you have open before answering. Six slices, one PR (<code>#61</code>).</p>

<h2>The screen-context bus</h2>

<p>Every panel that wants Nova to know about it publishes a small JSON snapshot to a shared store on a debounced cadence. New <code>useScreenContextPublisher</code> hook in <code>apps/ui/lib/</code>. Lookup publishes (ticker, score breakdown, current zone, last earnings surprise, smart-money summary). Nova Fund publishes (cash, total, holdings, sector exposure, pending trades, draft memo if any). Screener publishes (preset, top 10 results). Insiders / Congress / 13F panels each publish (current filters, top 5 names). And so on &mdash; eight more panels behind those.</p>

<p>The bus stores the most recent snapshot from each panel plus which panel is "active" (whichever one is rendered on the dashboard surface). When you open the chat overlay, the active panel's snapshot gets injected into Nova's system prompt as a <code>&lt;screen_context&gt;...&lt;/screen_context&gt;</code> block. She can quote ticker, score, exposure, current filters &mdash; straight from the snapshot &mdash; without navigation, without you naming anything.</p>

<h2>The overlay</h2>

<p>Ctrl+N (used to open a small text-input modal) now opens a full chat overlay. Drag-positionable; position persists in localStorage. Hover the orb in the top-right of the dashboard and you get a "Nova Watching" popover with a one-liner of what panel she sees and the ticker (when applicable).</p>

<p>The chat tab still exists for thread browsing &mdash; the overlay's surface is for the active conversation, the tab's surface is "find an old conversation, reopen it." Two different jobs.</p>

<h2>The validating moment</h2>

<p>Once everything was wired and Nova restarted, opened the Nova Fund tab, hit Ctrl+N, asked Nova what she thought.</p>

<p>She criticized her own picks. Flagged tech concentration. Said the picking approach was off for the lens. Same critique I'd surfaced a week earlier in a different conversation: "she has ETFs that come up too, which is nice. But I'm not sure she's considering small caps in that run-week scan at all."</p>

<p>She got there from the screen-context bus alone. She read her own sector exposure off the snapshot, weighed it against the Quality &times; Discount &times; Smart-money lens that's in her system prompt, and reached the conclusion independently. That's the bar A.7.1 had to clear: not "Nova answers about whatever ticker you mention," but "Nova sees what you see and forms her own read."</p>

<h2>Two bugs to bank</h2>

<p><strong><code>[object O...]</code> in the Nova Watching chip.</strong> First version read <code>zoneOf(score)</code> and rendered the result inline. <code>zoneOf</code> returns a <code>NovaScoreZoneMeta</code> object, not a string &mdash; so the chip showed <code>[object O...]</code> truncated to the chip width. Fix: read <code>zoneMeta.label</code>. Commit <code>3500431</code> on the chat-overlay branch.</p>

<p><strong>"You didn't give me a ticker" &mdash; but the chip looked right.</strong> Asked Nova about a ticker that the screen-context bus said was active. She replied she had no ticker. The chip in the overlay was rendering correctly &mdash; the snapshot was visible to the UI. But Nova couldn't see it.</p>

<p>Cause: <code>packages/core</code> had built-but-not-loaded changes. <code>electron-vite</code> hot-reloads the renderer bundle (UI changes appear instantly) but does <em>not</em> hot-reload the main bundle (anything in <code>packages/core</code>, IPC handlers, system-prompt assembly). The injection logic was right in the source; the running process was using the previous build.</p>

<p>Banked as a Nova-specific dev pattern: when an IPC or system-prompt change "doesn't take," check if it's in <code>packages/core</code> first. UI changes trust hot-reload; main-process changes need a full Nova restart.</p>

<h2>What this unlocks</h2>

<p>The screen-context bus isn't just for chat. The next tier of features falls out of it: "ask Nova about this row" right-click menus, panel-aware skills (a <code>/explain</code> that already knows the ticker), cross-panel comparisons ("compare this to my Nova Fund holdings" works because the fund's snapshot is in the bus too).</p>

<p>It also surfaces a real feedback loop. The validating moment was about the picker, not the chat: Nova's critique flagged that the universe filters and scoring math want a rework. The fact that Nova got there on her own says the bus is doing real work, not theater &mdash; and the next pillar (A.7.2) is the fund-mode score reweighting that her own critique pointed at.</p>

<p>A.6 (LookupPanel split into sub-components) is still next. The chart visual layer is done; the 2,960-line file wants to be five files. Then A.7.2 with the reweighting Nova herself flagged.</p>
