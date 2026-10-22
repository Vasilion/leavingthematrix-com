import { ratioOneDecimal } from "./arithmetic";
import { ALREADY, runCascade, toMilestone } from "./cascade";
import type { CascadeInput, CascadeResult } from "./cascade";
import { toIsoDate } from "./calendar";
import { PLAN_CONFIG } from "./config";
import type { PlanConfig } from "./config";
import type { DebtState } from "./debt-simulation";
import { analyzeGap } from "./gap";
import { CENTS_PER_DOLLAR, formatCentsRounded } from "./money";
import type { Cents } from "./money";
import {
  fullFundMonths,
  fullFundTarget,
  isHighInterest,
  starterFundTarget,
  suggestFunMoney,
  sumMinimums,
  sumMustPays,
} from "./targets";
import type {
  CoreNumbers,
  Debt,
  DebtMilestone,
  GoalOutcome,
  Milestone,
  PayoffStrategy,
  PlanInputs,
  PlanResult,
  StrategyComparison,
  StrategyOutcome,
} from "./types";

const EXTRA_SEARCH_CEILING: Cents = 10_000_000_000;

export function coreNumbers(inputs: PlanInputs, config: PlanConfig): CoreNumbers {
  const mustPays: Cents = sumMustPays(inputs.mustPays);
  const minimums: Cents = sumMinimums(inputs.debts);
  const essentials: Cents = mustPays + minimums;
  const leftover: Cents = inputs.takeHome - essentials;
  return {
    takeHome: inputs.takeHome,
    mustPays,
    minimums,
    essentials,
    leftover,
    funMoney: inputs.funMoney,
    push: leftover - inputs.funMoney,
    runwayMonths: ratioOneDecimal(inputs.cashSavings, essentials),
    cashSavings: inputs.cashSavings,
    starterFundTarget: starterFundTarget(essentials, config),
    fullFundTarget: fullFundTarget(essentials, inputs.stability, config),
    fullFundMonths: fullFundMonths(inputs.stability, config),
    highInterestThresholdPercent: config.highInterestThresholdPercent,
    totalDebt: inputs.debts.reduce((total: Cents, debt: Debt): Cents => total + debt.balance, 0),
  };
}

function cascadeInput(
  inputs: PlanInputs,
  core: CoreNumbers,
  strategy: PayoffStrategy,
  push: Cents,
  asOf: Date,
  config: PlanConfig,
  stopAfterMonth: number | null,
): CascadeInput {
  return {
    debts: inputs.debts,
    goal: inputs.goal,
    strategy,
    mustPays: core.mustPays,
    funMoney: core.funMoney,
    push,
    cashSavings: inputs.cashSavings,
    starterTarget: core.starterFundTarget,
    fullTarget: core.fullFundTarget,
    asOf,
    config,
    stopAfterMonth,
  };
}

function reachesGoalOnTime(result: CascadeResult): boolean {
  return (
    result.goalIndex !== null &&
    result.goalTargetIndex !== null &&
    result.goalIndex !== ALREADY &&
    result.goalIndex <= result.goalTargetIndex
  );
}

function extraMonthlyNeeded(
  inputs: PlanInputs,
  core: CoreNumbers,
  strategy: PayoffStrategy,
  asOf: Date,
  config: PlanConfig,
  targetIndex: number,
): Cents | null {
  const onTimeWith = (extraDollars: number): boolean =>
    reachesGoalOnTime(
      runCascade(
        cascadeInput(inputs, core, strategy, core.push + extraDollars * CENTS_PER_DOLLAR, asOf, config, targetIndex),
      ),
    );
  let high: number = Math.max(1, Math.ceil((inputs.goal?.amount ?? 0) / CENTS_PER_DOLLAR));
  while (!onTimeWith(high)) {
    high *= 2;
    if (high * CENTS_PER_DOLLAR > EXTRA_SEARCH_CEILING) {
      return null;
    }
  }
  let low: number = 0;
  while (high - low > 1) {
    const middle: number = Math.floor((low + high) / 2);
    if (onTimeWith(middle)) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return high * CENTS_PER_DOLLAR;
}

function debtMilestones(result: CascadeResult, inputs: PlanInputs, config: PlanConfig): DebtMilestone[] {
  const order: readonly string[] = [...result.highOrder, ...result.lowOrder];
  const clearedAt = (state: DebtState): number => state.clearedMonthIndex ?? Number.MAX_SAFE_INTEGER;
  return [...result.states]
    .sort(
      (a: DebtState, b: DebtState): number => clearedAt(a) - clearedAt(b) || order.indexOf(a.id) - order.indexOf(b.id),
    )
    .map((state: DebtState): DebtMilestone => {
      const debt: Debt | undefined = inputs.debts.find((entry: Debt): boolean => entry.id === state.id);
      return {
        id: state.id,
        label: state.label,
        balance: debt?.balance ?? 0,
        aprPercent: state.aprPercent,
        highInterest: debt === undefined ? false : isHighInterest(debt, config),
        paidOff: toMilestone(result.start, state.clearedMonthIndex),
      };
    });
}

function strategyOutcome(
  inputs: PlanInputs,
  core: CoreNumbers,
  strategy: PayoffStrategy,
  asOf: Date,
  config: PlanConfig,
): StrategyOutcome {
  const result: CascadeResult = runCascade(cascadeInput(inputs, core, strategy, core.push, asOf, config, null));
  const order: readonly string[] = [...result.highOrder, ...result.lowOrder];
  const firstTarget: DebtState | undefined = result.states.find((state: DebtState): boolean => state.id === order[0]);

  let goal: GoalOutcome | null = null;
  if (inputs.goal !== null && result.goalTargetIndex !== null) {
    const onTime: boolean = reachesGoalOnTime(result);
    goal = {
      label: inputs.goal.label,
      amount: inputs.goal.amount,
      targetMonth: inputs.goal.targetMonth,
      monthly: result.goalMonthly,
      reached: toMilestone(result.start, result.goalIndex),
      onTime,
      extraMonthlyNeeded: onTime
        ? 0
        : extraMonthlyNeeded(inputs, core, strategy, asOf, config, result.goalTargetIndex),
    };
  }

  const noDebt: boolean = inputs.debts.length === 0;
  const none: Milestone = { kind: "none" };
  return {
    strategy,
    firstTarget: firstTarget?.label ?? null,
    debts: debtMilestones(result, inputs, config),
    debtFree: noDebt ? none : toMilestone(result.start, result.debtFreeIndex),
    firstDebtPaidOff: noDebt ? none : toMilestone(result.start, result.firstClearedIndex),
    totalInterest: result.totalInterest,
    starterFund: toMilestone(result.start, result.starterIndex),
    fullFund: toMilestone(result.start, result.fullIndex),
    goal,
    thisMonth: result.thisMonth,
  };
}

function monthNumber(milestone: Milestone): number | null {
  if (milestone.kind !== "month") {
    return null;
  }
  const parts: string[] = milestone.month.split("-");
  return Number(parts[0]) * 12 + Number(parts[1]);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function compareOutcomes(avalanche: StrategyOutcome, snowball: StrategyOutcome): StrategyComparison | null {
  if (avalanche.debts.length < 2) {
    return null;
  }
  const interestSaved: Cents = Math.max(0, snowball.totalInterest - avalanche.totalInterest);
  const avalancheFirst: number | null = monthNumber(avalanche.firstDebtPaidOff);
  const snowballFirst: number | null = monthNumber(snowball.firstDebtPaidOff);
  const monthsSooner: number =
    avalancheFirst === null || snowballFirst === null ? 0 : Math.max(0, avalancheFirst - snowballFirst);
  const sameOrder: boolean =
    avalanche.debts.map((debt: DebtMilestone): string => debt.id).join("|") ===
      snowball.debts.map((debt: DebtMilestone): string => debt.id).join("|") && interestSaved === 0;
  const roundedSaved: boolean = interestSaved >= CENTS_PER_DOLLAR;

  let summaryLine: string;
  if (avalanche.debtFree.kind === "beyond" && snowball.debtFree.kind === "beyond") {
    summaryLine = "At these numbers, neither method clears your debt within 40 years.";
  } else if (sameOrder || (!roundedSaved && monthsSooner === 0)) {
    summaryLine = "For your debts, both methods come out about the same.";
  } else if (roundedSaved && monthsSooner > 0) {
    summaryLine = `Avalanche saves you ${formatCentsRounded(interestSaved)} in interest. Snowball pays off your first debt ${plural(monthsSooner, "month")} sooner.`;
  } else if (roundedSaved) {
    summaryLine = `Avalanche saves you ${formatCentsRounded(interestSaved)} in interest, and snowball doesn't pay off your first debt any sooner.`;
  } else {
    summaryLine = `Snowball pays off your first debt ${plural(monthsSooner, "month")} sooner, for about the same interest.`;
  }

  return {
    interestSavedByAvalanche: interestSaved,
    monthsSoonerFirstWinBySnowball: monthsSooner,
    sameOrder,
    summaryLine,
  };
}

export function buildPlan(inputs: PlanInputs, asOf: Date, config: PlanConfig = PLAN_CONFIG): PlanResult {
  const core: CoreNumbers = coreNumbers(inputs, config);
  const madeOn: string = toIsoDate(asOf);

  if (core.leftover <= 0) {
    return { kind: "gap", madeOn, core, gap: analyzeGap(inputs.mustPays, inputs.takeHome, core.leftover) };
  }
  if (core.push <= 0) {
    return { kind: "fun_too_high", madeOn, core, suggestedFunMoney: suggestFunMoney(core.leftover, config) };
  }

  const avalanche: StrategyOutcome = strategyOutcome(inputs, core, "avalanche", asOf, config);
  const snowball: StrategyOutcome = strategyOutcome(inputs, core, "snowball", asOf, config);
  return { kind: "plan", madeOn, core, avalanche, snowball, comparison: compareOutcomes(avalanche, snowball) };
}
