import type { RetentionDays } from 'aws-cdk-lib/aws-logs';

export const STAGES = ['dev', 'staging', 'uat', 'prod'] as const;
export type Stage = (typeof STAGES)[number];

export interface StageConfig {
  stage: Stage;
  serviceName: string;
  awsRegion: string;
  /** If set, CDK refuses to deploy the stack with credentials of another account */
  awsAccount?: string;
  /**
   * Custom domain of the API, with a base path if several services share it: 'api.dev.example.com' or
   * 'api.example.com/logs'. openapi.yaml lists it in servers; without it, the execute-api URL. The stack doesn't
   * create the domain yet (README → What to add next)
   */
  apiDomain?: string;

  /** esbuild */
  esbuildMinify: boolean;
  esbuildSourcemap: boolean;

  /** true → tables and the user pool stay when the stack is deleted (DeletionPolicy: Retain) */
  retainData: boolean;
  logRetention: RetentionDays;

  /** Short resource names. resourceName() adds the service and the stage: 'logs' → template-cdk-logs-dev */
  names: {
    api: string;
    userPool: string;
    userPoolClient: string;
    logsTable: string;
    logsTopic: string;
    queueExample: string;
    queueExampleDlq: string;
    delayedExecution: string;
  };
}

/** A stage file overrides only what differs from common */
export type StageOverrides = Pick<StageConfig, 'stage'> & Partial<StageConfig>;
