import { Construct } from 'constructs';
import { StageConfig } from '../environments/types';
import { Api } from './api';
import { AppFunction } from './shared/app-function';

interface TestFunctionsProps {
  config: StageConfig;
  api: Api;
}

/** template.sls: serverless/parts/functions.ts. POST /v1/test-function: no auth */
export class TestFunctions extends Construct {
  constructor(scope: Construct, id: string, { config, api }: TestFunctionsProps) {
    super(scope, id);

    const testFunction: AppFunction = new AppFunction(this, 'TestFunction', {
      config,
      name: 'testFunction',
      entry: 'src/api/test-functions/handler.ts',
      handler: 'testFunction',
    });
    api.addRoute({ method: 'POST', path: 'v1/test-function', handler: testFunction, auth: 'none' });
  }
}
