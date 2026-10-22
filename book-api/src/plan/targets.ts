import { ceilToDollar } from "./money";
import type { Cents } from "./money";
import type { PlanConfig } from "./config";
import type { Debt, IncomeStability, MustPays, PlanInputs } from "./types";

export function sumMustPays(mustPays: MustPays): Cents {
  return (
    mustPays.housing +
    mustPays.utilities +
    mustPays.groceries +
    mustPays.transportation +
    mustPays.insurance +
    mustPays.childcare +
    mustPays.other
  );
}

export function sumMinimums(debts: readonly Debt[]): Cents {
  return debts.reduce((total: Cents, debt: Debt): Cents => total + debt.minimumPayment, 0);
}

export function monthlyEssentials(inputs: PlanInputs): Cents {
  return sumMustPays(inputs.mustPays) + sumMinimums(inputs.debts);
}

export function starterFundTarget(essentials: Cents, config: PlanConfig): Cents {
  return Math.min(config.starterFundCap, essentials);
}

export function fullFundMonths(stability: IncomeStability, config: PlanConfig): number {
  return stability === "two_incomes" ? config.fullFundMonthsTwoIncomes : config.fullFundMonthsOther;
}

export function fullFundTarget(essentials: Cents, stability: IncomeStability, config: PlanConfig): Cents {
  return essentials * fullFundMonths(stability, config);
}

export function isHighInterest(debt: Debt, config: PlanConfig): boolean {
  return debt.aprPercent >= config.highInterestThresholdPercent;
}

export function goalMonthly(amount: Cents, monthsToSave: number): Cents {
  return ceilToDollar(Math.ceil(amount / Math.max(1, monthsToSave)));
}

export function suggestFunMoney(leftover: Cents, config: PlanConfig): Cents {
  if (leftover <= 0) {
    return 0;
  }
  const raw: number = (leftover * config.funMoneyPercentOfLeftover) / 100;
  return Math.round(raw / config.funMoneyRounding) * config.funMoneyRounding;
}
