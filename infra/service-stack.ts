import { Stack, StackProps, Tags } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { Api } from './constructs/api';
import { Auth } from './constructs/auth';
import { EventLogs } from './constructs/event-logs';
import { Sqs } from './constructs/sqs';
import { StepFunctions } from './constructs/step-functions';
import { Users } from './constructs/users';
import { StageConfig } from './environments/types';

export interface ServiceStackProps extends StackProps {
  config: StageConfig;
}

/** Like joinParts() in template.sls: the stack is built from independent parts (constructs) */
export class ServiceStack extends Stack {
  /** tools/generate-openapi.ts reads the routes from it */
  readonly api: Api;

  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);
    const { config } = props;

    /** On every resource of the stack: costs and resources can be filtered by service, stage and owner */
    Tags.of(this).add('ApplicationService', config.serviceName);
    Tags.of(this).add('Environment', config.stage);
    if (config.owner) {
      Tags.of(this).add('Owner', config.owner);
    }

    const auth: Auth = new Auth(this, 'Auth', { config });
    const api: Api = new Api(this, 'Api', {
      config,
      userPool: auth.userPool,
      userPoolClient: auth.userPoolClient,
    });
    this.api = api;

    new Users(this, 'Users', {
      config,
      api,
      userPool: auth.userPool,
    });
    new EventLogs(this, 'EventLogs', {
      config,
      api,
    });
    new Sqs(this, 'Sqs', {
      config,
      api,
    });
    new StepFunctions(this, 'StepFunctions', {
      config,
      api,
    });
  }
}
