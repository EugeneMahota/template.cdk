import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { StageConfig } from './types';

export const COMMON_CONFIG: Omit<StageConfig, 'stage'> = {
  serviceName: 'template-cdk',
  awsRegion: 'eu-west-1',

  /** esbuild */
  esbuildMinify: false,
  esbuildSourcemap: true,

  /** data */
  retainData: false,
  logRetention: RetentionDays.ONE_MONTH,

  names: {
    api: 'api',

    /** cognito */
    userPool: 'users',
    userPoolClient: 'app',

    /** tables */
    logsTable: 'logs',

    /** sns */
    logsTopic: 'logs-topic',

    /** sqs */
    queueExample: 'queue-example',
    queueExampleDlq: 'queue-example-dlq',

    /** step functions */
    delayedExecution: 'delayed-execution',
  },
};
