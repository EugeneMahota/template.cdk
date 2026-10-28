import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import type { SNSEvent } from 'aws-lambda';
import Joi from 'joi';
import { getEnv } from '../../helper/environment';
import { log } from '../../helper/logger';
import { runLocally } from '../../helper/run-locally';
import { createEventLog, EventLog, EventLogCode, EventLogCodes, getEventLogsByCode } from '../../models/logs.model';
import { restApiHandler } from '../rest-api-wrapper';
import type { ApiGatewayHandler, LambdaEvent } from '../types';

/** Clients are created outside the handler, so they are reused between lambda invocations */
const sns: SNSClient = new SNSClient();

type CreateLogBody = { eventCode: EventLogCode };
type GetLogsQuery = { eventCode: EventLogCode };

const eventCode = Joi.string()
  .valid(...EventLogCodes)
  .required();

export const createLog: ApiGatewayHandler = restApiHandler(
  { body: Joi.object({ eventCode }) },
  async ({ body }: LambdaEvent<CreateLogBody>): Promise<EventLog> => {
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
  { query: Joi.object({ eventCode }) },
  async ({ query }: LambdaEvent<unknown, unknown, GetLogsQuery>): Promise<EventLog[]> =>
    getEventLogsByCode(query.eventCode)
);

/** SNS topic subscriber: called after each createLog */
export const onLogCreated = async (event: SNSEvent): Promise<void> => {
  for (const record of event.Records) {
    log('LOG CREATED: ', JSON.parse(record.Sns.Message));
  }
};

if (require.main === module) {
  runLocally(createLog, { body: { eventCode: EventLogCode.CREATE } }).then();
}
