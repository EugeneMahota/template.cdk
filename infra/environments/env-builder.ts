import { COMMON_CONFIG } from './environment.common';
import { DEV_CONFIG } from './environment.dev';
import { PROD_CONFIG } from './environment.prod';
import { STAGING_CONFIG } from './environment.staging';
import { UAT_CONFIG } from './environment.uat';
import { Stage, StageConfig, StageOverrides, STAGES } from './types';

const STAGE_CONFIGS: Record<Stage, StageOverrides> = {
  dev: DEV_CONFIG,
  staging: STAGING_CONFIG,
  uat: UAT_CONFIG,
  prod: PROD_CONFIG,
};

export function buildConfig(stage: unknown): StageConfig {
  if (!isStage(stage)) {
    throw new Error(`Unknown stage "${stage}". Use one of: ${STAGES.join(', ')} (e.g. cdk deploy -c stage=dev)`);
  }
  return { ...COMMON_CONFIG, ...STAGE_CONFIGS[stage] };
}

function isStage(value: unknown): value is Stage {
  return STAGES.includes(value as Stage);
}
