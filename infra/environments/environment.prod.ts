import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Stage } from './stage';
import { StageOverrides } from './types';

export const PROD_CONFIG: StageOverrides = {
  stage: Stage.PROD,
  // awsAccount: '123456789012',
  // apiDomain: 'api.example.com',

  /** esbuild */
  esbuildMinify: true,
  esbuildSourcemap: false,

  /** data */
  retainData: true,
  logRetention: RetentionDays.ONE_MONTH,
};
