---
title: "Why I'm building Nova"
date: 2026-04-01
summary: "An origin story for a Jarvis-inspired desktop AI assistant — built for me, by me, on top of the model APIs I already pay for."
category: nova-dev
tags: ["nova", "origin"]
readMinutes: 5
---

<p>I want a Jarvis. Not the cinematic genius butler — the realistic version. A piece of software that lives on my desktop, listens when I want it to, talks back, holds context across a working day, and reaches into the parts of my life that actually matter to me. Calendar. Notes. Code. The market. My own writing.</p>

<p>The frontier model labs all sell something close to this. I have a Claude Max plan; I have a ChatGPT Plus plan; I have a Gemini key. Each chat window is an island. None of them remember last Tuesday. None of them know what tickers I trade or which Cursor project is currently broken. The intelligence is real, but the surface area is hostile.</p>

<p>So I'm building my own. I'm calling it Nova.</p>

<h2>What I want it to do</h2>

<p>The non-negotiables, in order of priority:</p>

<ul>
  <li><strong>Voice as a primary interface.</strong> Push to talk and hands-free. I want to ask a question while my hands are full and get an answer back through the speakers. No typing tax for the small stuff.</li>
  <li><strong>A presence orb.</strong> Visual feedback that the thing is alive. Idle, listening, thinking, speaking, error. If I can't tell at a glance which state it's in, the interface has failed.</li>
  <li><strong>Pluggable brains.</strong> Anthropic, Gemini, Ollama, OpenRouter — I should be able to flip the model dropdown mid-conversation and the only thing that changes is the answer. The orchestration is mine.</li>
  <li><strong>A skills system.</strong> I don't want to build "an agent that does X." I want a framework where each capability is a plugin: calendar skill, vault skill, screener skill, portfolio skill. New tools should snap in.</li>
  <li><strong>Memory that's mine.</strong> An Obsidian-backed markdown vault, watched live. Notes I take in Obsidian show up in chat. Notes Nova writes show up in Obsidian. The data is on disk, in plain text, in a folder I control.</li>
</ul>

<h2>What I'm not building</h2>

<p>Not a SaaS. Not a startup. No team. No login, no billing, no analytics. This is single-user software that happens to be ambitious — closer to a tricked-out IDE than a product. If it ever ships to anyone else, it'll ship as an installer with my opinions baked in. But that's a problem for later.</p>

<p>I'm also not building a foundation model. The interesting work in 2026 isn't training a smarter brain — the brains are already smart. The interesting work is wiring the brain into the rest of your life without a hundred copy-pastes.</p>

<h2>Why now</h2>

<p>Three things converged. Anthropic's tool-use story finally became something I'd trust with my real data. Vercel's AI SDK matured to the point where swapping providers is a one-line change. And Electron — for all its sins — is still the fastest way to ship a polished desktop app on Windows that talks to native APIs.</p>

<p>The model labs aren't going to build me what I want. They're going to build the 90% case for everyone, and the 10% that's actually mine is going to keep getting punted. Fine. I'll build the 10%.</p>

<h2>This blog</h2>

<p>I'm going to write up the build as I go. Not a tutorial — more of a logbook. Decisions I made, fights I lost, things I learned about Electron's child-process model that I never wanted to know. If you're building something similar, hopefully a few of these save you a Saturday.</p>

<p>Next up: the stack picks. Why Electron + Next.js + Vercel AI SDK, why pnpm workspaces, and why I started with a monorepo on day one even though it was overkill.</p>
