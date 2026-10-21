import { Duration } from 'aws-cdk-lib/core';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { StageConfig } from '../environments/types';
import { resourceName } from '../utils';
import { Api } from './api';
import { AppFunction } from './app-function';

interface SqsProps {
  config: StageConfig;
  api: Api;
}

/**
 * template.sls: serverless/parts/sqs.ts
 * POST /api/add-queue-item → queue → handleQueueItem
 * after 2 failed attempts the message moves to the DLQ → handleFailedQueueItem
 */
export class Sqs extends Construct {
  constructor(scope: Construct, id: string, { config, api }: SqsProps) {
    super(scope, id);

    const queueDlq: Queue = new Queue(this, 'QueueExampleDLQ', {
      queueName: resourceName(config, 'queue-example-dlq'),
      retentionPeriod: Duration.days(14),
    });
    const queue: Queue = new Queue(this, 'QueueExample', {
      queueName: resourceName(config, 'queue-example'),
      retentionPeriod: Duration.days(14),
      /** AWS recommends a visibility timeout of at least 6 × the timeout of the handler lambda */
      visibilityTimeout: Duration.minutes(6),
      deadLetterQueue: { queue: queueDlq, maxReceiveCount: 2 },
    });

    const addItemInQueue: AppFunction = new AppFunction(this, 'AddItemInQueue', {
      config,
      name: 'addItemInQueue',
      entry: 'src/api/sqs/handler.ts',
      handler: 'addItemInQueue',
      environment: {
        QUEUE_EXAMPLE_URL: queue.queueUrl,
      },
    });
    queue.grantSendMessages(addItemInQueue);
    api.addRoute('POST', 'add-queue-item', addItemInQueue);

    const handleQueueItem: AppFunction = new AppFunction(this, 'HandleQueueItem', {
      config,
      name: 'handleQueueItem',
      entry: 'src/api/sqs/handler.ts',
      handler: 'handleQueueItem',
      timeout: Duration.minutes(1),
    });
    /** SqsEventSource grants the lambda permission to read from the queue */
    handleQueueItem.addEventSource(new SqsEventSource(queue, { batchSize: 1 }));

    const handleFailedQueueItem: AppFunction = new AppFunction(this, 'HandleFailedQueueItem', {
      config,
      name: 'handleFailedQueueItem',
      entry: 'src/api/sqs/handler.ts',
      handler: 'handleFailedQueueItem',
    });
    handleFailedQueueItem.addEventSource(new SqsEventSource(queueDlq, { batchSize: 1 }));
  }
}
