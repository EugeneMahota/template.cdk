import { RemovalPolicy } from 'aws-cdk-lib/core';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { LambdaSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { StageConfig } from '../environments/types';
import { resourceName } from '../utils';
import { Api } from './api';
import { AppFunction } from './app-function';

const LOGS_TABLE_CODE_INDEX: string = 'eventCode-createdAt-index';

interface EventLogsProps {
  config: StageConfig;
  api: Api;
}

/**
 * template.sls: serverless/parts/tables.ts + SNS
 * POST /api/logs → write to DynamoDB → message to SNS → onLogCreated
 * GET /api/logs?eventCode=CREATE → query by GSI
 */
export class EventLogs extends Construct {
  constructor(scope: Construct, id: string, { config, api }: EventLogsProps) {
    super(scope, id);

    const table: Table = new Table(this, 'EventLogsTable', {
      tableName: resourceName(config, 'logs'),
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    table.addGlobalSecondaryIndex({
      indexName: LOGS_TABLE_CODE_INDEX,
      partitionKey: { name: 'eventCode', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
    });

    const topic: Topic = new Topic(this, 'EventLogsTopic', {
      topicName: resourceName(config, 'logs-topic'),
    });

    const createLog: AppFunction = new AppFunction(this, 'CreateLog', {
      config,
      name: 'createLog',
      entry: 'src/api/logs/handler.ts',
      handler: 'createLog',
      environment: {
        LOGS_TABLE: table.tableName,
        LOGS_TOPIC_ARN: topic.topicArn,
      },
    });
    /** Instead of provider.iam.role.statements: each lambda gets its own role with only the permissions it needs */
    table.grantWriteData(createLog);
    topic.grantPublish(createLog);
    api.addRoute('POST', 'logs', createLog);

    const getLogs: AppFunction = new AppFunction(this, 'GetLogs', {
      config,
      name: 'getLogs',
      entry: 'src/api/logs/handler.ts',
      handler: 'getLogs',
      environment: {
        LOGS_TABLE: table.tableName,
        LOGS_TABLE_CODE_INDEX,
      },
    });
    table.grantReadData(getLogs);
    api.addRoute('GET', 'logs', getLogs);

    const onLogCreated: AppFunction = new AppFunction(this, 'OnLogCreated', {
      config,
      name: 'onLogCreated',
      entry: 'src/api/logs/handler.ts',
      handler: 'onLogCreated',
    });
    topic.addSubscription(new LambdaSubscription(onLogCreated));
  }
}
