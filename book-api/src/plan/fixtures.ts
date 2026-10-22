import { dollarsToCents } from "./money";
import type { Debt, MustPays, PlanInputs } from "./types";

export const AS_OF: Date = new Date(Date.UTC(2026, 9, 21));

export const MUST_PAYS: MustPays = {
  housing: dollarsToCents(1_500),
  utilities: dollarsToCents(250),
  groceries: dollarsToCents(600),
  transportation: dollarsToCents(400),
  insurance: dollarsToCents(300),
  childcare: 0,
  other: 0,
};

export function debt(id: string, label: string, balance: number, apr: number, minimum: number): Debt {
  return {
    id,
    label,
    balance: dollarsToCents(balance),
    aprPercent: apr,
    minimumPayment: dollarsToCents(minimum),
  };
}

export const CARD: Debt = debt("debt-1", "Store card", 1_200, 26, 40);
export const VISA: Debt = debt("debt-2", "Visa", 6_500, 22, 180);
export const CAR: Debt = debt("debt-3", "Car loan", 14_000, 6.5, 330);

export function inputsWith(overrides: Partial<PlanInputs>): PlanInputs {
  return {
    takeHome: dollarsToCents(6_000),
    householdSize: 3,
    stability: "two_incomes",
    mustPays: MUST_PAYS,
    debts: [CARD, VISA, CAR],
    cashSavings: dollarsToCents(400),
    employerMatch: "yes",
    goal: { label: "Truck with no payment", amount: dollarsToCents(12_000), targetMonth: "2029-06" },
    funMoney: dollarsToCents(150),
    ...overrides,
  };
}
