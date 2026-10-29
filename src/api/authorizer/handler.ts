import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import { USER_SCOPE } from '../../helper/auth';
import { getEnv } from '../../helper/environment';
import { warn } from '../../helper/logger';

/** An access token: issued for our app client (client_id) and with the scope of a signed-in user */
const createVerifier = () =>
  CognitoJwtVerifier.create({
    userPoolId: getEnv('USER_POOL_ID'),
    clientId: getEnv('USER_POOL_CLIENT_ID'),
    tokenUse: 'access',
    scope: USER_SCOPE,
  });

let verifier: ReturnType<typeof createVerifier> | undefined;

/** Created on the first call and kept: it downloads the signing keys of the user pool once and caches them */
export function getVerifier(): ReturnType<typeof createVerifier> {
  verifier ??= createVerifier();
  return verifier;
}

/**
 * Lambda (TOKEN) authorizer for the routes with AuthType.LAMBDA. For now it checks the same as the built-in Cognito
 * authorizer: the access token in the Authorization header, its signature and expiry, the user pool, the app client
 * and the scope. Handlers get the claims of the token, like with the built-in one. An access token has no email or
 * other profile attributes: only sub, username, cognito:groups, client_id and scope
 */
export const authorize = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  let claims: Record<string, unknown>;
  try {
    claims = await getVerifier().verify(event.authorizationToken);
  } catch (error) {
    /** The reason only: the token itself never goes to the logs */
    warn('Token rejected: ', (error as Error).message);
    /** With exactly this message API Gateway answers 401, like the built-in authorizer */
    throw new Error('Unauthorized');
  }

  /**
   * The place for custom logic: the token is valid, and claims.sub is the caller. For example, load the user from
   * DynamoDB and refuse a blocked account, or check a role (claims['cognito:groups']). To refuse, throw
   * new Error('Unauthorized') for a 401, or return the answer below with Effect: 'Deny' for a 403.
   * API Gateway caches the answer for 5 minutes per token, so it must not depend on the route
   */

  return {
    principalId: String(claims.sub),
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Allow', Resource: allRoutesOf(event.methodArn) }],
    },
    context: toContext(claims),
  };
};

/**
 * arn:aws:execute-api:<region>:<account>:<api-id>/<stage>/GET/v1/users/me → …/<stage>/*.
 * The answer is cached per token, so it allows every route: an answer for one route would refuse the others
 */
function allRoutesOf(methodArn: string): string {
  const [api, stage] = methodArn.split('/');
  return `${api}/${stage}/*`;
}

/** The context takes flat values only, so every claim becomes a string (groups: "admins,editors") */
function toContext(claims: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(claims).map(([name, value]) => [name, Array.isArray(value) ? value.join(',') : String(value)])
  );
}
