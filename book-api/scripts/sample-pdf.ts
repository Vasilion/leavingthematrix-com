import { mkdirSync, writeFileSync } from "node:fs";
import { AS_OF, CAR, CARD, VISA, debt, inputsWith } from "../src/plan/fixtures";
import { dollarsToCents } from "../src/plan/money";
import { buildPlan } from "../src/plan/plan";
import type { Debt, PlanInputs, PlanResult } from "../src/plan/types";
import { buildDocument, renderPlanPdf } from "../src/pdf/plan-pdf";
import type { PlanDocument } from "../src/pdf/document";

const many: PlanInputs = inputsWith({
  debts: Array.from({ length: 15 }, (_: unknown, index: number): Debt =>
    debt(`debt-${index + 1}`, `Credit card number ${index + 1}`, 500 + index * 900, 5 + index * 1.7, 25 + index * 12),
  ),
  takeHome: dollarsToCents(9_500),
});

const samples: Record<string, PlanInputs> = {
  typical: inputsWith({}),
  late: inputsWith({ goal: { label: "Truck with no payment", amount: dollarsToCents(12_000), targetMonth: "2027-03" } }),
  "no-debt-no-goal": inputsWith({ debts: [], goal: null, cashSavings: dollarsToCents(2_500) }),
  "one-debt": inputsWith({ debts: [VISA] }),
  gap: inputsWith({ takeHome: dollarsToCents(3_300), debts: [CARD, CAR] }),
  "fifteen-debts": many,
};

mkdirSync("build/samples", { recursive: true });

Promise.all(
  Object.entries(samples).map(([name, inputs]: [string, PlanInputs]): Promise<void> => {
    const result: PlanResult = buildPlan(inputs, AS_OF);
    const document: PlanDocument | null = buildDocument(inputs, result, { strategy: "avalanche", newsletter: false, asOf: AS_OF });
    if (document === null) {
      return Promise.resolve();
    }
    return renderPlanPdf(document, AS_OF).then((bytes: Uint8Array): void => {
      writeFileSync(`build/samples/${name}.pdf`, bytes);
      console.log(`${name}: ${document.pages.length} pages, ${Math.round(bytes.length / 1024)} KB`);
    });
  }),
).catch((error: unknown): void => {
  console.error(error);
  process.exit(1);
});
