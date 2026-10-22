import { Decimal } from "decimal.js";
import type { Cents, Percent } from "./money";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export function roundToCents(value: Decimal): Cents {
  return value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function monthlyInterest(balance: Cents, aprPercent: Percent): Cents {
  if (balance <= 0 || aprPercent <= 0) {
    return 0;
  }
  const monthlyRate: Decimal = new Decimal(aprPercent).div(100).div(12);
  return roundToCents(new Decimal(balance).mul(monthlyRate));
}

export function ratioPercent(part: Cents, whole: Cents): Percent {
  if (whole === 0) {
    return 0;
  }
  return new Decimal(part).div(whole).mul(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toNumber();
}

export function ratioOneDecimal(part: Cents, whole: Cents): number {
  if (whole <= 0) {
    return 0;
  }
  return new Decimal(part).div(whole).toDecimalPlaces(1, Decimal.ROUND_DOWN).toNumber();
}
