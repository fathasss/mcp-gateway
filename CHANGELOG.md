# Changelog

All notable changes to the **MCP Gateway** project and **MCP Gateway Skill** are documented here.

## [1.0.0] - 2026-11-12

### Added
- **Two-Phase Skill Workflow (`SKILL.md` & `references/`):** Added pre-flight installation detection (Phase A), explicit consent and secret-hygiene rules, complete tool parameter documentation (`references/gateway-tool-reference.md`), and live Gateway orchestration (Phase B).
- **Hot-Plug Server Management (`manage_mcp_server`):** Added runtime server registration (`add`, `add_json`, `remove`, `enable`, `disable`) with immediate tool indexing, plus `MCP_GATEWAY_TOOL_TIMEOUT_MS` timeout handling and closed-connection recovery in `src/client-pool.js`.
- **Security Hardening (`src/security.js`):** Added recursive secret redaction across nested objects/arrays, cross-platform home path masking (Windows/macOS/Linux), atomic temp-file + rename writes, allowed-path enforcement, and secret redaction in Gateway logs/errors.
- **Client Migration & Rollback (`scripts/auto-migrate.js`):** Added dry-run preview, timestamped backups, post-write JSON verification, partial-failure reporting, idempotency protection, and `--restore` rollback with pre-restore safety backups for Claude Code, Cursor, Claude Desktop, and Gemini CLI.
- **Diagnostics & Reproducible Benchmark (`scripts/doctor.js`, `scripts/benchmark.js`):** Added health checks and synthetic benchmark measurements derived from the live core tool definitions.
- **Cross-Platform Agensi Packaging (`scripts/build-agensi-package.js`):** Added pure-Node ZIP builder producing POSIX `/` paths with `SKILL.md` at archive root and zero sensitive files.
- **Automated Test Suite (`tests/`):** Added syntax, security, registry, MCP integration, migration, and ZIP package verification tests.

