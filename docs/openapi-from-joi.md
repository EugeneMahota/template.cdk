# OpenAPI from Joi schemas

**Status: built.** `npm run openapi` writes [openapi/openapi.yaml](../openapi/openapi.yaml). Not done yet: publishing
the spec and describing the success bodies (see the open questions at the end).

## Goal

The spec is generated from the Joi schemas that the handlers use to validate requests. CI fails when the committed file
no longer matches the code, so the docs can't drift away from the API.

A spec written by hand drifts: nothing checks it against the code, and over time it stops describing what the API
does — extra fields, defaults instead of validation, side effects that nobody wrote down.

The idea comes from a Serverless Framework project with the same setup: a script turns the Joi schemas into
`documentation.yml`, the `serverless-openapi-documenter` plugin builds the spec from it, and `npm test` checks that the
file is up to date. CDK has no such plugin, but it doesn't need one: the routes are already in our code.

## How it works

### 1. A contract per handler

The handler passes its Joi schemas to `restApiHandler`:

```ts
export const createLog: ApiGatewayHandler = restApiHandler(
  { body: Joi.object({ eventCode }) },
  async ({ body }: LambdaEvent<CreateLogBody>): Promise<EventLog> => {
    // ...
  }
);
```

- A contract (`RequestContract` in `src/api/types.ts`) has `body`, `query` and `path`. All of them are optional: a
  handler without input passes `{}`.
- Validation runs in `restApiHandler` right after `toLambdaEvent()`, before the handler is called: the handler's view
  of the request exists only there, and Joi's converted values (`"5"` → `5` in `query`) go straight to the handler.
  It is Joi, not `@middy/validator`. A failure throws `HttpError(400)`, so `httpErrorHandler` and `jsonErrorBody` turn
  it into `{"message": "..."}`, like every other error.
- `restApiHandler` puts the contract on the handler it returns: `handler.contract`.

### 2. A route registry in `Api`

`Api.addRoute({ method, path, handler, auth })` saves every route to `api.routes`, and `ServiceStack` exposes its `Api`
as `stack.api`. `Route.handler` is an `AppFunction`, because only it knows its handler file and export: it keeps them
as `entry` and `exportName`.

### 3. The generator: `tools/generate-openapi.ts`

1. Builds `ServiceStack` in memory with `buildConfig('dev')`: routes and auth don't depend on the stage. The
   `aws:cdk:bundling-stacks` context is empty, so CDK skips esbuild and the generator takes about half a second.
2. For each route in `api.routes`, requires the handler file and reads `contract` of the export. A route without a
   contract stops the generator.
3. Converts the Joi schemas with `joi-to-json` in `open-api` mode (OpenAPI 3.0) and removes the regex flags that
   `joi-to-json` leaves in `pattern`. `Joi.when()` leaves artefacts too: add a cleanup for them when we start using
   it.
4. Builds the operation:
   - `requestBody` from `body`. It is `required` only when `{}` breaks the schema, because a missing body reaches the
     handler as `{}`;
   - `parameters` from `path` (always required) and `query`;
   - `security` from `auth`: `'cognito'` → the ID token in `Authorization`, `'iam'` → SigV4, `'none'` → none, an
     authorizer object → a scheme named after its construct id;
   - responses: 200, 400 when there is a contract, 401 for `'cognito'` and authorizer objects, 403 for `'iam'`, 422
     when there is a `body` (`httpJsonBodyParser` answers 422 to a body that is not valid JSON). Errors are
     `{"message": "..."}`;
   - `operationId` is the export name, `tags` is the folder in `src/api/`.
5. `servers` has one entry per stage: `https://<apiDomain>` when the stage config sets `apiDomain`, otherwise the
   execute-api URL with the API id as a variable.
6. Writes `openapi/openapi.yaml` with a "generated, do not edit" header. `--check` builds the same file in memory and
   fails if the committed one differs.

### 4. Scripts and CI

```json
"openapi": "node --import ./tools/middy-hook.mjs --import tsx tools/generate-openapi.ts",
"openapi:check": "node --import ./tools/middy-hook.mjs --import tsx tools/generate-openapi.ts --check"
```

`tools/middy-hook.mjs` lets the CommonJS code load the ESM-only middy (README → Things to know). `openapi:check` runs
in the `check` job of `.gitlab-ci.yml`, and `tsconfig.json` includes `tools`, so the type check covers the generator.

Dependencies: `joi` (it ends up in the lambda bundles), `joi-to-json` and `yaml` (dev only).

## Publishing the spec

Any of these, to decide later:

- the committed `openapi/openapi.yaml`: GitLab shows files with `openapi` in the name as Swagger UI;
- serve it at `GET /v1/docs` with `auth: 'none'`;
- after a deploy, upload the spec and Swagger UI to S3 (`BucketDeployment` in a separate construct).

## Open questions

- Response contracts: describe the success bodies with a `response` schema and check them in tests?
- Validation errors: only the first Joi message, or all of them (`abortEarly: false`)?
- Types: Joi doesn't infer TypeScript types, so `LambdaEvent<Body>` stays written by hand.
