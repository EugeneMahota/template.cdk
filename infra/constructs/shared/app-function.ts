import * as path from 'node:path';
import { Duration, RemovalPolicy } from 'aws-cdk-lib/core';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { StageConfig } from '../../environments/types';
import { resourceName } from '../../utils';

const PROJECT_ROOT: string = path.resolve(__dirname, '../../..');

export interface AppFunctionProps extends Omit<NodejsFunctionProps, 'entry' | 'functionName'> {
  config: StageConfig;
  /** Name without prefixes: 'testFunction' → template-cdk-testFunction-dev */
  name: string;
  /** Handler file, relative to the project root: 'src/api/test-functions/handler.ts' */
  entry: string;
  /** Name of the export in that file: 'testFunction' */
  handler: string;
}

/**
 * Lambda with settings shared by the whole service. In template.sls these were provider and build.esbuild.
 * Any setting can be overridden for a single function: memorySize, timeout, etc.
 */
export class AppFunction extends NodejsFunction {
  constructor(scope: Construct, id: string, { config, name, entry, environment, ...props }: AppFunctionProps) {
    const functionName: string = resourceName(config, name);

    super(scope, id, {
      functionName,
      entry: path.join(PROJECT_ROOT, entry),
      runtime: Runtime.NODEJS_24_X,
      memorySize: 128,
      timeout: Duration.seconds(29),
      logGroup: new LogGroup(scope, `${id}Logs`, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: config.logRetention,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      /** esbuild runs on synth/deploy. @aws-sdk/* is not bundled: the Lambda runtime already has it */
      bundling: {
        minify: config.esbuildMinify,
        sourceMap: config.esbuildSourcemap,
      },
      environment: {
        STAGE: config.stage,
        SERVICE_NAME: config.serviceName,
        ...(config.esbuildSourcemap ? { NODE_OPTIONS: '--enable-source-maps' } : {}),
        ...environment,
      },
      ...props,
    });
  }
}
