import type { Cents, Percent } from "./money";

export interface PlanConfig {
  readonly starterFundCap: Cents;
  readonly fullFundMonthsTwoIncomes: number;
  readonly fullFundMonthsOther: number;
  readonly highInterestThresholdPercent: Percent;
  readonly capMonths: number;
  readonly funMoneyPercentOfLeftover: Percent;
  readonly funMoneyRounding: Cents;
}

export const PLAN_CONFIG: PlanConfig = {
  starterFundCap: 100_000,
  fullFundMonthsTwoIncomes: 3,
  fullFundMonthsOther: 6,
  highInterestThresholdPercent: 8,
  capMonths: 480,
  funMoneyPercentOfLeftover: 10,
  funMoneyRounding: 1_000,
};
