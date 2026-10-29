import { getUserId } from '../../helper/auth';
import { runLocally } from '../../helper/run-locally';
import { getUserEmail } from '../../models/users.model';
import { restApiHandler } from '../rest-api-wrapper';
import type { ApiGatewayHandler, LambdaEvent } from '../types';

type Me = { id: string; email?: string };

export const getMe: ApiGatewayHandler = restApiHandler({}, async ({ claims }: LambdaEvent): Promise<Me> => {
  const id: string = getUserId(claims);
  return { id, email: await getUserEmail(claims.username ?? id) };
});

if (require.main === module) {
  /** USER_POOL_ID in .env, and the id of a real user of the pool: getMe reads the email from it */
  runLocally(getMe, { claims: { sub: '<user id>', username: '<user id>' } }).then();
}
