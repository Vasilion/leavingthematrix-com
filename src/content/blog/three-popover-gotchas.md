---
title: "Three popover gotchas in one polish pass"
date: 2026-05-09
summary: "A chat-sidebar polish pass shipped two new popovers and surfaced three different ways to make a popover not work: an ancestor backdrop-filter clipping it, a native browser tooltip occluding it, and a custom CSS class quietly beating Tailwind's .fixed utility."
category: nova-dev
tags: ["nova", "ux", "war-story"]
readMinutes: 7
---

<p>A.7.5 was a chat-sidebar polish pass &mdash; search, date grouping, hover previews, the works. Five items shipped in PR #64. Most of the work was layout. The interesting part is that two new popovers in the same pass surfaced three different ways to make a popover not work.</p>

<h2>Gotcha 1: backdrop-filter ancestor clipping</h2>

<p>The conversation sidebar got a hover-preview popover: rest on a row for 280ms, get the last ~260 chars of that conversation rendered to the right of the sidebar. First version used <code>position: fixed</code> with <code>top</code> and <code>left</code> set from the row's bounding rect. Looked obvious, didn't work &mdash; popover rendered, then immediately got clipped to invisibility on the right edge.</p>

<p>The cause is in the dashboard's outer chrome. <code>.nova-scan-sweep</code> (an animated background gradient on the dashboard) sets <code>backdrop-filter</code>. Per CSS spec, an element with <code>transform</code>, <code>filter</code>, or <code>backdrop-filter</code> becomes the containing block for <code>position: fixed</code> descendants &mdash; combined with an <code>overflow: hidden</code> somewhere up the tree, the popover gets clipped to the ancestor instead of the viewport.</p>

<p>This is the same trap we banked back when the (i) info-bubble popovers inside Cards on the macro page broke for the same reason. Different surface, identical CSS containing-block rule. The fix is the same too: <code>createPortal(popover, document.body)</code>. Once the popover is mounted directly under <code>&lt;body&gt;</code>, no ancestor's backdrop-filter can grab it.</p>

<h2>Gotcha 2: HTML <code>title=</code> is louder than your popover</h2>

<p>After portaling the popover to body, it rendered correctly &mdash; but on hover the row showed a ghostly second tooltip overlapping the popover content. Native browser tooltip. The conversation-row component had <code>title={c.filePath}</code> on the wrapping element for accessibility. The browser renders that as a small box on hover, and the box stacks above any popover the React tree renders &mdash; there's no z-index trick that beats native tooltips.</p>

<p>Drop the title attribute on the wrapping element. Done. Banked: when you add a custom hover popover to a row that has a <code>title</code> attribute, the native tooltip will visually occlude the popover. Strip the title or move it to a sub-element that's not the hover target.</p>

<h2>Gotcha 3: when <code>.nova-panel</code> beats <code>.fixed</code></h2>

<p>The header got a System Status button: 32&times;32 icon left of the model picker, click to toggle a popover with environment / health info. Three iterations to get it right.</p>

<p>First attempt: <code>absolute right-0 top-full mt-2</code> with <code>maxHeight: 70vh</code>. Content overflowed the visible viewport on this window size. Switched to <code>position: fixed</code> with viewport-aware <code>top</code> and <code>right</code> computed from the button's rect, plus a recompute on resize and scroll, and <code>maxHeight = window.innerHeight - top - 12px</code> so the popover always fits.</p>

<p>Second attempt: portaled to body, all the math right. Popover did not render. At all. Inspector showed it in the DOM, painted nowhere.</p>

<p>Third attempt &mdash; actual debugging. The popover element had Tailwind's <code>.fixed</code> class. It also had <code>nova-panel</code> for the dark-frosted-glass styling. <code>globals.css</code> defines <code>.nova-panel { position: relative }</code>. Both rules are single-class selectors, equal specificity &mdash; and <code>globals.css</code> loads after Tailwind. Last rule wins. The popover was sitting at the bottom of <code>&lt;body&gt;</code> with <code>position: relative</code>, which made <code>top</code> and <code>right</code> no-ops &mdash; it laid out wherever the document flow put it, which was off the bottom of the visible area.</p>

<p>The fix is one line: set <code>style.position = "fixed"</code> inline on the element. Inline styles beat any class-level CSS rule short of <code>!important</code>. Banked as a memory: when a Tailwind position or display utility seems ignored on an element that has a custom class, the custom class probably defined the same property after Tailwind loaded. Inline <code>style.X</code> always wins.</p>

<h2>Brand: Nova icon to mint</h2>

<p>Same PR did one other thing worth noting. The theme migration earlier this month moved Nova's UI from the original red/orange "fiery sun orb" palette to the mint-matrix scheme. The desktop app's icon was the only piece that stayed on the old palette &mdash; <code>apps/desktop/build/icon.svg</code> was still rendering the orange variant in the taskbar, the alt-tab list, and the installer.</p>

<p>Rewrote the SVG keeping the same compositional grammar (hot center &rarr; mid &rarr; rim &rarr; halo + 3 orbital rings) in mint: ink-deep background <code>#02100c</code>, white-mint hot center, signal-mint mid <code>#00ffc6</code>, dark-teal outer ring, mint orbital strokes. Regenerated <code>icon.png</code> (1024&times;1024) and <code>icon.ico</code> (16/24/32/48/64/128/256 multi-resolution) via <code>pnpm build:icon</code> (sharp + png-to-ico). Added <code>build:icon</code> as a prereq of <code>dist:win</code> so packaged installers always pick up the latest SVG. The dev tray-icon fallback (used when <code>out/resources/icon.png</code> is missing) was hardcoded to a blue RGB triplet &mdash; switched to mint.</p>

<p>One gotcha worth banking from this. <code>apps/desktop/build/</code> was wholesale-ignored in <code>.gitignore</code> ("build artifacts"), but the icons are source-controlled. The existing <code>dir/</code> ignore + <code>!dir/file</code> exception silently failed because git doesn't recurse into excluded parents &mdash; the <code>!</code> exception never gets evaluated. Switched to the <code>dir/*</code> + <code>!dir/keep.ext</code> form, which DOES allow exceptions. Brand assets are now actually tracked.</p>

<h2>What this means for next time</h2>

<p>Three popover gotchas, one polish pass, one PR. The pattern across them is the same: when a popover doesn't render or doesn't reach the right place, the assumption to test is that something further up the tree (a CSS rule, a containing block, a native tooltip) is intercepting the thing your code is trying to do. Portal-to-body is the answer for two of three; inline styles are the answer for the third.</p>

<p>The two new memories from the popover work and the one from the gitignore work all live in the durable-memory pile alongside <code>feedback_card_backdrop_filter_clipping</code> from the prior incident with the same root cause. Future-self reading this should expect to debug ancestor-rule problems before component-internal ones.</p>
