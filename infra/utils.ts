import { StageConfig } from './environments/types';

/** Same as ResourceName() in template.sls: resourceName(config, config.names.logsTable) → template-cdk-logs-dev */
export function resourceName(config: StageConfig, name: string): string {
  return `${config.serviceName}-${name}-${config.stage}`;
}
