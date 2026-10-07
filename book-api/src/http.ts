import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export type Event = APIGatewayProxyEventV2;
export type Result = APIGatewayProxyStructuredResultV2;

export function json(statusCode: number, body: Record<string, unknown>): Result {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

export function redirect(location: string, statusCode: number = 303): Result {
  return { statusCode, headers: { location, "cache-control": "no-store" }, body: "" };
}

export function rawBody(event: Event): Buffer {
  const body: string = event.body ?? "";
  return event.isBase64Encoded ? Buffer.from(body, "base64") : Buffer.from(body, "utf8");
}

export function header(event: Event, name: string): string {
  const value: string | undefined = event.headers[name.toLowerCase()];
  return value ?? "";
}

export function query(event: Event, name: string): string {
  const params: Record<string, string | undefined> = event.queryStringParameters ?? {};
  return params[name] ?? "";
}

export function selfUrl(event: Event): string {
  return `https://${event.requestContext.domainName}`;
}

export function clientIp(event: Event): string {
  return event.requestContext.http.sourceIp;
}
