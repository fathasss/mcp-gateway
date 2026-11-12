# MCP Gateway Tool Reference

This reference documents the exact tool names, parameters, enums, runtime defaults, and response payloads implemented in `src/server.js` (`getCoreToolsDefinition` and request handlers).

---

## Core Tools (Always Exposed)

MCP Gateway exposes **5 core tools** by default (plus any user-defined `shortcuts` configured in `config.json`).

### 1. `search_tools`

Search indexed downstream MCP tools by keyword or synonym (supports English and Turkish synonym expansion).

- **Required:** `query`
- **Parameters:**
  - `query` (`string`, **required**): Search keyword(s) or natural-language action phrase.
  - `server` (`string`, optional): Limit results to a specific server ID.
  - `limit` (`number`, optional): Maximum number of results to return. Runtime default: `8`.
- **Response (`content[0].text`):**
  - If matches are found: formatted list containing each tool's `server`, `tool`, `description`, and `inputSchema` (or a message stating no matching tools were found in the cache).

---

### 2. `call_tool`

Execute a tool on a downstream MCP server using its `server` ID, exact `tool` name, and `arguments`.

- **Required:** `server`, `tool`
- **Parameters:**
  - `server` (`string`, **required**): Configured downstream server ID.
  - `tool` (`string`, **required**): Exact downstream tool name (obtain via `search_tools` first).
  - `arguments` (`object`, optional): Tool-specific input arguments. Runtime default: `{}`.
- **Runtime behavior:**
  - Automatically reloads `<gateway-root>/.env` before connecting if needed.
  - Honors `MCP_GATEWAY_TOOL_TIMEOUT_MS` when set to a positive integer.
- **Response:**
  - Forwards the downstream server's `content` / `isError` payload.
  - Note: Downstream `call_tool` payload bodies returned by third-party servers are not redacted by Gateway; secret redaction applies to Gateway config extraction, `list_mcp_servers`, and Gateway error/registry messages.

---

### 3. `list_mcp_servers`

List all configured downstream servers, their runtime connection states, and index metadata.

- **Required:** None
- **Parameters:** `{}` (empty object)
- **Response (`content[0].text`):** JSON string with:
  - `configuredServers`: array of server summaries (`id`, `enabled`, `transport`, `description`, redacted config fields)
  - `runtimeStatus`: active connection status map
  - `totalIndexedTools`: total number of tools cached in `tools-cache.json`
  - `lastUpdated`: ISO timestamp of last cache update (or `null`)

---

### 4. `refresh_tools_index`

Reconnect to all enabled downstream MCP servers and rebuild `tools-cache.json`.

- **Required:** None
- **Parameters:** `{}` (empty object)
- **Response (`content[0].text`):** Summary text reporting refreshed servers, total indexed tools, and any redacted connection/discovery errors.

---

### 5. `manage_mcp_server`

Dynamically add, update, remove, enable, or disable a downstream MCP server in `config.json` and update the tool index.

- **Required:** `action`
- **Parameters:**
  - `action` (`string`, **required**, enum):
    - `"add"`: Add a new server or **update** an existing server by specifying its existing `id` (overwrites `config.servers[id]`). **There is no `"update"` enum value.**
    - `"add_json"`: Add/update server(s) from raw MCP JSON (`mcpServers` or single-server config object).
    - `"remove"`: Delete a server by `id` from `config.json` and `tools-cache.json`.
    - `"enable"`: Set `enabled: true` for `id` and index its tools.
    - `"disable"`: Set `enabled: false` for `id`, disconnect it, and clear its tools from cache.
  - `id` (`string`, optional in schema; required at runtime for `add`, `remove`, `enable`, `disable`): Unique server identifier.
  - `transport` (`string`, optional, enum): `"stdio"` | `"http"` | `"streamableHttp"` | `"sse"`.
  - `url` (`string`, optional): Remote MCP endpoint URL (for `http`, `streamableHttp`, or `sse`).
  - `command` (`string`, optional): Executable command (for `stdio`).
  - `args` (`string[]`, optional): Command arguments (for `stdio`).
  - `env` (`object`, optional): Environment variables. Prefer `"${VAR_NAME}"` placeholders referencing `<gateway-root>/.env`. Any sensitive literals provided are extracted to `.env` and replaced with `${VAR_NAME}` in `config.json`.
  - `headers` (`object`, optional): HTTP headers. Prefer `"${VAR_NAME}"` placeholders for authorization/tokens.
  - `description` (`string`, optional): Short human-readable server description.
  - `json` (`any`, optional): Raw JSON object or JSON string used when `action` is `"add_json"`.
  - `verify` (`boolean`, optional): Verify connection and index tools immediately on `add`/`add_json`/`enable`. Runtime default: `true`.

---

## Optional User Shortcuts (`config.json`)

If `config.json` defines a `shortcuts` array, MCP Gateway also exposes those direct tool aliases at top level and routes calls to their mapped `server` and `tool`.

---

## CLI Equivalents (`cli.js`)

For manual or scripted terminal use inside the Gateway repository:

- `node cli.js add <id> [--desc "..."] [--env KEY=VAL] [--no-verify] [--lang tr|en] -- <command> [args...]`
- `node cli.js add <id> --url <url> [--transport http|streamableHttp|sse] [--header KEY=VAL] [--no-verify]`
- `node cli.js add-json '<json-or-file-path>'`
- `node cli.js remove <id>`
- `node cli.js enable <id>`
- `node cli.js disable <id>`
- `node cli.js list`
- `node cli.js refresh [id]`

