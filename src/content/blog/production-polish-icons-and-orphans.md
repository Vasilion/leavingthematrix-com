---
title: "Production polish: custom icons, orphan processes, and the Windows tree-kill problem"
date: 2026-05-01
summary: "Three production-build war stories from a single week — afterPack rcedit, an EADDRINUSE loop on port 3000, and the cmd→npx→node grandchild that survived every kill signal until taskkill /T fixed it."
category: nova-dev
tags: ["nova", "electron", "war-story", "windows"]
readMinutes: 8
---

<p>The week before launch is when projects find out what production really means. For Nova, three problems showed up in three days, all in territory I'd been mentally classifying as "trivial polish." None of them were trivial.</p>

<h2>1. The default Electron icon that wouldn't go away</h2>

<p>Nova has a glowing red-orange orb as its identity — the in-app NovaOrb runs on the same palette (<code>oklch(0.66 0.24 25)</code>, around <code>#e74832</code>). When I shipped my first production build with <code>pnpm desktop:exe</code>, the installer's icon, taskbar pin, and Start menu entry all showed the default Electron logo. Hours of polish, and the very first thing a new user would see was someone else's brand.</p>

<p>I'd already done the obvious work. Designed the SVG (<code>apps/desktop/build/icon.svg</code>). Added a <code>build:icon</code> script that uses <code>sharp</code> to render <code>icon.png</code> (1024²) and <code>png-to-ico</code> to bake a multi-resolution <code>.ico</code> (16/24/32/48/64/128/256). Wired <code>BrowserWindow.icon</code> in dev. The orb showed up in dev mode just fine. Production was the problem.</p>

<p>Root cause: my <code>package.json</code> had <code>win.signAndEditExecutable: false</code>. That flag exists to bypass <code>winCodeSign</code>'s 7z extraction failure on Windows machines without Developer Mode (the <code>winCodeSign</code> archive contains darwin <code>.dylib</code> symlinks that <code>7za.exe</code> can't unpack without symlink privileges — fails with "A required privilege is not held by the client"). Turning the flag off lets the build succeed. It also turns off electron-builder's <code>rcedit</code> step, which is the thing that actually embeds the icon resource into <code>Nova.exe</code>.</p>

<p>So you can have signing-disabled and the icon, or signing-disabled and a broken build. By default you get neither and a green checkbox that lies to you.</p>

<h3>The fix</h3>

<p>Keep <code>signAndEditExecutable: false</code> for the 7z reasons. Add <code>win.icon: "build/icon.ico"</code> for completeness. Then wire an <code>afterPack</code> hook that runs <code>rcedit</code> directly on <code>Nova.exe</code> after packaging but before NSIS bundles it:</p>

<pre><code>// apps/desktop/scripts/embed-icon.cjs
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const exePath = path.join(context.appOutDir, 'Nova.exe');
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  const { default: rcedit } = await import('rcedit');
  await rcedit(exePath, { icon: iconPath });
  console.log(`[afterPack] icon embedded into ${exePath}`);
};</code></pre>

<p>Two notes from the trenches:</p>

<ul>
  <li><strong>The hook file must be <code>.cjs</code>.</strong> electron-builder loads hooks via <code>require()</code>, which can't load ESM <code>.mjs</code>. The <code>rcedit</code> package is ESM-only, so the CommonJS hook dynamically <code>import()</code>s it.</li>
  <li><strong>Verify with extraction.</strong> I ran <code>[System.Drawing.Icon]::ExtractAssociatedIcon</code> on each artifact afterwards: <code>Nova.exe</code>, <code>Nova-Setup-0.1.0-x64.exe</code>, <code>Nova-Portable-0.1.0-x64.exe</code>. All three carried the orb.</li>
</ul>

<h3>The Windows icon cache</h3>

<p>Even after the build was correct, my Explorer thumbnails kept showing the old default icon. Windows caches <code>.exe</code> icons by filename, and my rebuilt artifacts had unchanged filenames. The taskbar icon updated immediately because Windows pulls that one live; folder views were stuck. Fix: <code>ie4uinit.exe -show</code>. Or just trust the running app. Don't waste an hour on this twice like I did.</p>

<h2>2. The router that wouldn't die</h2>

<p>My second day of "polish" started with a renderer banner that wouldn't go away: <strong>"MAX ROUTER NOT RUNNING — EXIT CODE 1."</strong> I'd seen this banner before — for a few seconds — when the supervisor was warming up. This time it stayed pinned for an hour.</p>

<p>I went to the dev log:</p>

<pre><code>[max-router] Error: listen EADDRINUSE: address already in use 0.0.0.0:3000
[max-router] supervisor: backing off 1s
[max-router] supervisor: respawning…
[max-router] Error: listen EADDRINUSE: address already in use 0.0.0.0:3000
… (repeat forever)</code></pre>

<p>So the supervisor was respawning correctly. The respawned router was failing to bind because something else held port 3000. Something else turned out to be a <strong>previous</strong> router from a previous Nova session that hadn't been cleaned up when I'd quit Nova twenty minutes earlier.</p>

<p>Process listing confirmed it:</p>

<pre><code>node.exe  PID 109076  started 14:35
  command: node …\anthropic-max-router\dist\router\server.js</code></pre>

<p><code>taskkill //F //PID 109076</code> killed it. Port 3000 was free again. The next supervisor respawn succeeded. Banner cleared.</p>

<p>That's the immediate fix. But why did the orphan exist in the first place?</p>

<h2>3. The Windows process tree that broke <code>child.kill()</code></h2>

<p>The supervisor was already calling <code>child.kill()</code> on app quit. So why did the router survive?</p>

<p>Because of <code>shell: true</code>. Earlier I'd written about the <code>spawn EINVAL</code> on Windows .cmd shims; the fix was to spawn with a shell. That fix has a cost. When you spawn <code>npx --yes anthropic-max-router</code> with <code>shell: true</code> on Windows, you don't get one process. You get three:</p>

<pre><code>cmd.exe (shell wrapper)
└── npx (which is itself a .cmd script)
    └── node.exe (the actual router)</code></pre>

<p><code>child.kill()</code> sends a kill signal to the <code>cmd.exe</code>. Windows does <em>not</em> propagate kill signals through cmd.exe to its grandchildren. The cmd dies; <code>node.exe</code> survives, holding port 3000, oblivious. Next time Nova boots, EADDRINUSE.</p>

<h3>The fix: <code>killChildTree</code></h3>

<p>I added a helper in <code>apps/desktop/src/main/max-router.ts</code>:</p>

<pre><code>function killChildTree(child: ChildProcess) {
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)]);
  } else {
    child.kill();
  }
}</code></pre>

<p>The two flags that matter: <code>/F</code> is force, <code>/T</code> is "tree" — kill the named PID and every descendant. That walks the cmd → npx → node tree and terminates all three together.</p>

<p><code>spawnSync</code> instead of <code>spawn</code> matters too. Electron's <code>app.on('will-quit')</code> handler has to finish before the process actually exits. An async kill races the exit; a sync kill blocks it long enough for the children to die.</p>

<p>Replaced <code>child.kill()</code> at both call sites — the graceful <code>stop()</code> path and the health-check timeout path. <code>pnpm -F @nova/desktop typecheck</code> clean.</p>

<h3>End-to-end verification</h3>

<p>I made myself prove this fix worked, not just <em>think</em> it worked. Restarted dev, waited for the router's startup line, identified the electron main and the router node by PID. Sent a graceful WM_CLOSE to the electron PID via <code>taskkill /PID &lt;pid&gt;</code> (no <code>/F</code>) — Electron's <code>will-quit</code> fired, <code>stopMaxRouter()</code> ran, <code>killChildTree()</code> ran, <code>taskkill /F /T /PID &lt;cmd-pid&gt;</code> killed the whole tree. Post-close: the router PID was gone. Port 3000 had only a single TIME_WAIT closing-handshake socket, no LISTENING process. Rebuilt production artifacts. Shipped.</p>

<p>Updated the debug-workflow memory in my vault: <em>pre-flight must sweep both port 5173 (vite) AND port 3000 (max-router orphan), not just <code>electron.exe</code>.</em> The next time something gets stuck, I'll know which two ports to free.</p>

<h2>The lesson, if there is one</h2>

<p>Every one of these bugs was in code I would have called "done" the day before. Custom icon → "shipped." Router supervisor → "shipped." App quit → "shipped." All three were leaking on day-of-launch.</p>

<p>The thing they share is that I was treating a green build as a verification. A successful <code>pnpm desktop:exe</code> told me <em>nothing</em> about whether the icon was actually embedded; the script only verified that the file was produced. A successful Electron quit told me nothing about whether the children had actually died. I needed to <em>look</em> at the artifact and the system after the fact, with a different tool, before I trusted it.</p>

<p>For me that translates to: any time an artifact is written or a process is killed, I need a verifier that uses a different code path than the producer. <code>ExtractAssociatedIcon</code> for icons. <code>Get-NetTCPConnection -LocalPort 3000</code> for ports. <code>Get-Process</code> for child cleanup. Cheap to run, expensive to skip.</p>

<p>Next up: the Lookup feature. A TradingView-style symbol panel built in a single cut, the skill bus pattern that lets a plug-in fire renderer events without becoming Electron-aware, and the Cmd+K palette that's quietly become my favorite way to use Nova.</p>
