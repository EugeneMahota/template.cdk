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

/** Short enough for the longest resource name: template-cdk-handleFailedQueueItem-dev-<owner> fits into 64 */
const OWNER: RegExp = /^[a-z][a-z0-9-]{0,19}$/;

/**
 * The stage and the owner come as strings from the CLI (cdk deploy -c stage=dev -c owner=eugene), so they are checked
 * here. Only dev has personal environments: staging, uat and prod are shared
 */
export function buildConfig(stage: unknown, owner?: unknown): StageConfig {
  if (!isStage(stage)) {
    const stages: string = Object.values(Stage).join(', ');
    throw new Error(`Unknown stage "${stage}". Use one of: ${stages} (e.g. cdk deploy -c stage=dev)`);
  }
  const config: StageConfig = { ...COMMON_CONFIG, ...STAGE_CONFIGS[stage] };
  if (owner === undefined) {
    return config;
  }
  if (stage !== Stage.DEV) {
    throw new Error(`A personal environment is a copy of dev: use -c stage=dev with -c owner=${owner}`);
  }
  if (typeof owner !== 'string' || !OWNER.test(owner)) {
    throw new Error(`Owner "${owner}" must be up to 20 lowercase letters, digits and dashes, starting with a letter`);
  }
  return { ...config, owner };
}

function isStage(value: unknown): value is Stage {
  return Object.values(Stage).includes(value as Stage);
}
