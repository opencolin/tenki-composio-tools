# Changelog

## 0.2.0 (2026-10-14)

### Breaking changes

- **ESM-only.** The CJS build (`dist/index.cjs`) is removed. It could never work on Node 18/20 anyway: the `@composio/core` peer dependency ships no CJS build, so `require()` of this package threw `ERR_REQUIRE_ESM` there (caught by the new engine-floor CI job). ESM consumers are unaffected; CJS consumers on Node >= 20.19 / >= 22.12 can `require()` the ESM build natively, or use dynamic `import()`.
- `tenkiToolkit()` no longer accepts `workspaceId` / `projectId` options, and the `TENKI_WORKSPACE_ID` / `TENKI_PROJECT_ID` environment variables are no longer read. Tenki removed the project-id requirement from sandbox session creation (server-side and SDK); Workspace API keys infer the workspace automatically. Remove these options if you passed them — no other migration is needed.
- `GET_SANDBOX` / `CREATE_SANDBOX` responses now return `workspaceId` instead of `projectId` (field renamed upstream in the Tenki SDK).
- **Tenki API keys only.** Authenticate with a Tenki API key or service token (`tk_…`) via `authToken`, `TENKI_AUTH_TOKEN`, or `TENKI_API_KEY`. The 1.x SDK rejects browser session tokens.
- **`EXEC_COMMAND` enforces `timeoutSeconds`** (default 30). The 0.x SDK ignored it, so commands ran unbounded. Now the sandbox stops a command at the deadline and the result carries `timedOut: true` (status `TIMED_OUT`) with the output captured so far. Pass a larger `timeoutSeconds` (max 600) for long installs.
- `GET_SANDBOX` / `CREATE_SANDBOX` responses no longer include `idleTimeoutMinutes`: Tenki sandboxes do not pause on idle, and the 1.x SDK ignores the setting.

### Changed

- Bumped `@tenkicloud/sandbox` from `^0.3.6` to `>=1.4.1`, a floor with no upper bound.
- `EXEC_COMMAND` results include a `timedOut` boolean.
- The `allowOutbound` docs now match the SDK: outbound access is on unless `allowOutbound` is `false`. They previously described it as off, or as a workspace default.
- One fewer network round-trip on the first `CREATE_SANDBOX` call (the `whoAmI()` resolution step is gone).

## 0.1.0 (2026-07-20)

Initial release: `tenkiToolkit()` custom toolkit for Composio with six tools — `CREATE_SANDBOX`, `EXEC_COMMAND`, `LIST_SANDBOXES`, `GET_SANDBOX`, `CREATE_SNAPSHOT`, `TERMINATE_SANDBOX`. Failure-atomic boot, 30-minute max-duration backstop, structured error results, LLM-friendly output truncation.
