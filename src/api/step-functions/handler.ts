import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { getEnv } from '../../helper/environment';
import { log } from '../../helper/logger';
import { runLocally } from '../../helper/run-locally';
import { restApiHandler } from '../rest-api-wrapper';
import type { ApiGatewayHandler } from '../types';

const sfn: SFNClient = new SFNClient();

type DelayedExecutionInput = { scheduledTime: string; answer: number };

export const scheduleDelayedFunction: ApiGatewayHandler = restApiHandler(
  async (): Promise<{ message: string; scheduledTime: string }> => {
    const input: DelayedExecutionInput = {
      scheduledTime: new Date(Date.now() + 1000 * 60 * 3).toISOString(),
      answer: 42 /** just additional param */,
    };

    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: getEnv('DELAYED_EXECUTION_STATEMACHINE_ARN'),
        input: JSON.stringify(input),
      })
    );

    return { message: 'All fine :)', scheduledTime: input.scheduledTime };
  }
);

/** Called by the state machine after the Wait step */
export const delayedFunctionHandler = async (event: DelayedExecutionInput): Promise<void> => {
  log('delayedFunctionHandler: ', event);
};

if (require.main === module) {
  runLocally(scheduleDelayedFunction, {}).then();
}
