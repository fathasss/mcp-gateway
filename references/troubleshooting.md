# Troubleshooting & Diagnostics

---

## 1. Quick Diagnostic Command

Run the built-in doctor from the `mcp-gateway` directory:
```bash
npm run doctor
```
It checks:
1. Missing `${VAR}` secrets in `.env`
2. Duplicate HTTP/SSE/StreamableHTTP URLs or port collisions
3. Per-server indexed tool counts and offline errors
4. Estimated schema footprint vs. the 64/128 function cap

---

## 2. Common Issues & Fixes

### `search_tools` returns `found: 0`
* **Cause:** `tools-cache.json` has not been built yet, or the target server was offline during the last refresh.
* **Fix:** Call `refresh_tools_index` in chat (or run `npm run refresh` / `npm run mcp -- refresh <server-id>`).

### Downstream HTTP server shows `ECONNREFUSED` or `405 Method Not Allowed`
* **Cause:** The local app (e.g., Unreal Engine, Unity, n8n, Docker container) is stopped, or uses a different transport.
* **Fix:**
  1. Start the target application or container.
  2. Call `refresh_tools_index` (no IDE restart needed).
  3. If the server uses legacy SSE only, set `"transport": "sse"` instead of `"http"`.

### `manage_mcp_server` is not available in chat
* **Cause:** `mcp-gateway` is not installed or not yet connected in the host client's MCP configuration.
* **Fix:** Follow **Phase A** in `SKILL.md` (and `references/installation-guide.md`) to install and connect `mcp-gateway` first, then restart the client once.

### Windows `npx` fails with `ENOENT`
* **Cause:** Windows requires `npx.cmd` / `npm.cmd` when spawned from Node.js.
* **Fix:** `src/client-pool.js` automatically maps `npx` -> `npx.cmd` and `npm` -> `npm.cmd` on `win32`. Verify `node` and `npm` are on your system `PATH`.

### Migration modified the wrong file or failed mid-way
* **Fix:** Restore the automatic timestamped backup created by `auto-migrate.js`:
  ```bash
  npm run migrate -- --client <client-name> --restore <backup-file-path>
  ```

