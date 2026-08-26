/**
 * ajv-formats interop shim.
 *
 * ajv-formats@3.0.1 ships only a CJS default export (`export default
 * formatsPlugin` in dist/index.d.ts) — there is no named alternative to
 * switch to, unlike ajv itself. Under this project's
 * "module"/"moduleResolution": "Node16" combined with packages/core's own
 * "type": "module", TypeScript resolves `import addFormats from
 * "ajv-formats"` to the whole CJS module shape rather than the callable
 * plugin function, so every call site sees TS2349 "This expression is
 * not callable" — even though the value IS callable at actual runtime
 * (Node's ESM-importing-CJS interop binds a default import to
 * `module.exports`, and ajv-formats sets `module.exports` to the plugin
 * function itself: `module.exports = exports = formatsPlugin`). vitest
 * never surfaces this because it transpiles with esbuild instead of
 * type-checking.
 *
 * This shim resolves the callable function defensively — it handles both
 * "the default import already is the function" (what Node actually does
 * today) and "the default import is a namespace object with a .default
 * property" (in case that interop shape ever changes) — and re-exports
 * it typed against ajv-formats' own `FormatsPlugin` type. Every validator
 * module imports `addFormats` from here instead of from "ajv-formats"
 * directly, so this is the one place that needs to change if ajv-formats
 * or the module resolution setup changes.
 */
import addFormatsImport from "ajv-formats";
import type { FormatsPlugin } from "ajv-formats";

const resolved =
  (addFormatsImport as unknown as { default?: FormatsPlugin }).default ??
  (addFormatsImport as unknown as FormatsPlugin);

export const addFormats: FormatsPlugin = resolved;
