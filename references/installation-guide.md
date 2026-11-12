# Installation, Update & Uninstall Guide

This skill operates in a **two-part model**:
- **Agensi Skill Package:** Provides agent instructions (`SKILL.md`) and reference guides.
- **MCP Gateway Runtime:** Open-source Node.js server hosted at `https://github.com/fathasss/mcp-gateway`.

---

## 1. Prerequisites Check

Before modifying any client configuration, verify the host environment:
```bash
node -v   # Required: Node.js >= 18.0.0
git --version
```
If `mcp-gateway` is already installed on disk (e.g., `~/apps/mcp-gateway` or `C:\Users\<user>\Desktop\apps\mcp-gateway`), skip cloning and verify dependencies instead.

---

## 2. Installing MCP Gateway

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/fathasss/mcp-gateway.git
   cd mcp-gateway
   npm install
   ```

2. Verify the clean installation:
   ```bash
   node cli.js --help
   npm run doctor
   ```

3. **Option A — Migrate an Existing Client Setup (Recommended):**
   Preview what will be migrated without modifying any files:
   ```bash
   npm run migrate -- --client cursor
   ```
   After obtaining explicit user confirmation, apply the migration with automatic backup:
   ```bash
   npm run migrate -- --client cursor --apply --replace-client
   npm run refresh
   npm run doctor
   ```
   Supported `--client` presets: `claude-code`, `cursor`, `claude-desktop`, `gemini`.

4. **Option B — Fresh Manual Client Connection:**
   Back up the target client configuration file first, then register `mcp-gateway` with the absolute path to `index.js`:
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
   Restart the AI client once so it loads `mcp-gateway`.

---

## 3. Verification & Rollback

* **Verify in a new session:** Confirm the agent sees the 5 core tools (`search_tools`, `call_tool`, `list_mcp_servers`, `refresh_tools_index`, `manage_mcp_server`).
* **Rollback if connection fails:**
  ```bash
  npm run migrate -- --client <client-name> --restore <path-to-backup-file>
  ```

---

## 4. Updating MCP Gateway

```bash
cd /path/to/mcp-gateway
git pull origin main
npm install
npm run refresh
npm run doctor
```
Your `config.json`, `.env`, and `tools-cache.json` are excluded from Git and remain untouched during updates.

---

## 5. Uninstalling / Reverting

1. Restore your previous client backup (if migrated via `auto-migrate`):
   ```bash
   npm run migrate -- --client <client-name> --restore <path-to-backup-file>
   ```
   Or remove `"mcp-gateway"` manually from your client's `mcpServers` JSON block.
2. Restart the AI client and delete the local `mcp-gateway` directory if no longer needed.

