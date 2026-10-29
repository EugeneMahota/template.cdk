import { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { StageConfig } from '../environments/types';
import { Api, AuthType, HttpMethod } from './api';
import { AppFunction } from './shared/app-function';

interface UsersProps {
  config: StageConfig;
  api: Api;
  userPool: IUserPool;
}

/**
 * GET /v1/users/me → the signed-in user, taken from the token (the "me" model, see src/helper/auth.ts). The access
 * token has no email, so the lambda reads it from the user pool
 */
export class Users extends Construct {
  constructor(scope: Construct, id: string, { config, api, userPool }: UsersProps) {
    super(scope, id);

    const getMe: AppFunction = new AppFunction(this, 'GetMe', {
      config,
      name: 'getMe',
      entry: 'src/api/users/handler.ts',
      handler: 'getMe',
      environment: { USER_POOL_ID: userPool.userPoolId },
    });
    userPool.grant(getMe, 'cognito-idp:AdminGetUser');

    api.addRoute({
      method: HttpMethod.GET,
      path: 'v1/users/me',
      handler: getMe,
      auth: AuthType.LAMBDA,
    });
  }
}
