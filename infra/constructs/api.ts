import { Cors, IResource, LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { StageConfig } from '../environments/types';
import { resourceName } from '../utils';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** REST API (API Gateway v1). In Serverless Framework it was created implicitly from events.http */
export class Api extends Construct {
  readonly restApi: RestApi;
  private readonly apiRoot: IResource;

  constructor(scope: Construct, id: string, { config }: { config: StageConfig }) {
    super(scope, id);

    this.restApi = new RestApi(this, 'RestApi', {
      restApiName: resourceName(config, 'api'),
      deployOptions: { stageName: config.stage },
      /** Same as cors: true. API Gateway itself answers OPTIONS (preflight) requests */
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
      },
    });
    this.apiRoot = this.restApi.root.addResource('api');
  }

  /** api.addRoute('POST', 'test-function', fn) → POST /api/test-function */
  addRoute(method: HttpMethod, path: string, handler: IFunction): void {
    this.apiRoot.resourceForPath(path).addMethod(method, new LambdaIntegration(handler));
  }
}
