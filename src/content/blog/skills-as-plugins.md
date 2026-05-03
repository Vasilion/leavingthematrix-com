---
title: "Skills as plugins: a tool-use plugin system that scales past 20 tools"
date: 2026-04-18
summary: "Why every Nova capability — calendar, CRM, vault, screener, portfolio — is a plugin package, what the contract looks like, and how a chat-time skills picker keeps tool sprawl from drowning the model."
category: nova-dev
tags: ["nova", "skills", "architecture"]
readMinutes: 7
---

<p>The first thing that breaks in a tool-using agent is "give the model every tool you have." It works at five tools. It limps at fifteen. By twenty, the model is misrouting calls, the system prompt is bloated, and you're paying tokens for tools that aren't relevant to the question at hand. Nova's solution is to treat capabilities as <strong>skills</strong>, each one a self-contained plugin that registers with a central registry, ships its own tools, and can be enabled or disabled at runtime.</p>

<h2>What a skill is</h2>

<p>A skill is a workspace package under <code>packages/skills/&lt;name&gt;</code> that exports a single object:</p>

<pre><code>// packages/skills/calendar/src/index.ts
export const skill: SkillDefinition = {
  id: 'calendar',
  name: 'Calendar',
  description: 'Read and write to the user\'s calendar',
  envSchema: z.object({
    GOOGLE_CALENDAR_CLIENT_ID: z.string(),
    GOOGLE_CALENDAR_CLIENT_SECRET: z.string(),
  }),
  tools: {
    list_events: {
      description: 'List upcoming calendar events',
      parameters: z.object({ days: z.number().default(7) }),
      execute: async ({ days }) =&gt; { /* ... */ },
    },
    create_event: { /* ... */ },
  },
  promptHints: 'Prefer list_events when the user asks about scheduling.',
};</code></pre>

<p>The contract is small on purpose. A skill has an id, a description, an env schema (validated at boot), a flat map of tool definitions in the AI SDK's expected shape, and an optional <code>promptHints</code> string the registry stitches into the system prompt only when the skill is enabled.</p>

<h2>The registry</h2>

<p>At Nova boot, <code>SkillRegistry</code> imports every package under <code>packages/skills/*</code>, validates its env vars, and registers it. Skills with missing env vars don't crash — they're flagged as <em>unavailable</em>, and the chat agent never sees their tools. This way the same Nova binary works whether or not I've got a Cartesia key, a Finnhub key, or a Google Calendar OAuth token. Each skill self-deactivates if it can't run.</p>

<p>Tools from active skills are merged into a single map handed to <code>streamText</code>. Each tool's name is namespaced as <code>&lt;skill_id&gt;.&lt;tool_id&gt;</code> so two skills can both have a <code>list</code> tool without colliding.</p>

<h2>The chat skills picker</h2>

<p>The model is good at picking among a dozen tools. It is not good at picking among forty. So Nova has a chat-time picker: type <code>/</code> in an empty composer and a popover surfaces every available skill, two-level tree (skill → tools), fuzzy filter, click-to-insert. Picking a tool inserts the tool's description into the composer as the starting prompt, and the message that gets sent biases the model toward that specific tool.</p>

<p>The win: I keep two dozen tools registered, but the model usually only sees a focused subset because the user message is already shaped around one of them.</p>

<h3>The skill that almost broke this</h3>

<p>A few weeks ago I shipped a new <code>screener</code> skill with eleven tools. Suddenly chat queries like "pull up UBER" started misrouting — the model picked <code>screener.scan_universe</code> because the word "pull" had recently appeared in scan-related contexts and the screener's prompt hints were over-fitting. Fix: the new <code>lookup</code> skill (a TradingView-style symbol panel) added explicit prompt hints to <em>distinguish itself</em> from screener:</p>

<pre><code>promptHints: `
  Use lookup.pull_up_symbol for phrases like "pull up TICKER",
  "show me TICKER", "look at TICKER". This is NOT a screener
  tool — do not confuse with screener.scan_universe.
`</code></pre>

<p>This kind of negative-space prompt tuning is a constant tax on plugin systems. You can't always rely on tool descriptions alone — you have to tell the model when not to pick a tool, too.</p>

<h2>Vault-backed skills</h2>

<p>The most-used skills don't talk to external APIs at all — they talk to my Obsidian vault:</p>

<ul>
  <li><strong>vault</strong> — read/write notes, search by content, link generation.</li>
  <li><strong>crm</strong> — contacts and deal stages, stored as YAML-frontmatter markdown.</li>
  <li><strong>portfolio</strong> — positions, prices (via Stooq quote endpoint), watchlist.</li>
  <li><strong>budget</strong> — incomes, expenses, rules.</li>
</ul>

<p>The pattern: each skill owns a directory under the vault. <code>vault/CRM/</code>, <code>vault/Portfolio/</code>, <code>vault/Budget/</code>. The skill reads and writes plain markdown. The chokidar watcher in the vault skill picks up external edits (e.g. me opening Obsidian and changing a contact note) and broadcasts an event the chat panel can listen to. So if I edit a file in Obsidian and then ask Nova about it, the answer is current — no caching layer, no sync, just the filesystem as truth.</p>

<h2>MCP support</h2>

<p>The <code>SkillRegistry</code> also speaks Model Context Protocol. An MCP server registered in <code>nova.config.json</code> shows up as a skill at boot, with its tools enumerated automatically. So if there's an MCP I want — Notion, Slack, GitHub — I don't have to write a skill for it. I drop a config entry and it appears.</p>

<p>The native skills are still where I do the work that needs custom UI affordances (the screener has a whole panel; the calendar has a peek view). MCP is the escape hatch for "I just want this one tool, please don't make me write a package."</p>

<h2>The scaffolder</h2>

<p>Adding a new skill is a one-liner:</p>

<pre><code>pnpm nova:skill:new my-skill</code></pre>

<p>That generates the package directory, <code>package.json</code>, a stubbed <code>index.ts</code> with a working <code>echo</code> tool, a typecheck-clean Zod schema, and the workspace edits to register it. New tool? Add a property to the skill's <code>tools</code> map. Restart Nova. Done.</p>

<p>The shape of the system means I rarely think about "where does this code go?" The answer is always: in a skill. That clarity is worth more than it sounds.</p>

<h2>What I'd do differently</h2>

<p>One regret: I made tool execution synchronous to the chat stream. If a tool takes 8 seconds, the model sits on that tool call for 8 seconds before generating its next token. For most tools this is fine — they return in well under a second. For the screener's full universe scan it's a problem, and I had to add streaming partial results out-of-band via IPC to keep the UI alive. If I were starting over, tools would return either values or async iterables, and the agent loop would compose them differently.</p>

<p>Second regret, smaller: tool descriptions are strings instead of typed prompt fragments. I want to be able to compose a tool description from sub-fragments (e.g. "always cite the source URL"), and right now that's just string concatenation. Fine for now.</p>

<p>Skills are the architectural feature I'm proudest of. They've turned every "Nova should also do X" conversation from a refactor question into a scaffold question. Next up: the screener — Nova's first skill that grew its own opinionated UI panel, a backtest engine, and an autonomous trade-finder that I now use every day.</p>
