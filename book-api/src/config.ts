export interface Config {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePrice: string;
  bucket: string;
  pdfKey: string;
  epubKey: string;
  sesFrom: string;
  sesReplyTo: string;
  siteUrl: string;
  table: string;
  linkSecret: string;
  linkTtlSeconds: number;
  newsletterUrl: string;
  publicApiUrl: string;
}

export const PRODUCT_TAG: string = "disqualified";

function required(name: string): string {
  const value: string | undefined = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing env var ${name}`);
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value: string | undefined = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

export function loadConfig(): Config {
  return {
    stripeSecretKey: required("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    stripePrice: required("STRIPE_PRICE_DISQUALIFIED"),
    bucket: required("BOOK_BUCKET"),
    pdfKey: required("BOOK_PDF_KEY"),
    epubKey: required("BOOK_EPUB_KEY"),
    sesFrom: required("SES_FROM"),
    sesReplyTo: required("SES_REPLY_TO"),
    siteUrl: required("SITE_URL").replace(/\/$/, ""),
    table: required("BOOK_TABLE"),
    linkSecret: required("BOOK_LINK_SECRET"),
    linkTtlSeconds: Number(optional("BOOK_LINK_TTL_SECONDS", "604800")),
    newsletterUrl: optional("NEWSLETTER_URL", ""),
    publicApiUrl: optional("PUBLIC_API_URL", "").replace(/\/$/, ""),
  };
}
