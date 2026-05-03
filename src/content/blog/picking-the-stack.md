---
title: "Picking the stack: Electron, Next.js, and the Vercel AI SDK"
date: 2026-04-05
summary: "Why a Jarvis clone in 2026 ends up as a pnpm monorepo with an Electron main process, a Next.js renderer, and a swappable provider layer."
category: nova-dev
tags: ["nova", "architecture"]
readMinutes: 6
---

<p>Day-zero choices on a project like this matter more than they should. Get them wrong and every feature after costs 2x. Get them right and the next six months feel like the codebase is helping you. Here's how I picked Nova's stack and what each choice was actually buying me.</p>

<h2>Desktop runtime: Electron</h2>

<p>I went back and forth on Tauri. Tauri ships a smaller binary, uses the system webview, and the Rust core is genuinely a pleasure to work in. But I want to spawn Python sidecars, talk to native Windows APIs, do tray icons, hook into global shortcuts, and pipe child-process stdout into the renderer DevTools console. Every one of those is a paved road in Electron and a side quest in Tauri. Electron also lets me ship the same Node ecosystem on the main process that I'm already using everywhere else.</p>

<p>The cost is real. A 200MB installer, a per-window Chromium tax, and a child-process model that has cost me actual sleep (more on that in a later post). I'm paying it knowingly.</p>

<h2>UI framework: Next.js 15 in static-export mode</h2>

<p>The renderer is just a Next.js app with <code>output: 'export'</code>. Electron loads the static build off disk in production and points at the dev server during development. I get React 19, Tailwind 4, the app router, server components I don't actually use yet, and a build pipeline that's already battle-tested.</p>

<p>The win that mattered most: I can develop the UI in a normal browser tab when I just want to iterate on a component. <code>pnpm dev:ui</code> serves the renderer on <code>:5173</code>. <code>pnpm dev</code> spins up Electron and points at the same server. Same code, two harnesses. Hot reload works in both.</p>

<h2>Agent layer: Vercel AI SDK</h2>

<p>The Vercel AI SDK (specifically <code>streamText</code>) is what makes the brain swap actually painless. I have a single function signature on the agent loop, and the provider it dispatches to is selected at runtime from a registry:</p>

<pre><code>// packages/core/src/agent/providers/index.ts
const PROVIDERS: Record&lt;ProviderId, ProviderFactory&gt; = {
  anthropic: anthropicProvider,
  google: googleProvider,
  ollama: ollamaProvider,
  openrouter: openrouterProvider,
  max: maxProvider,
  mock: mockProvider,
};</code></pre>

<p>The dropdown in Nova's header writes a string to localStorage; the next message uses whichever provider corresponds. Anthropic, Gemini, an Ollama model running locally, OpenRouter for free tiers — same chat, same tools, different brain. I'll write a whole post on the Anthropic Max router, which was the most painful one to wire up; for now, just know that the abstraction held.</p>

<h2>Monorepo: pnpm workspaces</h2>

<p>The repo is a pnpm monorepo from day one:</p>

<pre><code>apps/
  desktop/   Electron main process — IPC, windows, voice services
  ui/        Next.js renderer (chat dashboard + HUD)
packages/
  core/      Agent loop, providers, voice, vault I/O, SkillRegistry
  shared/    IPC channel types, DTOs
  skills/    One package per plugin skill</code></pre>

<p>Was this overkill on day one? Absolutely. Did I regret it? Not once. The skills system needs a clean module boundary, and so does the IPC contract between main and renderer. Having those as their own packages forces me to keep DTOs explicit and not let the Electron main process leak into business logic. When I added a new skill last week, I ran <code>pnpm nova:skill:new lookup</code> and got a working scaffold in under a minute.</p>

<h2>Voice: local STT, streaming TTS</h2>

<p>I want to talk to Nova when I'm not in front of a microphone array. That means decent audio capture, voice-activity detection, and transcription that doesn't ship my speech to a third party every time I think out loud.</p>

<ul>
  <li><strong>STT:</strong> <code>faster-whisper</code> running <code>medium.en</code> on CUDA via a Python sidecar, fronted by Silero VAD (ONNX) so the renderer only ships actual speech up to the transcriber.</li>
  <li><strong>TTS:</strong> Cartesia Sonic, streamed. Streaming is non-negotiable; nothing ruins the illusion like waiting for a full audio file before playback starts.</li>
</ul>

<p>STT runs cold in about 80ms on my 4090. The presence orb transitions to <em>listening</em> the instant VAD trips, and to <em>speaking</em> the instant the first audio chunk arrives from Cartesia. Felt latency is the metric I optimize for, not first-token throughput.</p>

<h2>Memory: a markdown vault</h2>

<p>Memory is an Obsidian-backed folder under <code>NOVA_VAULT_PATH</code>, watched by chokidar. Conversations log to <code>Conversations/YYYY-MM-DD/</code>. Notes Nova edits show up in Obsidian within milliseconds. There's no DB schema for me to migrate — when I outgrow this, I'll layer SQLite-backed embeddings over the same files for semantic recall.</p>

<p>The principle: <strong>my data is on my disk in plain text in a folder I picked.</strong> Anything fancier has to earn it.</p>

<h2>What this stack costs</h2>

<p>The downside of every choice above is the same: surface area. Electron's child-process model is a footgun in production. Next.js static export disagrees with anything that wants server runtime. Vercel AI SDK has its own opinions about request bodies that don't match every provider. pnpm workspaces means I have to pay attention to peer-dep resolution. The Python sidecar is a separate venv to keep alive.</p>

<p>But every one of those costs is a known cost, and the project has the shape of a thing I can actually ship. Day one was a long week of <code>pnpm install</code> failures and <code>spawn EINVAL</code>s. By the end of week two, the chat loop was streaming, voice was working, and skills were loadable. That's a stack picking itself well enough.</p>

<p>Next up: the brain swap layer. Why pluggable providers turned out to be cheaper than committing to one, and what I learned wiring up Anthropic, Google, Ollama, OpenRouter, and an unofficial Claude Max proxy in the same week.</p>
