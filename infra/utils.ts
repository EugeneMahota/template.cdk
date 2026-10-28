import { StageConfig } from './environments/types';

/** dev, or dev-eugene in a personal environment: the end of the stack name and of every resource name */
export function envName(config: StageConfig): string {
  return config.owner ? `${config.stage}-${config.owner}` : config.stage;
}

/**
 * Same as ResourceName() in template.sls: resourceName(config, config.names.logsTable) → template-cdk-logs-dev,
 * template-cdk-logs-dev-eugene in a personal environment
 */
export function resourceName(config: StageConfig, name: string): string {
  return `${config.serviceName}-${name}-${envName(config)}`;
}
