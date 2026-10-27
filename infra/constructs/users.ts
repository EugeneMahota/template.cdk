import { Construct } from 'constructs';
import { StageConfig } from '../environments/types';
import { Api } from './api';
import { AppFunction } from './shared/app-function';

interface UsersProps {
  config: StageConfig;
  api: Api;
}

/** GET /v1/users/me → the signed-in user, taken from the token (the "me" model, see src/helper/auth.ts) */
export class Users extends Construct {
  constructor(scope: Construct, id: string, { config, api }: UsersProps) {
    super(scope, id);

    const getMe: AppFunction = new AppFunction(this, 'GetMe', {
      config,
      name: 'getMe',
      entry: 'src/api/users/handler.ts',
      handler: 'getMe',
    });
    api.addRoute({ method: 'GET', path: 'v1/users/me', handler: getMe, auth: 'cognito' });
  }
}
