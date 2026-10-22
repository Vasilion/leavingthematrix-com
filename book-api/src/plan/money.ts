export type Cents = number;

export type Percent = number;

export const CENTS_PER_DOLLAR: number = 100;

export function dollarsToCents(dollars: number): Cents {
  return Math.round(dollars * CENTS_PER_DOLLAR);
}

export function formatCents(cents: Cents): string {
  const sign: string = cents < 0 ? "-" : "";
  const absolute: number = Math.abs(cents);
  const whole: number = Math.floor(absolute / CENTS_PER_DOLLAR);
  const fraction: number = absolute % CENTS_PER_DOLLAR;
  return `${sign}$${whole.toLocaleString("en-US")}.${String(fraction).padStart(2, "0")}`;
}

export function formatCentsRounded(cents: Cents): string {
  const sign: string = cents < 0 ? "-" : "";
  const whole: number = Math.round(Math.abs(cents) / CENTS_PER_DOLLAR);
  return `${sign}$${whole.toLocaleString("en-US")}`;
}

export function ceilToDollar(cents: Cents): Cents {
  return Math.ceil(cents / CENTS_PER_DOLLAR) * CENTS_PER_DOLLAR;
}

export function weeklyFromMonthly(monthly: Cents): Cents {
  return Math.round((monthly * 12) / 52);
}
