import { Stack, StackProps } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { Api } from './constructs/api';
import { EventLogs } from './constructs/event-logs';
import { Sqs } from './constructs/sqs';
import { StepFunctions } from './constructs/step-functions';
import { TestFunctions } from './constructs/test-functions';
import { StageConfig } from './environments/types';

export interface ServiceStackProps extends StackProps {
  config: StageConfig;
}

/** Like joinParts() in template.sls: the stack is built from independent parts (constructs) */
export class ServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);
    const { config } = props;

    const api: Api = new Api(this, 'Api', { config });

    new TestFunctions(this, 'TestFunctions', { config, api });
    new EventLogs(this, 'EventLogs', { config, api });
    new Sqs(this, 'Sqs', { config, api });
    new StepFunctions(this, 'StepFunctions', { config, api });
  }
}
