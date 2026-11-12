---
name: mcp-gateway
description: Dynamic MCP tool router and orchestrator skill for AI coding agents. Guides Gateway installation and client migration (Claude Code, Cursor, Claude Desktop, Gemini CLI), then routes tool discovery and execution through search_tools, call_tool, and manage_mcp_server to reduce tool declaration context overhead and avoid 64/128 function caps.
---

# MCP Gateway — Intelligent Tool Orchestration

**Manage multiple MCP servers through a single gateway, discover tools on demand, and reduce unnecessary tool context for AI coding agents.**

* **Skill Version:** `1.0.0`
* **Gateway Source Repository:** `https://github.com/fathasss/mcp-gateway`
* **Scope:** Guides consent-based installation, safe client config migration/rollback, hot-plug server management, and two-phase tool routing (`search_tools` -> `call_tool`).
* **Requirements:** Node.js `>= 18.0.0`, Git, and a local `mcp-gateway` installation connected to a supported MCP client (`Claude Code`, `Cursor`, `Claude Desktop`, or `Gemini CLI`).
* **Limitations:** Only `Claude Code`, `Cursor`, `Claude Desktop`, and `Gemini CLI` have `--client` auto-migration presets (Claude Desktop does not natively auto-discover `SKILL.md` directories). Downstream remote servers requiring interactive browser OAuth PKCE flows are not handled headlessly without valid tokens in `.env`. See [references/supported-clients.md](references/supported-clients.md).

---

## Pre-Flight Check: Is MCP Gateway Connected?

Before invoking any Gateway tool, inspect your active tool declarations:
* **If `search_tools`, `call_tool`, `list_mcp_servers`, `refresh_tools_index`, and `manage_mcp_server` are present:** Proceed to **Phase B**.
* **If those tools are NOT present:** **DO NOT** call `manage_mcp_server`, `search_tools`, `call_tool`, `list_mcp_servers`, or `refresh_tools_index`. Proceed to **Phase A**.
* **If an expected Gateway tool or parameter is missing or behaves incompatibly:** **DO NOT** guess tool names or parameters; report the missing/incompatible Gateway version to the user and link [references/gateway-tool-reference.md](references/gateway-tool-reference.md).

---

## Phase A — Installation & Client Connection

> **Strict Consent Rule:** Never execute terminal commands (`git clone`, `npm install`, `npm run ...`, prerequisite checks) or modify/overwrite any file without explicit user approval first. For each step, show the exact command(s), target directory, and expected impact beforehand. Specifically explain that `npm install` can execute third-party package lifecycle scripts. If the user declines, stop immediately and provide manual commands they can run themselves.

Full installation, update, and uninstall steps live in [references/installation-guide.md](references/installation-guide.md).

1. **Prerequisites & Existing Install Check (With User Approval):**
   Ask permission to check `node -v` (`>= 18`), `git --version`, and whether `mcp-gateway` already exists in the user's chosen directory.

2. **Install Gateway Software (If Missing — Requires Explicit Approval):**
   Ask the user to confirm the target parent directory and approve running:
   ```bash
   git clone https://github.com/fathasss/mcp-gateway.git <target-dir>
   cd <target-dir>
   npm install
   ```
   Warn clearly that `npm install` installs `@modelcontextprotocol/sdk` and dependencies and may run package lifecycle scripts. Stop and share manual steps if not approved.

3. **Dry-Run Client Migration Preview (Read-Only, Requires Command Approval):**
   Ask which supported client (`claude-code`, `cursor`, `claude-desktop`, or `gemini`) to inspect, then request approval to preview without changing files:
   ```bash
   npm run migrate -- --client <client-name>
   ```
   *Safe default:* If the config format is unknown or ambiguous, **do not** auto-migrate or overwrite it.

4. **Apply Migration, Index & Verify (Requires Explicit Approval):**
   Summarize the target client config file, confirm a timestamped `.bak.<timestamp>` backup will be created first, and explain that sensitive keys will be extracted to `<gateway-root>/.env` (plaintext on disk) with `${VAR_NAME}` placeholders in `config.json`. After explicit approval, run:
   ```bash
   npm run migrate -- --client <client-name> --apply --replace-client
   npm run refresh
   npm run doctor
   ```

5. **Client Restart & Failure Rollback:**
   Instruct the user to restart their client once to load `mcp-gateway`. If any step fails partially, report what succeeded/failed and offer immediate rollback (with approval):
   ```bash
   npm run migrate -- --client <client-name> --restore <backup-file-path>
   ```

---

## Phase B — Gateway Tool & Server Management

Use this workflow **only when MCP Gateway is connected**. Full parameter schemas and defaults are documented in [references/gateway-tool-reference.md](references/gateway-tool-reference.md).

### Confirmation & Secret Hygiene Rules

* **Read-only operations (`list_mcp_servers`, `search_tools`):** May run without extra confirmation.
* **Explicit confirmation required BEFORE:**
  * Adding a server (`manage_mcp_server` with `action: "add"` or `"add_json"`)
  * Updating an existing server (uses `action: "add"` with the existing `id` — there is no `"update"` action)
  * Enabling, disabling, or removing a server (`action: "enable"`, `"disable"`, `"remove"`)
  * Refreshing when reconnecting external endpoints (`refresh_tools_index`) or editing/migrating/restoring any client config file or running npm scripts
  Before asking approval, summarize the target `id`, target config file, and exact change.
* **NEVER ask the user to paste raw secrets/tokens/passwords into chat.** Instruct the user to place secrets in `<gateway-root>/.env` locally and reference them as `"${VAR_NAME}"` placeholders in `env` or `headers` (see [references/security-guide.md](references/security-guide.md)).

### 1. List Connected Servers (`list_mcp_servers`)
Call with `{}` to inspect configured servers (secrets redacted), runtime status, and total indexed tools.

### 2. Add, Update, Enable, Disable, or Remove Servers (`manage_mcp_server`)
When Gateway is active, manage servers via `manage_mcp_server` rather than editing client configs manually (only after explicit user confirmation):

* **Add or update a `stdio` server** (`action: "add"`):
  ```json
  {
    "action": "add",
    "id": "github",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
    },
    "description": "GitHub repositories, issues, and pull requests",
    "verify": true
  }
  ```

* **Add or update an HTTP / StreamableHTTP / SSE server** (`action: "add"`):
  ```json
  {
    "action": "add",
    "id": "remote-api",
    "transport": "http",
    "url": "http://localhost:8080/mcp",
    "description": "Remote StreamableHTTP MCP service",
    "verify": true
  }
  ```

* **Import raw JSON (`action: "add_json"`), or `enable` / `disable` / `remove`:**
  Allowed `action` values: `"add"` | `"add_json"` | `"remove"` | `"enable"` | `"disable"`. See [references/gateway-tool-reference.md](references/gateway-tool-reference.md) for all parameters and defaults.

### 3. Discover Tools (`search_tools`)
Search indexed tools before calling downstream capabilities (`query` required; optional `server`, `limit` default `8`):
```json
{
  "query": "pull request create",
  "server": "github",
  "limit": 8
}
```

### 4. Inspect Schema & Execute (`call_tool`)
Inspect the `inputSchema` returned by `search_tools`, satisfy all `required` fields, and invoke `call_tool` (`server` required, `tool` required, `arguments` optional object default `{}`):
```json
{
  "server": "github",
  "tool": "create_pull_request",
  "arguments": {
    "owner": "org",
    "repo": "repo",
    "title": "feat: add integration",
    "head": "feat/integration",
    "base": "main"
  }
}
```
Summarize the downstream tool output clearly. Note that third-party downstream `call_tool` response payloads are not redacted by Gateway.

### 5. Refresh & Diagnostics (`refresh_tools_index`)
* Call `refresh_tools_index` (`{}`) after starting a local downstream app/container.
* For offline servers, `ECONNREFUSED`, or cache mismatches, consult [references/troubleshooting.md](references/troubleshooting.md) or ask permission before running `npm run doctor`.
