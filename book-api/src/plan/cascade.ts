import { addMonths, firstOfMonth, monthsBetween, parseMonthKey, toMonthKey } from "./calendar";
import type { PlanConfig } from "./config";
import { accrueAndPayMinimums, orderDebts, payExtra, toDebtStates, totalBalance } from "./debt-simulation";
import type { DebtState, ExtraOutcome, MinimumsOutcome } from "./debt-simulation";
import type { Cents } from "./money";
import { goalMonthly, isHighInterest, sumMinimums } from "./targets";
import type { BucketAmount, Debt, Goal, Milestone, MonthSplit, PayoffStrategy } from "./types";

export const ALREADY: number = -1;

export interface CascadeInput {
  readonly debts: readonly Debt[];
  readonly goal: Goal | null;
  readonly strategy: PayoffStrategy;
  readonly mustPays: Cents;
  readonly funMoney: Cents;
  readonly push: Cents;
  readonly cashSavings: Cents;
  readonly starterTarget: Cents;
  readonly fullTarget: Cents;
  readonly asOf: Date;
  readonly config: PlanConfig;
  readonly stopAfterMonth: number | null;
}

export interface CascadeResult {
  readonly start: Date;
  readonly states: readonly DebtState[];
  readonly highOrder: readonly string[];
  readonly lowOrder: readonly string[];
  readonly starterIndex: number | null;
  readonly fullIndex: number | null;
  readonly goalIndex: number | null;
  readonly goalTargetIndex: number | null;
  readonly goalMonthly: Cents;
  readonly debtFreeIndex: number | null;
  readonly firstClearedIndex: number | null;
  readonly totalInterest: Cents;
  readonly thisMonth: MonthSplit;
}

function bucket(kind: BucketAmount["kind"], amount: Cents, targets: readonly string[]): BucketAmount {
  return { kind, amount, targets: Array.from(new Set<string>(targets)) };
}

export function goalTargetIndex(goal: Goal, start: Date): number {
  const target: Date | null = parseMonthKey(goal.targetMonth);
  return target === null ? 0 : Math.max(0, monthsBetween(start, target));
}

export function runCascade(input: CascadeInput): CascadeResult {
  const { debts, goal, strategy, config, starterTarget, fullTarget } = input;
  const start: Date = firstOfMonth(input.asOf);
  const states: DebtState[] = toDebtStates(debts);
  const highOrder: readonly string[] = orderDebts(
    debts.filter((debt: Debt): boolean => isHighInterest(debt, config)),
    strategy,
  ).map((debt: Debt): string => debt.id);
  const lowOrder: readonly string[] = orderDebts(
    debts.filter((debt: Debt): boolean => !isHighInterest(debt, config)),
    strategy,
  ).map((debt: Debt): string => debt.id);
  const pool: Cents = input.push + sumMinimums(debts);

  const targetIndex: number | null = goal === null ? null : goalTargetIndex(goal, start);
  const monthlyForGoal: Cents = goal === null || targetIndex === null ? 0 : goalMonthly(goal.amount, targetIndex + 1);

  let savings: Cents = input.cashSavings;
  let goalSaved: Cents = 0;
  let starterIndex: number | null = savings >= starterTarget ? ALREADY : null;
  let fullIndex: number | null = savings >= fullTarget ? ALREADY : null;
  let goalIndex: number | null = null;
  let debtFreeIndex: number | null = totalBalance(states) <= 0 ? ALREADY : null;
  let firstClearedIndex: number | null = null;
  let totalInterest: Cents = 0;
  let thisMonth: MonthSplit = { mustPays: input.mustPays, minimums: 0, funMoney: input.funMoney, buckets: [] };

  const lastMonth: number =
    input.stopAfterMonth === null ? config.capMonths - 1 : Math.min(config.capMonths - 1, input.stopAfterMonth);

  for (let monthIndex: number = 0; monthIndex <= lastMonth; monthIndex += 1) {
    const allDone: boolean =
      starterIndex !== null && fullIndex !== null && debtFreeIndex !== null && (goal === null || goalIndex !== null);
    if (allDone && monthIndex > 0) {
      break;
    }

    const minimums: MinimumsOutcome = accrueAndPayMinimums(states, pool, monthIndex);
    totalInterest += minimums.interestAccrued;
    let available: Cents = pool - minimums.totalPaid;

    let starter: Cents = 0;
    if (savings < starterTarget) {
      starter = Math.min(available, starterTarget - savings);
      savings += starter;
      available -= starter;
    }

    const high: ExtraOutcome = payExtra(states, highOrder, available, monthIndex);
    available -= high.totalPaid;

    let toGoal: Cents = 0;
    if (goal !== null && targetIndex !== null && goalSaved < goal.amount) {
      const remaining: Cents = goal.amount - goalSaved;
      const monthsLeft: number = targetIndex - monthIndex + 1;
      const catchUp: Cents = monthsLeft <= 0 ? remaining : goalMonthly(remaining, monthsLeft);
      toGoal = Math.min(available, Math.max(monthlyForGoal, catchUp), remaining);
      goalSaved += toGoal;
      available -= toGoal;
    }

    let full: Cents = 0;
    if (savings < fullTarget) {
      full = Math.min(available, fullTarget - savings);
      savings += full;
      available -= full;
    }

    const low: ExtraOutcome = payExtra(states, lowOrder, available, monthIndex);
    available -= low.totalPaid;

    if (starterIndex === null && savings >= starterTarget) {
      starterIndex = monthIndex;
    }
    if (fullIndex === null && savings >= fullTarget) {
      fullIndex = monthIndex;
    }
    if (goal !== null && goalIndex === null && goalSaved >= goal.amount) {
      goalIndex = monthIndex;
    }
    const cleared: number = minimums.clearedIds.length + high.clearedIds.length + low.clearedIds.length;
    if (firstClearedIndex === null && cleared > 0) {
      firstClearedIndex = monthIndex;
    }
    if (debtFreeIndex === null && totalBalance(states) <= 0) {
      debtFreeIndex = monthIndex;
    }

    if (monthIndex === 0) {
      thisMonth = {
        mustPays: input.mustPays,
        minimums: minimums.totalPaid,
        funMoney: input.funMoney,
        buckets: [
          bucket("starter_fund", starter, []),
          bucket("high_interest_debt", high.totalPaid, high.targetLabels),
          bucket("goal", toGoal, goal === null ? [] : [goal.label]),
          bucket("full_fund", full, []),
          bucket("low_interest_debt", low.totalPaid, low.targetLabels),
          bucket("future_you", available, []),
        ].filter((entry: BucketAmount): boolean => entry.amount > 0),
      };
    }
  }

  return {
    start,
    states,
    highOrder,
    lowOrder,
    starterIndex,
    fullIndex,
    goalIndex,
    goalTargetIndex: targetIndex,
    goalMonthly: monthlyForGoal,
    debtFreeIndex,
    firstClearedIndex,
    totalInterest,
    thisMonth,
  };
}

export function toMilestone(start: Date, index: number | null): Milestone {
  if (index === null) {
    return { kind: "beyond" };
  }
  if (index === ALREADY) {
    return { kind: "already" };
  }
  return { kind: "month", month: toMonthKey(addMonths(start, index)) };
}
