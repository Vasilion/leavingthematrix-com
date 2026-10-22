const MONTH_NAMES: readonly string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_KEY_PATTERN: RegExp = /^(\d{4})-(\d{2})$/;

export function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

export function monthsBetween(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}

export function toIsoDate(date: Date): string {
  const year: string = String(date.getUTCFullYear()).padStart(4, "0");
  const month: string = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day: string = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toMonthKey(date: Date): string {
  return toIsoDate(date).slice(0, 7);
}

export function parseMonthKey(value: string): Date | null {
  const match: RegExpExecArray | null = MONTH_KEY_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  const year: number = Number(match[1]);
  const month: number = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, 1));
}

export function formatMonthKey(monthKey: string): string {
  const date: Date | null = parseMonthKey(monthKey);
  if (date === null) {
    return "";
  }
  return `${MONTH_NAMES[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

export function formatLongDate(date: Date): string {
  return `${MONTH_NAMES[date.getUTCMonth()] ?? ""} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}
