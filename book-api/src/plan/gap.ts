import { ratioPercent } from "./arithmetic";
import { formatCentsRounded } from "./money";
import type { Cents, Percent } from "./money";
import type { GapAnalysis, MustPayKey, MustPayLine, MustPays } from "./types";

const TARGET_HOUSING_PERCENT: Percent = 30;

interface Candidate {
  readonly key: MustPayKey;
  readonly reducibleShare: number;
  readonly note: string;
}

export const MUST_PAY_LABELS: Record<MustPayKey, string> = {
  housing: "Rent or mortgage",
  utilities: "Utilities and phone",
  groceries: "Groceries and household basics",
  transportation: "Transportation",
  insurance: "Other insurance",
  childcare: "Childcare",
  other: "Other must-pays",
};

const CANDIDATES: readonly Candidate[] = [
  {
    key: "groceries",
    reducibleShare: 0.2,
    note: "A 20% trim here is realistic without changing where you live or what you drive.",
  },
  {
    key: "transportation",
    reducibleShare: 0.2,
    note: "Fuel, parking and insurance usually have more slack in them than people expect.",
  },
  {
    key: "insurance",
    reducibleShare: 0.15,
    note: "Re-shopping a policy is a one-afternoon job that rarely comes back empty.",
  },
  {
    key: "utilities",
    reducibleShare: 0.15,
    note: "Phone and internet plans are worth one call to ask for a better rate.",
  },
  {
    key: "other",
    reducibleShare: 0.25,
    note: "Worth itemizing before you decide it's fixed.",
  },
  {
    key: "childcare",
    reducibleShare: 0,
    note: "Rarely the place to start.",
  },
  {
    key: "housing",
    reducibleShare: 0,
    note: "The biggest lever, and the slowest one.",
  },
];

export function analyzeGap(mustPays: MustPays, takeHome: Cents, leftover: Cents): GapAnalysis {
  const shortfall: Cents = Math.max(0, -leftover);
  const housingPercent: Percent = ratioPercent(mustPays.housing, takeHome);
  const housingTrim: Cents =
    housingPercent > TARGET_HOUSING_PERCENT
      ? Math.max(0, mustPays.housing - Math.round((takeHome * TARGET_HOUSING_PERCENT) / 100))
      : 0;

  const ranked: MustPayLine[] = CANDIDATES.filter((candidate: Candidate): boolean => mustPays[candidate.key] > 0)
    .map((candidate: Candidate): MustPayLine => {
      const amount: Cents = mustPays[candidate.key];
      const isHousing: boolean = candidate.key === "housing";
      return {
        key: candidate.key,
        label: MUST_PAY_LABELS[candidate.key],
        amount,
        suggestedReduction: isHousing ? housingTrim : Math.round(amount * candidate.reducibleShare),
        note:
          isHousing && housingTrim > 0
            ? `Housing is ${housingPercent}% of take-home. Under 30% is where the rest of a plan starts working.`
            : candidate.note,
      };
    })
    .sort((a: MustPayLine, b: MustPayLine): number => b.amount - a.amount);

  const reachable: Cents = ranked
    .filter((line: MustPayLine): boolean => line.key !== "housing")
    .reduce((total: Cents, line: MustPayLine): Cents => total + line.suggestedReduction, 0);

  const summaryLine: string =
    shortfall === 0
      ? "Everything coming in already has somewhere to go, so there's nothing left to point at a plan yet."
      : reachable >= shortfall
        ? `You're ${formatCentsRounded(shortfall)} short each month. The trims below add up to ${formatCentsRounded(reachable)}, which is enough to close it.`
        : `You're ${formatCentsRounded(shortfall)} short each month. Trimming everything below gets you ${formatCentsRounded(reachable)}, so the rest has to come from housing or more income.`;

  return {
    shortfall,
    ranked,
    reachableByTrimming: reachable,
    housingPercentOfIncome: housingPercent,
    summaryLine,
  };
}
