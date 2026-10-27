// middy is ESM only: its packages export nothing for require(). The project is CommonJS, and tsx runs it as such
// (npm run local, npm test, npm run openapi). This hook adds the "import" condition for @middy/* only, so require()
// finds their ESM build, which Node 24 can load. A global --conditions=import breaks tsx on JSON files of other
// packages (joi), and the lambda bundles don't need any of this: esbuild resolves middy on its own.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@middy/')) {
      return nextResolve(specifier, { ...context, conditions: [...context.conditions, 'import'] });
    }
    return nextResolve(specifier, context);
  },
});
