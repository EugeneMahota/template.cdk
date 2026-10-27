import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib/core';
import { AccountRecovery, UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { StageConfig } from '../environments/types';
import { resourceName } from '../utils';

/**
 * Cognito user pool for the routes with auth: 'cognito' (see api.ts). Users sign in with email and password and get
 * an ID token, the API authorizer checks it. How to create a test user and get a token: README → Check after a deploy
 */
export class Auth extends Construct {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, { config }: { config: StageConfig }) {
    super(scope, id);

    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: resourceName(config, config.names.userPool),
      /** The email is the username. This and the next setting can't change after the pool is created */
      signInAliases: { email: true },
      /** Me@example.com and me@example.com are the same user */
      signInCaseSensitive: false,
      /** Only an admin creates users. true → anyone can sign up from the app */
      selfSignUpEnabled: false,
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      /** Same as the tables: in prod the users stay when the stack is deleted, and nobody can delete the pool */
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      deletionProtection: config.retainData,
    });

    /**
     * Client for the frontend and mobile apps: public, without a secret.
     * If you add a custom attribute that gives access (custom:role), leave it out of writeAttributes:
     * by default users can change every attribute with their own token
     */
    this.userPoolClient = this.userPool.addClient('AppClient', {
      userPoolClientName: resourceName(config, config.names.userPoolClient),
      /** SRP for the apps (Amplify uses it), password for getting a token with the AWS CLI */
      authFlows: { userSrp: true, userPassword: true },
      /** "Incorrect username or password" instead of "User does not exist" */
      preventUserExistenceErrors: true,
      /** No hosted sign-in page (Cognito domain) yet. Without this CDK turns on OAuth with an example.com callback */
      disableOAuth: true,
    });

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
  }
}
