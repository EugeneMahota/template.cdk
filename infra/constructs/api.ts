import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  IAuthorizer,
  LambdaIntegration,
  MethodOptions,
  ResponseType,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { StageConfig } from '../environments/types';
import { resourceName } from '../utils';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Who may call the route:
 * - 'none': anyone
 * - 'cognito': signed-in users, with an ID token of the user pool in the Authorization header
 * - 'iam': other services and scripts, with requests signed by IAM credentials (SigV4)
 * - an authorizer object: a lambda authorizer (TokenAuthorizer), another user pool
 */
export type RouteAuth = 'none' | 'cognito' | 'iam' | IAuthorizer;

export interface Route {
  method: HttpMethod;
  /** 'v1/users/{userId}/orders': a version first, then kebab-case segments and {camelCase} parameters */
  path: string;
  handler: IFunction;
  /** Required on purpose: a public route says 'none' out loud */
  auth: RouteAuth;
}

const VERSION_SEGMENT = /^v\d+$/;
const PATH_SEGMENT = /^([a-z0-9]+(-[a-z0-9]+)*|\{[a-z][a-zA-Z0-9]*\})$/;

interface ApiProps {
  config: StageConfig;
  userPool: IUserPool;
}

/** REST API (API Gateway v1). In Serverless Framework it was created implicitly from events.http */
export class Api extends Construct {
  readonly restApi: RestApi;
  private readonly userPool: IUserPool;
  private cognitoAuthorizer?: CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, { config, userPool }: ApiProps) {
    super(scope, id);
    this.userPool = userPool;

    this.restApi = new RestApi(this, 'RestApi', {
      restApiName: resourceName(config, config.names.api),
      deployOptions: { stageName: config.stage },
      /** Same as cors: true. API Gateway itself answers OPTIONS (preflight) requests */
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
      },
    });

    /**
     * Errors that API Gateway returns without calling a lambda (401 from the authorizer, 403 from IAM, 429, 5xx)
     * need the CORS header too, or the browser shows a CORS error instead of the real status.
     * The value is a mapping expression, so a static string goes in single quotes
     */
    const corsHeaders = { 'Access-Control-Allow-Origin': "'*'" };
    this.restApi.addGatewayResponse('Default4xx', { type: ResponseType.DEFAULT_4XX, responseHeaders: corsHeaders });
    this.restApi.addGatewayResponse('Default5xx', { type: ResponseType.DEFAULT_5XX, responseHeaders: corsHeaders });
  }

  /** api.addRoute({ method: 'GET', path: 'v1/users/me', handler: fn, auth: 'cognito' }) → GET /v1/users/me */
  addRoute({ method, path, handler, auth }: Route): void {
    assertPath(path);
    this.restApi.root.resourceForPath(path).addMethod(method, new LambdaIntegration(handler), this.methodOptions(auth));
  }

  private methodOptions(auth: RouteAuth): MethodOptions {
    if (auth === 'none') {
      return { authorizationType: AuthorizationType.NONE };
    }
    if (auth === 'iam') {
      return { authorizationType: AuthorizationType.IAM };
    }
    /** CDK takes the auth type from the authorizer: COGNITO_USER_POOLS, or CUSTOM for a lambda authorizer */
    return { authorizer: auth === 'cognito' ? this.userPoolAuthorizer() : auth };
  }

  /** Created with the first 'cognito' route: CDK fails the synth if an authorizer has no routes */
  private userPoolAuthorizer(): CognitoUserPoolsAuthorizer {
    this.cognitoAuthorizer ??= new CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [this.userPool],
    });
    return this.cognitoAuthorizer;
  }
}

/** Fails the synth on a path that breaks the naming rules */
function assertPath(path: string): void {
  const [version, ...segments] = path.split('/');
  if (!VERSION_SEGMENT.test(version) || segments.length === 0) {
    throw new Error(`Route "${path}" must start with a version and have a resource after it, e.g. "v1/orders"`);
  }
  const wrongSegment = segments.find((segment) => !PATH_SEGMENT.test(segment));
  if (wrongSegment !== undefined) {
    throw new Error(`Route "${path}": "${wrongSegment}" must be kebab-case (user-profiles) or a {camelCase} parameter`);
  }
}
