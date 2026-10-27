import middy, { MiddlewareObj } from '@middy/core';
import httpCors from '@middy/http-cors';
import httpErrorHandler from '@middy/http-error-handler';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { error, log } from '../helper/logger';
import type { ApiGatewayHandler, LambdaEvent } from './types';

type Handler<Event extends LambdaEvent<unknown, unknown, unknown>, Result> = (
  event: Event,
  context: Context
) => Promise<Result>;

type Middleware = MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult>;

/** Same as logEvent in template.sls */
const logEvent = (): Middleware => ({
  before: ({ event }) => log('EVENT: ', event),
});

/**
 * httpErrorHandler sends the error message as plain text. This turns it into {"message": "..."}, so every error
 * response is JSON, the errors of middy itself too (422 for a malformed JSON body)
 */
const jsonErrorBody = (): Middleware => ({
  onError: ({ response }) => {
    if (response?.headers?.['Content-Type'] === 'text/plain') {
      response.body = JSON.stringify({ message: response.body });
      response.headers['Content-Type'] = 'application/json';
    }
  },
});

/**
 * Same as restApiHandler in template.sls: the handler gets the parsed request and returns a plain object, middy turns
 * it into the HTTP response. Throw HttpError for a 4xx response, any other error becomes a 500.
 * body/query types are not checked at runtime, so validate the input in the handler.
 * Middlewares: `before` runs in the order of use(), `after` and `onError` in the reverse order
 */
export function restApiHandler<Event extends LambdaEvent<unknown, unknown, unknown>, Result>(
  handler: Handler<Event, Result>
): ApiGatewayHandler {
  return (
    middy<APIGatewayProxyEvent, APIGatewayProxyResult>()
      .use(logEvent())
      /** Parses the body whatever the Content-Type: curl -d sends a form type, and GET requests have no body */
      .use(httpJsonBodyParser<APIGatewayProxyEvent>({ disableContentTypeCheck: true }))
      /** With REST API + lambda proxy, the lambda itself must return the CORS header */
      .use(httpCors({ origin: '*' }))
      .use(
        httpResponseSerializer({
          serializers: [{ regex: /^application\/json$/, serializer: ({ body }) => JSON.stringify(body) }],
          defaultContentType: 'application/json',
        })
      )
      .use(jsonErrorBody())
      /** Logs the error. 4xx: the message of the HttpError goes to the client. Anything else: a 500 without details */
      .use(httpErrorHandler({ logger: error, fallbackMessage: 'Internal Server Error' }))
      .handler(async (event, context) => {
        const result: Result = await handler(toLambdaEvent(event) as Event, context);
        /**
         * Always a full response: middy treats a result with a statusCode, body or headers field as the response
         * itself, and answers 500 when the handler returns nothing. httpResponseSerializer turns the body into JSON
         */
        return { statusCode: 200, body: result ?? null } as unknown as APIGatewayProxyResult;
      })
  );
}

/** What the handler gets: httpJsonBodyParser has already turned the body into an object */
function toLambdaEvent(event: APIGatewayProxyEvent): LambdaEvent {
  return {
    body: event.body ?? {},
    path: event.pathParameters ?? {},
    query: event.queryStringParameters ?? {},
    headers: event.headers ?? {},
    claims: event.requestContext?.authorizer?.claims ?? {},
  };
}
