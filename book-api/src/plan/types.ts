import type { Cents, Percent } from "./money";

export type IncomeStability = "two_incomes" | "one_income" | "unsteady";

export type PayoffStrategy = "avalanche" | "snowball";

export type EmployerMatch = "yes" | "no" | "not_sure";

export interface Debt {
  readonly id: string;
  readonly label: string;
  readonly balance: Cents;
  readonly aprPercent: Percent;
  readonly minimumPayment: Cents;
}

export interface MustPays {
  readonly housing: Cents;
  readonly utilities: Cents;
  readonly groceries: Cents;
  readonly transportation: Cents;
  readonly insurance: Cents;
  readonly childcare: Cents;
  readonly other: Cents;
}

export type MustPayKey = keyof MustPays;

export interface Goal {
  readonly label: string;
  readonly amount: Cents;
  readonly targetMonth: string;
}

export interface PlanInputs {
  readonly takeHome: Cents;
  readonly householdSize: number;
  readonly stability: IncomeStability;
  readonly mustPays: MustPays;
  readonly debts: readonly Debt[];
  readonly cashSavings: Cents;
  readonly employerMatch: EmployerMatch;
  readonly goal: Goal | null;
  readonly funMoney: Cents;
}

export interface CoreNumbers {
  readonly takeHome: Cents;
  readonly mustPays: Cents;
  readonly minimums: Cents;
  readonly essentials: Cents;
  readonly leftover: Cents;
  readonly funMoney: Cents;
  readonly push: Cents;
  readonly runwayMonths: number;
  readonly cashSavings: Cents;
  readonly starterFundTarget: Cents;
  readonly fullFundTarget: Cents;
  readonly fullFundMonths: number;
  readonly highInterestThresholdPercent: Percent;
  readonly totalDebt: Cents;
}

export type Milestone =
  | { readonly kind: "none" }
  | { readonly kind: "already" }
  | { readonly kind: "month"; readonly month: string }
  | { readonly kind: "beyond" };

export interface DebtMilestone {
  readonly id: string;
  readonly label: string;
  readonly balance: Cents;
  readonly aprPercent: Percent;
  readonly highInterest: boolean;
  readonly paidOff: Milestone;
}

export type BucketKind = "starter_fund" | "high_interest_debt" | "goal" | "full_fund" | "low_interest_debt" | "future_you";

export interface BucketAmount {
  readonly kind: BucketKind;
  readonly amount: Cents;
  readonly targets: readonly string[];
}

export interface MonthSplit {
  readonly mustPays: Cents;
  readonly minimums: Cents;
  readonly funMoney: Cents;
  readonly buckets: readonly BucketAmount[];
}

export interface GoalOutcome {
  readonly label: string;
  readonly amount: Cents;
  readonly targetMonth: string;
  readonly monthly: Cents;
  readonly reached: Milestone;
  readonly onTime: boolean;
  readonly extraMonthlyNeeded: Cents | null;
}

export interface StrategyOutcome {
  readonly strategy: PayoffStrategy;
  readonly firstTarget: string | null;
  readonly debts: readonly DebtMilestone[];
  readonly debtFree: Milestone;
  readonly firstDebtPaidOff: Milestone;
  readonly totalInterest: Cents;
  readonly starterFund: Milestone;
  readonly fullFund: Milestone;
  readonly goal: GoalOutcome | null;
  readonly thisMonth: MonthSplit;
}

export interface StrategyComparison {
  readonly interestSavedByAvalanche: Cents;
  readonly monthsSoonerFirstWinBySnowball: number;
  readonly sameOrder: boolean;
  readonly summaryLine: string;
}

export interface MustPayLine {
  readonly key: MustPayKey;
  readonly label: string;
  readonly amount: Cents;
  readonly suggestedReduction: Cents;
  readonly note: string;
}

export interface GapAnalysis {
  readonly shortfall: Cents;
  readonly ranked: readonly MustPayLine[];
  readonly reachableByTrimming: Cents;
  readonly housingPercentOfIncome: Percent;
  readonly summaryLine: string;
}

export interface WorkingPlan {
  readonly kind: "plan";
  readonly madeOn: string;
  readonly core: CoreNumbers;
  readonly avalanche: StrategyOutcome;
  readonly snowball: StrategyOutcome;
  readonly comparison: StrategyComparison | null;
}

export interface GapPlan {
  readonly kind: "gap";
  readonly madeOn: string;
  readonly core: CoreNumbers;
  readonly gap: GapAnalysis;
}

export interface FunTooHigh {
  readonly kind: "fun_too_high";
  readonly madeOn: string;
  readonly core: CoreNumbers;
  readonly suggestedFunMoney: Cents;
}

export type PlanResult = WorkingPlan | GapPlan | FunTooHigh;
