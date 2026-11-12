# Security & Secret Management Guide

MCP Gateway helps keep credentials separated in `<gateway-root>/.env` and out of `config.json`, example configs, and Gateway management outputs.

> **Security Notice (Gateway-Managed Credentials):** Secrets handled via `.env` are stored on disk as **local plaintext** in `<gateway-root>/.env` (not in an OS keychain). Protect host filesystem permissions, avoid asking users to paste raw secrets into AI chat, and note that third-party `call_tool` response payloads are passed through without Gateway redaction.

---

## 1. Where Credentials & Backups Are Stored

* **`<gateway-root>/.env`:** Primary local store for secret values referenced by `${VAR_NAME}` placeholders in `config.json`. Stored as plaintext; excluded from Git via `.gitignore`.
* **`config.json`:** Stores server definitions with sensitive `env`/`headers` keys replaced by `${VAR_NAME}` placeholders. Excluded from Git via `.gitignore`.
* **`.env.example` & `config.example.json`:** Safe template files containing dummy placeholders only (`npm run mask` generates `config.example.json` without modifying `config.json`).
* **Client Config Backups (`.bak.<timestamp>`):** `scripts/auto-migrate.js` creates timestamped backups of client configs (and pre-restore safety backups on `--restore`). Original client configs and `.bak.<timestamp>` files may still hold pre-migration secrets—restrict file permissions and remove `.bak` files once migration is verified.

---

## 2. Automatic Extraction & Redaction Scope

* **Automatic Extraction (`manage_mcp_server` & `npm run migrate`):**
  * Keys matching sensitive patterns (case-insensitive: `apiKey`, `access_token`, `refresh_token`, `password`, `clientSecret`, `privateKey`, `Authorization`, `Bearer`, `token`, `secret`, etc.) are extracted from `env` and `headers`.
  * Raw values are written atomically to `<gateway-root>/.env` and replaced in `config.json` with `${VAR_NAME}` placeholders (e.g., `${GITHUB_PERSONAL_ACCESS_TOKEN}`).
* **What Gateway Redacts:**
  * `list_mcp_servers` output (`redactConfigObject()` masks sensitive fields in server configurations).
  * `npm run mask` (`config.example.json` masks nested objects/arrays recursively and replaces Windows `C:\Users\<name>\`, macOS `/Users/<name>/`, and Linux `/home/<name>/` home paths with `USERNAME`).
  * Gateway registry and connection error strings (`redactSecretsFromText()` masks `process.env` secret values of length `>= 6`, `Bearer` tokens, JWTs matching `eyJ...`, and token prefixes such as `ghp_...` / `sk-...`).
* **What Gateway Does NOT Redact:**
  * Payload bodies returned inside downstream `call_tool` responses from third-party MCP servers.
  * External logs written directly by third-party downstream MCP processes.

---

## 3. Recommended Secret Hygiene

* **Never paste raw secrets in chat:** Instruct users to add secrets directly to `<gateway-root>/.env` locally and reference `"${VAR_NAME}"` in `manage_mcp_server` calls.
* **Protect file permissions:** Restrict `.env` and `config.json` to the current user (`chmod 600 .env config.json` on macOS/Linux, or user-only NTFS ACLs on Windows).
* **Verify Git exclusions before committing/sharing:** Confirm `.gitignore` covers `.env`, `.env.*` (except `.env.example`), `config.json`, `tools-cache.json`, and `*.log`, and inspect `.env.example` / `config.example.json` before publishing.

---

## 4. Filesystem & Command Safety

* **Atomic Writes:** Writes to `config.json`, `.env`, `tools-cache.json`, `config.example.json`, and migrated client configs write to a unique temporary file first and rename atomically (`writeFileAtomic()`).
* **Path Boundaries:** Configuration and masking scripts enforce `assertPathWithinAllowedDirs()` to block writes outside expected workspace or client configuration directories.
* **No Shell Interpolation:** Packaging and subprocess runners pass argument arrays rather than concatenating user input into shell command strings.

---

## 5. Agent Confirmation Rules

Before modifying local files or running commands, the agent **must** summarize the target server/file/command and obtain explicit user confirmation for:
1. Installation or update commands (`git clone`, `npm install` — noting lifecycle script execution risk — `npm run refresh`, `npm run doctor`)
2. Applying or restoring client config migrations (`--apply --replace-client`, `--restore`)
3. Adding, updating (re-`add` with existing `id`), enabling, disabling, or removing servers via `manage_mcp_server`
4. Modifying or overwriting any client MCP configuration file
