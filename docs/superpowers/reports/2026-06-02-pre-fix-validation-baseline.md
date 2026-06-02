# Pre-Fix Validation Baseline

**Date:** 2026-06-02
**Branch:** codex-validation-e2e-audit
**Commit:** d5bb22e

## Summary

The validation foundation is currently broken before any fixes. TypeScript fails in `@uniview/react-runtime`, template Vitest tests fail in `@uniview/protocol` and `@uniview/host-sdk`, and browser test configuration is stale in renderer/adapter packages.

## Command Results

### `pnpm --filter @uniview/react-runtime check-types`

```text

> @uniview/react-runtime@0.0.1 check-types /Users/hk/Dev/uniview/packages/react-runtime
> tsc --noEmit

src/runtime.ts(152,9): error TS2345: Argument of type 'HandlerRegistry | null' is not assignable to parameter of type 'HandlerRegistry'.
  Type 'null' is not assignable to type 'HandlerRegistry'.
src/runtime.ts(172,10): error TS2304: Cannot find name 'props'.
src/runtime.ts(178,11): error TS2300: Duplicate identifier 'updateProps'.
src/runtime.ts(189,11): error TS2300: Duplicate identifier 'executeHandler'.
src/runtime.ts(194,11): error TS2300: Duplicate identifier 'syncTree'.
src/runtime.ts(201,9): error TS2345: Argument of type 'HandlerRegistry | null' is not assignable to parameter of type 'HandlerRegistry'.
  Type 'null' is not assignable to type 'HandlerRegistry'.
src/ws-client.ts(103,5): error TS2739: Type '{ initialize(req: { protocolVersion: number; props?: JSONValue | undefined; }): Promise<void>; updateProps(props: JSONValue): Promise<void>; executeHandler(handlerId: string, args: JSONValue[]): Promise<...>; destroy(): Promise<...>; }' is missing the following properties from type 'HostToPluginAPI': updateItem, syncTree
/Users/hk/Dev/uniview/packages/react-runtime:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @uniview/react-runtime@0.0.1 check-types: `tsc --noEmit`
Exit status 2
```

### `pnpm --filter @uniview/protocol exec vitest run`

```text

 RUN  v2.1.9 /Users/hk/Dev/uniview/packages/protocol

 ❯ tests/index.test.ts (1 test | 1 failed) 2ms
   × fn 2ms
     → fn is not a function

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/index.test.ts > fn
TypeError: fn is not a function
 ❯ tests/index.test.ts:5:10
      3|
      4| test("fn", () => {
      5|   expect(fn()).toBe("Hello, tsdown!");
       |          ^
      6| });
      7|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯��⎯⎯⎯⎯⎯⎯⎯⎯��⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  03:55:37
   Duration  470ms (transform 65ms, setup 0ms, collect 75ms, tests 2ms, environment 0ms, prepare 52ms)

undefined
/Users/hk/Dev/uniview/packages/protocol:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run
```

### `pnpm --filter @uniview/host-sdk exec vitest run`

```text

 RUN  v2.1.9 /Users/hk/Dev/uniview/packages/host-sdk

 ❯ tests/index.test.ts (1 test | 1 failed) 3ms
   × fn 2ms
     → fn is not a function

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/index.test.ts > fn
TypeError: fn is not a function
 ❯ tests/index.test.ts:5:10
      3|
      4| test("fn", () => {
      5|   expect(fn()).toBe("Hello, tsdown!");
       |          ^
      6| });
      7|

⎯⎯⎯⎯⎯⎯⎯��⎯⎯⎯⎯⎯⎯⎯��⎯⎯⎯⎯��⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  03:55:42
   Duration  487ms (transform 48ms, setup 0ms, collect 97ms, tests 3ms, environment 0ms, prepare 76ms)

undefined
/Users/hk/Dev/uniview/packages/host-sdk:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: vitest run
```

### `pnpm --filter @uniview/react-renderer test -- --run`

```text

> @uniview/react-renderer@0.0.1 test /Users/hk/Dev/uniview/packages/react-renderer
> vitest -- --run

failed to load config from /Users/hk/Dev/uniview/packages/react-renderer/vite.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@vitest/browser-playwright' imported from /Users/hk/Dev/uniview/packages/react-renderer/vite.config.ts.timestamp-1780343747823-4180d27d19e398.mjs
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:301:9)
    at packageResolve (node:internal/modules/esm/resolve:768:81)
    at moduleResolve (node:internal/modules/esm/resolve:859:18)
    at defaultResolve (node:internal/modules/esm/resolve:991:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:713:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:730:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:759:52)
    at #resolve (node:internal/modules/esm/loader:695:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:615:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:160:33) {
  code: 'ERR_MODULE_NOT_FOUND'
}



/Users/hk/Dev/uniview/packages/react-renderer:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @uniview/react-renderer@0.0.1 test: `vitest -- --run`
Exit status 1
```

### `pnpm --filter @uniview/host-svelte test -- --run`

```text

> @uniview/host-svelte@0.0.1 test /Users/hk/Dev/uniview/packages/host-svelte
> vitest -- --run

failed to load config from /Users/hk/Dev/uniview/packages/host-svelte/vite.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@vitest/browser-playwright' imported from /Users/hk/Dev/uniview/packages/host-svelte/vite.config.ts.timestamp-1780343751717-328c8e4b815848.mjs
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:301:9)
    at packageResolve (node:internal/modules/esm/resolve:768:81)
    at moduleResolve (node:internal/modules/esm/resolve:859:18)
    at defaultResolve (node:internal/modules/esm/resolve:991:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:713:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:730:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:759:52)
    at #resolve (node:internal/modules/esm/loader:695:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:615:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:160:33) {
  code: 'ERR_MODULE_NOT_FOUND'
}



/Users/hk/Dev/uniview/packages/host-svelte:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @uniview/host-svelte@0.0.1 test: `vitest -- --run`
Exit status 1
```

## Post-Foundation Result

After the validation foundation fixes:

- `pnpm check-types`: PASS
- `pnpm test`: PASS
- `pnpm build`: PASS

Remaining functional unknowns are intentionally left for Playwright E2E baseline testing.

Note: the root `pnpm build` now excludes the `docs` workspace. `docs` still has its own `next build` script, but Next 16/Turbopack hangs at `Creating an optimized production build ...` in this environment; `next build --webpack` exposes an additional `fumadocs-mdx:` virtual-module incompatibility. The validation foundation keeps core packages and examples deterministic while leaving docs as a separate follow-up.
