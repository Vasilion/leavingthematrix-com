import type { Config } from "./config";
import { sendPlan } from "./email";
import type { Event, Result } from "./http";
import { clientIp, json, rawBody } from "./http";
import { buildDocument, renderPlanPdf } from "./pdf/plan-pdf";
import type { PlanDocument } from "./pdf/document";
import { buildPlan } from "./plan/plan";
import type { PlanInputs, PlanResult } from "./plan/types";
import { parsePdfRequest, parsePreviewRequest } from "./plan/validate";
import type { PdfRequest, Validated } from "./plan/validate";
import { subscribeNewsletter } from "./routes";
import { countHit, recordLead } from "./store";
import { nowSeconds } from "./tokens";

const RATE_WINDOW_SECONDS: number = 3600;
const PREVIEW_PER_IP: number = 60;
const PDF_PER_EMAIL: number = 5;
const PDF_PER_IP: number = 20;
const LEAD_SOURCE: string = "money-plan";
const MAX_BODY_BYTES: number = 20_000;
const BUSY_MESSAGE: string = "You've made a lot of plans in the last hour. Give it a bit and try again.";
const SERVER_MESSAGE: string = "Something went wrong building your plan. Please try again.";
const FUN_MESSAGE: string = "Your fun money uses up everything left over. Lower it to build a plan.";

export function errorLabel(error: unknown): string {
  if (error instanceof Error) {
    const code: unknown = (error as { Code?: unknown; code?: unknown }).Code ?? (error as { code?: unknown }).code;
    return typeof code === "string" ? `${error.name} (${code})` : error.name;
  }
  return "unknown error";
}

function body(event: Event): string | null {
  const raw: Buffer = rawBody(event);
  return raw.length > MAX_BODY_BYTES ? null : raw.toString("utf8");
}

export function handlePlanPreview(config: Config, event: Event): Promise<Result> {
  const text: string | null = body(event);
  if (text === null) {
    return Promise.resolve(json(413, { ok: false, message: "That's more than the tool can take." }));
  }
  const asOf: Date = new Date();
  const parsed: Validated<PlanInputs> = parsePreviewRequest(text, asOf);
  if (!parsed.ok) {
    return Promise.resolve(json(400, { ok: false, message: parsed.message }));
  }
  const inputs: PlanInputs = parsed.value;
  return countHit(config.table, `plan-preview-ip#${clientIp(event)}`, RATE_WINDOW_SECONDS, nowSeconds())
    .then((hits: number): Result => {
      if (hits > PREVIEW_PER_IP) {
        console.warn(`[plan/preview] rate limited (ip hits ${hits})`);
        return json(429, { ok: false, message: BUSY_MESSAGE });
      }
      return json(200, { ok: true, plan: buildPlan(inputs, asOf) });
    })
    .catch((error: unknown): Result => {
      console.error(`[plan/preview] failed: ${errorLabel(error)}`);
      return json(500, { ok: false, message: SERVER_MESSAGE });
    });
}

function deliver(config: Config, request: PdfRequest, result: PlanResult, asOf: Date): Promise<Result> {
  const document: PlanDocument | null = buildDocument(request.inputs, result, {
    strategy: request.strategy,
    newsletter: request.newsletter,
    asOf,
  });
  if (document === null) {
    return Promise.resolve(json(400, { ok: false, message: FUN_MESSAGE }));
  }
  const now: number = nowSeconds();
  const lead: Promise<void> = recordLead(config.table, request.email, LEAD_SOURCE, request.newsletter, now)
    .then((): Promise<void> => (request.newsletter ? subscribeNewsletter(config, request.email, LEAD_SOURCE) : Promise.resolve()))
    .catch((error: unknown): void => {
      console.error(`[plan/pdf] lead record failed: ${errorLabel(error)}`);
    });
  return Promise.all([renderPlanPdf(document, asOf), lead]).then(([pdf]: [Uint8Array, void]): Promise<Result> =>
    sendPlan(config, request.email, pdf, result.kind === "gap")
      .then((): boolean => true)
      .catch((error: unknown): boolean => {
        console.error(`[plan/pdf] email failed: ${errorLabel(error)}`);
        return false;
      })
      .then((emailed: boolean): Result => {
        console.log(`[plan/pdf] delivered (${result.kind}, ${document.pages.length} pages, emailed ${emailed})`);
        return json(200, {
          ok: true,
          emailed,
          filename: "Your-Money-Plan.pdf",
          pdf: Buffer.from(pdf).toString("base64"),
        });
      }),
  );
}

export function handlePlanPdf(config: Config, event: Event): Promise<Result> {
  const text: string | null = body(event);
  if (text === null) {
    return Promise.resolve(json(413, { ok: false, message: "That's more than the tool can take." }));
  }
  const asOf: Date = new Date();
  const parsed: Validated<PdfRequest> = parsePdfRequest(text, asOf);
  if (!parsed.ok) {
    return Promise.resolve(json(400, { ok: false, message: parsed.message }));
  }
  const request: PdfRequest = parsed.value;
  const now: number = nowSeconds();
  return Promise.all([
    countHit(config.table, `plan-email#${request.email.toLowerCase()}`, RATE_WINDOW_SECONDS, now),
    countHit(config.table, `plan-ip#${clientIp(event)}`, RATE_WINDOW_SECONDS, now),
  ])
    .then(([emailHits, ipHits]: number[]): Promise<Result> => {
      if ((emailHits ?? 0) > PDF_PER_EMAIL || (ipHits ?? 0) > PDF_PER_IP) {
        console.warn(`[plan/pdf] rate limited (email hits ${emailHits}, ip hits ${ipHits})`);
        return Promise.resolve(json(429, { ok: false, message: BUSY_MESSAGE }));
      }
      return deliver(config, request, buildPlan(request.inputs, asOf), asOf);
    })
    .catch((error: unknown): Result => {
      console.error(`[plan/pdf] failed: ${errorLabel(error)}`);
      return json(500, { ok: false, message: SERVER_MESSAGE });
    });
}
