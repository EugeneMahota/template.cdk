# template.cdk

A service skeleton on AWS CDK v2 + TypeScript, in the style of [template.sls](https://github.com/EugeneMahota/template.sls):
infrastructure and environment config live in `infra/`, business logic lives in `src/`. The only dependencies are CDK,
AWS SDK and build tools.

## Structure

```
infra/                        infrastructure (in template.sls: serverless.ts + serverless/)
├── app.ts                    entry point: reads the stage, creates the stack
├── service-stack.ts          the stack, built from parts (like joinParts)
├── utils.ts                  resourceName(): template-cdk-logs-dev
├── environments/             config: common + overrides for dev / staging / uat / prod
└── constructs/               parts of the stack (in template.sls: serverless/parts/)
    ├── app-function.ts       shared lambda settings (provider + build.esbuild)
    ├── api.ts                REST API (in SLS it was created from events.http)
    ├── test-functions.ts     POST /api/test-function
    ├── event-logs.ts         DynamoDB + GSI and SNS: POST and GET /api/logs
    ├── sqs.ts                queue + DLQ: POST /api/add-queue-item
    └── step-functions.ts     delayed run: POST /api/schedule-delayed-function
src/                          business logic, knows nothing about CDK
├── api/                      handlers and a REST wrapper (instead of middy)
├── helper/                   env, logger, HTTP errors, local run
└── models/                   DynamoDB via AWS SDK (instead of dynamoose)
test/                         infrastructure tests: check the CloudFormation template without a deploy
```

## How it maps to template.sls

| template.sls | template.cdk |
|---|---|
| `serverless/parts/*.ts` + `deepmerge` | `infra/constructs/*.ts`: construct classes |
| `environment.*.ts` → `${param:...}` | `environment.*.ts` → typed `StageConfig` |
| `Arn()`, `Ref()`, `Fn::Sub` | object properties: `queue.queueUrl`, `table.tableName` |
| `provider.iam.role.statements`, one role for all functions | `table.grantWriteData(fn)`: each lambda has its own role |
| `events: [{ http }]` | `api.addRoute('POST', 'logs', fn)` |
| `events: [{ sqs }]` | `fn.addEventSource(new SqsEventSource(queue))` |
| `serverless-step-functions` plugin | `new Wait(...).next(new LambdaInvoke(...))` |
| `build.esbuild` | `NodejsFunction` bundles with esbuild on its own |

## Stages

`dev`, `staging`, `uat`, `prod`. Each stage has a file in `infra/environments/` that overrides `environment.common.ts`.
`staging` and `uat` have no overrides yet, so they use the common settings, like `dev`. `prod` minifies the code,
turns off source maps and keeps the tables when the stack is deleted.

Each stage is a separate stack: `template-cdk-dev`, `template-cdk-staging`, `template-cdk-uat`, `template-cdk-prod`.
The stage is passed as context: `cdk deploy -c stage=uat`. The default is `dev` (`cdk.json` → `context.stage`).

## First deploy

1. `npm install`
2. The AWS profile is set in `cdk.json` (`"profile"`), the region in `infra/environments/environment.common.ts`.
3. Once per account and region: `npm run bootstrap`. It creates the `CDKToolkit` stack with a bucket for lambda
   bundles and roles for deploys. If a stage is in another account, bootstrap it with that account's profile:
   `npx cdk bootstrap -c stage=prod --profile <profile>`.
4. `npm run diff:dev` shows what will be created.
5. `npm run deploy:dev`. At the end CDK prints the API URL:
   `ApiRestApiEndpoint… = https://<id>.execute-api.eu-west-1.amazonaws.com/dev/`

## Commands

| Script | What it does | In Serverless Framework |
|---|---|---|
| `deploy:dev` / `deploy:staging` / `deploy:uat` / `deploy:prod` | deploy a stage | `sls deploy --stage dev` |
| `diff:dev` / `diff:staging` / `diff:uat` / `diff:prod` | show what will change compared to the deployed stack | — |
| `deploy:dev:hotswap` | upload only the lambda code, bypassing CloudFormation (takes seconds) | `sls deploy function` |
| `watch:dev` | the same, but automatically when you save a file | — |
| `synth:dev` | build the CloudFormation template into `cdk.out/` | `sls package` |
| `destroy:dev` | delete the stack | `sls remove` |
| `bootstrap` | prepare the account and region for deploys | — |
| `local -- <file>` | run a handler on your machine | `ts-node` + `export-env` |
| `test` | infrastructure tests | — |
| `typecheck` | type check (it also runs before every synth and deploy) | — |

## Check after a deploy

```bash
API=https://<id>.execute-api.eu-west-1.amazonaws.com/dev

curl -X POST $API/api/test-function -d '{"isShowError": true}'   # 400
curl -X POST $API/api/logs -d '{"eventCode": "CREATE"}'          # write to DynamoDB + message to SNS
curl "$API/api/logs?eventCode=CREATE"                            # read by GSI
curl -X POST $API/api/add-queue-item -d '{"job": "fail"}'        # goes to the DLQ after 2 attempts
curl -X POST $API/api/schedule-delayed-function                  # the lambda runs in 3 minutes
```

Logs are in CloudWatch: `/aws/lambda/template-cdk-<function name>-dev`.

## Local run

```bash
cp .env.example .env   # put in your account id
npm run local -- src/api/test-functions/handler.ts
```

This runs the `if (require.main === module)` block at the end of the handler file. Calls to AWS go to the real
resources of the deployed stage, with the profile from `.env`. There is no `serverless-offline` here: for quick
iterations `watch:dev` works better.

## Things to know

- **Don't rename construct ids** (the second argument: `new Table(this, 'EventLogsTable', ...)`). CDK builds the
  logical ID of the resource from it, so after a rename CloudFormation deletes the resource and creates a new one.
  For a table in dev this means losing data; prod has `retainData: true`, so the table stays in the account.
- **Resources have explicit names**, as in template.sls. The downside: a change that needs a new resource (for
  example, a new table key) fails, and you have to rename the resource first.
- **`hotswap` and `watch` change the code bypassing CloudFormation**, so use them only for dev.
- **`@aws-sdk/*` is not in the bundle**: the lambdas use the version built into the Lambda runtime.
- **Feature flags** in `cdk.json` → `context` come from `cdk init` and turn on the recommended behavior for new
  projects. Changing them in a live project is risky: some of them change the templates of existing resources.

## What to add next

The skeleton is intentionally minimal. Before building a real service on it, work through this list:

- [ ] **GitLab CI/CD.** The pipeline is ready in [.gitlab-ci.yml](.gitlab-ci.yml): type check, tests and
  `cdk diff` on merge requests; deploy `staging` on merge to the default branch; deploy `prod` manually. It uses
  GitLab OIDC instead of stored AWS keys, so what is left is the one-time AWS setup: an IAM OIDC identity
  provider for `gitlab.com`, a deploy role that trusts your GitLab project (see "OpenID Connect in AWS" in the
  GitLab docs) and the `AWS_DEPLOY_ROLE_ARN` CI/CD variable with that role's ARN.

- [ ] **API authorizer.** All routes are public today. Put at least one example route behind an authorizer —
  Cognito (`CognitoUserPoolsAuthorizer`), IAM, or a custom lambda (`TokenAuthorizer`) — so the pattern lives in
  the codebase. While there, set throttling on the stage (`deployOptions.throttlingRateLimit` /
  `throttlingBurstLimit`): right now the API runs on the account defaults.

- [ ] **Config and secrets in SSM Parameter Store.** Keep per-stage values out of the repo under
  `/template-cdk/<stage>/...`. Two patterns, pick per value: deploy time —
  `StringParameter.valueForStringParameter(...)` in a construct puts the value into the lambda env; runtime —
  the lambda reads the parameter with the SDK (create the client and cache the value outside the handler) and
  gets access via `parameter.grantRead(fn)`. Real secrets (API keys of other services) go into SecureString
  parameters or Secrets Manager, never into `environment.*.ts`.

- [ ] **Error tracking and alarms.** Today there are only CloudWatch logs: no alarms, no dashboard, no tracing.
  Two layers work well together: Sentry (`@sentry/aws-serverless`) for application errors — stack traces,
  grouping, releases (source maps are already on outside prod) — and a few CloudWatch alarms for what Sentry
  can't see: messages in the DLQ, API Gateway 5xx, lambda errors and throttles. Each alarm is ~10 lines in a
  construct; `cdk-monitoring-constructs` gives ready-made dashboards. Optional on top: X-Ray
  (`tracing: Tracing.ACTIVE` in `AppFunction`) and structured logs with Lambda Powertools.

- [ ] **API versioning (`/v1/...`, `/v2/...`).** `addRoute` already handles nested paths:
  `api.addRoute('POST', 'v1/orders', fn)` → `/api/v1/orders`. Version the contract, not the infrastructure:
  handler files per version (`src/api/orders/v1/handler.ts`), shared models underneath, v1 and v2 served side
  by side until old clients are gone. Lambda versions/aliases are a different tool (canary deploys), not needed
  for URL versioning.

- [ ] **OpenAPI (Swagger) from validation schemas.** The REST wrapper does not validate input at runtime yet —
  solve both problems at once: describe body/query with schemas (Joi + `joi-to-swagger`, or zod +
  `@asteasolutions/zod-to-openapi` — zod also infers the TS types, so `LambdaEvent<Body>` comes for free),
  validate them in `restApiHandler`, and generate the OpenAPI spec from the same schemas in CI or serve it at
  `GET /api/docs`. One source of truth for types, validation and docs.

- [ ] **Pre-commit git hook** (the project is not a git repository yet, so `git init` first). Format, types and
  tests before every commit, with no extra tools:

  ```bash
  mkdir -p .githooks
  cat > .githooks/pre-commit <<'EOF'
  #!/bin/sh
  set -e
  npx prettier --check "{infra,src,test}/**/*.ts"
  npm run typecheck
  npm test
  EOF
  chmod +x .githooks/pre-commit
  git config core.hooksPath .githooks
  ```

  Add `prettier` to devDependencies first (it is not there yet). `git config core.hooksPath` is per clone, so
  the command belongs in the onboarding steps; husky runs it for everyone automatically after `npm install`,
  if you prefer a dependency.
