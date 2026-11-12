# Supported Clients & Platform Compatibility

MCP Gateway communicates over standard MCP `stdio` with the host AI client and connects to downstream MCP servers via `stdio`, `SSE`, or `StreamableHTTP`.

---

## 1. Compatibility Matrix

| Client | Skill Loading | Gateway MCP Connection | Auto-Migrate (`--client`) | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Claude Code** | Global: `~/.claude/skills/<skill>/SKILL.md`<br>Project: `.claude/skills/<skill>/SKILL.md` | `~/.claude.json` (`stdio`) | `claude-code` | `auto-migrate.js` fixture-tested; live Claude Code client discovery not verified |
| **Cursor** | Project: `.cursor/skills/<skill>/SKILL.md` (also reads `.claude/skills/`) | `~/.cursor/mcp.json` or `.cursor/mcp.json` (`stdio`) | `cursor` | `auto-migrate.js` fixture-tested; live Cursor client discovery not verified |
| **Claude Desktop** | Manual setup (no native directory-based `SKILL.md` auto-discovery) | Windows: `%APPDATA%\Claude\claude_desktop_config.json`<br>macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`<br>Linux: `~/.config/Claude/claude_desktop_config.json` | `claude-desktop` | `auto-migrate.js` fixture-tested; live Claude Desktop UI not verified |
| **Gemini CLI** | Global: `~/.gemini/skills/<skill>/SKILL.md` (or `~/.agents/skills/`)<br>Project: `.gemini/skills/<skill>/SKILL.md` | `~/.gemini/settings.json` (`stdio`) | `gemini` | `auto-migrate.js` fixture-tested; live Gemini CLI discovery not verified |

### Platform Config Paths Quick Reference

- **Windows:**
  - Claude Code: `%USERPROFILE%\.claude.json`
  - Cursor: `%USERPROFILE%\.cursor\mcp.json` or `.cursor\mcp.json`
  - Claude Desktop: `%APPDATA%\Claude\claude_desktop_config.json`
  - Gemini CLI: `%USERPROFILE%\.gemini\settings.json`
- **macOS:**
  - Claude Code: `~/.claude.json`
  - Cursor: `~/.cursor/mcp.json` or `.cursor/mcp.json`
  - Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Gemini CLI: `~/.gemini/settings.json`
- **Linux:**
  - Claude Code: `~/.claude.json`
  - Cursor: `~/.cursor/mcp.json` or `.cursor/mcp.json`
  - Claude Desktop: `~/.config/Claude/claude_desktop_config.json`
  - Gemini CLI: `~/.gemini/settings.json`

---

## 2. Other Clients & Unsupported Setups

* **Other `mcpServers`-compatible tools (e.g., Windsurf, VS Code Copilot, Antigravity):**
  * Not included as built-in `--client` presets in `auto-migrate.js`.
  * You can migrate a compatible JSON file manually using `--file <path-to-config.json>` after verifying its schema, or register `node /path/to/mcp-gateway/index.js` directly in that client's MCP settings.
  * Never claim automatic `--client` preset support for a client outside the 4 presets above.

* **Limitations (Not Supported Out-of-the-Box):**
  * **Interactive Browser OAuth Servers:** Downstream remote MCP servers that require interactive browser-based OAuth PKCE login cannot complete interactive OAuth headlessly through `mcp-gateway`'s `StreamableHTTPClientTransport` unless a valid bearer token is supplied via `.env`.
  * **Clients without `stdio` MCP support:** Web-only chat clients that cannot launch local `node` processes cannot connect directly to a local `stdio` gateway.
