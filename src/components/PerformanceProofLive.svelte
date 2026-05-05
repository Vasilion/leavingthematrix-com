<script lang="ts">
  // Live track-record card pair. Fetches /api/performance/public from the
  // Nova subscriber app (nova.leavingthematrix.io), which projects Luke's
  // latest ClickCapital scrape from Neon and the matching SPY/IWM benchmark
  // returns from Yahoo. No fake numbers — when Luke clicks Sync in Nova,
  // these stats update on the next page load.
  //
  // Mounts as a Svelte island via `client:load` from PerformanceProof.astro.
  // Page itself stays static; only this component fetches at runtime.

  import { onMount } from 'svelte';

  interface PortfolioSummary {
    label: string;
    scrapedAt: string;
    sourceMonth: string | null;
    holdingsCount: number;
    twrPct: number | null;
    annualizedReturnPct: number | null;
    totalGainLoss: number | null;
    amountInvested: number | null;
    currentValue: number | null;
    periodCount: number | null;
    periodUnit: 'months' | 'weeks' | null;
    approxDays: number | null;
    lastUpdatedLabel: string | null;
    benchmark: { ticker: string; twrPct: number | null };
  }

  interface PerformancePayload {
    updatedAt: string;
    etfMomentum: PortfolioSummary | null;
    stockPicks: PortfolioSummary | null;
  }

  // Endpoint resolves to the Nova members portal. Override via prop if
  // we ever need to point local dev at a non-prod backend (default
  // assumes nova.leavingthematrix.io is up).
  export let endpoint =
    'https://nova.leavingthematrix.io/api/performance/public';

  let state: 'loading' | 'ready' | 'error' = 'loading';
  let data: PerformancePayload | null = null;
  let errorMsg = '';

  onMount(async () => {
    try {
      const res = await fetch(endpoint, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      data = (await res.json()) as PerformancePayload;
      state = 'ready';
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      state = 'error';
    }
  });

  function fmtPct(n: number | null): string {
    if (n == null || !Number.isFinite(n)) return '—';
    const sign = n >= 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}%`;
  }

  function fmtPeriod(p: PortfolioSummary | null): string {
    if (!p || p.periodCount == null || !p.periodUnit) return '';
    return `${p.periodCount} ${p.periodUnit}`;
  }

  function diffVsBenchmark(p: PortfolioSummary | null): number | null {
    if (!p || p.twrPct == null || p.benchmark.twrPct == null) return null;
    return p.twrPct - p.benchmark.twrPct;
  }

  function diffSign(p: PortfolioSummary | null): 'positive' | 'negative' | 'neutral' {
    const d = diffVsBenchmark(p);
    if (d == null) return 'neutral';
    return d >= 0 ? 'positive' : 'negative';
  }
</script>

{#if state === 'loading'}
  <div class="grid gap-6 lg:grid-cols-2">
    <article class="card bg-ink-800">
      <div class="flex items-baseline justify-between gap-4">
        <div>
          <p class="eyebrow text-signal">ETF Momentum</p>
          <div class="mt-2 h-6 w-48 animate-pulse rounded bg-bone/10" />
        </div>
        <div class="h-12 w-20 animate-pulse rounded bg-bone/10" />
      </div>
      <div class="mt-8 grid grid-cols-3 gap-3 border-t border-bone/10 pt-6">
        <div class="h-12 animate-pulse rounded bg-bone/5" />
        <div class="h-12 animate-pulse rounded bg-bone/5" />
        <div class="h-12 animate-pulse rounded bg-bone/5" />
      </div>
    </article>
    <article class="card bg-ink-800">
      <div class="flex items-baseline justify-between gap-4">
        <div>
          <p class="eyebrow text-signal">Stock Picks</p>
          <div class="mt-2 h-6 w-48 animate-pulse rounded bg-bone/10" />
        </div>
        <div class="h-12 w-20 animate-pulse rounded bg-bone/10" />
      </div>
      <div class="mt-8 grid grid-cols-3 gap-3 border-t border-bone/10 pt-6">
        <div class="h-12 animate-pulse rounded bg-bone/5" />
        <div class="h-12 animate-pulse rounded bg-bone/5" />
        <div class="h-12 animate-pulse rounded bg-bone/5" />
      </div>
    </article>
  </div>
{:else if state === 'error'}
  <div class="grid gap-6 lg:grid-cols-2">
    <article class="card bg-ink-800">
      <p class="eyebrow text-signal">ETF Momentum</p>
      <p class="mt-3 font-mono text-[12px] text-warn">
        Live track record temporarily unavailable.
      </p>
      <p class="mt-1 font-mono text-[10px] text-bone-mute">{errorMsg}</p>
    </article>
    <article class="card bg-ink-800">
      <p class="eyebrow text-signal">Stock Picks</p>
      <p class="mt-3 font-mono text-[12px] text-warn">
        Live track record temporarily unavailable.
      </p>
      <p class="mt-1 font-mono text-[10px] text-bone-mute">{errorMsg}</p>
    </article>
  </div>
{:else if data}
  {@const etf = data.etfMomentum}
  {@const sp = data.stockPicks}
  <div class="grid gap-6 lg:grid-cols-2">
    <!-- ETF Momentum card -->
    <article class="card bg-ink-800">
      <div class="flex items-baseline justify-between gap-4">
        <div>
          <p class="eyebrow text-signal">ETF Momentum</p>
          <h3 class="mt-2 font-display text-2xl uppercase tracking-tight text-bone">
            Momentum-screened ETFs
          </h3>
        </div>
        <div class="text-right">
          <p class="font-mono text-3xl text-signal">
            {fmtPct(etf?.annualizedReturnPct ?? null)}
          </p>
          <p class="text-[10px] uppercase tracking-widest text-bone-mute">
            annualized
          </p>
        </div>
      </div>

      <div class="mt-8 grid grid-cols-3 gap-3 border-t border-bone/10 pt-6 text-sm">
        <div>
          <p class="font-mono text-xs text-bone-mute">TWR</p>
          <p class="mt-1 font-display text-2xl text-bone">
            {fmtPct(etf?.twrPct ?? null)}
          </p>
        </div>
        <div>
          <p class="font-mono text-xs text-bone-mute">vs {etf?.benchmark.ticker ?? 'SPY'}</p>
          <p
            class="mt-1 font-display text-2xl"
            class:text-signal={diffSign(etf) === 'positive'}
            class:text-loss={diffSign(etf) === 'negative'}
            class:text-bone-dim={diffSign(etf) === 'neutral'}
          >
            {diffVsBenchmark(etf) != null ? fmtPct(diffVsBenchmark(etf)) : '—'}
          </p>
        </div>
        <div>
          <p class="font-mono text-xs text-bone-mute">{etf?.benchmark.ticker ?? 'SPY'}</p>
          <p class="mt-1 font-display text-2xl text-bone-dim">
            {fmtPct(etf?.benchmark.twrPct ?? null)}
          </p>
        </div>
      </div>

      {#if etf}
        <div class="mt-6 flex flex-wrap items-center gap-3 text-[11px] text-bone-mute">
          <span class="font-mono uppercase tracking-wider">{fmtPeriod(etf)} running</span>
          {#if etf.holdingsCount}
            <span aria-hidden="true">·</span>
            <span>{etf.holdingsCount} holdings</span>
          {/if}
          {#if etf.lastUpdatedLabel}
            <span aria-hidden="true">·</span>
            <span>updated {etf.lastUpdatedLabel}</span>
          {/if}
        </div>
      {/if}
    </article>

    <!-- Stock Picks card -->
    <article class="card bg-ink-800">
      <div class="flex items-baseline justify-between gap-4">
        <div>
          <p class="eyebrow text-signal">Stock Picks</p>
          <h3 class="mt-2 font-display text-2xl uppercase tracking-tight text-bone">
            High-conviction names
          </h3>
        </div>
        <div class="text-right">
          <p class="font-mono text-3xl text-signal">
            {fmtPct(sp?.annualizedReturnPct ?? null)}
          </p>
          <p class="text-[10px] uppercase tracking-widest text-bone-mute">
            annualized
          </p>
        </div>
      </div>

      <div class="mt-8 grid grid-cols-3 gap-3 border-t border-bone/10 pt-6 text-sm">
        <div>
          <p class="font-mono text-xs text-bone-mute">TWR</p>
          <p class="mt-1 font-display text-2xl text-bone">
            {fmtPct(sp?.twrPct ?? null)}
          </p>
        </div>
        <div>
          <p class="font-mono text-xs text-bone-mute">vs {sp?.benchmark.ticker ?? 'IWM'}</p>
          <p
            class="mt-1 font-display text-2xl"
            class:text-signal={diffSign(sp) === 'positive'}
            class:text-loss={diffSign(sp) === 'negative'}
            class:text-bone-dim={diffSign(sp) === 'neutral'}
          >
            {diffVsBenchmark(sp) != null ? fmtPct(diffVsBenchmark(sp)) : '—'}
          </p>
        </div>
        <div>
          <p class="font-mono text-xs text-bone-mute">{sp?.benchmark.ticker ?? 'IWM'}</p>
          <p class="mt-1 font-display text-2xl text-bone-dim">
            {fmtPct(sp?.benchmark.twrPct ?? null)}
          </p>
        </div>
      </div>

      {#if sp}
        <div class="mt-6 flex flex-wrap items-center gap-3 text-[11px] text-bone-mute">
          <span class="font-mono uppercase tracking-wider">{fmtPeriod(sp)} running</span>
          {#if sp.holdingsCount}
            <span aria-hidden="true">·</span>
            <span>{sp.holdingsCount} holdings</span>
          {/if}
          {#if sp.lastUpdatedLabel}
            <span aria-hidden="true">·</span>
            <span>updated {sp.lastUpdatedLabel}</span>
          {/if}
        </div>
      {/if}
    </article>
  </div>

  <p class="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-bone-mute">
    Data updated {new Date(data.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
  </p>
{/if}
