import middy, { MiddlewareObj } from '@middy/core';
import httpCors from '@middy/http-cors';
import httpErrorHandler from '@middy/http-error-handler';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { HttpError } from '../helper/http-error';
import { error, log } from '../helper/logger';
import type { ApiGatewayHandler, LambdaEvent, RequestContract } from './types';

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
 * The Joi schemas of the contract check body, query and path before the handler runs: a 400 with the Joi message.
 * Middlewares: `before` runs in the order of use(), `after` and `onError` in the reverse order
 */
export function restApiHandler<Event extends LambdaEvent<unknown, unknown, unknown>, Result>(
  contract: RequestContract,
  handler: Handler<Event, Result>
): ApiGatewayHandler {
  const middyfied = middy<APIGatewayProxyEvent, APIGatewayProxyResult>()
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
      const request: LambdaEvent = validate(contract, toLambdaEvent(event));
      const result: Result = await handler(request as Event, context);
      /**
       * Always a full response: middy treats a result with a statusCode, body or headers field as the response
       * itself, and answers 500 when the handler returns nothing. httpResponseSerializer turns the body into JSON
       */
      return { statusCode: 200, body: result ?? null } as unknown as APIGatewayProxyResult;
    });
  /** tools/generate-openapi.ts reads the contract from the handler */
  return Object.assign(middyfied, { contract });
}

/** Checks body, query and path against the contract and returns them as Joi converted them: "5" → 5 */
function validate(contract: RequestContract, request: LambdaEvent): LambdaEvent {
  const validated: LambdaEvent = { ...request };
  for (const part of ['body', 'query', 'path'] as const) {
    const result = contract[part]?.validate(request[part]);
    if (result?.error) {
      throw new HttpError(400, result.error.message);
    }
    if (result) {
      validated[part] = result.value;
    }
  }
  return validated;
}

/** What the handler gets: httpJsonBodyParser has already turned the body into an object */
function toLambdaEvent(event: APIGatewayProxyEvent): LambdaEvent {
  return {
    body: event.body ?? {},
    path: event.pathParameters ?? {},
    query: event.queryStringParameters ?? {},
    headers: event.headers ?? {},
    /** The Cognito authorizer puts the claims into authorizer.claims, our lambda authorizer into authorizer itself */
    claims: event.requestContext?.authorizer?.claims ?? event.requestContext?.authorizer ?? {},
  };
}
