import { monthlyInterest } from "./arithmetic";
import type { Cents } from "./money";
import type { Debt, PayoffStrategy } from "./types";

export interface DebtState {
  readonly id: string;
  readonly label: string;
  balance: Cents;
  readonly aprPercent: number;
  readonly minimumPayment: Cents;
  clearedMonthIndex: number | null;
}

export interface MinimumsOutcome {
  readonly interestAccrued: Cents;
  readonly totalPaid: Cents;
  readonly clearedIds: readonly string[];
}

export interface ExtraOutcome {
  readonly totalPaid: Cents;
  readonly targetLabels: readonly string[];
  readonly clearedIds: readonly string[];
}

export interface MonthDebtOutcome {
  readonly openingDebt: Cents;
  readonly interestAccrued: Cents;
  readonly totalPaid: Cents;
  readonly closingDebt: Cents;
  readonly clearedIds: readonly string[];
  readonly unspent: Cents;
}

export function toDebtStates(debts: readonly Debt[]): DebtState[] {
  return debts.map(
    (debt: Debt): DebtState => ({
      id: debt.id,
      label: debt.label,
      balance: debt.balance,
      aprPercent: debt.aprPercent,
      minimumPayment: debt.minimumPayment,
      clearedMonthIndex: null,
    }),
  );
}

export function orderDebts(debts: readonly Debt[], strategy: PayoffStrategy): readonly Debt[] {
  const ordered: Debt[] = [...debts];
  if (strategy === "avalanche") {
    ordered.sort((a: Debt, b: Debt): number => b.aprPercent - a.aprPercent || a.balance - b.balance);
  } else {
    ordered.sort((a: Debt, b: Debt): number => a.balance - b.balance || b.aprPercent - a.aprPercent);
  }
  return ordered;
}

export function totalBalance(states: readonly DebtState[]): Cents {
  return states.reduce((total: Cents, state: DebtState): Cents => total + state.balance, 0);
}

function targetIndex(order: readonly string[], states: readonly DebtState[]): number {
  for (const id of order) {
    const index: number = states.findIndex((state: DebtState): boolean => state.id === id && state.balance > 0);
    if (index >= 0) {
      return index;
    }
  }
  return -1;
}

export function accrueAndPayMinimums(states: DebtState[], budget: Cents, monthIndex: number): MinimumsOutcome {
  let interestAccrued: Cents = 0;
  for (const state of states) {
    if (state.balance <= 0) {
      continue;
    }
    const interest: Cents = monthlyInterest(state.balance, state.aprPercent);
    state.balance += interest;
    interestAccrued += interest;
  }

  const clearedIds: string[] = [];
  let remaining: Cents = budget;
  for (const state of states) {
    if (state.balance <= 0 || remaining <= 0) {
      continue;
    }
    const payment: Cents = Math.min(state.minimumPayment, state.balance, remaining);
    state.balance -= payment;
    remaining -= payment;
    if (state.balance <= 0 && state.clearedMonthIndex === null) {
      state.clearedMonthIndex = monthIndex;
      clearedIds.push(state.id);
    }
  }

  return { interestAccrued, totalPaid: budget - remaining, clearedIds };
}

export function payExtra(
  states: DebtState[],
  payoffOrder: readonly string[],
  budget: Cents,
  monthIndex: number,
): ExtraOutcome {
  const clearedIds: string[] = [];
  const targetLabels: string[] = [];
  let remaining: Cents = budget;
  let currentTarget: number = targetIndex(payoffOrder, states);
  while (remaining > 0 && currentTarget >= 0) {
    const state: DebtState | undefined = states[currentTarget];
    if (state === undefined) {
      break;
    }
    targetLabels.push(state.label);
    const payment: Cents = Math.min(state.balance, remaining);
    state.balance -= payment;
    remaining -= payment;
    if (state.balance <= 0 && state.clearedMonthIndex === null) {
      state.clearedMonthIndex = monthIndex;
      clearedIds.push(state.id);
    }
    currentTarget = targetIndex(payoffOrder, states);
  }
  return { totalPaid: budget - remaining, targetLabels, clearedIds };
}

export function stepDebtMonth(
  states: DebtState[],
  payoffOrder: readonly string[],
  budget: Cents,
  monthIndex: number,
): MonthDebtOutcome {
  const openingDebt: Cents = totalBalance(states);
  if (openingDebt === 0) {
    return { openingDebt: 0, interestAccrued: 0, totalPaid: 0, closingDebt: 0, clearedIds: [], unspent: budget };
  }
  const minimums: MinimumsOutcome = accrueAndPayMinimums(states, budget, monthIndex);
  const extra: ExtraOutcome = payExtra(states, payoffOrder, budget - minimums.totalPaid, monthIndex);
  const totalPaid: Cents = minimums.totalPaid + extra.totalPaid;
  return {
    openingDebt,
    interestAccrued: minimums.interestAccrued,
    totalPaid,
    closingDebt: totalBalance(states),
    clearedIds: [...minimums.clearedIds, ...extra.clearedIds],
    unspent: budget - totalPaid,
  };
}
