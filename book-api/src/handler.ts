import Stripe from "stripe";
import { loadConfig } from "./config";
import type { Config } from "./config";
import { json } from "./http";
import { errorLabel } from "./plan-routes";
import type { Event, Result } from "./http";
import { handlePlanPdf, handlePlanPreview } from "./plan-routes";
import { createCheckout, handleDownload, handleLinks, handleResend, handleSample, handleWebhook } from "./routes";

let cached: { config: Config; stripe: Stripe } | null = null;

function context(): { config: Config; stripe: Stripe } {
  if (cached === null) {
    const config: Config = loadConfig();
    cached = { config, stripe: new Stripe(config.stripeSecretKey) };
  }
  return cached;
}

export function handler(event: Event): Promise<Result> {
  let ctx: { config: Config; stripe: Stripe };
  try {
    ctx = context();
  } catch (error: unknown) {
    console.error("[config]", error);
    return Promise.resolve(json(500, { error: "Not configured" }));
  }
  const method: string = event.requestContext.http.method.toUpperCase();
  const path: string = event.rawPath.replace(/\/+$/, "") || "/";
  const route: string = `${method} ${path}`;
  const routes: Record<string, () => Promise<Result>> = {
    "POST /checkout": (): Promise<Result> => createCheckout(ctx.stripe, ctx.config),
    "POST /webhook": (): Promise<Result> => handleWebhook(ctx.stripe, ctx.config, event),
    "GET /links": (): Promise<Result> => handleLinks(ctx.stripe, ctx.config, event),
    "GET /download": (): Promise<Result> => handleDownload(ctx.config, event),
    "POST /resend": (): Promise<Result> => handleResend(ctx.stripe, ctx.config, event),
    "POST /sample": (): Promise<Result> => handleSample(ctx.config, event),
    "POST /plan/preview": (): Promise<Result> => handlePlanPreview(ctx.config, event),
    "POST /plan/pdf": (): Promise<Result> => handlePlanPdf(ctx.config, event),
  };
  const run: (() => Promise<Result>) | undefined = routes[route];
  const result: Promise<Result> = run === undefined ? Promise.resolve(json(404, { error: "Not found" })) : run();

  return result.catch((error: unknown): Result => {
    console.error(`[${route}] unhandled`, path.startsWith("/plan/") ? errorLabel(error) : error);
    return json(500, { error: "Server error" });
  });
}
