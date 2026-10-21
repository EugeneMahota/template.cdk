import { Construct } from 'constructs';
import { StageConfig } from '../environments/types';
import { Api } from './api';
import { AppFunction } from './app-function';

interface TestFunctionsProps {
  config: StageConfig;
  api: Api;
}

/** template.sls: serverless/parts/functions.ts */
export class TestFunctions extends Construct {
  constructor(scope: Construct, id: string, { config, api }: TestFunctionsProps) {
    super(scope, id);

    const testFunction: AppFunction = new AppFunction(this, 'TestFunction', {
      config,
      name: 'testFunction',
      entry: 'src/api/test-functions/handler.ts',
      handler: 'testFunction',
    });
    api.addRoute('POST', 'test-function', testFunction);
  }
}
