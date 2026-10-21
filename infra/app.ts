import { App } from 'aws-cdk-lib/core';
import { buildConfig } from './environments/env-builder';
import { ServiceStack } from './service-stack';

const app: App = new App();

/** cdk deploy -c stage=prod → prod. The default stage (dev) is set in cdk.json → context.stage */
const config = buildConfig(app.node.tryGetContext('stage'));

new ServiceStack(app, `${config.serviceName}-${config.stage}`, {
  config,
  env: {
    /** The CLI sets CDK_DEFAULT_ACCOUNT to the account of the profile from cdk.json */
    account: config.awsAccount ?? process.env.CDK_DEFAULT_ACCOUNT,
    region: config.awsRegion,
  },
  tags: {
    service: config.serviceName,
    stage: config.stage,
  },
});
