import type { PayoffStrategy, PlanInputs, PlanResult } from "../plan/types";
import { buildGapDocument, buildWorkingDocument } from "./document";
import type { PlanDocument } from "./document";
import { renderPdf } from "./render";

export interface PlanPdfOptions {
  readonly strategy: PayoffStrategy;
  readonly newsletter: boolean;
  readonly asOf: Date;
}

export function buildDocument(inputs: PlanInputs, result: PlanResult, options: PlanPdfOptions): PlanDocument | null {
  switch (result.kind) {
    case "plan":
      return buildWorkingDocument(inputs, result, options);
    case "gap":
      return buildGapDocument(inputs, result, options);
    case "fun_too_high":
      return null;
  }
}

export function renderPlanPdf(document: PlanDocument, asOf: Date): Promise<Uint8Array> {
  return renderPdf(document, asOf);
}
