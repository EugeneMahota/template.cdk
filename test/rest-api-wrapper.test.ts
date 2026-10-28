import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import Joi from 'joi';
import { restApiHandler } from '../src/api/rest-api-wrapper';
import type { LambdaEvent } from '../src/api/types';

/** An API Gateway event with only the fields that restApiHandler reads */
function event(fields: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    pathParameters: null,
    queryStringParameters: null,
    ...fields,
  } as APIGatewayProxyEvent;
}

const context = {} as Context;

describe('restApiHandler', () => {
  const handler = restApiHandler(
    { query: Joi.object({ limit: Joi.number().integer().min(1).required() }) },
    async ({ query }: LambdaEvent<unknown, unknown, { limit: number }>) => ({ limit: query.limit })
  );

  it('passes the values that Joi converted to the handler', async () => {
    const response = await handler(event({ queryStringParameters: { limit: '5' } }), context);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { limit: 5 });
  });

  it('answers 400 with the Joi message when the request breaks the contract', async () => {
    const response = await handler(event({ queryStringParameters: { limit: '0' } }), context);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), { message: '"limit" must be greater than or equal to 1' });
  });

  it('keeps the contract on the handler for the OpenAPI generator', () => {
    assert.ok(handler.contract.query);
  });
});
