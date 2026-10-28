import { App } from 'aws-cdk-lib/core';
import { buildConfig } from './environments/env-builder';
import { ServiceStack } from './service-stack';
import { envName } from './utils';

const app: App = new App();

/**
 * cdk deploy -c stage=prod → prod. The default stage (dev) is set in cdk.json → context.stage.
 * cdk deploy -c stage=dev -c owner=eugene → a personal copy of dev: the stack template-cdk-dev-eugene
 */
const config = buildConfig(app.node.tryGetContext('stage'), app.node.tryGetContext('owner'));

new ServiceStack(app, `${config.serviceName}-${envName(config)}`, {
  config,
  env: {
    /** The CLI sets CDK_DEFAULT_ACCOUNT to the account of the credentials: AWS_PROFILE locally, the OIDC role in CI */
    account: config.awsAccount ?? process.env.CDK_DEFAULT_ACCOUNT,
    region: config.awsRegion,
  },
});
