# Changelog

## 0.2.0 (2026-07-24)

### Breaking changes

- `tenkiToolkit()` no longer accepts `workspaceId` / `projectId` options, and the `TENKI_WORKSPACE_ID` / `TENKI_PROJECT_ID` environment variables are no longer read. Tenki removed the project-id requirement from sandbox session creation (server-side and SDK); Workspace API keys infer the workspace automatically. Remove these options if you passed them — no other migration is needed.
- `GET_SANDBOX` / `CREATE_SANDBOX` responses now return `workspaceId` instead of `projectId` (field renamed upstream in the Tenki SDK).

### Changed

- Bumped `@tenkicloud/sandbox` from `^0.3.6` to `^0.5.4`.
- One fewer network round-trip on the first `CREATE_SANDBOX` call (the `whoAmI()` resolution step is gone).

## 0.1.0 (2026-07-20)

Initial release: `tenkiToolkit()` custom toolkit for Composio with six tools — `CREATE_SANDBOX`, `EXEC_COMMAND`, `LIST_SANDBOXES`, `GET_SANDBOX`, `CREATE_SNAPSHOT`, `TERMINATE_SANDBOX`. Failure-atomic boot, 30-minute max-duration backstop, structured error results, LLM-friendly output truncation.
