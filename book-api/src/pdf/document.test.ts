import { describe, expect, it } from "vitest";
import { AS_OF, CAR, CARD, VISA, debt, inputsWith } from "../plan/fixtures";
import { dollarsToCents } from "../plan/money";
import { buildPlan } from "../plan/plan";
import type { Debt, PayoffStrategy, PlanInputs, PlanResult } from "../plan/types";
import { FOOTER, GAP_HEADLINE, documentStrings } from "./document";
import type { Page, PlanDocument } from "./document";
import { buildDocument, renderPlanPdf } from "./plan-pdf";

const SCENARIOS: Record<string, PlanInputs> = {
  typical: inputsWith({}),
  late: inputsWith({ goal: { label: "Truck with no payment", amount: dollarsToCents(12_000), targetMonth: "2027-03" } }),
  noDebt: inputsWith({ debts: [] }),
  noGoal: inputsWith({ goal: null }),
  neither: inputsWith({ debts: [], goal: null, cashSavings: dollarsToCents(60_000) }),
  oneDebt: inputsWith({ debts: [VISA], householdSize: 1, employerMatch: "no", funMoney: 0 }),
  stuck: inputsWith({ debts: [debt("debt-1", "Old card", 10_000, 30, 200)], goal: null, takeHome: dollarsToCents(3_300), funMoney: 0 }),
  gap: inputsWith({ takeHome: dollarsToCents(3_300), debts: [CARD, CAR] }),
  zeroLeftover: inputsWith({ takeHome: dollarsToCents(3_600) }),
  fifteen: inputsWith({
    takeHome: dollarsToCents(9_500),
    debts: Array.from({ length: 15 }, (_: unknown, index: number): Debt =>
      debt(`debt-${index + 1}`, `Card ${index + 1}`, 500 + index * 900, 5 + index * 1.7, 25 + index * 12),
    ),
  }),
};

function documentFor(inputs: PlanInputs, strategy: PayoffStrategy, newsletter: boolean): PlanDocument {
  const result: PlanResult = buildPlan(inputs, AS_OF);
  const document: PlanDocument | null = buildDocument(inputs, result, { strategy, newsletter, asOf: AS_OF });
  if (document === null) {
    throw new Error(`no document for ${result.kind}`);
  }
  return document;
}

function allDocuments(): PlanDocument[] {
  const documents: PlanDocument[] = [];
  for (const inputs of Object.values(SCENARIOS)) {
    for (const strategy of ["avalanche", "snowball"] as const) {
      for (const newsletter of [true, false]) {
        documents.push(documentFor(inputs, strategy, newsletter));
      }
    }
  }
  return documents;
}

function titles(document: PlanDocument): string[] {
  return document.pages.map((page: Page): string => page.title);
}

describe("compliance, against every PDF string", () => {
  const copy: string = allDocuments().flatMap(documentStrings).join("\n");

  it("never names a security, ticker or fund company", () => {
    expect(copy).not.toMatch(/\b(VTI|VOO|SPY|QQQ|VTSAX|FXAIX|S&P 500|Vanguard|Fidelity|Schwab|Nasdaq|Dow)\b/);
    expect(copy).not.toMatch(/\bindex fund\b/i);
  });

  it("never recommends an allocation split", () => {
    expect(copy).not.toMatch(/\b\d{1,3}\/\d{1,3}\s+(stocks?|bonds?)\b/i);
    expect(copy).not.toMatch(/\b\d{1,3}% (in|into) (stocks?|bonds?|the market)\b/i);
  });

  it("makes no promises", () => {
    expect(copy).not.toMatch(/\bguarantee(d|s)?\b/i);
    expect(copy).not.toMatch(/\byou will\b/i);
    expect(copy).not.toMatch(/\brisk-free\b/i);
  });

  it("never shames", () => {
    expect(copy).not.toMatch(/\b(lazy|irresponsible|you failed|shame|excuses|broke|poverty|crisis)\b/i);
  });

  it("only describes future you generically", () => {
    const futureLines: string[] = copy.split("\n").filter((value: string): boolean => /future you:/i.test(value));
    for (const value of futureLines) {
      expect(value).toBe(
        "Future you: Long-term investing, like a low-cost diversified fund inside your employer plan or an IRA.",
      );
    }
  });
});

describe("document shape", () => {
  it("never runs past 8 pages and puts the disclaimer in every footer", () => {
    for (const document of allDocuments()) {
      expect(document.pages.length).toBeLessThanOrEqual(8);
      expect(document.footer).toBe(FOOTER);
    }
  });

  it("skips the goal page without a goal and the debt page without debt", () => {
    expect(titles(documentFor(SCENARIOS.typical as PlanInputs, "avalanche", false))).toEqual([
      "Your Money Plan",
      "Where you stand",
      "Your monthly budget",
      "Your safety net",
      "Your goal",
      "Your debt",
      "Your rules",
      "Your first 30 days",
    ]);
    expect(titles(documentFor(SCENARIOS.noGoal as PlanInputs, "avalanche", false))).not.toContain("Your goal");
    expect(titles(documentFor(SCENARIOS.noDebt as PlanInputs, "avalanche", false))).not.toContain("Your debt");
    expect(titles(documentFor(SCENARIOS.neither as PlanInputs, "avalanche", false))).toHaveLength(6);
  });

  it("builds a here's-the-gap version when the numbers don't work", () => {
    const document: PlanDocument = documentFor(SCENARIOS.gap as PlanInputs, "avalanche", false);
    expect(titles(document)).toEqual(["Your Money Plan", "Where you stand", "The gap", "Your first 30 days"]);
    expect(documentStrings(document)).toContain(GAP_HEADLINE);
  });

  it("states the late goal gap without changing their date", () => {
    const strings: string[] = documentStrings(documentFor(SCENARIOS.late as PlanInputs, "avalanche", false));
    const status: string | undefined = strings.find((value: string): boolean => value.startsWith("At these numbers you'd hit this in"));
    expect(status).toMatch(/^At these numbers you'd hit this in \w+ \d{4}\. To make March 2027, you'd need about \$[\d,]+ more a month\.$/);
  });

  it("only offers the weekly email when they didn't opt in", () => {
    const optedIn: string = documentStrings(documentFor(SCENARIOS.typical as PlanInputs, "avalanche", true)).join("\n");
    const notOptedIn: string = documentStrings(documentFor(SCENARIOS.typical as PlanInputs, "avalanche", false)).join("\n");
    expect(optedIn).not.toContain("weekly email");
    expect(notOptedIn).toContain("weekly email");
  });

  it("highlights the strategy they picked", () => {
    const strings: string[] = documentStrings(documentFor(SCENARIOS.typical as PlanInputs, "snowball", false));
    expect(strings.join("\n")).toContain("Debt method: Snowball.");
  });

  it("renders a real PDF in the book's look", () => {
    return renderPlanPdf(documentFor(SCENARIOS.fifteen as PlanInputs, "avalanche", false), AS_OF).then(
      (bytes: Uint8Array): void => {
        const head: string = Buffer.from(bytes.slice(0, 5)).toString("latin1");
        expect(head).toBe("%PDF-");
        expect(bytes.length).toBeLessThan(500_000);
      },
    );
  });
});
