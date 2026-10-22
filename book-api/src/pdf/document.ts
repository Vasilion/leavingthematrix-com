import { formatLongDate, formatMonthKey } from "../plan/calendar";
import { MUST_PAY_LABELS } from "../plan/gap";
import { formatCentsRounded, weeklyFromMonthly } from "../plan/money";
import type { Cents } from "../plan/money";
import type {
  BucketAmount,
  CoreNumbers,
  DebtMilestone,
  GapPlan,
  GoalOutcome,
  IncomeStability,
  MonthSplit,
  Milestone,
  MustPayKey,
  MustPayLine,
  PayoffStrategy,
  PlanInputs,
  StrategyOutcome,
  WorkingPlan,
} from "../plan/types";

export const FOOTER: string =
  "Not financial advice. Built from the book Disqualified by Luke Vasilion. leavingthematrix.io";
export const OPENING_LINE: string =
  "You don't have to fix everything at once. You just have to do the next small thing.";
export const FUTURE_YOU_LINE: string =
  "Long-term investing, like a low-cost diversified fund inside your employer plan or an IRA.";
export const STICK_WITH_IT: string = "The best method is the one you'll actually stick with.";
export const GAP_HEADLINE: string = "Your numbers don't work yet. Here's the gap, and the two ways to close it.";

const SITE: string = "https://leavingthematrix.io";
const FREE_CHAPTER_URL: string = `${SITE}/disqualified#free-chapter`;
const WEEKLY_EMAIL_URL: string = `${SITE}/tools/money-plan#weekly-email`;
const MEMBERSHIP_URL: string = `${SITE}/membership`;
const TOOL_URL: string = `${SITE}/tools/money-plan`;

export interface Stat {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}

export interface TableRow {
  readonly cells: readonly string[];
  readonly style: "normal" | "section" | "total";
}

export interface DebtColumn {
  readonly title: string;
  readonly subtitle: string;
  readonly highlighted: boolean;
  readonly lines: readonly string[];
  readonly footer: readonly string[];
}

export interface ChecklistGroup {
  readonly title: string;
  readonly intro: string;
  readonly items: readonly string[];
}

export interface LinkItem {
  readonly text: string;
  readonly url: string;
}

export type Block =
  | { readonly type: "lead"; readonly text: string }
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "small"; readonly text: string }
  | { readonly type: "heading"; readonly text: string }
  | { readonly type: "stats"; readonly items: readonly Stat[] }
  | { readonly type: "table"; readonly columns: readonly string[]; readonly rows: readonly TableRow[] }
  | { readonly type: "big"; readonly label: string; readonly text: string }
  | { readonly type: "callout"; readonly text: string }
  | { readonly type: "bullets"; readonly items: readonly string[] }
  | { readonly type: "debtColumns"; readonly columns: readonly DebtColumn[] }
  | { readonly type: "checklist"; readonly groups: readonly ChecklistGroup[] }
  | { readonly type: "links"; readonly items: readonly LinkItem[] };

export interface Page {
  readonly title: string;
  readonly blocks: readonly Block[];
}

export interface PlanDocument {
  readonly pages: readonly Page[];
  readonly footer: string;
}

export interface DocumentOptions {
  readonly strategy: PayoffStrategy;
  readonly newsletter: boolean;
  readonly asOf: Date;
}

const STRATEGY_NAMES: Record<PayoffStrategy, string> = { avalanche: "Avalanche", snowball: "Snowball" };
const STRATEGY_SUBTITLES: Record<PayoffStrategy, string> = {
  avalanche: "Highest interest rate first",
  snowball: "Smallest balance first",
};
const STABILITY_TEXT: Record<IncomeStability, string> = {
  two_incomes: "a steady paycheck with two incomes",
  one_income: "one income",
  unsteady: "income that can swing",
};

function money(cents: Cents): string {
  return formatCentsRounded(cents);
}

function weekly(cents: Cents): string {
  return formatCentsRounded(weeklyFromMonthly(cents));
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function aboutMonth(milestone: Milestone, already: string, beyond: string, none: string): string {
  switch (milestone.kind) {
    case "month":
      return `about ${formatMonthKey(milestone.month)}`;
    case "already":
      return already;
    case "beyond":
      return beyond;
    case "none":
      return none;
  }
}

function runwayValue(core: CoreNumbers): string {
  if (core.runwayMonths >= 1) {
    return `${core.runwayMonths} months`;
  }
  return plural(runwayDays(core), "day");
}

function runwayDays(core: CoreNumbers): number {
  return core.essentials <= 0 ? 0 : Math.floor((core.cashSavings / core.essentials) * 30);
}

export function runwaySentence(core: CoreNumbers): string {
  if (core.runwayMonths >= 1) {
    return `If your income stopped today, you'd last about ${core.runwayMonths} months.`;
  }
  if (runwayDays(core) < 1) {
    return "If your income stopped today, your savings wouldn't cover a single day of essentials yet. That's the first thing this plan fixes.";
  }
  return `If your income stopped today, you'd last about ${plural(runwayDays(core), "day")}.`;
}

function mustPayRows(inputs: PlanInputs): TableRow[] {
  const keys: MustPayKey[] = ["housing", "utilities", "groceries", "transportation", "insurance", "childcare", "other"];
  return keys
    .filter((key: MustPayKey): boolean => inputs.mustPays[key] > 0)
    .map((key: MustPayKey): TableRow => ({ cells: [MUST_PAY_LABELS[key], money(inputs.mustPays[key])], style: "normal" }));
}

function whereYouStand(inputs: PlanInputs, core: CoreNumbers): Page {
  const rows: TableRow[] = [
    { cells: ["Take-home pay", money(core.takeHome)], style: "total" },
    { cells: ["Must-pays", ""], style: "section" },
    ...mustPayRows(inputs),
    { cells: ["Total must-pays", money(core.mustPays)], style: "total" },
  ];
  if (inputs.debts.length > 0) {
    rows.push({ cells: ["Debt minimums", ""], style: "section" });
    for (const entry of inputs.debts) {
      rows.push({ cells: [entry.label, money(entry.minimumPayment)], style: "normal" });
    }
    rows.push({ cells: ["Total minimums", money(core.minimums)], style: "total" });
  }
  rows.push({ cells: ["Monthly essentials", money(core.essentials)], style: "total" });
  rows.push({ cells: ["Leftover", money(core.leftover)], style: "total" });
  return {
    title: "Where you stand",
    blocks: [
      { type: "lead", text: "Money in, the must-pays, the minimums, and what's left." },
      { type: "table", columns: ["", "Per month"], rows },
      { type: "heading", text: "Your runway" },
      { type: "paragraph", text: runwaySentence(core) },
      {
        type: "small",
        text: `Runway is cash savings divided by monthly essentials: ${money(core.cashSavings)} ÷ ${money(core.essentials)}. It's the most honest number in your financial life.`,
      },
    ],
  };
}

function bucketLabel(entry: BucketAmount): string {
  switch (entry.kind) {
    case "starter_fund":
      return "Starter fund (Plan B)";
    case "high_interest_debt":
    case "low_interest_debt":
      return `Extra to ${entry.targets.join(", ")}`;
    case "goal":
      return entry.targets[0] ?? "Your goal";
    case "full_fund":
      return "Emergency fund (Plan B)";
    case "future_you":
      return "Future you";
  }
}

function bucketDestination(entry: BucketAmount | undefined): string {
  if (entry === undefined) {
    return "your starter fund";
  }
  switch (entry.kind) {
    case "starter_fund":
      return "your starter fund";
    case "high_interest_debt":
    case "low_interest_debt":
      return entry.targets[0] ?? "your first debt";
    case "goal":
      return entry.targets[0] ?? "your goal";
    case "full_fund":
      return "your emergency fund";
    case "future_you":
      return "future you";
  }
}

function budgetPage(core: CoreNumbers, outcome: StrategyOutcome): Page {
  const split: MonthSplit = outcome.thisMonth;
  const rows: TableRow[] = [
    { cells: ["Must-pays", money(split.mustPays), weekly(split.mustPays)], style: "normal" },
  ];
  if (split.minimums > 0) {
    rows.push({ cells: ["Debt minimums", money(split.minimums), weekly(split.minimums)], style: "normal" });
  }
  rows.push({ cells: ["Fun money", money(split.funMoney), weekly(split.funMoney)], style: "normal" });
  rows.push({ cells: ["The push", "", ""], style: "section" });
  for (const entry of split.buckets) {
    rows.push({ cells: [bucketLabel(entry), money(entry.amount), weekly(entry.amount)], style: "normal" });
  }
  rows.push({ cells: ["Total", money(core.takeHome), weekly(core.takeHome)], style: "total" });

  const blocks: Block[] = [
    { type: "lead", text: `Every dollar has a job. Here's where this month's ${money(core.takeHome)} goes.` },
    { type: "table", columns: ["Job", "Per month", "Per week"], rows },
    {
      type: "paragraph",
      text: `The push is what's left after must-pays, minimums and fun: ${money(core.push)} this month. It fills one job at a time, in the book's order:`,
    },
    {
      type: "bullets",
      items: [
        "A small safety net first.",
        `Then the expensive debt, anything at ${core.highInterestThresholdPercent}% interest or more.`,
        "Then your goal, up to its monthly number.",
        "Then the full safety net.",
        "Then the rest of the debt.",
        "Then future you.",
      ],
    },
    { type: "small", text: "When a debt is paid off, its minimum payment joins the push." },
  ];
  if (split.buckets.some((entry: BucketAmount): boolean => entry.kind === "future_you")) {
    blocks.push({ type: "small", text: `Future you: ${FUTURE_YOU_LINE}` });
  }
  blocks.push({ type: "small", text: "Weekly numbers are monthly × 12 ÷ 52. A month is about 4.33 weeks, not 4." });
  return { title: "Your monthly budget", blocks };
}

function safetyNetPage(inputs: PlanInputs, core: CoreNumbers, outcome: StrategyOutcome): Page {
  return {
    title: "Your safety net",
    blocks: [
      { type: "lead", text: "The emergency fund comes before everything else. Without it, every surprise becomes debt." },
      {
        type: "stats",
        items: [
          {
            label: "Starter fund",
            value: money(core.starterFundTarget),
            note: aboutMonth(outcome.starterFund, "You already have this", "Not within 40 years", ""),
          },
          {
            label: "Full emergency fund",
            value: money(core.fullFundTarget),
            note: aboutMonth(outcome.fullFund, "You already have this", "Not within 40 years at these numbers", ""),
          },
        ],
      },
      {
        type: "paragraph",
        text: `Your starter fund is the smaller of $1,000 or one month of essentials. It's there so the next surprise doesn't go on a card.`,
      },
      {
        type: "paragraph",
        text: `Your full fund covers ${core.fullFundMonths} months of essentials at ${money(core.essentials)} a month, minimums included, because those are still owed if your income stops. You told us you have ${STABILITY_TEXT[inputs.stability]}, so the plan uses ${core.fullFundMonths} months.`,
      },
      { type: "paragraph", text: `Your savings count toward it. Right now that's ${money(core.cashSavings)}.` },
      { type: "heading", text: "Where to keep it" },
      {
        type: "bullets",
        items: [
          "Separate from checking, so you don't spend it on a random Tuesday.",
          "Easy to get to, so you can move it in a day or two when you need it.",
          "Safe, meaning not in the stock market. The market and the job market tend to crash at the same time.",
        ],
      },
      {
        type: "callout",
        text: 'Keep it in a separate high-yield savings account at an FDIC-insured bank, and name it "Plan B."',
      },
    ],
  };
}

function goalStatus(goal: GoalOutcome): string {
  const theirDate: string = formatMonthKey(goal.targetMonth);
  if (goal.onTime) {
    return `At these numbers, you'd get there ${aboutMonth(goal.reached, "", "", "")}, on time for ${theirDate}.`;
  }
  const reached: string =
    goal.reached.kind === "month"
      ? `At these numbers you'd hit this in ${formatMonthKey(goal.reached.month)}.`
      : "At these numbers, this goal doesn't get funded within 40 years.";
  const gap: string =
    goal.extraMonthlyNeeded === null
      ? `Making ${theirDate} would take more than these numbers can stretch to.`
      : `To make ${theirDate}, you'd need about ${money(goal.extraMonthlyNeeded)} more a month.`;
  return `${reached} ${gap}`;
}

function goalPage(goal: GoalOutcome): Page {
  const blocks: Block[] = [
    { type: "big", label: "What it's for", text: goal.label },
    {
      type: "stats",
      items: [
        { label: "How much", value: money(goal.amount), note: "Starting from $0" },
        { label: "By when", value: formatMonthKey(goal.targetMonth), note: "Your date" },
        { label: "Each month", value: money(goal.monthly), note: "Amount ÷ months, rounded up" },
        { label: "Each week", value: weekly(goal.monthly), note: "Monthly × 12 ÷ 52" },
      ],
    },
    { type: "paragraph", text: goalStatus(goal) },
  ];
  if (!goal.onTime) {
    blocks.push({
      type: "small",
      text: "Your goal waits behind the starter fund and the expensive debt, because those come first in the book's order. The extra-a-month number counts that. Your date stays your date: push it out, shrink the goal, or find the extra.",
    });
  }
  blocks.push({ type: "heading", text: "Give it a name" });
  blocks.push({
    type: "paragraph",
    text: `Give this goal its own savings account with its name on it: "${goal.label}." It sounds silly. It works. It's a lot harder to raid an account with a name on it than one called "Savings 2."`,
  });
  blocks.push({
    type: "small",
    text: "Your existing savings count toward your safety net, never toward the goal, so this one starts from zero.",
  });
  return { title: "Your goal", blocks };
}

function debtColumn(outcome: StrategyOutcome, picked: boolean): DebtColumn {
  const lines: string[] = outcome.debts.map(
    (entry: DebtMilestone, index: number): string =>
      `${index + 1}. ${entry.label}: ${aboutMonth(entry.paidOff, "paid off", "not within 40 years", "")}`,
  );
  return {
    title: STRATEGY_NAMES[outcome.strategy],
    subtitle: STRATEGY_SUBTITLES[outcome.strategy],
    highlighted: picked,
    lines,
    footer: [
      `Debt-free: ${aboutMonth(outcome.debtFree, "now", "not within 40 years", "")}`,
      `Total interest: ${money(outcome.totalInterest)}`,
    ],
  };
}

function debtPage(plan: WorkingPlan, picked: StrategyOutcome, strategy: PayoffStrategy): Page {
  const single: boolean = picked.debts.length < 2;
  const columns: DebtColumn[] = single
    ? [{ ...debtColumn(picked, true), title: "Your debt", subtitle: "With one debt, both methods are the same" }]
    : [debtColumn(plan.avalanche, strategy === "avalanche"), debtColumn(plan.snowball, strategy === "snowball")];
  const blocks: Block[] = [
    { type: "big", label: "Start here", text: picked.firstTarget ?? "Your first debt" },
    { type: "debtColumns", columns },
  ];
  if (plan.comparison !== null) {
    blocks.push({ type: "paragraph", text: plan.comparison.summaryLine });
  }
  blocks.push({ type: "callout", text: STICK_WITH_IT });
  blocks.push({
    type: "small",
    text: `Both methods pay the minimum on everything and send every extra dollar at one debt at a time. Debts at ${plan.core.highInterestThresholdPercent}% or more get paid down before your goal. The rest wait until your safety net is full. Dates are estimates at these numbers.`,
  });
  return { title: "Your debt", blocks };
}

function rulesPage(inputs: PlanInputs, outcome: StrategyOutcome): Page {
  const groceries: Cents = inputs.mustPays.groceries;
  const destination: string = bucketDestination(outcome.thisMonth.buckets[0]);
  const capText: string =
    groceries > 0
      ? `Groceries, household basics and the random runs live under one monthly number: ${money(groceries)} a month, about ${weekly(groceries)} a week. When it's gone, it's gone until next month.`
      : "Groceries, gas, eating out and the random runs all live under one monthly number. Pick yours and write it down.";
  const funText: string =
    inputs.funMoney > 0
      ? `Your ${money(inputs.funMoney)} a month of fun goes on one card, paid off in full every month. The statement is the scoreboard. If it comes in over, you know it, and nobody has to argue about where the money went.`
      : "You set fun money at $0. A plan with zero fun is a plan you'll quit. Even a small number on its own card helps. The statement is the scoreboard.";
  return {
    title: "Your rules",
    blocks: [
      {
        type: "lead",
        text: "Spreadsheets are for planning. Day to day, people follow simple rules. If a rule takes more than a sentence, it's too complicated.",
      },
      { type: "heading", text: "1. A hard cap on everyday spending" },
      { type: "paragraph", text: capText },
      { type: "heading", text: "2. Fun has its own card" },
      { type: "paragraph", text: funText },
      { type: "heading", text: "3. Surprise money gets split 80/20" },
      {
        type: "paragraph",
        text: `Bonuses, tax refunds, side money: 80% goes to ${destination}, and 20% goes to fun. A $1,000 refund would be $800 to ${destination} and $200 to enjoy. You get to enjoy a win without blowing it.`,
      },
      { type: "small", text: "From Chapter 16. Write these down where you'll see them." },
    ],
  };
}

function nextSteps(newsletter: boolean): Block[] {
  const items: LinkItem[] = [{ text: "Read the first chapter of Disqualified free", url: FREE_CHAPTER_URL }];
  if (!newsletter) {
    items.push({ text: "Get the free weekly email: one story, one money lesson", url: WEEKLY_EMAIL_URL });
  }
  items.push({
    text: "When your safety net is built and you're ready to invest, that's what Leaving the Matrix is for",
    url: MEMBERSHIP_URL,
  });
  return [{ type: "heading", text: "Your next step" }, { type: "links", items }];
}

function matchItem(inputs: PlanInputs): string {
  switch (inputs.employerMatch) {
    case "yes":
      return "Check your 401(k) match. If you're not getting all of it, raise your contribution until you are.";
    case "not_sure":
      return "Find out if your employer matches 401(k) contributions. If they do, contribute enough to get all of it.";
    case "no":
      return "No employer match? When your safety net is built, an IRA is the account to look at first.";
  }
}

function biggestExpenses(inputs: PlanInputs, count: number): string {
  const keys: MustPayKey[] = (Object.keys(inputs.mustPays) as MustPayKey[])
    .filter((key: MustPayKey): boolean => inputs.mustPays[key] > 0)
    .sort((a: MustPayKey, b: MustPayKey): number => inputs.mustPays[b] - inputs.mustPays[a])
    .slice(0, count);
  return keys.map((key: MustPayKey): string => MUST_PAY_LABELS[key].toLowerCase()).join(", ");
}

function planB(core: CoreNumbers, outcome: StrategyOutcome): string {
  const starterThisMonth: Cents =
    outcome.thisMonth.buckets.find((entry: BucketAmount): boolean => entry.kind === "starter_fund")?.amount ?? 0;
  const moveNow: string =
    core.cashSavings > 0 ? `move your ${money(core.cashSavings)} of savings into it` : "move something into it, even $25";
  const automatic: string =
    starterThisMonth > 0 ? `, then set up an automatic ${money(starterThisMonth)} transfer for payday` : "";
  return `Open a high-yield savings account named "Plan B" and ${moveNow}${automatic}.`;
}

function firstDaysPlan(inputs: PlanInputs, core: CoreNumbers, outcome: StrategyOutcome, newsletter: boolean): Page {
  const week1: string[] = [
    inputs.goal === null
      ? "Write down your reason. Who or what are you doing this for? Put it somewhere you'll see it every day."
      : `Write down your reason. You said "${inputs.goal.label}." Put it somewhere you'll see it every day.`,
  ];
  if (inputs.debts.length > 0) {
    week1.push(
      `Look at your payments for a minute: ${money(core.minimums)} a month in minimums is ${money(core.minimums * 12)} a year.`,
    );
    week1.push("Check your credit report for free at annualcreditreport.com. Look for errors and anything you forgot about.");
  }
  week1.push(`Write down your runway: ${runwayValue(core)}. Don't judge it. Just know it.`);

  const week2: string[] = [
    planB(core, outcome),
    outcome.starterFund.kind === "already"
      ? `Your first target, ${money(core.starterFundTarget)}, is already covered. Leave it alone.`
      : `Your first target: ${money(core.starterFundTarget)}, ${aboutMonth(outcome.starterFund, "", "", "")}.`,
  ];
  if (outcome.goal !== null) {
    week2.push(
      `Open a second account named "${outcome.goal.label}" and set ${money(outcome.goal.monthly)} a month (about ${weekly(outcome.goal.monthly)} a week) to go there once the plan reaches it.`,
    );
  } else {
    week2.push("Write one money goal with three parts: what it's for, how much, and by when.");
  }

  const firstDebtExtra: BucketAmount | undefined = outcome.thisMonth.buckets.find(
    (entry: BucketAmount): boolean => entry.kind === "high_interest_debt" || entry.kind === "low_interest_debt",
  );
  const week3: string[] = [
    `Rate your biggest expenses (${biggestExpenses(inputs, 5)}) from 1 to 10 on how much they improve your life. Cut or shrink the lowest one.`,
    "Call one company you pay every month and ask for a better rate.",
  ];
  if (outcome.firstTarget !== null) {
    week3.push(
      firstDebtExtra !== undefined
        ? `Send an extra ${money(firstDebtExtra.amount)} to ${firstDebtExtra.targets[0] ?? outcome.firstTarget} this month.`
        : `Once your starter fund is full, send every extra dollar to ${outcome.firstTarget}.`,
    );
  }

  const week4: string[] = [matchItem(inputs)];
  week4.push("When your safety net is built, open a Roth IRA if you're eligible.");
  week4.push(
    inputs.householdSize > 1
      ? "Have the money talk with your household, and write down the rules on the Your rules page."
      : "Write down the rules on the Your rules page and put them where you'll see them.",
  );
  week4.push("Look up what your job pays. Find one skill that would move you up.");

  return {
    title: "Your first 30 days",
    blocks: [
      {
        type: "checklist",
        groups: [
          { title: "Week 1: See where you stand", intro: "", items: week1 },
          { title: "Week 2: Build the safety net", intro: "", items: week2 },
          { title: "Week 3: Stop the leaks", intro: "", items: week3 },
          { title: "Week 4: Start building", intro: "", items: week4 },
        ],
      },
      { type: "small", text: "Day 31: pick the one move that scared you most and do it again next month." },
      ...nextSteps(newsletter),
    ],
  };
}

function headlineStats(core: CoreNumbers, outcome: StrategyOutcome): Stat[] {
  return [
    { label: "Leftover each month", value: money(core.leftover), note: "After must-pays and minimums" },
    { label: "Runway", value: runwayValue(core), note: "How long your savings would last" },
    {
      label: "Debt-free by",
      value: aboutMonth(outcome.debtFree, "Now", "Not within 40 years", "No debt").replace(/^about /, ""),
      note: outcome.debtFree.kind === "month" ? "Estimated at these numbers" : "",
    },
    {
      label: "Goal reached by",
      value:
        outcome.goal === null
          ? "No goal set"
          : aboutMonth(outcome.goal.reached, "Now", "Not within 40 years", "").replace(/^about /, ""),
      note: outcome.goal === null ? "" : outcome.goal.onTime ? "On time" : `You picked ${formatMonthKey(outcome.goal.targetMonth)}`,
    },
  ];
}

function coverPage(madeOn: Date, stats: readonly Stat[], subline: string, headline: string | null): Page {
  const blocks: Block[] = [{ type: "small", text: `Made ${formatLongDate(madeOn)}. ${subline}` }];
  if (headline !== null) {
    blocks.push({ type: "lead", text: headline });
  }
  blocks.push({ type: "stats", items: stats });
  blocks.push({ type: "callout", text: OPENING_LINE });
  blocks.push({
    type: "small",
    text: "Every date in this plan is an estimate at the numbers you entered. If your numbers change, so do the dates.",
  });
  return { title: "Your Money Plan", blocks };
}

export function buildWorkingDocument(inputs: PlanInputs, plan: WorkingPlan, options: DocumentOptions): PlanDocument {
  const outcome: StrategyOutcome = options.strategy === "avalanche" ? plan.avalanche : plan.snowball;
  const subline: string =
    inputs.debts.length > 0 ? `Debt method: ${STRATEGY_NAMES[options.strategy]}.` : "Built on the book's order.";
  const pages: Page[] = [
    coverPage(options.asOf, headlineStats(plan.core, outcome), subline, null),
    whereYouStand(inputs, plan.core),
    budgetPage(plan.core, outcome),
    safetyNetPage(inputs, plan.core, outcome),
  ];
  if (outcome.goal !== null) {
    pages.push(goalPage(outcome.goal));
  }
  if (inputs.debts.length > 0) {
    pages.push(debtPage(plan, outcome, options.strategy));
  }
  pages.push(rulesPage(inputs, outcome));
  pages.push(firstDaysPlan(inputs, plan.core, outcome, options.newsletter));
  return { pages, footer: FOOTER };
}

function gapPage(plan: GapPlan): Page {
  const rows: TableRow[] = plan.gap.ranked.map(
    (line: MustPayLine): TableRow => ({
      cells: [line.label, money(line.amount), line.suggestedReduction > 0 ? money(line.suggestedReduction) : "-"],
      style: "normal",
    }),
  );
  const notes: string[] = plan.gap.ranked.map((line: MustPayLine): string => `${line.label}: ${line.note}`);
  const shortfallWeekly: string = weekly(Math.max(plan.gap.shortfall, 0));
  return {
    title: "The gap",
    blocks: [
      { type: "lead", text: plan.gap.summaryLine },
      { type: "table", columns: ["Must-pay, biggest first", "Per month", "Possible trim"], rows },
      { type: "bullets", items: notes },
      { type: "heading", text: "Lever 1: cut or shrink the biggest expense" },
      {
        type: "paragraph",
        text: "Rate your biggest expenses from 1 to 10 on how much they actually improve your life. Cut or shrink the lowest one. Housing is the biggest lever, and the slowest. (Chapter 11)",
      },
      { type: "heading", text: "Lever 2: raise your income" },
      {
        type: "paragraph",
        text:
          plan.gap.shortfall > 0
            ? `Income is the biggest lever. Closing ${money(plan.gap.shortfall)} a month is about ${shortfallWeekly} a week: a raise, more hours, or one skill you could charge for. (Chapter 9)`
            : "Income is the biggest lever. Even a small raise or a little side income gives this plan something to work with. (Chapter 9)",
      },
      { type: "small", text: `Once the gap is closed, run the numbers again at ${TOOL_URL}. It takes three minutes.` },
    ],
  };
}

function gapFirstDays(inputs: PlanInputs, plan: GapPlan, newsletter: boolean): Page {
  const core: CoreNumbers = plan.core;
  const top: MustPayLine | undefined = plan.gap.ranked[0];
  return {
    title: "Your first 30 days",
    blocks: [
      {
        type: "checklist",
        groups: [
          {
            title: "Week 1: See where you stand",
            intro: "",
            items: [
              "Write down your reason. Who or what are you doing this for? Put it somewhere you'll see it every day.",
              `Write down your runway: ${runwayValue(core)}. Don't judge it. Just know it.`,
              ...(inputs.debts.length > 0
                ? ["Check your credit report for free at annualcreditreport.com. Look for errors and anything you forgot about."]
                : []),
            ],
          },
          {
            title: "Week 2: Build the safety net",
            intro: "",
            items: [
              'Open a high-yield savings account named "Plan B." Even $25 a payday starts it.',
              `Your first target: ${money(core.starterFundTarget)}, the smaller of $1,000 or one month of essentials.`,
            ],
          },
          {
            title: "Week 3: Stop the leaks",
            intro: "",
            items: [
              `Rate your biggest expenses (${biggestExpenses(inputs, 5)}) from 1 to 10. Cut or shrink the lowest one.`,
              ...(top === undefined
                ? []
                : [`Start with the biggest: ${top.label.toLowerCase()} at ${money(top.amount)} a month.`]),
              "Call one company you pay every month and ask for a better rate.",
            ],
          },
          {
            title: "Week 4: Pull the income lever",
            intro: "",
            items: [
              "Look up what your job pays and your total compensation. Find one skill that would move you up.",
              "List three skills you could charge for.",
              `Run the numbers again at ${TOOL_URL}.`,
            ],
          },
        ],
      },
      { type: "small", text: "Day 31: pick the one move that scared you most and do it again next month." },
      ...nextSteps(newsletter),
    ],
  };
}

export function buildGapDocument(inputs: PlanInputs, plan: GapPlan, options: DocumentOptions): PlanDocument {
  const top: MustPayLine | undefined = plan.gap.ranked[0];
  const stats: Stat[] = [
    {
      label: "Short each month",
      value: money(plan.gap.shortfall),
      note: plan.gap.shortfall === 0 ? "Nothing left over yet" : "Essentials minus take-home",
    },
    { label: "Runway", value: runwayValue(plan.core), note: "How long your savings would last" },
    { label: "Biggest must-pay", value: top === undefined ? "-" : money(top.amount), note: top?.label ?? "" },
    { label: "Monthly essentials", value: money(plan.core.essentials), note: "Must-pays plus minimums" },
  ];
  return {
    pages: [
      coverPage(options.asOf, stats, "Here's the gap version.", GAP_HEADLINE),
      whereYouStand(inputs, plan.core),
      gapPage(plan),
      gapFirstDays(inputs, plan, options.newsletter),
    ],
    footer: FOOTER,
  };
}

export function documentStrings(document: PlanDocument): string[] {
  const strings: string[] = [document.footer];
  for (const page of document.pages) {
    strings.push(page.title);
    for (const block of page.blocks) {
      switch (block.type) {
        case "lead":
        case "paragraph":
        case "small":
        case "heading":
        case "callout":
          strings.push(block.text);
          break;
        case "big":
          strings.push(block.label, block.text);
          break;
        case "stats":
          for (const stat of block.items) {
            strings.push(stat.label, stat.value, stat.note);
          }
          break;
        case "table":
          strings.push(...block.columns);
          for (const row of block.rows) {
            strings.push(...row.cells);
          }
          break;
        case "bullets":
          strings.push(...block.items);
          break;
        case "debtColumns":
          for (const column of block.columns) {
            strings.push(column.title, column.subtitle, ...column.lines, ...column.footer);
          }
          break;
        case "checklist":
          for (const group of block.groups) {
            strings.push(group.title, group.intro, ...group.items);
          }
          break;
        case "links":
          for (const link of block.items) {
            strings.push(link.text, link.url);
          }
          break;
      }
    }
  }
  return strings.filter((value: string): boolean => value !== "");
}
