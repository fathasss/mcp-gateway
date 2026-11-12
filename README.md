# MCP Gateway — Intelligent Tool Orchestration

<div align="center">

[**English**](README.md) · [**Türkçe**](README.tr.md) · [**Testing & Benchmarks**](TESTING.md)

</div>

Manage multiple MCP servers through a single gateway, discover tools on demand, and reduce unnecessary tool context for AI coding agents.

---

## Why MCP Gateway?

Connecting multiple Model Context Protocol (MCP) servers directly to an AI coding client introduces three recurring bottlenecks:
1. **High Tool Context Overhead:** Every prompt turn injects all connected tool JSON schemas into the model context.
2. **Function Declaration Caps:** Many LLM APIs enforce strict **64 or 128 tool declaration limits** (`400 INVALID_ARGUMENT`).
3. **IDE Restarts:** Adding a new MCP server directly to `.claude.json` or `.cursor/mcp.json` normally requires restarting your client.

**MCP Gateway** exposes **5 core orchestrator tools** (`~833` estimated tokens/turn across `3,333` bytes of schema) plus any optional user-configured shortcuts, while managing downstream `stdio`, `SSE`, and `StreamableHTTP` servers on demand:
- `search_tools` — Discover relevant tools and `inputSchema` definitions on demand (with EN/TR synonym expansion).
- `call_tool` — Execute any tool on any connected downstream MCP server.
- `manage_mcp_server` — Hot-plug (`add`, `add_json`, `enable`, `disable`, `remove`) downstream servers without restarting your IDE.
- `list_mcp_servers` — Inspect configured servers (with secrets redacted), runtime status, and tool counts.
- `refresh_tools_index` — Re-scan enabled servers and update `tools-cache.json`.

---

## Measured Token Reduction (Synthetic Benchmark)

Reproducible measurements via `npm run benchmark` (Node `v24.22.1`, compact JSON `chars / 4` heuristic across a 5-turn single-tool task including 1 `search_tools` lookup of 5 schemas and 1 `call_tool` invocation):

| Scenario | Direct MCP (5 turns) | MCP Gateway (5 turns) | Estimated Reduction |
| :--- | :--- | :--- | :--- |
| **Small** (2 servers, 10 tools) | ~5,478 est. tokens | ~4,730 est. tokens | **13.7%** |
| **Medium** (5 servers, 60 tools) | ~32,813 est. tokens | ~4,730 est. tokens | **85.6%** |
| **Large** (12 servers, 250 tools) | ~137,003 est. tokens | ~4,730 est. tokens | **96.5%** |

*Methodology & Limitations:* Figures use `Math.round(compactJsonChars / 4)` on synthetic tool schemas. Actual savings vary by LLM tokenizer, schema verbosity, and the number of distinct `search_tools` lookups per session. Small setups (<10 tools) yield modest savings due to the ~833-token baseline of the 5 core tools.

---

## Supported Clients

| Client | Auto-Migrate (`--client`) | Config Location |
| :--- | :--- | :--- |
| **Claude Code** | `claude-code` | `~/.claude.json` |
| **Cursor** | `cursor` | `~/.cursor/mcp.json` or `.cursor/mcp.json` |
| **Claude Desktop** | `claude-desktop` | Windows: `%APPDATA%\Claude\claude_desktop_config.json`<br>macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`<br>Linux: `~/.config/Claude/claude_desktop_config.json` |
| **Gemini CLI** | `gemini` | `~/.gemini/settings.json` |

*Compatibility refers solely to standard MCP configuration formats and does not imply official affiliation or endorsement.*

---

## Installation & Setup

### 1. Clone and Install
```bash
git clone https://github.com/fathasss/mcp-gateway.git
cd mcp-gateway
npm install
```
*(Requires Node.js >= 18.0.0)*

### 2. Migrate Existing Client Config (Dry-Run First)
```bash
# 1. Preview discovered servers without modifying any files
npm run migrate -- --client cursor

# 2. Apply migration, extract secrets to .env, back up client config, and point client to mcp-gateway
npm run migrate -- --client cursor --apply --replace-client

# 3. Index tools and run diagnostics
npm run refresh
npm run doctor
```

### 3. Manual Client Registration (Fresh Setup)
```json
{
  "mcpServers": {
    "mcp-gateway": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-gateway/index.js"]
    }
  }
}
```

### 4. Rollback / Update / Uninstall
```bash
# Roll back client config from automatic backup
npm run migrate -- --client cursor --restore /path/to/backup.bak.<timestamp>

# Update gateway software (preserves local config.json, .env, tools-cache.json)
git pull origin main && npm install && npm run refresh
```

---

## Security & Secret Handling

- **Automatic Secret Extraction:** Sensitive keys (case-insensitive: `apiKey`, `access_token`, `refresh_token`, `password`, `clientSecret`, `privateKey`, `Authorization`, `GITHUB_PERSONAL_ACCESS_TOKEN`, etc.) are automatically extracted to `.env` (stored locally as plaintext, not in an OS keychain) and referenced via `${VAR}` placeholders in `config.json`.
- **Safe Sharing (`npm run mask`):** Recursively masks sensitive keys across nested objects/arrays and masks Windows/macOS/Linux user home paths when generating `config.example.json`.
- **Atomic Writes & Path Guards:** Config, cache, and `.env` updates use temporary files + atomic rename and validate allowed directories.
- **Redacted Outputs & Errors:** `list_mcp_servers` and gateway error handlers redact sensitive values before returning output (note: downstream third-party `call_tool` response payloads are not filtered by Gateway).

---

## CLI & NPM Scripts Reference

| Command | Description |
| :--- | :--- |
| `npm start` | Start MCP Gateway (`stdio` server) |
| `npm run mcp -- list` | List configured servers and indexed tool counts |
| `npm run mcp -- add <id> ...` | Add a `stdio`, `http`, `streamableHttp`, or `sse` server |
| `npm run mcp -- add-json <json\|file>` | Import servers from JSON string or file |
| `npm run mcp -- enable <id>` / `disable <id>` | Enable or disable a server |
| `npm run mcp -- remove <id>` | Remove a server from `config.json` and cache |
| `npm run refresh` | Index all enabled downstream servers |
| `npm run migrate -- --client <name>` | Dry-run / apply / restore client MCP migration |
| `npm run doctor` | Validate secrets, endpoints, and estimated token footprint |
| `npm run mask` | Generate sanitized `config.example.json` |
| `npm run benchmark` | Run reproducible synthetic token benchmark |
| `npm test` | Run all unit, security, migration, integration, and ZIP tests |
| `npm run build:agensi` | Build and verify `dist/mcp-gateway-skill.zip` for Agensi.io |

---

## Two-Part Agensi Skill Package

- **GitHub Repository:** Open-source MCP Gateway runtime (MIT License).
- **Agensi Skill (`dist/mcp-gateway-skill.zip`):** Distributable `SKILL.md` + `references/` documentation layer guiding installation, safe migration, and dynamic tool routing. Build locally with `npm run build:agensi`.

---

## License
[MIT](LICENSE)
