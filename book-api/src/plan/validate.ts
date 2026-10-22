import { firstOfMonth, monthsBetween, parseMonthKey } from "./calendar";
import { dollarsToCents } from "./money";
import type { Cents } from "./money";
import type { Debt, EmployerMatch, Goal, IncomeStability, MustPays, PayoffStrategy, PlanInputs } from "./types";

export const LIMITS = {
  takeHome: 1_000_000,
  expense: 1_000_000,
  balance: 10_000_000,
  minimum: 1_000_000,
  savings: 100_000_000,
  goal: 100_000_000,
  maxDebts: 15,
  debtLabel: 40,
  goalLabel: 60,
  goalMonthsAhead: 480,
} as const;

const STABILITY: readonly IncomeStability[] = ["two_incomes", "one_income", "unsteady"];
const MATCH: readonly EmployerMatch[] = ["yes", "no", "not_sure"];
const STRATEGIES: readonly PayoffStrategy[] = ["avalanche", "snowball"];
const EMAIL_PATTERN: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNPRINTABLE: RegExp = /[^ -~ -ſ‘’“”–—]/g;

export type Validated<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export interface PdfRequest {
  readonly inputs: PlanInputs;
  readonly email: string;
  readonly newsletter: boolean;
  readonly strategy: PayoffStrategy;
}

class InvalidInput extends Error {}

function fail(message: string): never {
  throw new InvalidInput(message);
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(message);
  }
  return value as Record<string, unknown>;
}

function amount(value: unknown, max: number, message: string, required: boolean = false): Cents {
  if (value === undefined || value === null || value === "") {
    return required ? fail(message) : 0;
  }
  if (typeof value !== "number" && typeof value !== "string") {
    return fail(message);
  }
  const parsed: number = typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : value;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    return fail(message);
  }
  return dollarsToCents(parsed);
}

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(UNPRINTABLE, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function oneOf<T extends string>(value: unknown, options: readonly T[], message: string): T {
  const match: T | undefined = options.find((option: T): boolean => option === value);
  return match === undefined ? fail(message) : match;
}

function parseMustPays(value: unknown): MustPays {
  const source: Record<string, unknown> = record(value, "Fill in your must-pays.");
  return {
    housing: amount(source.housing, LIMITS.expense, "Enter your rent or mortgage (0 is fine).", true),
    utilities: amount(source.utilities, LIMITS.expense, "Check your utilities amount."),
    groceries: amount(source.groceries, LIMITS.expense, "Check your groceries amount."),
    transportation: amount(source.transportation, LIMITS.expense, "Check your transportation amount."),
    insurance: amount(source.insurance, LIMITS.expense, "Check your insurance amount."),
    childcare: amount(source.childcare, LIMITS.expense, "Check your childcare amount."),
    other: amount(source.other, LIMITS.expense, "Check your other must-pays."),
  };
}

function parseDebts(value: unknown): Debt[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return fail("Check your debts.");
  }
  if (value.length > LIMITS.maxDebts) {
    return fail(`Enter up to ${LIMITS.maxDebts} debts.`);
  }
  return value
    .map((entry: unknown, index: number): Debt => {
      const row: Record<string, unknown> = record(entry, "Check your debts.");
      const position: number = index + 1;
      const label: string = cleanText(row.label, LIMITS.debtLabel) || `Debt ${position}`;
      const aprRaw: number = Number(row.apr);
      if (!Number.isFinite(aprRaw) || aprRaw < 0 || aprRaw > 100) {
        return fail(`Debt ${position}: the interest rate has to be between 0 and 100.`);
      }
      return {
        id: `debt-${position}`,
        label,
        balance: amount(row.balance, LIMITS.balance, `Debt ${position}: check the balance.`, true),
        aprPercent: Math.round(aprRaw * 100) / 100,
        minimumPayment: amount(row.minimum, LIMITS.minimum, `Debt ${position}: check the minimum payment.`, true),
      };
    })
    .filter((debt: Debt): boolean => debt.balance > 0);
}

function parseGoal(value: unknown, asOf: Date): Goal | null {
  if (value === undefined || value === null) {
    return null;
  }
  const source: Record<string, unknown> = record(value, "Check your goal.");
  const goalAmount: Cents = amount(source.amount, LIMITS.goal, "Check your goal amount.");
  if (goalAmount <= 0) {
    return null;
  }
  const targetMonth: string = typeof source.targetMonth === "string" ? source.targetMonth : "";
  const target: Date | null = parseMonthKey(targetMonth);
  if (target === null) {
    return fail("Pick a month and year for your goal.");
  }
  const monthsAhead: number = monthsBetween(firstOfMonth(asOf), target);
  if (monthsAhead < 1) {
    return fail("Your goal date has to be in the future.");
  }
  if (monthsAhead > LIMITS.goalMonthsAhead) {
    return fail("Pick a goal date within the next 40 years.");
  }
  return { label: cleanText(source.label, LIMITS.goalLabel) || "My goal", amount: goalAmount, targetMonth };
}

function parseInputsRecord(source: Record<string, unknown>, asOf: Date): PlanInputs {
  const takeHome: Cents = amount(source.takeHome, LIMITS.takeHome, "Enter your monthly take-home pay.", true);
  if (takeHome <= 0) {
    return fail("Enter your monthly take-home pay.");
  }
  const householdSize: number = Number(source.householdSize);
  if (!Number.isInteger(householdSize) || householdSize < 1 || householdSize > 8) {
    return fail("Pick a household size from 1 to 8.");
  }
  return {
    takeHome,
    householdSize,
    stability: oneOf(source.stability, STABILITY, "Pick how steady your income is."),
    mustPays: parseMustPays(source.mustPays),
    debts: parseDebts(source.debts),
    cashSavings: amount(source.cashSavings, LIMITS.savings, "Check your cash savings."),
    employerMatch: oneOf(source.employerMatch ?? "not_sure", MATCH, "Pick an answer for the 401(k) match."),
    goal: parseGoal(source.goal, asOf),
    funMoney: amount(source.funMoney, LIMITS.takeHome, "Check your fun money."),
  };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function guard<T>(run: () => T): Validated<T> {
  try {
    return { ok: true, value: run() };
  } catch (error: unknown) {
    if (error instanceof InvalidInput) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Check your answers and try again." };
  }
}

export function parsePreviewRequest(body: string, asOf: Date): Validated<PlanInputs> {
  return guard((): PlanInputs => {
    const source: Record<string, unknown> = record(parseJson(body), "Check your answers and try again.");
    return parseInputsRecord(record(source.inputs, "Check your answers and try again."), asOf);
  });
}

export function parsePdfRequest(body: string, asOf: Date): Validated<PdfRequest> {
  return guard((): PdfRequest => {
    const source: Record<string, unknown> = record(parseJson(body), "Check your answers and try again.");
    const email: string = typeof source.email === "string" ? source.email.trim() : "";
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return fail("Enter a valid email address.");
    }
    return {
      inputs: parseInputsRecord(record(source.inputs, "Check your answers and try again."), asOf),
      email,
      newsletter: source.newsletter === true,
      strategy: oneOf(source.strategy ?? "avalanche", STRATEGIES, "Pick avalanche or snowball."),
    };
  });
}
