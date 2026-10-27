import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { App, Stack } from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { TokenAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { Api } from '../infra/constructs/api';
import { buildConfig } from '../infra/environments/env-builder';
import { ServiceStack } from '../infra/service-stack';

/** Synthesizes the stack into a CloudFormation template: no deploy, no AWS credentials */
function synth(stage: string): Template {
  const config = buildConfig(stage);
  const stack = new ServiceStack(new App(), 'TestStack', { config, env: { region: config.awsRegion } });
  return Template.fromStack(stack);
}

/** { 'GET /v1/users/me': 'COGNITO_USER_POOLS', ... }: every route of the API with its auth, without OPTIONS */
function routeAuth(template: Template): Record<string, string> {
  const resources = template.findResources('AWS::ApiGateway::Resource');
  const pathOf = (id: string): string => {
    const { ParentId, PathPart } = resources[id].Properties;
    return `${ParentId.Ref ? pathOf(ParentId.Ref) : ''}/${PathPart}`;
  };
  return Object.fromEntries(
    Object.values(template.findResources('AWS::ApiGateway::Method'))
      .map(({ Properties }) => Properties)
      .filter(({ HttpMethod }) => HttpMethod !== 'OPTIONS')
      .map(({ HttpMethod, ResourceId, AuthorizationType }) => [
        `${HttpMethod} ${pathOf(ResourceId.Ref)}`,
        AuthorizationType,
      ])
  );
}

describe('ServiceStack', () => {
  const dev: Template = synth('dev');

  it('creates logs table with GSI by eventCode', () => {
    dev.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'template-cdk-logs-dev',
      GlobalSecondaryIndexes: [Match.objectLike({ IndexName: 'eventCode-createdAt-index' })],
    });
  });

  it('moves failed queue messages to DLQ after 2 attempts', () => {
    dev.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'template-cdk-queue-example-dev',
      RedrivePolicy: { maxReceiveCount: 2, deadLetterTargetArn: Match.anyValue() },
    });
  });

  it('keeps tables and users after stack deletion only in prod', () => {
    const prod: Template = synth('prod');
    for (const type of ['AWS::DynamoDB::Table', 'AWS::Cognito::UserPool']) {
      dev.hasResource(type, { DeletionPolicy: 'Delete' });
      prod.hasResource(type, { DeletionPolicy: 'Retain' });
    }
    prod.hasResourceProperties('AWS::Cognito::UserPool', { DeletionProtection: 'ACTIVE' });
  });

  /** Every route of the API with its auth: a change of who may call what shows up in the merge request */
  it('gives each route the auth it asks for', () => {
    assert.deepEqual(routeAuth(dev), {
      'POST /v1/test-function': 'NONE',
      'GET /v1/users/me': 'COGNITO_USER_POOLS',
      'POST /v1/logs': 'COGNITO_USER_POOLS',
      'GET /v1/logs': 'COGNITO_USER_POOLS',
      'POST /v1/internal/add-queue-item': 'AWS_IAM',
      'POST /v1/internal/schedule-delayed-function': 'AWS_IAM',
    });
    dev.resourceCountIs('AWS::ApiGateway::Authorizer', 1);
  });

  it('adds the CORS header to errors that API Gateway returns itself', () => {
    for (const ResponseType of ['DEFAULT_4XX', 'DEFAULT_5XX']) {
      dev.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
        ResponseType,
        ResponseParameters: { 'gatewayresponse.header.Access-Control-Allow-Origin': "'*'" },
      });
    }
  });
});

describe('Api', () => {
  /** An Api in an empty stack, with an imported function as the handler: nothing gets bundled */
  function emptyApi() {
    const stack = new Stack();
    const api = new Api(stack, 'Api', {
      config: buildConfig('dev'),
      userPool: UserPool.fromUserPoolId(stack, 'UserPool', 'eu-west-1_test'),
    });
    const handler = LambdaFunction.fromFunctionName(stack, 'Handler', 'handler');
    return { stack, api, handler };
  }

  it('rejects paths that break the naming rules', () => {
    const { api, handler } = emptyApi();
    const wrongPaths: [string, RegExp][] = [
      ['users/me', /must start with a version/],
      ['v1', /must start with a version/],
      ['v1/getUser', /"getUser" must be kebab-case/],
      ['v1/users/{user_id}', /"\{user_id\}" must be kebab-case/],
    ];
    for (const [path, error] of wrongPaths) {
      assert.throws(() => api.addRoute({ method: 'GET', path, handler, auth: 'none' }), error);
    }
  });

  it('takes the auth type from any authorizer', () => {
    const { stack, api, handler } = emptyApi();
    const auth = new TokenAuthorizer(stack, 'TokenAuthorizer', { handler });
    api.addRoute({ method: 'GET', path: 'v1/users/{userId}/reports', handler, auth });

    Template.fromStack(stack).hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'GET',
      AuthorizationType: 'CUSTOM',
    });
  });
});
