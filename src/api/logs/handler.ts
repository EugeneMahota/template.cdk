import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import type { SNSEvent } from 'aws-lambda';
import { getEnv } from '../../helper/environment';
import { BadRequest } from '../../helper/http-error';
import { log } from '../../helper/logger';
import { runLocally } from '../../helper/run-locally';
import { createEventLog, EventLog, EventLogCode, EventLogCodes, getEventLogsByCode } from '../../models/logs.model';
import { restApiHandler } from '../rest-api-wrapper';
import type { ApiGatewayHandler, LambdaEvent } from '../types';

/** Clients are created outside the handler, so they are reused between lambda invocations */
const sns: SNSClient = new SNSClient();

type CreateLogBody = { eventCode: EventLogCode };
type GetLogsQuery = { eventCode?: EventLogCode };

export const createLog: ApiGatewayHandler = restApiHandler(
  async ({ body }: LambdaEvent<CreateLogBody>): Promise<EventLog> => {
    assertEventCode(body.eventCode);
    const eventLog: EventLog = await createEventLog(body.eventCode);
    await sns.send(
      new PublishCommand({
        TopicArn: getEnv('LOGS_TOPIC_ARN'),
        Message: JSON.stringify(eventLog),
      })
    );
    return eventLog;
  }
);

export const getLogs: ApiGatewayHandler = restApiHandler(
  async ({ query }: LambdaEvent<unknown, unknown, GetLogsQuery>): Promise<EventLog[]> => {
    assertEventCode(query.eventCode);
    return getEventLogsByCode(query.eventCode);
  }
);

/** SNS topic subscriber: called after each createLog */
export const onLogCreated = async (event: SNSEvent): Promise<void> => {
  for (const record of event.Records) {
    log('LOG CREATED: ', JSON.parse(record.Sns.Message));
  }
};

function assertEventCode(eventCode: unknown): asserts eventCode is EventLogCode {
  if (!EventLogCodes.includes(eventCode as EventLogCode)) {
    throw BadRequest(`eventCode must be one of: ${EventLogCodes.join(', ')}`);
  }
}

if (require.main === module) {
  runLocally(createLog, { body: { eventCode: EventLogCode.CREATE } }).then();
}
