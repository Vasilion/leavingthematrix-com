<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { funMoneyPrefillDollars, groceriesPrefillDollars } from '../../book-api/src/plan/prefill';
  import type {
    BucketAmount,
    FunTooHigh,
    GapPlan,
    GoalOutcome,
    Milestone,
    PayoffStrategy,
    PlanResult,
    StrategyOutcome,
    WorkingPlan,
  } from '../../book-api/src/plan/types';

  export let api: string;

  interface DebtRow {
    label: string;
    balance: string;
    apr: string;
    minimum: string;
  }

  interface FormState {
    takeHome: string;
    householdSize: string;
    stability: string;
    housing: string;
    utilities: string;
    groceries: string;
    groceriesTouched: boolean;
    transportation: string;
    insurance: string;
    childcare: string;
    other: string;
    noDebt: boolean;
    debts: DebtRow[];
    cashSavings: string;
    employerMatch: string;
    goalLabel: string;
    goalAmount: string;
    goalMonth: string;
    goalYear: string;
    funMoney: string;
    funTouched: boolean;
  }

  interface PreviewResponse {
    ok: boolean;
    plan?: PlanResult;
    message?: string;
  }

  interface PdfResponse {
    ok: boolean;
    emailed?: boolean;
    filename?: string;
    pdf?: string;
    message?: string;
  }

  const STORAGE_KEY: string = 'ltm-money-plan-v1';
  const STEPS: string[] = ['Money in', 'Must-pays', 'Debts and savings', 'Your goal'];
  const MAX_DEBTS: number = 15;
  const MONTHS: string[] = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const GENERIC_ERROR: string = 'Something went wrong. Please try again.';
  const EMAIL_PATTERN: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const now: Date = new Date();
  const YEARS: number[] = Array.from({ length: 41 }, (_: unknown, index: number): number => now.getFullYear() + index);

  function emptyDebt(): DebtRow {
    return { label: '', balance: '', apr: '', minimum: '' };
  }

  function emptyForm(): FormState {
    return {
      takeHome: '',
      householdSize: '2',
      stability: 'two_incomes',
      housing: '',
      utilities: '',
      groceries: String(groceriesPrefillDollars(2)),
      groceriesTouched: false,
      transportation: '',
      insurance: '',
      childcare: '',
      other: '',
      noDebt: false,
      debts: [emptyDebt()],
      cashSavings: '',
      employerMatch: 'not_sure',
      goalLabel: '',
      goalAmount: '',
      goalMonth: '',
      goalYear: '',
      funMoney: '',
      funTouched: false,
    };
  }

  let form: FormState = emptyForm();
  let step: number = 0;
  let view: 'form' | 'results' = 'form';
  let error: string = '';
  let loading: boolean = false;
  let plan: PlanResult | null = null;
  let strategy: PayoffStrategy = 'avalanche';
  let email: string = '';
  let newsletter: boolean = false;
  let sending: boolean = false;
  let gateError: string = '';
  let delivered: boolean = false;
  let emailed: boolean = false;
  let downloadUrl: string = '';
  let loaded: boolean = false;
  let root: HTMLElement;

  onMount((): void => {
    try {
      const saved: string | null = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const parsed: Partial<FormState> = JSON.parse(saved) as Partial<FormState>;
        form = { ...emptyForm(), ...parsed };
        if (!Array.isArray(form.debts) || form.debts.length === 0) {
          form.debts = [emptyDebt()];
        }
      }
    } catch {
      form = emptyForm();
    }
    loaded = true;
  });

  function persist(state: FormState): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      return;
    }
  }

  $: if (loaded) persist(form);

  function dollars(value: string): number {
    const parsed: number = Number(String(value).replace(/[$,\s]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function setHousehold(event: Event): void {
    const value: string = (event.currentTarget as HTMLSelectElement).value;
    form.householdSize = value;
    if (!form.groceriesTouched) {
      form.groceries = String(groceriesPrefillDollars(Number(value)));
    }
  }

  function leftoverDollars(): number {
    const mustPays: number = [form.housing, form.utilities, form.groceries, form.transportation, form.insurance, form.childcare, form.other]
      .map(dollars)
      .reduce((sum: number, value: number): number => sum + value, 0);
    const minimums: number = form.noDebt
      ? 0
      : form.debts.map((row: DebtRow): number => dollars(row.minimum)).reduce((sum: number, value: number): number => sum + value, 0);
    return dollars(form.takeHome) - mustPays - minimums;
  }

  function usableDebts(): DebtRow[] {
    return form.noDebt ? [] : form.debts.filter((row: DebtRow): boolean => dollars(row.balance) > 0);
  }

  function validateStep(index: number): string {
    if (index === 0) {
      if (dollars(form.takeHome) <= 0) {
        return 'Enter your monthly take-home pay.';
      }
      return '';
    }
    if (index === 1) {
      return form.housing.trim() === '' ? 'Enter your rent or mortgage. Put 0 if you have none.' : '';
    }
    if (index === 2) {
      if (form.noDebt) {
        return '';
      }
      for (let position: number = 0; position < form.debts.length; position += 1) {
        const row: DebtRow = form.debts[position];
        const started: boolean = [row.label, row.balance, row.apr, row.minimum].some((value: string): boolean => value.trim() !== '');
        if (!started) {
          continue;
        }
        const apr: number = Number(row.apr);
        if (dollars(row.balance) <= 0) {
          return `Debt ${position + 1}: enter the balance.`;
        }
        if (row.apr.trim() === '' || !Number.isFinite(apr) || apr < 0 || apr > 100) {
          return `Debt ${position + 1}: the interest rate has to be between 0 and 100.`;
        }
        if (row.minimum.trim() === '') {
          return `Debt ${position + 1}: enter the minimum payment.`;
        }
      }
      if (usableDebts().length === 0) {
        return 'Add a debt, or tick "I don\'t have any debt."';
      }
      return '';
    }
    if (dollars(form.goalAmount) > 0) {
      if (form.goalMonth === '' || form.goalYear === '') {
        return 'Pick a month and year for your goal.';
      }
      const target: number = Number(form.goalYear) * 12 + Number(form.goalMonth);
      const current: number = now.getFullYear() * 12 + now.getMonth() + 1;
      if (target <= current) {
        return 'Your goal date has to be in the future.';
      }
    }
    return '';
  }

  function scrollToTop(): void {
    tick().then((): void => {
      root?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function next(): void {
    error = validateStep(step);
    if (error !== '') {
      return;
    }
    if (step === 2 && !form.funTouched) {
      form.funMoney = String(funMoneyPrefillDollars(leftoverDollars()));
    }
    if (step < STEPS.length - 1) {
      step += 1;
      scrollToTop();
      return;
    }
    preview();
  }

  function back(): void {
    error = '';
    if (step > 0) {
      step -= 1;
      scrollToTop();
    }
  }

  function edit(): void {
    view = 'form';
    step = 0;
    delivered = false;
    scrollToTop();
  }

  function requestInputs(): Record<string, unknown> {
    const goalSet: boolean = dollars(form.goalAmount) > 0;
    return {
      takeHome: dollars(form.takeHome),
      householdSize: Number(form.householdSize),
      stability: form.stability,
      mustPays: {
        housing: dollars(form.housing),
        utilities: dollars(form.utilities),
        groceries: dollars(form.groceries),
        transportation: dollars(form.transportation),
        insurance: dollars(form.insurance),
        childcare: dollars(form.childcare),
        other: dollars(form.other),
      },
      debts: usableDebts().map((row: DebtRow): Record<string, unknown> => ({
        label: row.label,
        balance: dollars(row.balance),
        apr: Number(row.apr),
        minimum: dollars(row.minimum),
      })),
      cashSavings: dollars(form.cashSavings),
      employerMatch: form.employerMatch,
      goal: goalSet
        ? { label: form.goalLabel, amount: dollars(form.goalAmount), targetMonth: `${form.goalYear}-${String(form.goalMonth).padStart(2, '0')}` }
        : null,
      funMoney: dollars(form.funMoney),
    };
  }

  function preview(): void {
    loading = true;
    error = '';
    fetch(`${api}/plan/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inputs: requestInputs() }),
    })
      .then((response: Response): Promise<PreviewResponse> => response.json() as Promise<PreviewResponse>)
      .then((data: PreviewResponse): void => {
        loading = false;
        if (!data.ok || data.plan === undefined) {
          error = data.message ?? GENERIC_ERROR;
          return;
        }
        plan = data.plan;
        view = 'results';
        scrollToTop();
      })
      .catch((): void => {
        loading = false;
        error = GENERIC_ERROR;
      });
  }

  function useSuggestedFun(amount: number): void {
    form.funMoney = String(Math.round(amount / 100));
    form.funTouched = true;
    preview();
  }

  function money(cents: number): string {
    const sign: string = cents < 0 ? '-' : '';
    return `${sign}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
  }

  function monthLabel(key: string): string {
    const parts: string[] = key.split('-');
    return `${MONTHS[Number(parts[1]) - 1] ?? ''} ${parts[0] ?? ''}`;
  }

  function milestoneLabel(milestone: Milestone, none: string): string {
    switch (milestone.kind) {
      case 'month':
        return monthLabel(milestone.month);
      case 'already':
        return 'Already there';
      case 'beyond':
        return 'Not within 40 years';
      case 'none':
        return none;
    }
  }

  function runwayLabel(months: number, cash: number, essentials: number): string {
    if (months >= 1) {
      return `${months} months`;
    }
    const days: number = essentials <= 0 ? 0 : Math.floor((cash / essentials) * 30);
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  function goalNote(outcome: StrategyOutcome): string {
    const goal: GoalOutcome | null = outcome.goal;
    if (goal === null) {
      return 'Skipped. The plan works toward your safety net and debt.';
    }
    if (goal.onTime) {
      return `On time for ${monthLabel(goal.targetMonth)}. About ${money(goal.monthly)} a month.`;
    }
    if (goal.extraMonthlyNeeded === null) {
      return `You picked ${monthLabel(goal.targetMonth)}. These numbers can't stretch that far yet.`;
    }
    return `You picked ${monthLabel(goal.targetMonth)}. To make it, you'd need about ${money(goal.extraMonthlyNeeded)} more a month.`;
  }

  function firstBucket(outcome: StrategyOutcome): BucketAmount | undefined {
    return outcome.thisMonth.buckets[0];
  }

  function bucketText(entry: BucketAmount | undefined): string {
    if (entry === undefined) {
      return '';
    }
    switch (entry.kind) {
      case 'starter_fund':
        return `${money(entry.amount)} into your starter fund`;
      case 'high_interest_debt':
      case 'low_interest_debt':
        return `${money(entry.amount)} extra to ${entry.targets.join(', ')}`;
      case 'goal':
        return `${money(entry.amount)} toward ${entry.targets[0] ?? 'your goal'}`;
      case 'full_fund':
        return `${money(entry.amount)} into your emergency fund`;
      case 'future_you':
        return `${money(entry.amount)} to future you`;
    }
  }

  function base64ToBlob(base64: string): Blob {
    const binary: string = window.atob(base64);
    const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index: number = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: 'application/pdf' });
  }

  function startDownload(url: string, filename: string): void {
    const link: HTMLAnchorElement = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function requestPdf(): void {
    gateError = '';
    const trimmed: string = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      gateError = 'Please enter a valid email address.';
      return;
    }
    sending = true;
    fetch(`${api}/plan/pdf`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inputs: requestInputs(), email: trimmed, newsletter, strategy }),
    })
      .then((response: Response): Promise<PdfResponse> => response.json() as Promise<PdfResponse>)
      .then((data: PdfResponse): void => {
        sending = false;
        if (!data.ok || data.pdf === undefined) {
          gateError = data.message ?? GENERIC_ERROR;
          return;
        }
        if (downloadUrl !== '') {
          URL.revokeObjectURL(downloadUrl);
        }
        downloadUrl = URL.createObjectURL(base64ToBlob(data.pdf));
        startDownload(downloadUrl, data.filename ?? 'Your-Money-Plan.pdf');
        emailed = data.emailed === true;
        delivered = true;
      })
      .catch((): void => {
        sending = false;
        gateError = GENERIC_ERROR;
      });
  }

  function addDebt(): void {
    if (form.debts.length < MAX_DEBTS) {
      form.debts = [...form.debts, emptyDebt()];
    }
  }

  function removeDebt(index: number): void {
    form.debts = form.debts.filter((_: DebtRow, position: number): boolean => position !== index);
    if (form.debts.length === 0) {
      form.debts = [emptyDebt()];
    }
  }

  function startOver(): void {
    form = emptyForm();
    plan = null;
    view = 'form';
    step = 0;
    delivered = false;
    error = '';
  }

  let working: WorkingPlan | null = null;
  let gapPlan: GapPlan | null = null;
  let funPlan: FunTooHigh | null = null;
  let outcome: StrategyOutcome | null = null;
  let progress: number = 0;

  $: working = plan !== null && plan.kind === 'plan' ? (plan as WorkingPlan) : null;
  $: gapPlan = plan !== null && plan.kind === 'gap' ? (plan as GapPlan) : null;
  $: funPlan = plan !== null && plan.kind === 'fun_too_high' ? (plan as FunTooHigh) : null;
  $: outcome = working === null ? null : strategy === 'avalanche' ? working.avalanche : working.snowball;
  $: progress = ((step + 1) / STEPS.length) * 100;
</script>

<div bind:this={root} class="scroll-mt-24 font-book text-book-paper">
  {#if view === 'form'}
    <div class="mb-8">
      <div class="flex items-baseline justify-between gap-4 text-sm">
        <p class="font-bold uppercase tracking-wider text-book-red">Step {step + 1} of {STEPS.length}</p>
        <p class="text-bone-dim">{STEPS[step]}</p>
      </div>
      <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bone/10" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)}>
        <div class="h-full bg-book-red transition-all duration-300" style={`width: ${progress}%`}></div>
      </div>
    </div>

    <form class="space-y-6" novalidate on:submit|preventDefault={next}>
      {#if step === 0}
        <h2 class="font-book-display text-3xl uppercase sm:text-4xl">Money in</h2>
        <label class="field">
          <span class="field-label">Monthly take-home pay</span>
          <span class="field-help">What actually hits your bank account, after taxes.</span>
          <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" autocomplete="off" bind:value={form.takeHome} placeholder="5,200" /></span>
        </label>
        <label class="field">
          <span class="field-label">Household size</span>
          <select value={form.householdSize} on:change={setHousehold}>
            {#each [1, 2, 3, 4, 5, 6, 7, 8] as size}
              <option value={String(size)}>{size} {size === 1 ? 'person' : 'people'}</option>
            {/each}
          </select>
        </label>
        <fieldset class="field">
          <legend class="field-label">How steady is your income?</legend>
          <div class="mt-3 grid gap-3">
            <label class="choice"><input type="radio" bind:group={form.stability} value="two_incomes" /> <span>Steady paycheck, two incomes</span></label>
            <label class="choice"><input type="radio" bind:group={form.stability} value="one_income" /> <span>One income</span></label>
            <label class="choice"><input type="radio" bind:group={form.stability} value="unsteady" /> <span>Commission, self-employed or layoff-prone</span></label>
          </div>
        </fieldset>
      {:else if step === 1}
        <h2 class="font-book-display text-3xl uppercase sm:text-4xl">Must-pays</h2>
        <p class="text-bone-dim">Only what you'd still have to pay if your income stopped. Monthly amounts.</p>
        <label class="field">
          <span class="field-label">Rent or mortgage</span>
          <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={form.housing} placeholder="1,500" /></span>
        </label>
        <label class="field">
          <span class="field-label">Utilities and phone</span>
          <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={form.utilities} placeholder="250" /></span>
        </label>
        <label class="field">
          <span class="field-label">Groceries and household basics</span>
          <span class="field-help">Pre-filled from USDA food-plan data for your household size. Change it if yours is different.</span>
          <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={form.groceries} on:input={() => (form.groceriesTouched = true)} /></span>
        </label>
        <label class="field">
          <span class="field-label">Transportation</span>
          <span class="field-help">Gas, car insurance, transit. Car payments go in the next step.</span>
          <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={form.transportation} placeholder="400" /></span>
        </label>
        <label class="field">
          <span class="field-label">Other insurance</span>
          <span class="field-help">Health, life.</span>
          <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={form.insurance} placeholder="0" /></span>
        </label>
        <label class="field">
          <span class="field-label">Childcare</span>
          <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={form.childcare} placeholder="0" /></span>
        </label>
        <label class="field">
          <span class="field-label">Other must-pays</span>
          <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={form.other} placeholder="0" /></span>
        </label>
      {:else if step === 2}
        <h2 class="font-book-display text-3xl uppercase sm:text-4xl">Debts and savings</h2>
        <label class="choice">
          <input type="checkbox" bind:checked={form.noDebt} />
          <span>I don't have any debt</span>
        </label>
        {#if !form.noDebt}
          <div class="space-y-4">
            {#each form.debts as row, index}
              <div class="rounded-md border border-bone/15 bg-ink-800 p-4">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-bold uppercase tracking-wider text-book-red">Debt {index + 1}</p>
                  {#if form.debts.length > 1}
                    <button type="button" class="text-sm text-bone-dim underline underline-offset-4 hover:text-book-paper" on:click={() => removeDebt(index)}>Remove</button>
                  {/if}
                </div>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <label class="field col-span-2">
                    <span class="field-label">Name</span>
                    <input type="text" maxlength="40" bind:value={row.label} placeholder="Car loan" />
                  </label>
                  <label class="field col-span-2 sm:col-span-1">
                    <span class="field-label">Balance</span>
                    <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={row.balance} placeholder="6,500" /></span>
                  </label>
                  <label class="field">
                    <span class="field-label">Interest rate</span>
                    <span class="money-input"><input type="text" inputmode="decimal" bind:value={row.apr} placeholder="22" /><span aria-hidden="true">%</span></span>
                  </label>
                  <label class="field">
                    <span class="field-label">Minimum</span>
                    <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={row.minimum} placeholder="180" /></span>
                  </label>
                </div>
              </div>
            {/each}
            {#if form.debts.length < MAX_DEBTS}
              <button type="button" class="btn-outline" on:click={addDebt}>+ Add another debt</button>
            {/if}
          </div>
        {/if}
        <label class="field">
          <span class="field-label">Cash savings</span>
          <span class="field-help">Checking and savings you could use in an emergency. Not retirement accounts.</span>
          <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={form.cashSavings} placeholder="0" /></span>
        </label>
        <fieldset class="field">
          <legend class="field-label">Does your employer match 401(k) contributions?</legend>
          <div class="mt-3 grid grid-cols-3 gap-3">
            <label class="choice"><input type="radio" bind:group={form.employerMatch} value="yes" /> <span>Yes</span></label>
            <label class="choice"><input type="radio" bind:group={form.employerMatch} value="no" /> <span>No</span></label>
            <label class="choice"><input type="radio" bind:group={form.employerMatch} value="not_sure" /> <span>Not sure</span></label>
          </div>
        </fieldset>
      {:else}
        <h2 class="font-book-display text-3xl uppercase sm:text-4xl">Your goal</h2>
        <p class="text-bone-dim">Optional. Leave the amount blank to skip it, and the plan works toward your safety net and debt.</p>
        <label class="field">
          <span class="field-label">What it's for</span>
          <input type="text" maxlength="60" bind:value={form.goalLabel} placeholder="Truck with no payment" />
        </label>
        <label class="field">
          <span class="field-label">How much</span>
          <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={form.goalAmount} placeholder="12,000" /></span>
        </label>
        <div class="field">
          <span class="field-label">By when</span>
          <div class="mt-2 grid grid-cols-2 gap-3">
            <select bind:value={form.goalMonth} aria-label="Goal month">
              <option value="">Month</option>
              {#each MONTHS as name, index}
                <option value={String(index + 1)}>{name}</option>
              {/each}
            </select>
            <select bind:value={form.goalYear} aria-label="Goal year">
              <option value="">Year</option>
              {#each YEARS as year}
                <option value={String(year)}>{year}</option>
              {/each}
            </select>
          </div>
        </div>
        <label class="field">
          <span class="field-label">Fun money each month</span>
          <span class="field-help">A plan with zero fun is a plan you'll quit.</span>
          <span class="money-input"><span aria-hidden="true">$</span><input type="text" inputmode="decimal" bind:value={form.funMoney} on:input={() => (form.funTouched = true)} /></span>
        </label>
      {/if}

      {#if error !== ''}
        <p class="text-sm text-loss" role="alert">{error}</p>
      {/if}

      <div class="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
        {#if step > 0}
          <button type="button" class="btn-outline" on:click={back}>Back</button>
        {:else}
          <span></span>
        {/if}
        <button type="submit" class="btn-red" disabled={loading}>
          {loading ? 'Building your plan…' : step === STEPS.length - 1 ? 'See my plan' : 'Next'}
        </button>
      </div>
      <p class="text-xs text-bone-mute">Your answers stay in this browser while you work. We use them to build your plan and don't save them.</p>
    </form>
  {:else if plan !== null}
    {#if working !== null && outcome !== null}
      <h2 class="font-book-display text-3xl uppercase sm:text-4xl">Your numbers</h2>
      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <div class="stat">
          <p class="stat-label">Leftover each month</p>
          <p class="stat-value">{money(working.core.leftover)}</p>
          <p class="stat-note">After must-pays and minimums</p>
        </div>
        <div class="stat">
          <p class="stat-label">Runway</p>
          <p class="stat-value">{runwayLabel(working.core.runwayMonths, working.core.cashSavings, working.core.essentials)}</p>
          <p class="stat-note">You could last about that long with no income</p>
        </div>
        <div class="stat">
          <p class="stat-label">Debt-free by</p>
          <p class="stat-value">{milestoneLabel(outcome.debtFree, 'No debt')}</p>
          <p class="stat-note">{outcome.debtFree.kind === 'month' ? 'An estimate at these numbers' : ''}</p>
        </div>
        <div class="stat">
          <p class="stat-label">Goal reached by</p>
          <p class="stat-value">{outcome.goal === null ? 'No goal set' : milestoneLabel(outcome.goal.reached, 'No goal set')}</p>
          <p class="stat-note">{goalNote(outcome)}</p>
        </div>
      </div>

      {#if firstBucket(outcome) !== undefined}
        <p class="mt-6 leading-relaxed text-bone-dim">This month, your push starts with <span class="font-semibold text-book-paper">{bucketText(firstBucket(outcome))}</span>. The full split is in the PDF.</p>
      {/if}

      {#if working.comparison !== null}
        <div class="mt-8 rounded-md border border-bone/15 bg-ink-800 p-5">
          <p class="text-sm font-bold uppercase tracking-wider text-book-red">Your debt method</p>
          <div class="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Debt payoff method">
            <button type="button" role="radio" aria-checked={strategy === 'avalanche'} class="toggle" class:toggle-on={strategy === 'avalanche'} on:click={() => (strategy = 'avalanche')}>Avalanche</button>
            <button type="button" role="radio" aria-checked={strategy === 'snowball'} class="toggle" class:toggle-on={strategy === 'snowball'} on:click={() => (strategy = 'snowball')}>Snowball</button>
          </div>
          <p class="mt-4 leading-relaxed text-book-paper">{working.comparison.summaryLine}</p>
          <p class="mt-2 text-sm text-bone-dim">The best method is the one you'll actually stick with.</p>
        </div>
      {/if}
    {:else if gapPlan !== null}
      <h2 class="font-book-display text-3xl uppercase sm:text-4xl">Your numbers don't work yet</h2>
      <p class="mt-4 text-lg leading-relaxed text-bone-dim">Here's the gap, and the two ways to close it.</p>
      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <div class="stat">
          <p class="stat-label">Short each month</p>
          <p class="stat-value">{money(gapPlan.gap.shortfall)}</p>
          <p class="stat-note">{gapPlan.gap.shortfall === 0 ? 'Nothing left over yet' : 'Essentials minus take-home'}</p>
        </div>
        {#if gapPlan.gap.ranked[0] !== undefined}
          <div class="stat">
            <p class="stat-label">Biggest must-pay</p>
            <p class="stat-value">{money(gapPlan.gap.ranked[0].amount)}</p>
            <p class="stat-note">{gapPlan.gap.ranked[0].label}</p>
          </div>
        {/if}
      </div>
      <p class="mt-6 leading-relaxed text-bone-dim">Two levers: cut or shrink the biggest expense, or raise your income. The PDF ranks your must-pays and shows where the trims are.</p>
    {:else if funPlan !== null}
      <h2 class="font-book-display text-3xl uppercase sm:text-4xl">Almost there</h2>
      <p class="mt-4 text-lg leading-relaxed text-bone-dim">
        Your fun money uses up everything left over ({money(funPlan.core.leftover)}), so there's nothing to build the plan with.
        Ten percent of what's left is about {money(funPlan.suggestedFunMoney)}.
      </p>
      <div class="mt-6 flex flex-col gap-3 sm:flex-row">
        <button type="button" class="btn-red" on:click={() => useSuggestedFun(funPlan?.suggestedFunMoney ?? 0)}>Use {money(funPlan.suggestedFunMoney)} for fun</button>
        <button type="button" class="btn-outline" on:click={edit}>Change my answers</button>
      </div>
    {/if}

    {#if funPlan === null}
      <div class="mt-10 rounded-md border border-book-red/50 bg-ink-800 p-5 sm:p-6">
        {#if !delivered}
          <h3 class="font-book-display text-2xl uppercase">Get your full plan as a PDF</h3>
          <p class="mt-2 leading-relaxed text-bone-dim">
            {gapPlan !== null ? 'The here\'s-the-gap version, with your 30-day checklist.' : 'Your monthly budget, safety net, debt order, rules and a 30-day checklist, all with your numbers.'}
          </p>
          <form class="mt-5" novalidate on:submit|preventDefault={requestPdf}>
            <label for="money-plan-email" class="block text-sm font-semibold">Email address</label>
            <div class="mt-2 flex flex-col gap-3 sm:flex-row">
              <input id="money-plan-email" type="email" autocomplete="email" inputmode="email" bind:value={email} placeholder="you@example.com" class="min-w-0 flex-1" disabled={sending} />
              <button type="submit" class="btn-red" disabled={sending}>{sending ? 'Building…' : 'Send my plan'}</button>
            </div>
            <label class="mt-4 flex items-start gap-3 text-sm leading-relaxed text-bone-dim">
              <input type="checkbox" bind:checked={newsletter} class="mt-1 h-4 w-4 shrink-0 accent-book-red" />
              <span>Also send me the free weekly email: one story, one money lesson.</span>
            </label>
            {#if gateError !== ''}
              <p class="mt-3 text-sm text-loss" role="alert">{gateError}</p>
            {/if}
          </form>
        {:else}
          <h3 class="font-book-display text-2xl uppercase">Your plan is downloading</h3>
          <p class="mt-2 leading-relaxed text-bone-dim">
            {emailed ? 'A copy is on its way to your inbox too.' : "We couldn't email a copy just now, so keep the download."}
            Start with the last page: your first 30 days.
          </p>
          <a class="btn-outline mt-4" href={downloadUrl} download="Your-Money-Plan.pdf">Download it again</a>
          <h4 class="mt-8 text-sm font-bold uppercase tracking-wider text-book-red">Your next step</h4>
          <ol class="mt-3 space-y-3 leading-relaxed">
            <li><a class="next-link" href="/disqualified#free-chapter">Read the first chapter of Disqualified free</a></li>
            {#if !newsletter}
              <li><a class="next-link" href="#weekly-email">Get the free weekly email: one story, one money lesson</a></li>
            {/if}
            <li>When your safety net is built and you're ready to invest, <a class="next-link" href="/membership">that's what Leaving the Matrix is for</a>.</li>
          </ol>
        {/if}
      </div>
    {/if}

    <div class="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <button type="button" class="text-bone-dim underline underline-offset-4 hover:text-book-paper" on:click={edit}>Change my answers</button>
      <button type="button" class="text-bone-dim underline underline-offset-4 hover:text-book-paper" on:click={startOver}>Start over</button>
    </div>
    <p class="mt-6 text-xs leading-relaxed text-bone-mute">Not financial advice. Dates are estimates at the numbers you entered. Built from the book Disqualified by Luke Vasilion.</p>
  {/if}
</div>

<style>
  .field {
    display: block;
  }
  .field-label {
    display: block;
    font-weight: 600;
    color: #e9e6df;
  }
  .field-help {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.875rem;
    color: #c8c8c0;
  }
  input[type='text'],
  input[type='email'],
  select {
    margin-top: 0.5rem;
    width: 100%;
    min-width: 0;
    border-radius: 0.375rem;
    border: 1px solid rgba(245, 245, 240, 0.2);
    background: #0a0a0d;
    padding: 0.8rem 0.9rem;
    font-size: 1rem;
    color: #e9e6df;
  }
  input:focus,
  select:focus {
    outline: none;
    border-color: #d7192f;
  }
  .money-input {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #7a7a78;
  }
  .money-input input {
    flex: 1;
  }
  .money-input > span {
    margin-top: 0.5rem;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid rgba(245, 245, 240, 0.15);
    background: #0a0a0d;
    padding: 0.8rem 0.9rem;
    cursor: pointer;
  }
  .choice input {
    accent-color: #d7192f;
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
  .btn-red {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    background: #d7192f;
    padding: 0.875rem 1.5rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #fff;
  }
  .btn-red:hover {
    background: #e8253c;
  }
  .btn-red:disabled {
    cursor: wait;
    opacity: 0.7;
  }
  .btn-outline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    border: 1px solid rgba(233, 230, 223, 0.35);
    padding: 0.875rem 1.5rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #e9e6df;
  }
  .btn-outline:hover {
    border-color: #e9e6df;
  }
  .stat {
    border-radius: 0.375rem;
    border: 1px solid rgba(233, 230, 223, 0.2);
    background: #0a0a0d;
    padding: 1.25rem;
  }
  .stat-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #d7192f;
  }
  .stat-value {
    margin-top: 0.5rem;
    font-family: 'Archivo Black', Archivo, Impact, sans-serif;
    font-size: 1.75rem;
    line-height: 1.15;
    color: #e9e6df;
  }
  .stat-note {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #c8c8c0;
  }
  .toggle {
    border-radius: 0.375rem;
    border: 1px solid rgba(233, 230, 223, 0.25);
    padding: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #c8c8c0;
  }
  .toggle-on {
    border-color: #d7192f;
    background: #d7192f;
    color: #fff;
  }
  .next-link {
    color: #e9e6df;
    text-decoration: underline;
    text-decoration-color: #d7192f;
    text-underline-offset: 4px;
  }
</style>
