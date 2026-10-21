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
};
