/**
 * Runs `cdk bootstrap` once per account and region: npm run deploy:dev calls it before the deploy, so a new account
 * doesn't fail with "Has the environment been bootstrapped?". The account comes from the credentials (AWS_PROFILE from
 * the shell or from .env), the region from the stage config. When the CDKToolkit stack is already there, it does nothing
 */
import { execFileSync } from 'node:child_process';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { buildConfig } from '../infra/environments/env-builder';
import type { StageConfig } from '../infra/environments/types';

/** The default name of the bootstrap stack (cdk bootstrap --toolkit-stack-name) */
const TOOLKIT_STACK = 'CDKToolkit';

async function main(): Promise<void> {
  const stage: string | undefined = process.argv[2];
  const config: StageConfig = buildConfig(stage);
  if (await isBootstrapped(config.awsRegion)) {
    return;
  }
  const profile: string = process.env.AWS_PROFILE ?? 'default credentials';
  console.log(`${TOOLKIT_STACK} is not found in ${config.awsRegion} (${profile}): running cdk bootstrap`);
  execFileSync('npx', ['cdk', 'bootstrap', '-c', `stage=${stage}`], { stdio: 'inherit' });
}

async function isBootstrapped(region: string): Promise<boolean> {
  const client = new CloudFormationClient({ region });
  try {
    await client.send(new DescribeStacksCommand({ StackName: TOOLKIT_STACK }));
    return true;
  } catch (error) {
    // A missing stack is a ValidationError "Stack with id CDKToolkit does not exist"; anything else (no credentials,
    // AccessDenied) must stop the deploy
    if (error instanceof Error && error.name === 'ValidationError' && error.message.includes('does not exist')) {
      return false;
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
