import { createHmac, timingSafeEqual } from "node:crypto";

export type BookFormat = "pdf" | "epub";

export interface LinkClaims {
  sessionId: string;
  format: BookFormat;
  expiresAt: number;
}

interface EncodedClaims {
  s?: unknown;
  f?: unknown;
  e?: unknown;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function createToken(claims: LinkClaims, secret: string): string {
  const encoded: EncodedClaims = { s: claims.sessionId, f: claims.format, e: claims.expiresAt };
  const payload: string = Buffer.from(JSON.stringify(encoded), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function parseClaims(payload: string): EncodedClaims | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as EncodedClaims) : null;
  } catch {
    return null;
  }
}

export function readToken(token: string, secret: string, now: number): LinkClaims | null {
  const parts: string[] = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const expected: Buffer = Buffer.from(sign(parts[0], secret), "utf8");
  const given: Buffer = Buffer.from(parts[1], "utf8");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  const claims: EncodedClaims | null = parseClaims(parts[0]);
  if (claims === null || typeof claims.s !== "string" || typeof claims.e !== "number") {
    return null;
  }
  const format: unknown = claims.f;
  if (format !== "pdf" && format !== "epub") {
    return null;
  }
  if (claims.e < now) {
    return null;
  }
  return { sessionId: claims.s, format, expiresAt: claims.e };
}
