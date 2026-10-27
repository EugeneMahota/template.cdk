/**
 * Stages of the service: cdk deploy -c stage=dev. Each one is a separate stack with its own file in this folder.
 * No imports on purpose: the lambdas use it too (src/helper/environment.ts), and nothing of CDK may get into them
 */
export enum Stage {
  DEV = 'dev',
  STAGING = 'staging',
  UAT = 'uat',
  PROD = 'prod',
}
