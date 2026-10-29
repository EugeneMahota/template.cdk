import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getEnv } from '../helper/environment';

export enum EventLogCode {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  GET = 'GET',
}

export const EventLogCodes: EventLogCode[] = Object.values(EventLogCode);

export type EventLog = {
  id: string;
  eventCode: EventLogCode;
  createdAt: string;
};

/** Instead of dynamoose: DocumentClient from AWS SDK converts JS objects to the DynamoDB format and back */
const db: DynamoDBDocumentClient = DynamoDBDocumentClient.from(new DynamoDBClient());

export async function createEventLog(eventCode: EventLogCode): Promise<EventLog> {
  const eventLog: EventLog = {
    id: randomUUID(),
    eventCode,
    createdAt: new Date().toISOString(),
  };
  await db.send(
    new PutCommand({
      TableName: getEnv('LOGS_TABLE'),
      Item: eventLog,
    })
  );
  return eventLog;
}

/** Last 50 records with this code, newest first (GSI eventCode + createdAt) */
export async function getEventLogsByCode(eventCode: EventLogCode): Promise<EventLog[]> {
  const { Items } = await db.send(
    new QueryCommand({
      TableName: getEnv('LOGS_TABLE'),
      IndexName: getEnv('LOGS_TABLE_CODE_INDEX'),
      KeyConditionExpression: 'eventCode = :eventCode',
      ExpressionAttributeValues: { ':eventCode': eventCode },
      ScanIndexForward: false,
      Limit: 50,
    })
  );
  return (Items ?? []) as EventLog[];
}
