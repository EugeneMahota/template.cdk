import type { APIGatewayProxyResult, Context } from 'aws-lambda';
import { HttpError } from '../helper/http-error';
import { error, log } from '../helper/logger';
import type { ApiGatewayHandler, LambdaEvent } from './types';

type Handler<Event extends LambdaEvent<unknown, unknown, unknown>, Result> = (
  event: Event,
  context: Context
) => Promise<Result>;

/**
 * Replacement for middy from template.sls, with no dependencies: parses the JSON body, logs the event,
 * serializes the response and turns errors into HTTP responses.
 * body/query types are not checked at runtime, so validate the input in the handler.
 */
export function restApiHandler<Event extends LambdaEvent<unknown, unknown, unknown>, Result>(
  handler: Handler<Event, Result>
): ApiGatewayHandler {
  return async (event, context) => {
    log('EVENT: ', event);
    try {
      const request = {
        body: parseBody(event.body),
        path: event.pathParameters ?? {},
        query: event.queryStringParameters ?? {},
        headers: event.headers ?? {},
      } as Event;
      return response(200, await handler(request, context));
    } catch (e) {
      if (e instanceof HttpError) {
        return response(e.statusCode, { message: e.message });
      }
      error(e);
      return response(500, { message: 'Internal Server Error' });
    }
  };
}

function parseBody(body: string | null): unknown {
  if (!body) {
    return {};
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Body must be a valid JSON');
  }
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      /** With REST API + lambda proxy, the lambda itself must return the CORS header */
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body ?? null),
  };
}
