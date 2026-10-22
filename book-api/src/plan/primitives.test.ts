import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import { monthlyInterest, ratioOneDecimal, ratioPercent, roundToCents } from "./arithmetic";
import { addMonths, firstOfMonth, formatMonthKey, monthsBetween, parseMonthKey, toIsoDate } from "./calendar";
import { orderDebts, stepDebtMonth, toDebtStates } from "./debt-simulation";
import type { DebtState, MonthDebtOutcome } from "./debt-simulation";
import { debt } from "./fixtures";
import {
  estimateFoodCost,
  estimateHouseholdSupplies,
  estimateLivingAllowance,
  usdaHouseholdSizeAdjustment,
  USDA_MODERATE_PLAN_REFERENCE_FAMILY_MONTHLY,
} from "./living-allowance";
import { ceilToDollar, dollarsToCents, formatCents, formatCentsRounded, weeklyFromMonthly } from "./money";
import { funMoneyPrefillDollars, groceriesPrefillDollars } from "./prefill";
import type { Debt } from "./types";

describe("arithmetic", () => {
  it("rounds half up at the cent", () => {
    expect(roundToCents(new Decimal("10.5"))).toBe(11);
    expect(roundToCents(new Decimal("10.4"))).toBe(10);
    expect(roundToCents(new Decimal("-10.5"))).toBe(-11);
  });

  it("accrues no interest on a cleared or interest-free balance", () => {
    expect(monthlyInterest(0, 24)).toBe(0);
    expect(monthlyInterest(-500, 24)).toBe(0);
    expect(monthlyInterest(100_000, 0)).toBe(0);
  });

  it("accrues monthly interest at one twelfth of the annual rate", () => {
    expect(monthlyInterest(dollarsToCents(10_000), 24)).toBe(dollarsToCents(200));
  });

  it("computes percentages of a whole", () => {
    expect(ratioPercent(dollarsToCents(250), dollarsToCents(1000))).toBe(25);
    expect(ratioPercent(100, 0)).toBe(0);
  });

  it("rounds a runway down to one decimal place so it never overstates", () => {
    expect(ratioOneDecimal(dollarsToCents(7_000), dollarsToCents(3_500))).toBe(2);
    expect(ratioOneDecimal(dollarsToCents(1_000), dollarsToCents(3_000))).toBe(0.3);
    expect(ratioOneDecimal(dollarsToCents(1_000), 0)).toBe(0);
  });
});

describe("money formatting", () => {
  it("formats cents with and without the fractional part", () => {
    expect(formatCents(123_456)).toBe("$1,234.56");
    expect(formatCents(-500)).toBe("-$5.00");
    expect(formatCents(7)).toBe("$0.07");
    expect(formatCentsRounded(123_456)).toBe("$1,235");
    expect(formatCentsRounded(-123_456)).toBe("-$1,235");
  });

  it("rounds up to the next whole dollar", () => {
    expect(ceilToDollar(10_001)).toBe(10_100);
    expect(ceilToDollar(10_000)).toBe(10_000);
  });

  it("converts monthly to weekly with 52 weeks a year, not four a month", () => {
    expect(weeklyFromMonthly(dollarsToCents(173.33))).toBe(dollarsToCents(40));
    expect(weeklyFromMonthly(dollarsToCents(250))).toBe(5_769);
  });
});

describe("calendar", () => {
  it("normalises to the first of the month", () => {
    expect(toIsoDate(firstOfMonth(new Date(Date.UTC(2026, 8, 17))))).toBe("2026-09-01");
  });

  it("adds months across a year boundary", () => {
    expect(toIsoDate(addMonths(new Date(Date.UTC(2026, 10, 1)), 3))).toBe("2027-02-01");
  });

  it("counts whole months between two dates", () => {
    expect(monthsBetween(new Date(Date.UTC(2026, 8, 1)), new Date(Date.UTC(2028, 2, 1)))).toBe(18);
  });

  it("parses and formats month keys and rejects bad ones", () => {
    expect(formatMonthKey("2029-06")).toBe("June 2029");
    expect(parseMonthKey("2029-13")).toBeNull();
    expect(parseMonthKey("June 2029")).toBeNull();
    expect(formatMonthKey("nope")).toBe("");
  });
});

describe("living allowance", () => {
  it("scales with household size and never falls below one person", () => {
    expect(estimateLivingAllowance(1)).toBeGreaterThan(0);
    expect(estimateLivingAllowance(4)).toBeGreaterThan(estimateLivingAllowance(1));
    expect(estimateLivingAllowance(0)).toBe(estimateLivingAllowance(1));
    expect(estimateLivingAllowance(-3)).toBe(estimateLivingAllowance(1));
  });

  it("reproduces the USDA reference family food cost exactly at four people", () => {
    expect(estimateFoodCost(4)).toBe(USDA_MODERATE_PLAN_REFERENCE_FAMILY_MONTHLY);
  });

  it("applies the USDA household size adjustments", () => {
    expect(usdaHouseholdSizeAdjustment(1)).toBe(1.2);
    expect(usdaHouseholdSizeAdjustment(2)).toBe(1.1);
    expect(usdaHouseholdSizeAdjustment(3)).toBe(1.05);
    expect(usdaHouseholdSizeAdjustment(4)).toBe(1);
    expect(usdaHouseholdSizeAdjustment(5)).toBe(0.95);
    expect(usdaHouseholdSizeAdjustment(6)).toBe(0.95);
    expect(usdaHouseholdSizeAdjustment(7)).toBe(0.9);
  });

  it("separates food from household supplies so both are inspectable", () => {
    for (const size of [1, 3, 5]) {
      expect(estimateLivingAllowance(size)).toBe(estimateFoodCost(size) + estimateHouseholdSupplies(size));
    }
  });

  it("pre-fills groceries from the estimate, rounded to $10", () => {
    for (const size of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const prefill: number = groceriesPrefillDollars(size);
      expect(prefill % 10).toBe(0);
      expect(Math.abs(prefill * 100 - estimateLivingAllowance(size))).toBeLessThanOrEqual(500);
    }
  });

  it("pre-fills fun money at 10% of leftover, rounded to $10", () => {
    expect(funMoneyPrefillDollars(2_400)).toBe(240);
    expect(funMoneyPrefillDollars(1_234)).toBe(120);
    expect(funMoneyPrefillDollars(1_250)).toBe(130);
    expect(funMoneyPrefillDollars(-50)).toBe(0);
  });
});

describe("debt ordering", () => {
  const debts: readonly Debt[] = [
    debt("a", "A", 5_000, 18, 100),
    debt("b", "B", 1_000, 18, 50),
    debt("c", "C", 9_000, 6, 200),
  ];

  it("breaks avalanche ties on the smaller balance", () => {
    expect(orderDebts(debts, "avalanche").map((entry: Debt): string => entry.id)).toEqual(["b", "a", "c"]);
  });

  it("orders snowball by balance ascending", () => {
    expect(orderDebts(debts, "snowball").map((entry: Debt): string => entry.id)).toEqual(["b", "a", "c"]);
  });
});

describe("debt month stepping", () => {
  it("returns the whole budget unspent when there is no debt", () => {
    const outcome: MonthDebtOutcome = stepDebtMonth([], [], 50_000, 0);
    expect(outcome.unspent).toBe(50_000);
    expect(outcome.closingDebt).toBe(0);
  });

  it("pays minimums only when the budget covers nothing more", () => {
    const states: DebtState[] = toDebtStates([debt("a", "A", 1_000, 12, 50)]);
    const outcome: MonthDebtOutcome = stepDebtMonth(states, ["a"], 5_000, 0);
    expect(outcome.totalPaid).toBe(5_000);
    expect(outcome.clearedIds).toEqual([]);
    expect(outcome.closingDebt).toBe(96_000);
  });

  it("cascades leftover budget into the next debt in the same month", () => {
    const states: DebtState[] = toDebtStates([debt("a", "A", 100, 0, 10), debt("b", "B", 400, 0, 20)]);
    const outcome: MonthDebtOutcome = stepDebtMonth(states, ["a", "b"], 30_000, 0);
    expect(outcome.clearedIds).toContain("a");
    expect(outcome.closingDebt).toBe(20_000);
    expect(outcome.unspent).toBe(0);
  });
});
