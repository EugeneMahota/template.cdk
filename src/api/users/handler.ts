import { getUserId } from '../../helper/auth';
import { runLocally } from '../../helper/run-locally';
import { restApiHandler } from '../rest-api-wrapper';
import type { ApiGatewayHandler, LambdaEvent } from '../types';

type Me = { id: string; email?: string };

export const getMe: ApiGatewayHandler = restApiHandler(async ({ claims }: LambdaEvent): Promise<Me> => ({
  id: getUserId(claims),
  email: claims.email,
}));

if (require.main === module) {
  runLocally(getMe, { claims: { sub: 'local-user', email: 'me@example.com' } }).then();
}
