/**
 * Id of the signed-in user: `sub` of the token that the authorizer has checked.
 * The "me" model: take the user only from here, never from the path or the body (/v1/users/me/orders, not
 * /v1/users/{userId}/orders), and answer 404 for a record of another user, as if it didn't exist
 */
export function getUserId(claims: Record<string, string | undefined>): string {
  const userId: string | undefined = claims.sub;
  if (!userId) {
    /** Not a client error: the route was added without AuthType.COGNITO or LAMBDA, so nobody checked a token */
    throw new Error('No user in the request: add the route with AuthType.COGNITO or AuthType.LAMBDA');
  }
  return userId;
}
