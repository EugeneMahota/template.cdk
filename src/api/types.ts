import type { MiddyfiedHandler } from '@middy/core';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

type Params = Record<string, string | undefined>;

export interface LambdaEvent<Body = unknown, PathParams = Params, QueryParams = Params> {
  body: Body;
  path: PathParams;
  query: QueryParams;
  headers: Params;
  /** Claims of the token that the authorizer has checked: only on routes with auth: 'cognito', empty on the others */
  claims: Params;
}

/** Handler that API Gateway calls directly (lambda proxy integration), wrapped with middy by restApiHandler() */
export type ApiGatewayHandler = MiddyfiedHandler<APIGatewayProxyEvent, APIGatewayProxyResult>;
