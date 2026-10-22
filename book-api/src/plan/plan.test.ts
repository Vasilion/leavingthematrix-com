import { describe, expect, it } from "vitest";
import { runCascade } from "./cascade";
import type { CascadeResult } from "./cascade";
import { PLAN_CONFIG } from "./config";
import { AS_OF, CAR, CARD, VISA, debt, inputsWith } from "./fixtures";
import { dollarsToCents } from "./money";
import { buildPlan, coreNumbers } from "./plan";
import type { DebtState } from "./debt-simulation";
import type {
  BucketAmount,
  BucketKind,
  CoreNumbers,
  Debt,
  DebtMilestone,
  GoalOutcome,
  MonthSplit,
  MustPayLine,
  GapPlan,
  Milestone,
  PlanInputs,
  PlanResult,
  StrategyOutcome,
  WorkingPlan,
} from "./types";

function working(inputs: PlanInputs): WorkingPlan {
  const result: PlanResult = buildPlan(inputs, AS_OF);
  if (result.kind !== "plan") {
    throw new Error(`expected a working plan, got ${result.kind}`);
  }
  return result;
}

function bucketAmount(outcome: StrategyOutcome, kind: BucketKind): number {
  return outcome.thisMonth.buckets.find((entry: BucketAmount): boolean => entry.kind === kind)?.amount ?? 0;
}

function month(milestone: Milestone): string {
  if (milestone.kind !== "month") {
    throw new Error(`expected a month, got ${milestone.kind}`);
  }
  return milestone.month;
}

function cascadeFor(inputs: PlanInputs, extraPush: number): CascadeResult {
  const core: CoreNumbers = coreNumbers(inputs, PLAN_CONFIG);
  return runCascade({
    debts: inputs.debts,
    goal: inputs.goal,
    strategy: "avalanche",
    mustPays: core.mustPays,
    funMoney: core.funMoney,
    push: core.push + extraPush,
    cashSavings: inputs.cashSavings,
    starterTarget: core.starterFundTarget,
    fullTarget: core.fullFundTarget,
    asOf: AS_OF,
    config: PLAN_CONFIG,
    stopAfterMonth: null,
  });
}

describe("core numbers", () => {
  it("follows the book's formulas", () => {
    const plan: WorkingPlan = working(inputsWith({}));
    expect(plan.core.mustPays).toBe(dollarsToCents(3_050));
    expect(plan.core.minimums).toBe(dollarsToCents(550));
    expect(plan.core.essentials).toBe(dollarsToCents(3_600));
    expect(plan.core.leftover).toBe(dollarsToCents(2_400));
    expect(plan.core.push).toBe(dollarsToCents(2_250));
    expect(plan.core.runwayMonths).toBe(0.1);
  });

  it("sizes the starter fund at the smaller of $1,000 or one month of essentials", () => {
    expect(working(inputsWith({})).core.starterFundTarget).toBe(dollarsToCents(1_000));
    const lean: PlanInputs = inputsWith({
      takeHome: dollarsToCents(2_000),
      mustPays: { housing: dollarsToCents(500), utilities: 0, groceries: dollarsToCents(300), transportation: 0, insurance: 0, childcare: 0, other: 0 },
      debts: [],
      goal: null,
    });
    expect(working(lean).core.starterFundTarget).toBe(dollarsToCents(800));
  });

  it("sizes the full fund at three months for two steady incomes and six otherwise", () => {
    expect(working(inputsWith({ stability: "two_incomes" })).core.fullFundTarget).toBe(dollarsToCents(10_800));
    expect(working(inputsWith({ stability: "one_income" })).core.fullFundTarget).toBe(dollarsToCents(21_600));
    expect(working(inputsWith({ stability: "unsteady" })).core.fullFundTarget).toBe(dollarsToCents(21_600));
  });
});

describe("the monthly cascade", () => {
  it("fills the starter fund first and sends the rest to high-interest debt", () => {
    const plan: WorkingPlan = working(inputsWith({}));
    expect(bucketAmount(plan.avalanche, "starter_fund")).toBe(dollarsToCents(600));
    expect(bucketAmount(plan.avalanche, "high_interest_debt")).toBe(dollarsToCents(1_650));
    expect(bucketAmount(plan.avalanche, "goal")).toBe(0);
    expect(month(plan.avalanche.starterFund)).toBe("2026-10");
  });

  it("gives every dollar of take-home a job this month", () => {
    const plan: WorkingPlan = working(inputsWith({}));
    for (const outcome of [plan.avalanche, plan.snowball]) {
      const split: MonthSplit = outcome.thisMonth;
      const buckets: number = split.buckets.reduce((sum: number, entry: BucketAmount): number => sum + entry.amount, 0);
      expect(split.mustPays + split.minimums + split.funMoney + buckets).toBe(plan.core.takeHome);
    }
  });

  it("funds the goal before the full emergency fund, and the full fund before low-interest debt", () => {
    const plan: WorkingPlan = working(
      inputsWith({ debts: [CAR], cashSavings: dollarsToCents(1_000), takeHome: dollarsToCents(5_200) }),
    );
    const outcome: StrategyOutcome = plan.avalanche;
    expect(bucketAmount(outcome, "starter_fund")).toBe(0);
    expect(bucketAmount(outcome, "goal")).toBe(outcome.goal?.monthly ?? -1);
    expect(bucketAmount(outcome, "full_fund")).toBeGreaterThan(0);
    expect(bucketAmount(outcome, "low_interest_debt")).toBe(0);
  });

  it("sends whatever is left to future you once everything else is covered", () => {
    const plan: WorkingPlan = working(
      inputsWith({ debts: [], goal: null, cashSavings: dollarsToCents(50_000), takeHome: dollarsToCents(5_000) }),
    );
    expect(plan.avalanche.thisMonth.buckets).toEqual([
      { kind: "future_you", amount: dollarsToCents(5_000 - 3_050 - 150), targets: [] },
    ]);
    expect(plan.avalanche.starterFund.kind).toBe("already");
    expect(plan.avalanche.fullFund.kind).toBe("already");
  });

  it("rolls a paid-off debt's minimum into the push", () => {
    const inputs: PlanInputs = inputsWith({ goal: null });
    const withRoll: CascadeResult = cascadeFor(inputs, 0);
    const card: DebtState | undefined = withRoll.states.find((state: DebtState): boolean => state.id === CARD.id);
    const visa: DebtState | undefined = withRoll.states.find((state: DebtState): boolean => state.id === VISA.id);
    expect(card?.clearedMonthIndex).toBe(0);
    expect(visa?.clearedMonthIndex).not.toBeNull();
    expect(visa?.clearedMonthIndex ?? 99).toBeLessThan(6);
  });

  it("keeps every money figure an integer number of cents", () => {
    const plan: WorkingPlan = working(inputsWith({}));
    const amounts: number[] = [
      plan.core.push,
      plan.avalanche.totalInterest,
      plan.snowball.totalInterest,
      plan.avalanche.goal?.monthly ?? 0,
      plan.avalanche.goal?.extraMonthlyNeeded ?? 0,
      ...plan.avalanche.thisMonth.buckets.map((entry: BucketAmount): number => entry.amount),
    ];
    for (const value of amounts) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("is deterministic for identical inputs", () => {
    expect(JSON.stringify(buildPlan(inputsWith({}), AS_OF))).toBe(JSON.stringify(buildPlan(inputsWith({}), AS_OF)));
  });
});

describe("no debt", () => {
  it("skips the debt buckets and reports no debt-free date", () => {
    const plan: WorkingPlan = working(inputsWith({ debts: [] }));
    expect(plan.avalanche.debtFree.kind).toBe("none");
    expect(plan.avalanche.debts).toEqual([]);
    expect(plan.comparison).toBeNull();
    expect(bucketAmount(plan.avalanche, "high_interest_debt")).toBe(0);
    expect(bucketAmount(plan.avalanche, "goal")).toBeGreaterThan(0);
  });
});

describe("no goal", () => {
  it("works toward the safety net and debt only", () => {
    const plan: WorkingPlan = working(inputsWith({ goal: null }));
    expect(plan.avalanche.goal).toBeNull();
    expect(month(plan.avalanche.debtFree) <= month(working(inputsWith({})).avalanche.debtFree)).toBe(true);
    expect(plan.avalanche.fullFund.kind).toBe("month");
  });
});

describe("the goal date", () => {
  it("says so when the goal is reachable by their date", () => {
    const plan: WorkingPlan = working(inputsWith({ debts: [], cashSavings: dollarsToCents(20_000) }));
    const goal: GoalOutcome | null = plan.avalanche.goal;
    expect(goal?.onTime).toBe(true);
    expect(goal?.extraMonthlyNeeded).toBe(0);
    expect(goal?.monthly).toBe(dollarsToCents(Math.ceil(12_000 / 33)));
    expect(month(goal?.reached ?? { kind: "none" }) <= "2029-06").toBe(true);
  });

  it("shows the realistic date and the gap when it isn't, without moving their date", () => {
    const inputs: PlanInputs = inputsWith({
      goal: { label: "Truck with no payment", amount: dollarsToCents(12_000), targetMonth: "2027-03" },
    });
    const goal: GoalOutcome | null = working(inputs).avalanche.goal;
    expect(goal?.onTime).toBe(false);
    expect(goal?.targetMonth).toBe("2027-03");
    expect(month(goal?.reached ?? { kind: "none" }) > "2027-03").toBe(true);
    const extra: number = goal?.extraMonthlyNeeded ?? 0;
    expect(extra).toBeGreaterThan(0);
    expect(extra % 100).toBe(0);
  });

  it("finds the smallest extra monthly amount that actually makes the date", () => {
    const inputs: PlanInputs = inputsWith({
      goal: { label: "Truck", amount: dollarsToCents(12_000), targetMonth: "2027-03" },
    });
    const extra: number = working(inputs).avalanche.goal?.extraMonthlyNeeded ?? 0;
    const target: number = 5;
    expect(extra).toBeGreaterThan(0);
    const enough: CascadeResult = cascadeFor(inputs, extra);
    const short: CascadeResult = cascadeFor(inputs, extra - 100);
    expect(enough.goalIndex).not.toBeNull();
    expect(enough.goalIndex ?? 99).toBeLessThanOrEqual(target);
    expect(short.goalIndex === null || (short.goalIndex ?? 0) > target).toBe(true);
  });

  it("lets a goal that started late catch up toward their date", () => {
    const goal: GoalOutcome | null = working(
      inputsWith({ goal: { label: "Truck", amount: dollarsToCents(12_000), targetMonth: "2027-06" } }),
    ).avalanche.goal;
    expect(goal?.onTime).toBe(true);
    expect(goal?.reached).toEqual({ kind: "month", month: "2027-06" });
  });

  it("starts the goal from zero and never counts existing savings toward it", () => {
    const plan: WorkingPlan = working(inputsWith({ debts: [], cashSavings: dollarsToCents(80_000) }));
    expect(month(plan.avalanche.goal?.reached ?? { kind: "none" })).not.toBe("2026-10");
  });
});

describe("avalanche vs snowball", () => {
  const inverted: PlanInputs = inputsWith({
    goal: null,
    cashSavings: dollarsToCents(1_000),
    debts: [debt("debt-1", "Big card", 9_000, 29, 270), debt("debt-2", "Small card", 900, 12, 35)],
  });

  it("orders the debts differently and states the trade-off", () => {
    const plan: WorkingPlan = working(inverted);
    expect(plan.avalanche.firstTarget).toBe("Big card");
    expect(plan.snowball.firstTarget).toBe("Small card");
    expect(plan.avalanche.debts.map((entry: DebtMilestone): string => entry.label)).toEqual(["Big card", "Small card"]);
    expect(plan.snowball.debts.map((entry: DebtMilestone): string => entry.label)).toEqual(["Small card", "Big card"]);
    expect(plan.comparison?.interestSavedByAvalanche).toBeGreaterThan(0);
    expect(plan.comparison?.monthsSoonerFirstWinBySnowball).toBeGreaterThan(0);
    expect(plan.comparison?.summaryLine).toMatch(/^Avalanche saves you \$[\d,]+ in interest\. Snowball pays off your first debt \d+ months? sooner\.$/);
  });

  it("never lets snowball beat avalanche on total interest", () => {
    for (const inputs of [inverted, inputsWith({}), inputsWith({ goal: null })]) {
      const plan: WorkingPlan = working(inputs);
      expect(plan.avalanche.totalInterest).toBeLessThanOrEqual(plan.snowball.totalInterest);
    }
  });

  it("says they come out the same when every rate and order matches", () => {
    const plan: WorkingPlan = working(
      inputsWith({ debts: [debt("debt-1", "A", 1_000, 18, 30), debt("debt-2", "B", 3_000, 12, 60)] }),
    );
    expect(plan.comparison?.summaryLine).toBe("For your debts, both methods come out about the same.");
  });

  it("treats 8% and up as high-interest debt", () => {
    const plan: WorkingPlan = working(
      inputsWith({ debts: [debt("debt-1", "At threshold", 2_000, 8, 50), debt("debt-2", "Below", 1_000, 7.99, 50)] }),
    );
    const flags: boolean[] = plan.avalanche.debts.map((entry: DebtMilestone): boolean => entry.highInterest);
    expect(flags).toEqual([true, false]);
  });
});

describe("when the numbers don't work", () => {
  it("refuses to build a fake plan and ranks must-pays biggest first", () => {
    const result: PlanResult = buildPlan(inputsWith({ takeHome: dollarsToCents(3_400) }), AS_OF);
    expect(result.kind).toBe("gap");
    const gap: GapPlan = result as GapPlan;
    expect(gap.gap.shortfall).toBe(dollarsToCents(200));
    const amounts: number[] = gap.gap.ranked.map((line: MustPayLine): number => line.amount);
    expect(amounts).toEqual([...amounts].sort((a: number, b: number): number => b - a));
    expect(gap.gap.ranked[0]?.label).toBe("Rent or mortgage");
    expect(gap.gap.summaryLine).toContain("$200 short");
  });

  it("treats exactly zero leftover as not workable", () => {
    expect(buildPlan(inputsWith({ takeHome: dollarsToCents(3_600) }), AS_OF).kind).toBe("gap");
  });

  it("asks for less fun money when fun is what eats the push", () => {
    const result: PlanResult = buildPlan(inputsWith({ funMoney: dollarsToCents(2_400) }), AS_OF);
    expect(result.kind).toBe("fun_too_high");
    expect(result.kind === "fun_too_high" ? result.suggestedFunMoney : 0).toBe(dollarsToCents(240));
  });

  it("flags housing above 30% of take-home with a concrete trim", () => {
    const result: PlanResult = buildPlan(
      inputsWith({ takeHome: dollarsToCents(3_400), mustPays: { ...inputsWith({}).mustPays, housing: dollarsToCents(1_600) } }),
      AS_OF,
    );
    const housing: MustPayLine | undefined = (result as GapPlan).gap.ranked.find((line: MustPayLine): boolean => line.key === "housing");
    expect(housing?.suggestedReduction).toBe(dollarsToCents(1_600 - 1_020));
  });
});

describe("a debt that never clears on minimums", () => {
  const underwater: Debt = debt("debt-1", "Old card", 10_000, 30, 200);

  it("still clears once the push is pointed at it", () => {
    const plan: WorkingPlan = working(inputsWith({ debts: [underwater], goal: null }));
    expect(plan.avalanche.debtFree.kind).toBe("month");
  });

  it("reports beyond the 40-year cap instead of inventing a date when the push is too small", () => {
    const plan: WorkingPlan = working(
      inputsWith({ debts: [underwater], goal: null, takeHome: dollarsToCents(3_050 + 200 + 50), funMoney: dollarsToCents(0) }),
    );
    expect(plan.core.push).toBe(dollarsToCents(50));
    expect(plan.avalanche.debtFree.kind).toBe("beyond");
    expect(plan.avalanche.debts[0]?.paidOff.kind).toBe("beyond");
    expect(plan.comparison).toBeNull();
  });
});

describe("free vs members", () => {
  it("never returns a month-by-month schedule", () => {
    for (const inputs of [inputsWith({}), inputsWith({ debts: [] }), inputsWith({ takeHome: dollarsToCents(3_000) })]) {
      const json: string = JSON.stringify(buildPlan(inputs, AS_OF));
      expect(json).not.toMatch(/"(months|schedule|projection|steps|balanceCurve)"/);
      const arrays: unknown[][] = [];
      JSON.parse(json, (key: string, value: unknown): unknown => {
        if (Array.isArray(value)) {
          arrays.push(value);
        }
        return value;
      });
      for (const array of arrays) {
        expect(array.length).toBeLessThanOrEqual(15);
      }
    }
  });
});
