import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type { ApiGatewayHandler } from '../api/types';
import { log } from './logger';

type LocalRequest = {
  body?: unknown;
  headers?: Record<string, string>;
  path?: Record<string, string>;
  query?: Record<string, string>;
  /** Token claims for routes with auth: 'cognito', as the authorizer passes them: { sub: '<user id>', email: '...' } */
  claims?: Record<string, string>;
};

/**
 * Runs a REST handler on your machine: npm run local -- src/api/users/handler.ts
 * Environment variables come from .env (see .env.example). AWS resources are the real ones of the deployed stage.
 */
export async function runLocally(
  handler: ApiGatewayHandler,
  { body, headers, path, query, claims }: LocalRequest
): Promise<void> {
  /** Only the fields that restApiHandler reads */
  const requestContext: Partial<APIGatewayProxyEvent['requestContext']> = { authorizer: { claims } };
  const event: Partial<APIGatewayProxyEvent> = {
    body: JSON.stringify(body ?? {}),
    headers: { 'Content-Type': 'application/json', ...headers },
    pathParameters: path ?? null,
    queryStringParameters: query ?? null,
    requestContext: requestContext as APIGatewayProxyEvent['requestContext'],
  };
  const context: Partial<Context> = {
    functionName: 'local',
    awsRequestId: 'local',
    getRemainingTimeInMillis: () => 30_000,
  };

  log('RESPONSE: ', await handler(event as APIGatewayProxyEvent, context as Context));
}
