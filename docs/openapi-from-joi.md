# OpenAPI from Joi schemas

**Status: planned, not started.** This is the agreed design. Nothing in the code uses it yet.

## Goal

`npm run openapi` writes `openapi/openapi.yaml` from the Joi schemas that the handlers use to validate requests. CI
fails when the committed file no longer matches the code, so the docs can't drift away from the API.

A spec written by hand drifts: nothing checks it against the code, and over time it stops describing what the API
does — extra fields, defaults instead of validation, side effects that nobody wrote down.

The idea comes from a Serverless Framework project with the same setup: a script turns the Joi schemas into
`documentation.yml`, the `serverless-openapi-documenter` plugin builds the spec from it, and `npm test` checks that the
file is up to date. CDK has no such plugin, but it doesn't need one: the routes are already in our code.

## How it works

### 1. A contract per handler

The handler passes its Joi schemas to `restApiHandler`. The wrapper validates the request with them and keeps them on
the handler, so the docs describe exactly what is validated:

```ts
export const createLog: ApiGatewayHandler = restApiHandler(
  { body: Joi.object({ eventCode: Joi.string().valid(...EventLogCodes).required() }) },
  async ({ body }: LambdaEvent<CreateLogBody>): Promise<EventLog> => {
    // ...
  }
);
```

- A contract has `body`, `query` and `path`, later maybe `response`. All of them are optional: a handler without input
  passes `{}`.
- Validation runs in `restApiHandler` right after `toLambdaEvent()`, before the handler is called: the handler's view
  of the request exists only there, and Joi's converted values (`"5"` → `5` in `query`) go straight to the handler.
  It is Joi, not `@middy/validator`. A failure throws `HttpError(400)`, so `httpErrorHandler` and `jsonErrorBody` turn
  it into `{"message": "..."}`, like every other error.
- `restApiHandler` puts the contract on the handler it returns (`handler.contract`, so `ApiGatewayHandler` gets a
  `contract` field), for the generator.

### 2. A route registry in `Api`

`Api.addRoute({ method, path, handler, auth })` already knows everything about a route except the handler module. It
saves the method, path and auth of each route to `api.routes`, together with the handler file and export name. Two
changes for that:

- `AppFunction` keeps `entry` and `handler` (its props) as readonly fields. Today it passes them to `NodejsFunction`
  and doesn't keep them.
- `Route.handler` becomes `AppFunction` instead of `IFunction`, because only `AppFunction` knows its file and export.
  The `Api` tests then need an `AppFunction` instead of the imported function they use now.

### 3. The generator: `tools/generate-openapi.ts`

1. Builds `ServiceStack` in memory, like the tests do: no AWS credentials, no deploy. Routes and auth don't depend on
   the stage, so `buildConfig('dev')` is enough. `ServiceStack` exposes its `Api` as `readonly api` for this (today
   it is a local variable). Building the stack bundles every lambda with esbuild, which takes a few seconds.
2. For each route in `api.routes`, imports the handler file and reads the `contract` of the export.
3. Converts the Joi schemas with `joi-to-json` in `open-api` mode (OpenAPI 3.0). `joi-to-json` leaves artefacts of
   `Joi.when()` and keeps the regex flags in `pattern`, so its output needs a small cleanup step.
4. Builds the operation:
   - `requestBody` from `body`, `parameters` from `path` and `query`;
   - `security` from `auth`: `'cognito'` → the Cognito ID token in `Authorization`, `'iam'` → SigV4, `'none'` →
     none, an authorizer object → a scheme named after it;
   - responses: 200 (described by `response` when the contract has it), 400 when there is a contract, 422 when there
     is a `body` (`httpJsonBodyParser` answers 422 to a body that is not valid JSON), 401 for `'cognito'` and
     authorizer objects, 403 for `'iam'`;
   - `operationId` is the export name (it must be unique), `tags` is the folder in `src/api/`.
5. Writes `openapi/openapi.yaml` with a "generated, do not edit" header.
6. `--check` builds the same file in memory and fails if the committed one differs. It also fails for a route without
   a contract, so a new route can't skip the docs.

### 4. Scripts and CI

```json
"openapi": "node --conditions=import --import tsx tools/generate-openapi.ts",
"openapi:check": "node --conditions=import --import tsx tools/generate-openapi.ts --check"
```

`--conditions=import` is there for the same reason as in `npm run local`: middy is ESM only. `openapi:check` goes to
the `check` job in `.gitlab-ci.yml`.

Add `tools` to `include` in `tsconfig.json`: today the type check covers only `infra`, `src` and `test`, so it would
skip the generator. The same goes for the prettier glob in the pre-commit hook from the README.

New dependencies: `joi` (it ends up in the lambda bundles), `joi-to-json` and `yaml` (dev only).

## Publishing the spec

Any of these, to decide later:

- commit `openapi/openapi.yaml`: GitLab shows files with `openapi` in the name as Swagger UI;
- serve it at `GET /v1/docs` with `auth: 'none'`;
- after a deploy, upload the spec and Swagger UI to S3 (`BucketDeployment` in a separate construct).

## Open questions

- Response contracts: describe the success bodies with a `response` schema and check them in tests?
- Validation errors: only the first Joi message, or all of them (`abortEarly: false`)?
- `servers`: the execute-api URL is known only after a deploy. A custom domain would give a stable URL.
- Types: Joi doesn't infer TypeScript types, so `LambdaEvent<Body>` stays written by hand.
