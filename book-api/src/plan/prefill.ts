import { estimateLivingAllowance } from "./living-allowance";

export function groceriesPrefillDollars(householdSize: number): number {
  return Math.round(estimateLivingAllowance(householdSize) / 1000) * 10;
}

export function funMoneyPrefillDollars(leftoverDollars: number): number {
  if (leftoverDollars <= 0) {
    return 0;
  }
  return Math.round(leftoverDollars / 100) * 10;
}
