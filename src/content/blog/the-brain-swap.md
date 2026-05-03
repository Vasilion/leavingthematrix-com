---
title: "The brain swap: pluggable AI providers in one chat loop"
date: 2026-04-10
summary: "How Nova flips between Claude, Gemini, Ollama, OpenRouter, and an unofficial Claude Max proxy mid-conversation — and the five gotchas that made the Max provider painful."
category: nova-dev
tags: ["nova", "providers", "anthropic"]
readMinutes: 8
---

<p>If a personal AI tool depends on one model lab's API, you're going to have a bad week eventually. Rate limits, regional outages, pricing changes, model deprecations — they're not hypothetical, they're scheduled. So I built Nova to swap brains at runtime from the start.</p>

<p>The header has a provider dropdown and a model dropdown. Pick <em>anthropic + claude-sonnet-4-6</em>, send a message — Sonnet answers. Open the dropdown again, pick <em>google + gemini-2.5-pro</em>, send the next one — Gemini answers, in the same conversation. The chat doesn't reset. Tool calls keep working. Voice keeps working. The only thing that changes is the personality on the other end.</p>

<h2>The provider contract</h2>

<p>Every provider is a function that returns whatever the Vercel AI SDK's <code>streamText</code> wants for its <code>model</code> argument. That's it. The agent loop calls one function, gets back a model, hands it to <code>streamText</code> with the conversation and tool list. The provider's only job is to know how to construct the SDK's adapter for its respective lab.</p>

<pre><code>// packages/core/src/agent/providers/index.ts
export type ProviderFactory = (config: ProviderConfig) =&gt; LanguageModel;

const PROVIDERS = {
  anthropic: anthropicProvider,
  google: googleProvider,
  ollama: ollamaProvider,
  openrouter: openrouterProvider,
  max: maxProvider,
  mock: mockProvider,
} satisfies Record&lt;ProviderId, ProviderFactory&gt;;</code></pre>

<p>Anthropic, Google, OpenRouter, and Ollama are essentially one-liners — the SDK has first-class adapters for each. <code>mock</code> exists so I can develop without spending tokens. The interesting one is <code>max</code>.</p>

<h2>The Anthropic Max provider</h2>

<p>I pay for Anthropic's Max plan because I use Claude all day. Anthropic does not officially expose Max-tier inference through the API — the plan is for the chat product. There's an unofficial open-source proxy called <code>anthropic-max-router</code> that authenticates as the Claude desktop app and re-exposes the Max relationship as a local Anthropic-compatible endpoint on <code>http://localhost:3000</code>. If I'm going to use it personally, I want it bound into Nova so I never think about it.</p>

<p>The plan was simple: write a provider that points the Anthropic SDK at <code>localhost:3000</code> instead of the real API. The SDK is already provider-agnostic about base URLs.</p>

<p>Then I hit five problems in a row.</p>

<h3>Gotcha 1: <code>spawn EINVAL</code> on Windows .cmd shims</h3>

<p>I had Electron auto-spawn the router via <code>spawn('npx', ['--yes', 'anthropic-max-router'])</code>. On Windows, <code>npx</code> is a <code>.cmd</code> shim, and Node's child_process can't <code>spawn</code> a <code>.cmd</code> directly without a shell. The fix is the most googled boilerplate in Electron-on-Windows: <code>shell: true</code>. Easy to fix, painful to discover.</p>

<h3>Gotcha 2: the Anthropic SDK posts to <code>$&#123;baseURL&#125;/messages</code></h3>

<p>I set <code>baseURL: 'http://localhost:3000'</code> and watched every request 404 with no logs. The router's endpoint is <code>/v1/messages</code>; the Anthropic SDK appends <code>/messages</code> verbatim, expecting the baseURL to already include <code>/v1</code>. So <code>baseURL: 'http://localhost:3000/v1'</code>. The SDK is not wrong; the docs are just quiet about it.</p>

<h3>Gotcha 3: the router writes <code>.oauth-tokens.json</code> to CWD</h3>

<p>First time I auto-spawned the router, it picked up no auth and crashed on every request. The router stores OAuth tokens in <code>./.oauth-tokens.json</code>, relative to the working directory it was launched from. When Electron spawns it, the cwd is wherever Electron is — varies by environment. Pinned the spawn cwd to <code>app.getPath('userData')</code> (which is <code>%APPDATA%\@nova\desktop</code> on Windows), and the auth file finally lands somewhere stable. The router's auth CLI lives at <code>dist/cli.js</code> in the package and isn't exposed as a bin, so the one-time login still has to be a manual <code>node &lt;path&gt;</code> from the userData dir. Once. Forever.</p>

<h3>Gotcha 4: the AI SDK sends <code>temperature: 0</code> by default</h3>

<p>This one cost me an afternoon. Every Max-routed request returned a 400. The error: "temperature is not supported on this model." The Vercel AI SDK v4 defaults to <code>temperature: 0</code> if you don't pass one. Anthropic's reasoning models, when accessed through the Claude.ai subscription path, refuse any temperature parameter at all — not just non-zero ones. The router faithfully forwards the field, the upstream rejects it, the SDK never knew. Solved by wrapping the provider's <code>fetch</code> to strip <code>temperature</code>, <code>top_p</code>, and <code>top_k</code> from outbound bodies before they hit the wire:</p>

<pre><code>// packages/core/src/agent/providers/max.ts
const stripParams = async (input, init) =&gt; {
  if (init?.body) {
    const body = JSON.parse(init.body as string);
    delete body.temperature;
    delete body.top_p;
    delete body.top_k;
    init.body = JSON.stringify(body);
  }
  return fetch(input, init);
};</code></pre>

<h3>Gotcha 5: a transient "operation aborted" after a 200</h3>

<p>Once, after a successful response, I got <code>This operation was aborted</code> on the next request. Then everything worked again. I haven't reproduced it, I haven't root-caused it, and it's been on the open-issues list for a few weeks. Logging it here so I remember to circle back.</p>

<h2>The supervisor</h2>

<p>The router can crash. The router can be killed by something else holding port 3000. The router can fail health checks if I just woke my laptop. So Nova doesn't just spawn it once — there's a supervisor in the main process that:</p>

<ul>
  <li>Health-checks <code>http://localhost:3000/health</code> on a one-second cadence.</li>
  <li>Restarts the child with backoff if it dies.</li>
  <li>Pipes stdout and stderr into Nova's <code>dev.log</code> as <code>[max-router] …</code> lines.</li>
  <li>Broadcasts state changes to the renderer via three IPC channels: <code>nova:max-router:status</code>, <code>:restart</code>, and <code>:state-changed</code>.</li>
  <li>Drives a banner in the chat header that only appears when the active provider is <em>max</em> and the router isn't running. Click it and it triggers a restart.</li>
</ul>

<p>It works. It also gave me a Windows-process-tree war story that took out a whole afternoon — when I kill <code>cmd.exe</code>, the grandchild <code>node.exe</code> running the router survives, holds port 3000, and the supervisor's next spawn loops forever on <code>EADDRINUSE</code>. That's a future post.</p>

<h2>What it bought me</h2>

<p>Two months in, the brain-swap dropdown has paid for itself many times over:</p>

<ul>
  <li>When Anthropic had a regional incident, I flipped to Gemini and kept going.</li>
  <li>When I want to pressure-test a feature on a cheap model, I flip to Ollama or OpenRouter and burn no tokens.</li>
  <li>When I want my Max plan's quota to do the work for me, I flip to <em>max</em> and the proxy handles it.</li>
  <li>When I'm developing the UI and don't want to think about responses, I flip to <em>mock</em>.</li>
</ul>

<p>One chat loop, six brains. The provider abstraction was probably the single best architectural call I made on this project. It's also the one I almost skipped because "I'll just hardcode Anthropic for now."</p>

<p>Next up: voice. The presence orb, the Whisper sidecar, and why Cartesia's streaming TTS is the latency choice that makes the whole thing feel real.</p>
