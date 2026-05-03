---
title: "Voice as a primary interface: Whisper, Silero, Cartesia, and an orb"
date: 2026-04-14
summary: "Push-to-talk on Ctrl+Space, hands-free with VAD, local STT, streaming TTS, barge-in. The latency budget that makes Nova feel alive instead of like a chat window with a microphone glued on."
category: nova-dev
tags: ["nova", "voice", "ux"]
readMinutes: 7
---

<p>The thing that separates a chatbot from an assistant is whether you talk to it. Typing is fine for code. Typing is the wrong tool when you're cooking, when you're holding a phone, when you're three steps from the desk and want to know what's on your calendar. Nova has to be voice-first or it's not Nova.</p>

<p>Voice in software is also where most projects die slowly. Every component is a latency tax: capture, VAD, transcription, model thinking, speech synthesis, audio playback. Get any one of them wrong and the magic is gone — the user starts talking over you, or waits an awkward beat, or just opens a chat window because at least it's predictable. The whole pipeline has to feel snappy.</p>

<h2>The latency budget</h2>

<p>Here's the rough budget I work to, end-to-end from the user finishing speaking to the first spoken word coming back:</p>

<ul>
  <li>VAD endpoint detection: ~50ms after silence</li>
  <li>STT (whisper medium.en, ~3s of audio, on a 4090): ~80ms cold, sub-50ms warm</li>
  <li>Time-to-first-token from the model: 300–700ms depending on provider</li>
  <li>TTS first-audio-chunk from Cartesia Sonic streaming: ~200ms after first text token</li>
  <li>Audio device buffer: ~50ms</li>
</ul>

<p>That's a budget of roughly 700ms–1.1s before Nova starts speaking. Anything longer and the conversation feels like a long-distance phone call.</p>

<h2>Capture and VAD</h2>

<p>Two modes:</p>

<ul>
  <li><strong>Push-to-talk</strong> on <code>Ctrl+Space</code>. Hold the chord, talk, release. Bulletproof and silent.</li>
  <li><strong>Hands-free</strong> with VAD. Always-on microphone capture, gated by <a href="https://github.com/snakers4/silero-vad" target="_blank" rel="noopener">Silero VAD</a> running ONNX in the renderer. Speech triggers an utterance; sustained silence ends it.</li>
</ul>

<p>Silero VAD is the unsung hero. It's a small ONNX model that runs in-browser fast enough to be real-time, and it's accurate enough that I almost never get a false trigger from a creaky chair or a Discord notification. Without it, the assistant would fire transcription on every cough and the agent loop would melt under noise. With it, the renderer only ships actual speech segments to the STT sidecar.</p>

<h2>STT: faster-whisper as a Python sidecar</h2>

<p>I want local transcription. Audio of me talking to my desktop is not data I want flying to a third-party API every time I think out loud. I picked <code>faster-whisper</code> running <code>medium.en</code> on CUDA. It runs in a Python venv under <code>packages/core/src/voice/whisper-sidecar/</code>, fronted by a tiny stdio JSON protocol the main process speaks over.</p>

<p>Why a sidecar instead of a Node-native binding? Because <code>faster-whisper</code> is the best whisper implementation, it's Python-only, and I'm not going to compile it from source on three platforms. The IPC overhead is microseconds; the win on accuracy and speed is large. The sidecar is a process I supervise the same way I supervise the Max router — health checks, restart on crash, stdout piped into the dev log.</p>

<p>Boot logs the line I love seeing every time:</p>

<pre><code>whisper ready: medium.en on cuda</code></pre>

<h2>TTS: Cartesia Sonic, streaming</h2>

<p>I tried ElevenLabs first. The voices are great. The streaming protocol cost me hours and the latency was worse than I wanted. Cartesia's Sonic streaming endpoint is purpose-built for real-time voice agents — it streams audio chunks as the model generates them, so playback can start within ~200ms of the first text token.</p>

<p>The architectural detail that mattered: Nova streams text from the LLM and TTS at the same time. As tokens arrive from the agent loop, they're chunked at sentence boundaries and pushed to Cartesia. Cartesia streams audio back. The renderer plays it through a Web Audio AudioBufferSourceNode chain. The user is hearing the first sentence while the model is still generating the third.</p>

<h2>Barge-in</h2>

<p>If Nova is talking and the user starts speaking, Nova should stop talking. This is so obvious it's barely worth saying — but the implementation is a little subtle.</p>

<p>The renderer holds a reference to the active TTS playback chain. When VAD trips during <em>speaking</em> state, the renderer:</p>

<ul>
  <li>Tears down the AudioBufferSourceNode chain (<code>.stop()</code> on the head node).</li>
  <li>Aborts the in-flight Cartesia stream so we stop receiving audio chunks we won't use.</li>
  <li>Cancels the in-flight model stream so we stop generating tokens we won't TTS.</li>
  <li>Transitions the orb to <em>listening</em>.</li>
</ul>

<p>Cancellation propagation matters. If you skip the third bullet you keep paying for tokens you'll never speak.</p>

<h2>The presence orb</h2>

<p>The orb is non-negotiable. Without it, voice mode is a black box — am I being heard? did the model start? is it about to speak? The orb is the assistant's affordance and it surfaces five states:</p>

<ul>
  <li><strong>Idle</strong> — slow ambient pulse, low intensity. The "I'm here" state.</li>
  <li><strong>Listening</strong> — brighter, animation ties loosely to input audio level. The user can see Nova hearing them.</li>
  <li><strong>Thinking</strong> — internal swirl while a model call is in flight. Distinct enough that the user knows it's not waiting on them.</li>
  <li><strong>Speaking</strong> — animation modulates to the audio output. The "I'm answering" state.</li>
  <li><strong>Error</strong> — red shift. Rare, but unmistakable.</li>
</ul>

<p>Implemented in Framer Motion + a custom SVG. Single React component, transitions between named states, no external animation library beyond Framer. The whole thing is under 300 lines and it carries the entire emotional weight of the app.</p>

<h2>Global shortcuts</h2>

<p>Three shortcuts I rely on every day, registered globally so they work even when Nova isn't focused:</p>

<ul>
  <li><strong>Ctrl+Space</strong> — push-to-talk.</li>
  <li><strong>Ctrl+N</strong> — "Talk to Nova" floating composer. Fires-and-forgets a message without yanking me into the chat tab. Drop a thought, get a notification when the answer's ready, keep working.</li>
  <li><strong>Ctrl+K</strong> — Lookup palette (more on Lookup in a later post).</li>
</ul>

<p>Electron's <code>globalShortcut</code> module makes this trivial. The harder part was the renderer-side state management — when <code>Ctrl+Space</code> fires and Nova isn't focused, the chord still has to flip the renderer into PTT mode through IPC. Three lines of code; two evenings of debugging.</p>

<h2>What's still missing</h2>

<p>No wake word yet. Phase 3 of the original PLAN.md adds Porcupine for an always-listening "Hey Nova" trigger and an always-on-top HUD window so I can talk to Nova from any app without alt-tabbing. That's the next big voice push.</p>

<p>Also no multi-language support. <code>medium.en</code> is English-only. If I ever want to talk to Nova in Spanish I'll swap to <code>medium</code> (the multilingual model) and pay a small accuracy and latency tax. Not a priority for me personally.</p>

<p>The voice pipeline is the one part of Nova where I'd genuinely tell another founder "this took longer than you'd expect, plan for it." It's also the part that makes the whole thing feel like an assistant instead of a chat app. Worth every hour.</p>

<p>Next up: skills. How a plug-in architecture for tool use turns "another tool" from a half-day diff into a fifteen-minute scaffold.</p>
