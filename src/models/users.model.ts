import { AdminGetUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { getEnv } from '../helper/environment';

const cognito: CognitoIdentityProviderClient = new CognitoIdentityProviderClient();

/**
 * The access token has no email, so it comes from the user pool. username is the claim of the token: in a pool
 * with sign-in by email it is a generated id, not the email. A real service usually keeps the profile in its own table
 */
export async function getUserEmail(username: string): Promise<string | undefined> {
  const { UserAttributes } = await cognito.send(
    new AdminGetUserCommand({
      UserPoolId: getEnv('USER_POOL_ID'),
      Username: username,
    })
  );
  return UserAttributes?.find(({ Name }) => Name === 'email')?.Value;
}
