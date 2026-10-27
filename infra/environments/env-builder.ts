import { COMMON_CONFIG } from './environment.common';
import { DEV_CONFIG } from './environment.dev';
import { PROD_CONFIG } from './environment.prod';
import { STAGING_CONFIG } from './environment.staging';
import { UAT_CONFIG } from './environment.uat';
import { Stage } from './stage';
import { StageConfig, StageOverrides } from './types';

const STAGE_CONFIGS: Record<Stage, StageOverrides> = {
  [Stage.DEV]: DEV_CONFIG,
  [Stage.STAGING]: STAGING_CONFIG,
  [Stage.UAT]: UAT_CONFIG,
  [Stage.PROD]: PROD_CONFIG,
};

/** The stage comes as a string from the CLI (cdk deploy -c stage=dev), so it is checked here */
export function buildConfig(stage: unknown): StageConfig {
  if (!isStage(stage)) {
    const stages: string = Object.values(Stage).join(', ');
    throw new Error(`Unknown stage "${stage}". Use one of: ${stages} (e.g. cdk deploy -c stage=dev)`);
  }
  return { ...COMMON_CONFIG, ...STAGE_CONFIGS[stage] };
}

function isStage(value: unknown): value is Stage {
  return Object.values(Stage).includes(value as Stage);
}
