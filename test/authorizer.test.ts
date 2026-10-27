import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { before, describe, it } from 'node:test';
import type { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import type { Jwks } from 'aws-jwt-verify/jwk';
import { authorize, getVerifier } from '../src/api/authorizer/handler';

const USER_POOL_ID = 'eu-west-1_TestPool1';
const CLIENT_ID = 'test-client';
const METHOD_ARN = 'arn:aws:execute-api:eu-west-1:123456789012:abc123/dev/GET/v1/users/me';

/** Our own key instead of the one of the user pool: the verifier gets it instead of downloading the JWKS */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

/** An ID token like the ones Cognito gives, signed with our key */
function idToken(claims: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'user-1',
    email: 'me@example.com',
    'cognito:groups': ['admins', 'editors'],
    aud: CLIENT_ID,
    iss: `https://cognito-idp.eu-west-1.amazonaws.com/${USER_POOL_ID}`,
    token_use: 'id',
    auth_time: now,
    iat: now,
    exp: now + 3600,
    ...claims,
  };
  const encode = (part: object): string => Buffer.from(JSON.stringify(part)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })}.${encode(payload)}`;
  return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url')}`;
}

function event(token: string): APIGatewayTokenAuthorizerEvent {
  return { type: 'TOKEN', authorizationToken: token, methodArn: METHOD_ARN };
}

describe('lambda authorizer', () => {
  before(() => {
    process.env.USER_POOL_ID = USER_POOL_ID;
    process.env.USER_POOL_CLIENT_ID = CLIENT_ID;
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
    getVerifier().cacheJwks({ keys: [jwk] } as Jwks);
  });

  it('allows every route of the stage for a valid ID token and passes its claims', async () => {
    const result = await authorize(event(idToken()));

    assert.equal(result.principalId, 'user-1');
    assert.deepEqual(result.policyDocument.Statement, [
      {
        Action: 'execute-api:Invoke',
        Effect: 'Allow',
        Resource: 'arn:aws:execute-api:eu-west-1:123456789012:abc123/dev/*',
      },
    ]);
    assert.equal(result.context?.email, 'me@example.com');
    assert.equal(result.context?.['cognito:groups'], 'admins,editors');
  });

  it('answers 401 to the tokens that the built-in authorizer refuses', async () => {
    const wrongTokens = [
      idToken({ exp: Math.floor(Date.now() / 1000) - 60 }),
      idToken({ aud: 'another-client' }),
      idToken({ token_use: 'access' }),
      'not-a-jwt',
    ];
    for (const token of wrongTokens) {
      await assert.rejects(authorize(event(token)), { message: 'Unauthorized' });
    }
  });
});
