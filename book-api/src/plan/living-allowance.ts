import type { Cents } from "./money";

export const USDA_MODERATE_PLAN_REFERENCE_FAMILY_MONTHLY: Cents = 134_700;
export const USDA_REFERENCE_FAMILY_SIZE: number = 4;

const USDA_PER_PERSON_AT_REFERENCE_SIZE: Cents = Math.round(
  USDA_MODERATE_PLAN_REFERENCE_FAMILY_MONTHLY / USDA_REFERENCE_FAMILY_SIZE,
);

const HOUSEHOLD_SUPPLIES_FIRST_PERSON: Cents = 10_000;
const HOUSEHOLD_SUPPLIES_EACH_ADDITIONAL: Cents = 3_000;

export function usdaHouseholdSizeAdjustment(householdSize: number): number {
  if (householdSize <= 1) {
    return 1.2;
  }
  if (householdSize === 2) {
    return 1.1;
  }
  if (householdSize === 3) {
    return 1.05;
  }
  if (householdSize === 4) {
    return 1;
  }
  if (householdSize <= 6) {
    return 0.95;
  }
  return 0.9;
}

export function estimateFoodCost(householdSize: number): Cents {
  const people: number = Math.max(1, Math.floor(householdSize));
  return Math.round(USDA_PER_PERSON_AT_REFERENCE_SIZE * people * usdaHouseholdSizeAdjustment(people));
}

export function estimateHouseholdSupplies(householdSize: number): Cents {
  const people: number = Math.max(1, Math.floor(householdSize));
  return HOUSEHOLD_SUPPLIES_FIRST_PERSON + (people - 1) * HOUSEHOLD_SUPPLIES_EACH_ADDITIONAL;
}

export function estimateLivingAllowance(householdSize: number): Cents {
  return estimateFoodCost(householdSize) + estimateHouseholdSupplies(householdSize);
}
