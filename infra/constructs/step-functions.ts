import { DefinitionBody, StateMachine, Wait, WaitTime } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { StageConfig } from '../environments/types';
import { resourceName } from '../utils';
import { Api } from './api';
import { AppFunction } from './shared/app-function';

interface StepFunctionsProps {
  config: StageConfig;
  api: Api;
}

/**
 * template.sls: serverless/parts/step-functions.ts (without the serverless-step-functions plugin)
 * POST /v1/internal/schedule-delayed-function → state machine waits until scheduledTime → delayedFunctionHandler
 * The route is for other services: requests must be signed with IAM credentials (auth: 'iam', see api.ts)
 */
export class StepFunctions extends Construct {
  constructor(scope: Construct, id: string, { config, api }: StepFunctionsProps) {
    super(scope, id);

    const delayedFunctionHandler: AppFunction = new AppFunction(this, 'DelayedFunctionHandler', {
      config,
      name: 'delayedFunctionHandler',
      entry: 'src/api/step-functions/handler.ts',
      handler: 'delayedFunctionHandler',
    });

    /** States are defined in code instead of ASL JSON. CDK gives the state machine permission to call the lambda */
    const definition = new Wait(this, 'WaitForExecution', {
      time: WaitTime.timestampPath('$.scheduledTime'),
    }).next(
      new LambdaInvoke(this, 'ExecuteFunction', {
        lambdaFunction: delayedFunctionHandler,
      })
    );

    const stateMachine: StateMachine = new StateMachine(this, 'DelayedExecutionStateMachine', {
      stateMachineName: resourceName(config, config.names.delayedExecution),
      definitionBody: DefinitionBody.fromChainable(definition),
    });

    const scheduleDelayedFunction: AppFunction = new AppFunction(this, 'ScheduleDelayedFunction', {
      config,
      name: 'scheduleDelayedFunction',
      entry: 'src/api/step-functions/handler.ts',
      handler: 'scheduleDelayedFunction',
      environment: {
        DELAYED_EXECUTION_STATEMACHINE_ARN: stateMachine.stateMachineArn,
      },
    });
    stateMachine.grantStartExecution(scheduleDelayedFunction);
    api.addRoute({
      method: 'POST',
      path: 'v1/internal/schedule-delayed-function',
      handler: scheduleDelayedFunction,
      auth: 'iam',
    });
  }
}
