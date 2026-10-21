import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

type Params = Record<string, string | undefined>;

export interface LambdaEvent<Body = unknown, PathParams = Params, QueryParams = Params> {
  body: Body;
  path: PathParams;
  query: QueryParams;
  headers: Params;
}

/** Handler that API Gateway calls directly (lambda proxy integration) */
export type ApiGatewayHandler = (event: APIGatewayProxyEvent, context: Context) => Promise<APIGatewayProxyResult>;
