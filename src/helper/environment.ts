export type Stage = 'dev' | 'staging' | 'uat' | 'prod';

/** Every lambda has STAGE and SERVICE_NAME: infra/constructs/app-function.ts adds them */
export function getStage(): Stage {
  return getEnv('STAGE') as Stage;
}

export function getEnv(name: string, required?: true): string;
export function getEnv(name: string, required: false): string | undefined;
export function getEnv(name: string, required = true): string | undefined {
  const value: string | undefined = process.env[name];

  if (required && value === undefined) {
    throw new Error(`Missing environment variable ${name}`);
  }

  return value;
}
