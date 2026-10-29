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

/** A JWT like the ones Cognito gives, signed with our key */
function token(payload: Record<string, unknown>): string {
  const encode = (part: object): string => Buffer.from(JSON.stringify(part)).toString('base64url');
  const unsigned = `${encode({
    alg: 'RS256',
    kid: 'test-key',
    typ: 'JWT',
  })}.${encode(payload)}`;
  return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url')}`;
}

/** An access token of a signed-in user: no aud and no email, but client_id and scope */
function accessToken(claims: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return token({
    sub: 'user-1',
    username: 'user-1',
    'cognito:groups': ['admins', 'editors'],
    client_id: CLIENT_ID,
    scope: 'aws.cognito.signin.user.admin',
    iss: `https://cognito-idp.eu-west-1.amazonaws.com/${USER_POOL_ID}`,
    token_use: 'access',
    auth_time: now,
    iat: now,
    exp: now + 3600,
    ...claims,
  });
}

/** An ID token of the same user: valid, but for the frontend, not for the API */
function idToken(): string {
  const now = Math.floor(Date.now() / 1000);
  return token({
    sub: 'user-1',
    email: 'me@example.com',
    aud: CLIENT_ID,
    iss: `https://cognito-idp.eu-west-1.amazonaws.com/${USER_POOL_ID}`,
    token_use: 'id',
    auth_time: now,
    iat: now,
    exp: now + 3600,
  });
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

  it('allows every route of the stage for a valid access token and passes its claims', async () => {
    const result = await authorize(event(accessToken()));

    assert.equal(result.principalId, 'user-1');
    assert.deepEqual(result.policyDocument.Statement, [
      {
        Action: 'execute-api:Invoke',
        Effect: 'Allow',
        Resource: 'arn:aws:execute-api:eu-west-1:123456789012:abc123/dev/*',
      },
    ]);
    assert.equal(result.context?.username, 'user-1');
    assert.equal(result.context?.['cognito:groups'], 'admins,editors');
  });

  it('answers 401 to the tokens that the built-in authorizer refuses', async () => {
    const wrongTokens = [
      accessToken({ exp: Math.floor(Date.now() / 1000) - 60 }),
      accessToken({ client_id: 'another-client' }),
      accessToken({ scope: 'openid' }),
      idToken(),
      'not-a-jwt',
    ];
    for (const wrongToken of wrongTokens) {
      await assert.rejects(authorize(event(wrongToken)), { message: 'Unauthorized' });
    }
  });
});
