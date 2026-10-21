import { describe, it } from 'node:test';
import { App } from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { buildConfig } from '../infra/environments/env-builder';
import { ServiceStack } from '../infra/service-stack';

/** Synthesizes the stack into a CloudFormation template: no deploy, no AWS credentials */
function synth(stage: string): Template {
  const config = buildConfig(stage);
  const stack = new ServiceStack(new App(), 'TestStack', { config, env: { region: config.awsRegion } });
  return Template.fromStack(stack);
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

  it('keeps the table after stack deletion only in prod', () => {
    dev.hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Delete' });
    synth('prod').hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain' });
  });
});
