import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  IAuthorizer,
  LambdaIntegration,
  MethodOptions,
  ResponseType,
  RestApi,
  TokenAuthorizer,
} from 'aws-cdk-lib/aws-apigateway';
import { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { StageConfig } from '../environments/types';
import { resourceName } from '../utils';
import { AppFunction } from './shared/app-function';

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

/** Who may call the route */
export enum AuthType {
  /** Anyone */
  NONE = 'none',
  /** Signed-in users, with an ID token of the user pool in the Authorization header */
  COGNITO = 'cognito',
  /** The same token, but our lambda checks it (src/api/authorizer/handler.ts): the place for custom rules */
  LAMBDA = 'lambda',
  /** Other services and scripts, with requests signed by IAM credentials (SigV4) */
  IAM = 'iam',
}

/** An AuthType, or any authorizer object: another lambda authorizer, another user pool */
export type RouteAuth = AuthType | IAuthorizer;

export interface Route {
  method: HttpMethod;
  /** 'v1/users/{userId}/orders': a version first, then kebab-case segments and {camelCase} parameters */
  path: string;
  /** An AppFunction knows its file and export, so tools/generate-openapi.ts can find the contract of the route */
  handler: AppFunction;
  /** Required on purpose: a public route says AuthType.NONE out loud */
  auth: RouteAuth;
}

const VERSION_SEGMENT = /^v\d+$/;
const PATH_SEGMENT = /^([a-z0-9]+(-[a-z0-9]+)*|\{[a-z][a-zA-Z0-9]*\})$/;

interface ApiProps {
  config: StageConfig;
  userPool: IUserPool;
  /** The lambda authorizer accepts only the tokens of this client */
  userPoolClient: IUserPoolClient;
}

/** REST API (API Gateway v1). In Serverless Framework it was created implicitly from events.http */
export class Api extends Construct {
  readonly restApi: RestApi;
  /** Every route in the order of addRoute(): tools/generate-openapi.ts builds the spec from them */
  readonly routes: Route[] = [];
  private readonly config: StageConfig;
  private readonly userPool: IUserPool;
  private readonly userPoolClient: IUserPoolClient;
  private cognitoAuthorizer?: CognitoUserPoolsAuthorizer;
  private tokenAuthorizer?: TokenAuthorizer;

  constructor(scope: Construct, id: string, { config, userPool, userPoolClient }: ApiProps) {
    super(scope, id);
    this.config = config;
    this.userPool = userPool;
    this.userPoolClient = userPoolClient;

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

  /** api.addRoute({ method: HttpMethod.GET, path: 'v1/users/me', handler: fn, auth: AuthType.COGNITO }) */
  addRoute(route: Route): void {
    const { method, path, handler, auth } = route;
    assertPath(path);
    this.restApi.root.resourceForPath(path).addMethod(method, new LambdaIntegration(handler), this.methodOptions(auth));
    this.routes.push(route);
  }

  private methodOptions(auth: RouteAuth): MethodOptions {
    if (auth === AuthType.NONE) {
      return { authorizationType: AuthorizationType.NONE };
    }
    if (auth === AuthType.IAM) {
      return { authorizationType: AuthorizationType.IAM };
    }
    if (auth === AuthType.COGNITO) {
      return { authorizer: this.userPoolAuthorizer() };
    }
    if (auth === AuthType.LAMBDA) {
      return { authorizer: this.lambdaAuthorizer() };
    }
    /** CDK takes the auth type from the authorizer: COGNITO_USER_POOLS, or CUSTOM for a lambda authorizer */
    return { authorizer: auth };
  }

  /** Created with the first AuthType.COGNITO route: CDK fails the synth if an authorizer has no routes */
  private userPoolAuthorizer(): CognitoUserPoolsAuthorizer {
    this.cognitoAuthorizer ??= new CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [this.userPool],
    });
    return this.cognitoAuthorizer;
  }

  /**
   * Created with the first AuthType.LAMBDA route, like the Cognito one. It reads the Authorization header and caches
   * its answer for 5 minutes per token, the same defaults as the built-in authorizer
   */
  private lambdaAuthorizer(): TokenAuthorizer {
    this.tokenAuthorizer ??= new TokenAuthorizer(this, 'LambdaAuthorizer', {
      handler: new AppFunction(this, 'LambdaAuthorizerFunction', {
        config: this.config,
        name: 'authorizer',
        entry: 'src/api/authorizer/handler.ts',
        handler: 'authorize',
        environment: {
          USER_POOL_ID: this.userPool.userPoolId,
          USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
        },
      }),
    });
    return this.tokenAuthorizer;
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
