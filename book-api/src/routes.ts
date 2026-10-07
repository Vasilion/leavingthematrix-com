import Stripe from "stripe";
import type { Config } from "./config";
import { PRODUCT_TAG } from "./config";
import type { Event, Result } from "./http";
import { clientIp, header, json, query, rawBody, redirect, selfUrl } from "./http";
import { downloadLinks, presignFile } from "./files";
import type { DownloadLinks } from "./files";
import { sendDelivery } from "./email";
import { claimDelivery, countHit, markDelivered, recordOrder, releaseClaim } from "./store";
import { nowSeconds, readToken } from "./tokens";
import type { LinkClaims } from "./tokens";

type Session = Stripe.Checkout.Session;

const SESSION_ID_PATTERN: RegExp = /^cs_(test|live)_[A-Za-z0-9]+$/;
const EMAIL_PATTERN: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_MESSAGE: string = "If we found a purchase for that email, we've sent fresh download links to it.";
const RATE_WINDOW_SECONDS: number = 3600;
const RESEND_PER_EMAIL: number = 3;
const RESEND_PER_IP: number = 10;
const NEWSLETTER_FIELD: string = "newsletter";
const FULFILL_EVENTS: string[] = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];

function apiBase(config: Config, event: Event): string {
  return config.publicApiUrl === "" ? selfUrl(event) : config.publicApiUrl;
}

function isPaidBook(session: Session): boolean {
  return session.payment_status === "paid" && session.metadata?.product === PRODUCT_TAG;
}

function subscribeNewsletter(config: Config, email: string): Promise<void> {
  if (config.newsletterUrl === "") {
    return Promise.resolve();
  }
  return fetch(config.newsletterUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, source: "disqualified-checkout" }),
  })
    .then((response: Response): void => {
      if (!response.ok) {
        console.error(`[newsletter] subscribe failed with HTTP ${response.status}`);
      }
    })
    .catch((error: unknown): void => {
      console.error("[newsletter] subscribe failed", error);
    });
}

export function createCheckout(stripe: Stripe, config: Config): Promise<Result> {
  return stripe.checkout.sessions
    .create({
      mode: "payment",
      line_items: [{ price: config.stripePrice, quantity: 1 }],
      success_url: `${config.siteUrl}/disqualified/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.siteUrl}/disqualified`,
      metadata: { product: PRODUCT_TAG },
      payment_intent_data: { description: "Disqualified (ebook)", metadata: { product: PRODUCT_TAG } },
      custom_fields: [
        {
          key: NEWSLETTER_FIELD,
          label: { type: "custom", custom: "Free Blue Pill newsletter?" },
          type: "dropdown",
          optional: true,
          dropdown: {
            options: [
              { label: "No thanks", value: "no" },
              { label: "Yes, send me the free weekly newsletter", value: "yes" },
            ],
          },
        },
      ],
    })
    .then((session: Session): Result => redirect(session.url ?? `${config.siteUrl}/disqualified?checkout=error`))
    .catch((error: unknown): Result => {
      console.error("[checkout] session create failed", error);
      return redirect(`${config.siteUrl}/disqualified?checkout=error`);
    });
}

function fulfill(config: Config, apiBase: string, session: Session): Promise<Result> {
  const email: string = session.customer_details?.email ?? "";
  const name: string = session.customer_details?.name ?? "";
  if (email === "") {
    console.error(`[webhook] paid session ${session.id} has no email`);
    return Promise.resolve(json(200, { received: true, skipped: "no-email" }));
  }
  const now: number = nowSeconds();
  const optedIn: boolean = session.custom_fields.some(
    (field: Stripe.Checkout.Session.CustomField): boolean =>
      field.key === NEWSLETTER_FIELD && field.dropdown?.value === "yes",
  );
  return recordOrder(config.table, session.id, email, now)
    .then((isNew: boolean): Promise<void> =>
      isNew && optedIn ? subscribeNewsletter(config, email) : Promise.resolve(),
    )
    .then((): Promise<boolean> => claimDelivery(config.table, session.id, now))
    .then((claimed: boolean): Promise<Result> => {
      if (!claimed) {
        return Promise.resolve(json(200, { received: true, deduped: true }));
      }
      const links: DownloadLinks = downloadLinks(config, apiBase, session.id);
      return sendDelivery(config, email, name, links)
        .then((): Promise<void> => markDelivered(config.table, session.id, nowSeconds()))
        .then((): Result => json(200, { received: true, delivered: true }))
        .catch((error: unknown): Promise<Result> => {
          console.error(`[webhook] delivery email failed for ${session.id}`, error);
          return releaseClaim(config.table, session.id).then(
            (): Result => json(500, { received: true, delivered: false }),
          );
        });
    });
}

export function handleWebhook(stripe: Stripe, config: Config, event: Event): Promise<Result> {
  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody(event),
      header(event, "stripe-signature"),
      config.stripeWebhookSecret,
    );
  } catch (error: unknown) {
    console.error("[webhook] signature verification failed", error);
    return Promise.resolve(json(400, { error: "Invalid signature" }));
  }
  if (!FULFILL_EVENTS.includes(stripeEvent.type)) {
    return Promise.resolve(json(200, { received: true, ignored: stripeEvent.type }));
  }
  const session: Session = stripeEvent.data.object as Session;
  if (!isPaidBook(session)) {
    return Promise.resolve(json(200, { received: true, skipped: "not-a-paid-book-session" }));
  }
  return fulfill(config, apiBase(config, event), session);
}

export function handleLinks(stripe: Stripe, config: Config, event: Event): Promise<Result> {
  const sessionId: string = query(event, "session_id");
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return Promise.resolve(json(404, { ok: false }));
  }
  return stripe.checkout.sessions
    .retrieve(sessionId)
    .then((session: Session): Result => {
      if (!isPaidBook(session)) {
        return json(404, { ok: false });
      }
      const links: DownloadLinks = downloadLinks(config, apiBase(config, event), session.id);
      return json(200, {
        ok: true,
        pdf: links.pdf,
        pdfSave: links.pdfSave,
        epub: links.epub,
        expiresAt: links.expiresAt,
        email: session.customer_details?.email ?? "",
      });
    })
    .catch((): Result => json(404, { ok: false }));
}

export function handleDownload(config: Config, event: Event): Promise<Result> {
  const claims: LinkClaims | null = readToken(query(event, "t"), config.linkSecret, nowSeconds());
  if (claims === null) {
    return Promise.resolve(redirect(`${config.siteUrl}/disqualified/resend?expired=1`, 302));
  }
  return presignFile(config, claims.format, query(event, "save") === "1").then((url: string): Result => redirect(url, 302));
}

function parseEmail(event: Event): string {
  const body: string = rawBody(event).toString("utf8");
  const contentType: string = header(event, "content-type");
  if (contentType.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === "object" && parsed !== null && "email" in parsed) {
        const value: unknown = (parsed as { email: unknown }).email;
        return typeof value === "string" ? value.trim() : "";
      }
      return "";
    } catch {
      return "";
    }
  }
  return (new URLSearchParams(body).get("email") ?? "").trim();
}

function findPaidSessions(stripe: Stripe, email: string): Promise<Session[]> {
  const variants: string[] = Array.from(new Set<string>([email, email.toLowerCase()]));
  return Promise.all(
    variants.map(
      (variant: string): Promise<Session[]> =>
        stripe.checkout.sessions
          .list({ customer_details: { email: variant }, status: "complete", limit: 100 })
          .then((page: Stripe.ApiList<Session>): Session[] => page.data.filter(isPaidBook)),
    ),
  ).then((groups: Session[][]): Session[] =>
    groups.flat().sort((a: Session, b: Session): number => b.created - a.created),
  );
}

export function handleResend(stripe: Stripe, config: Config, event: Event): Promise<Result> {
  const email: string = parseEmail(event);
  const done: Result = json(200, { ok: true, message: RESEND_MESSAGE });
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return Promise.resolve(json(400, { ok: false, message: "Enter a valid email address." }));
  }
  const now: number = nowSeconds();
  return Promise.all([
    countHit(config.table, `email#${email.toLowerCase()}`, RATE_WINDOW_SECONDS, now),
    countHit(config.table, `ip#${clientIp(event)}`, RATE_WINDOW_SECONDS, now),
  ])
    .then(([emailHits, ipHits]: number[]): Promise<Result> => {
      if (emailHits > RESEND_PER_EMAIL || ipHits > RESEND_PER_IP) {
        console.warn(`[resend] rate limited (email hits ${emailHits}, ip hits ${ipHits})`);
        return Promise.resolve(done);
      }
      return findPaidSessions(stripe, email).then((sessions: Session[]): Promise<Result> => {
        if (sessions.length === 0) {
          console.log("[resend] no paid purchase found");
          return Promise.resolve(done);
        }
        const latest: Session = sessions[0];
        const to: string = latest.customer_details?.email ?? email;
        const links: DownloadLinks = downloadLinks(config, apiBase(config, event), latest.id);
        return sendDelivery(config, to, latest.customer_details?.name ?? "", links).then((): Result => {
          console.log(`[resend] sent links for ${latest.id}`);
          return done;
        });
      });
    })
    .catch((error: unknown): Result => {
      console.error("[resend] failed", error);
      return done;
    });
}
