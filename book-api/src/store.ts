import { DynamoDBClient, ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { UpdateCommandOutput } from "@aws-sdk/lib-dynamodb";

const CLAIM_STALE_SECONDS: number = 120;
const ORDER_RETENTION_SECONDS: number = 60 * 60 * 24 * 365 * 3;

const doc: DynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function swallowConditionFailure(error: unknown): boolean {
  if (error instanceof ConditionalCheckFailedException) {
    return false;
  }
  throw error;
}

export function recordOrder(table: string, sessionId: string, email: string, now: number): Promise<boolean> {
  return doc
    .send(
      new PutCommand({
        TableName: table,
        Item: {
          pk: `order#${sessionId}`,
          email,
          createdAt: now,
          expiresAt: now + ORDER_RETENTION_SECONDS,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    )
    .then((): boolean => true)
    .catch(swallowConditionFailure);
}

export function claimDelivery(table: string, sessionId: string, now: number): Promise<boolean> {
  return doc
    .send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: `order#${sessionId}` },
        UpdateExpression: "SET claimedAt = :now",
        ConditionExpression:
          "attribute_exists(pk) AND attribute_not_exists(emailedAt) AND (attribute_not_exists(claimedAt) OR claimedAt < :stale)",
        ExpressionAttributeValues: { ":now": now, ":stale": now - CLAIM_STALE_SECONDS },
      }),
    )
    .then((): boolean => true)
    .catch(swallowConditionFailure);
}

export function markDelivered(table: string, sessionId: string, now: number): Promise<void> {
  return doc
    .send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: `order#${sessionId}` },
        UpdateExpression: "SET emailedAt = :now REMOVE claimedAt",
        ExpressionAttributeValues: { ":now": now },
      }),
    )
    .then((): void => undefined);
}

export function releaseClaim(table: string, sessionId: string): Promise<void> {
  return doc
    .send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: `order#${sessionId}` },
        UpdateExpression: "REMOVE claimedAt",
      }),
    )
    .then((): void => undefined);
}

export function countHit(table: string, key: string, windowSeconds: number, now: number): Promise<number> {
  const bucket: number = Math.floor(now / windowSeconds);
  return doc
    .send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: `rate#${key}#${bucket}` },
        UpdateExpression: "ADD hits :one SET expiresAt = if_not_exists(expiresAt, :exp)",
        ExpressionAttributeValues: { ":one": 1, ":exp": (bucket + 2) * windowSeconds },
        ReturnValues: "UPDATED_NEW",
      }),
    )
    .then((output: UpdateCommandOutput): number => Number(output.Attributes?.hits ?? 0));
}
