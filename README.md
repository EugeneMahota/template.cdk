# template.cdk

A service skeleton on AWS CDK v2 + TypeScript, in the style of [template.sls](https://github.com/EugeneMahota/template.sls):
infrastructure and environment config live in `infra/`, business logic lives in `src/`. The dependencies are CDK, AWS
SDK, middy and build tools.

## Structure

```
infra/                        infrastructure (in template.sls: serverless.ts + serverless/)
├── app.ts                    entry point: reads the stage, creates the stack
├── service-stack.ts          the stack, built from parts (like joinParts)
├── utils.ts                  resourceName(): template-cdk-logs-dev
├── environments/             config: common + overrides for dev / staging / uat / prod
└── constructs/               parts of the stack with their resources (in template.sls: serverless/parts/)
    ├── shared/               reusable classes, without resources of their own
    │   └── app-function.ts   shared lambda settings (provider + build.esbuild)
    ├── api.ts                REST API and addRoute() with its auth: none / cognito / iam
    ├── auth.ts               Cognito user pool and its app client
    ├── users.ts              GET /v1/users/me
    ├── event-logs.ts         DynamoDB + GSI and SNS: POST and GET /v1/logs
    ├── sqs.ts                queue + DLQ: POST /v1/internal/add-queue-item
    └── step-functions.ts     delayed run: POST /v1/internal/schedule-delayed-function
src/                          business logic, knows nothing about CDK
├── api/                      handlers, the REST wrapper on middy, the lambda authorizer
├── helper/                   env, logger, HTTP errors, user from the token, local run
└── models/                   DynamoDB via AWS SDK (instead of dynamoose)
test/                         tests: the CloudFormation template without a deploy, restApiHandler
tools/                        generate-openapi.ts, middy-hook.mjs (see "Things to know")
openapi/                      openapi.yaml, generated from the Joi contracts: don't edit by hand
```

## How it maps to template.sls

| template.sls | template.cdk |
|---|---|
| `serverless/parts/*.ts` + `deepmerge` | `infra/constructs/*.ts`: construct classes |
| `environment.*.ts` → `${param:...}` | `environment.*.ts` → typed `StageConfig` |
| `LOGS_TABLE: ResourceName('logs')` | `names: { logsTable: 'logs' }` → `resourceName(config, config.names.logsTable)` |
| `Arn()`, `Ref()`, `Fn::Sub` | object properties: `queue.queueUrl`, `table.tableName` |
| `provider.iam.role.statements`, one role for all functions | `table.grantWriteData(fn)`: each lambda has its own role |
| `events: [{ http }]` | `api.addRoute({ method: HttpMethod.POST, path: 'v1/logs', handler: fn, auth: AuthType.COGNITO })` |
| `http.authorizer` | `auth` in `addRoute` (see [Routes and auth](#routes-and-auth)) |
| `events: [{ sqs }]` | `fn.addEventSource(new SqsEventSource(queue))` |
| `serverless-step-functions` plugin | `new Wait(...).next(new LambdaInvoke(...))` |
| `build.esbuild` | `NodejsFunction` bundles with esbuild on its own |

## Stages

`dev`, `staging`, `uat`, `prod`: the `Stage` enum in `infra/environments/stage.ts`. Each stage has a file in
`infra/environments/` that overrides `environment.common.ts`. A new stage is a member in `Stage`, its own file, a line
in `env-builder.ts` (TypeScript asks for it) and the scripts in `package.json`.
`staging` and `uat` have no overrides yet, so they use the common settings, like `dev`. `prod` minifies the code,
turns off source maps and keeps the tables when the stack is deleted.

Each stage is a separate stack: `template-cdk-dev`, `template-cdk-staging`, `template-cdk-uat`, `template-cdk-prod`.
The stage is passed as context: `cdk deploy -c stage=uat`. The default is `dev` (`cdk.json` → `context.stage`).

Resource names live in the config too: `names` in `environment.common.ts` has the short ones (`logsTable: 'logs'`),
and `resourceName()` adds the service and the stage: `template-cdk-logs-dev`. A stage file can also set `apiDomain`,
the custom domain of its API: `openapi/openapi.yaml` lists it in `servers`, and a stage without it gets the
execute-api URL.

## Routes and auth

Every route says who may call it. `HttpMethod` and `AuthType` are enums in `infra/constructs/api.ts`:

```ts
api.addRoute({ method: HttpMethod.GET, path: 'v1/users/me', handler: getMe, auth: AuthType.LAMBDA });
```

| `auth` | Who calls | How |
|---|---|---|
| `AuthType.NONE` | anyone | no auth |
| `AuthType.COGNITO` | signed-in users of the app | an ID token of the user pool in the `Authorization` header |
| `AuthType.LAMBDA` | signed-in users of the app | the same ID token, checked by our lambda authorizer |
| `AuthType.IAM` | other services and scripts | the request is signed with AWS credentials (SigV4) |
| an authorizer object | depends on the authorizer | a lambda `TokenAuthorizer`, another user pool |

`auth` has no default, so a public route says `AuthType.NONE` out loud. The path is free, but the synth fails when it breaks
the naming rules: a version first (`v1/`, `v2/`), then kebab-case segments and `{camelCase}` parameters, e.g.
`v1/users/{userId}/orders`. The test `gives each route the auth it asks for` lists every route with its auth, so a
change of who may call what shows up in the merge request.

- **Contracts.** Every handler passes Joi schemas to `restApiHandler`, `{}` when it takes no input:
  `restApiHandler({ body: Joi.object({ eventCode }) }, handler)`. The wrapper checks `body`, `query` and `path`
  before the handler runs: 400 with the Joi message, and the handler gets the converted values. `npm run openapi`
  turns the same schemas into [openapi/openapi.yaml](openapi/openapi.yaml) (`tools/generate-openapi.ts`), and CI
  fails when the file is out of date.
- **Versions.** Version the contract, not the infrastructure: handler files per version
  (`src/api/orders/v1/handler.ts`), shared models underneath, `v1` and `v2` side by side until old clients are
  gone. Lambda versions and aliases are a different tool (canary deploys), they are not needed for this.
- **The "me" model.** A handler takes the user only from the token: `getUserId(claims)` returns `sub` of the token
  that the authorizer has checked. Paths have `me` instead of a user id (`/v1/users/me/orders`, not
  `/v1/users/{userId}/orders`), so nobody can put another id into the URL. For a record of another user, answer
  404, not 403: the API doesn't reveal that the record exists.
- **The lambda authorizer** (`src/api/authorizer/handler.ts`) checks the ID token like the built-in one, with
  `aws-jwt-verify`: the signature, the expiry, the user pool and the app client. It is the place for custom rules,
  such as a blocked account or a role (`cognito:groups`). API Gateway caches its answer for 5 minutes per token, so
  the answer allows the whole API and must not depend on the route. `/v1/users/me` uses it, the logs use the
  built-in one.
- **Errors of API Gateway itself** (401 from the authorizer, 403 from IAM, 429, 5xx) don't reach the lambda, so
  `GatewayResponse` adds the CORS header to them. Without it the browser shows a CORS error instead of the status.
- **Callers of `iam` routes** need `execute-api:Invoke` on the route in their IAM policy:
  `arn:aws:execute-api:<region>:<account>:<api-id>/<stage>/POST/v1/internal/add-queue-item`. A caller from another
  AWS account also needs a resource policy on the API.

## First deploy

1. `npm install`
2. The AWS profile is set in `cdk.json` (`"profile"`), the region in `infra/environments/environment.common.ts`.
3. Once per account and region: `npm run bootstrap`. It creates the `CDKToolkit` stack with a bucket for lambda
   bundles and roles for deploys. If a stage is in another account, bootstrap it with that account's profile:
   `npx cdk bootstrap -c stage=prod --profile <profile>`.
4. `npm run diff:dev` shows what will be created.
5. `npm run deploy:dev`. At the end CDK prints the API URL and the ids of the user pool and its client:
   `ApiRestApiEndpoint… = https://<id>.execute-api.eu-west-1.amazonaws.com/dev/`, `AuthUserPoolId… = eu-west-1_…`,
   `AuthUserPoolClientId… = …`

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
| `test` | tests | — |
| `openapi` | write `openapi/openapi.yaml` from the routes and their Joi contracts | `sls openapi generate` |
| `openapi:check` | fail if `openapi/openapi.yaml` doesn't match the code (CI runs it) | — |
| `typecheck` | type check (it also runs before every synth and deploy) | — |

## Check after a deploy

```bash
API=https://<id>.execute-api.eu-west-1.amazonaws.com/dev
POOL_ID=<AuthUserPoolId… from the deploy output>
CLIENT_ID=<AuthUserPoolClientId… from the deploy output>
```

**`AuthType.COGNITO` and `AuthType.LAMBDA`**: both take the same ID token. Sign-up is off, so create a test user
yourself and get a token (it is valid for an hour). The password needs 8+ characters with upper and lower case
letters, a digit and a symbol.

```bash
aws cognito-idp admin-create-user --user-pool-id $POOL_ID --username me@example.com --message-action SUPPRESS \
  --user-attributes Name=email,Value=me@example.com Name=email_verified,Value=true
aws cognito-idp admin-set-user-password --user-pool-id $POOL_ID --username me@example.com \
  --password '<password>' --permanent
TOKEN=$(aws cognito-idp initiate-auth --client-id $CLIENT_ID --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=me@example.com,PASSWORD='<password>' \
  --query AuthenticationResult.IdToken --output text)

curl $API/v1/users/me                                # 401: no token
curl $API/v1/users/me -H "Authorization: $TOKEN"     # id and email of the caller
curl -X POST $API/v1/logs -H "Authorization: $TOKEN" -d '{"eventCode": "CREATE"}'   # DynamoDB + SNS
curl "$API/v1/logs?eventCode=CREATE" -H "Authorization: $TOKEN"                    # read by GSI
```

**`AuthType.IAM`**: curl (7.75+) signs the request with your AWS credentials.

```bash
eval "$(aws configure export-credentials --profile <profile> --format env)"
SIGN=(--aws-sigv4 "aws:amz:eu-west-1:execute-api" --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
  -H "x-amz-security-token: $AWS_SESSION_TOKEN")

curl -X POST $API/v1/internal/add-queue-item -d '{"job": "fail"}'               # 403: not signed
curl -X POST $API/v1/internal/add-queue-item "${SIGN[@]}" -d '{"job": "fail"}'  # goes to the DLQ after 2 attempts
curl -X POST $API/v1/internal/schedule-delayed-function "${SIGN[@]}"            # the lambda runs in 3 minutes
```

Logs are in CloudWatch: `/aws/lambda/template-cdk-<function name>-dev`.

## Local run

```bash
cp .env.example .env   # put in your account id
npm run local -- src/api/users/handler.ts
```

This runs the `if (require.main === module)` block at the end of the handler file. Calls to AWS go to the real
resources of the deployed stage, with the profile from `.env`. There is no `serverless-offline` here: for quick
iterations `watch:dev` works better. Handlers of `cognito` routes get fake token claims instead of a token:
`runLocally(getMe, { claims: { sub: 'local-user' } })`.

## Things to know

- **Don't rename construct ids** (the second argument: `new Table(this, 'EventLogsTable', ...)`). CDK builds the
  logical ID of the resource from it, so after a rename CloudFormation deletes the resource and creates a new one.
  For a table in dev this means losing data; prod has `retainData: true`, so the table stays in the account.
- **Resources have explicit names**, as in template.sls. The downside: a change that needs a new resource (for
  example, a new table key) fails, and you have to rename the resource first.
- **Decide the sign-in settings of the user pool before the first prod deploy.** Sign-in with email and case
  sensitivity can't change on a live pool: a change replaces it with a new, empty one. In prod the old pool and its
  users stay in the account, but the app moves to the new pool.
- **`hotswap` and `watch` change the code bypassing CloudFormation**, so use them only for dev.
- **`@aws-sdk/*` is not in the bundle**: the lambdas use the version built into the Lambda runtime.
- **middy is ESM only, the project is CommonJS.** It works because all the code runs through esbuild: NodejsFunction
  bundles the lambdas, tsx runs the rest. So `tsconfig.json` resolves modules like a bundler
  (`"moduleResolution": "bundler"`), and `npm run local`, `npm test` and `npm run openapi` load
  `tools/middy-hook.mjs`: it lets `require` find the ESM build of `@middy/*`, and only of them. A global
  `--conditions=import` would do the same, but under tsx it breaks the packages that require their own JSON files
  (joi). If more ESM-only packages come, move the project to ESM (`"type": "module"`).
- **Feature flags** in `cdk.json` → `context` come from `cdk init` and turn on the recommended behavior for new
  projects. Changing them in a live project is risky: some of them change the templates of existing resources.

## What to add next

The skeleton is intentionally minimal. Before building a real service on it, work through this list:

- [ ] **GitLab CI/CD.** The pipeline is ready in [.gitlab-ci.yml](.gitlab-ci.yml): type check, tests and
  `cdk diff` on merge requests; deploy `staging` on merge to the default branch; deploy `prod` manually. It uses
  GitLab OIDC instead of stored AWS keys, so what is left is the one-time AWS setup: an IAM OIDC identity
  provider for `gitlab.com`, a deploy role that trusts your GitLab project (see "OpenID Connect in AWS" in the
  GitLab docs) and the `AWS_DEPLOY_ROLE_ARN` CI/CD variable with that role's ARN.

- [ ] **Auth for real users.** The user pool is minimal. Before real users come: send its emails through SES
  (`email: UserPoolEmail.withSES(...)`), since the built-in Cognito email sends only 50 emails a day; decide who
  creates accounts (sign-up from the app or invites); add roles as Cognito groups (the `cognito:groups` claim) or
  as a custom attribute that users can't change: keep it out of the client's `writeAttributes`, or anyone can set
  it with their own token; turn on MFA if needed. Also set throttling on the API stage
  (`deployOptions.throttlingRateLimit` / `throttlingBurstLimit`): right now the API runs on the account defaults.

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

- [ ] **Custom domain.** `apiDomain` in a stage file only goes into `openapi/openapi.yaml` for now. To serve the API
  on it: an ACM certificate in the region of the stack, `restApi.addDomainName(...)` (or a `BasePathMapping` on a
  domain that several services share) and a DNS record (Route 53 `ARecord` with the `ApiGateway` target).

- [ ] **Publish the OpenAPI spec.** `openapi/openapi.yaml` is generated from the Joi contracts and checked in CI.
  Left: pick where people read it (GitLab shows the committed file as Swagger UI, or `GET /v1/docs`, or S3 + Swagger
  UI after a deploy) and describe the success bodies with `response` schemas.

- [ ] **Pre-commit git hook.** Format, types and
  tests before every commit, with no extra tools:

  ```bash
  mkdir -p .githooks
  cat > .githooks/pre-commit <<'EOF'
  #!/bin/sh
  set -e
  npx prettier --check "{infra,src,test,tools}/**/*.ts"
  npm run typecheck
  npm test
  npm run openapi:check
  EOF
  chmod +x .githooks/pre-commit
  git config core.hooksPath .githooks
  ```

  Add `prettier` to devDependencies first (it is not there yet). `git config core.hooksPath` is per clone, so
  the command belongs in the onboarding steps; husky runs it for everyone automatically after `npm install`,
  if you prefer a dependency.
