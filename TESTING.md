# Testing & Verification Guide

MCP Gateway uses Node.js's built-in test runner (`node:test`) with zero external test dependencies. All test fixtures use synthetic/mock data—no real credentials or personal configuration files are used.

---

## Running the Test Suite

```bash
# Run all syntax, unit, security, migration, integration, and packaging tests
npm test

# Run the reproducible synthetic token benchmark
npm run benchmark

# Build and verify the Agensi skill ZIP package
npm run build:agensi
```

---

## Test Coverage Breakdown

| Test File | Scope | What Is Verified |
| :--- | :--- | :--- |
| `tests/syntax.test.js` | Static validation | Runs `node --check` on every `.js` file across the repository. |
| `tests/security.test.js` | Secret redaction & FS safety | Case-insensitive secret key masking (`apiKey`, `access_token`, `GITHUB_PERSONAL_ACCESS_TOKEN`, `password`, `clientSecret`, `privateKey`), recursive nested object/array redaction, non-secret preservation, Windows/macOS/Linux path masking, `redactSecretsFromText`, path traversal blocking, atomic writes, and backup/restore. |
| `tests/registry-and-routing.test.js` | Config parsing & discovery | `parseJsonConfig` validation, invalid JSON/payload errors, `ToolRegistry` EN/TR synonym search, and `CORE_TOOL_COUNT` consistency across locales. |
| `tests/integration-mcp.test.js` | End-to-end live MCP stdio | Spawns real `index.js` + real mock downstream stdio MCP server; verifies `listTools` (5 core tools), `manage_mcp_server` (`add`, `disable`, `remove`), `list_mcp_servers` secret redaction, `search_tools`, `call_tool`, and error handling (offline server, missing params, invalid JSON). |
| `tests/migration.test.js` | Client compatibility | Tests `claude-code`, `cursor`, `claude-desktop`, and `gemini` path resolution, dry-run preview, `--apply --replace-client` with backup, idempotency on repeat run, `--restore` rollback, and rejection of unsupported clients/malformed configs. |
| `tests/agensi-package.test.js` | Agensi ZIP verification | Builds `mcp-gateway-skill.zip`, parses ZIP Central Directory, verifies `SKILL.md` at archive root, strictly POSIX `/` paths, all `references/*.md` linked inside `SKILL.md`, and zero leaked source/secrets. |

---

## Benchmark Methodology & Limitations

`npm run benchmark` evaluates synthetic deterministic MCP toolsets (10, 60, and 250 tools) over a 5-turn single-tool task (including 1 `search_tools` lookup returning 5 schemas and 1 `call_tool` execution).
- **Estimation method:** `Math.round(compactJsonChars / 4)` heuristic.
- **Limitations:** Actual token counts depend on the target LLM's tokenizer, schema verbosity, and how many distinct `search_tools` calls an agent performs in a session. Small setups (e.g., 10 tools) show modest savings (~13.7%) because the 5 core tools carry a ~833-token baseline footprint, while larger setups (60–250 tools) show much higher estimated declaration savings (~85.6%–96.5%).

