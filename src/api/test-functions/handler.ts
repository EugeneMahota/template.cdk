import { getStage } from '../../helper/environment';
import { BadRequest } from '../../helper/http-error';
import { runLocally } from '../../helper/run-locally';
import { restApiHandler } from '../rest-api-wrapper';
import type { ApiGatewayHandler, LambdaEvent } from '../types';

type TestFuncBody = { isShowError: boolean };
type TestFuncResponse = { message: string; stage: string };

export const testFunction: ApiGatewayHandler = restApiHandler(
  async ({ body }: LambdaEvent<TestFuncBody>): Promise<TestFuncResponse> => {
    if (body.isShowError) {
      throw BadRequest('Something went wrong!');
    }
    return { message: 'All good:)', stage: getStage() };
  }
);

if (require.main === module) {
  runLocally(testFunction, { body: { isShowError: false } }).then();
}
