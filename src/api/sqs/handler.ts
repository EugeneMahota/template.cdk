import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { SQSEvent } from 'aws-lambda';
import { getEnv } from '../../helper/environment';
import { log } from '../../helper/logger';
import { runLocally } from '../../helper/run-locally';
import { restApiHandler } from '../rest-api-wrapper';
import type { ApiGatewayHandler, LambdaEvent } from '../types';

const sqs: SQSClient = new SQSClient();

type QueueItem = { job: string };

export const addItemInQueue: ApiGatewayHandler = restApiHandler(
  async ({ body }: LambdaEvent<QueueItem>): Promise<{ message: string }> => {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: getEnv('QUEUE_EXAMPLE_URL'),
        MessageBody: JSON.stringify(body),
        DelaySeconds: 10,
      })
    );
    return { message: 'All fine:)' };
  }
);

/** On error the message goes back to the queue; after 2 attempts (maxReceiveCount) it moves to the DLQ */
export const handleQueueItem = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const item: QueueItem = JSON.parse(record.body);
    log('QUEUE ITEM: ', item);

    if (item.job === 'fail') {
      throw new Error(`Job "${item.job}" failed`);
    }
  }
};

export const handleFailedQueueItem = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    log('FAILED QUEUE ITEM: ', record.body);
  }
};

if (require.main === module) {
  runLocally(addItemInQueue, { body: { job: 'test' } }).then();
}
