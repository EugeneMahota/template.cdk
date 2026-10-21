import { StageConfig } from './environments/types';

/** Same as ResourceName() in template.sls: resourceName(config, 'logs') → template-cdk-logs-dev */
export function resourceName(config: StageConfig, name: string): string {
  return `${config.serviceName}-${name}-${config.stage}`;
}
