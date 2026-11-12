import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrateClientConfig, resolveClientPath, restoreClientConfig } from "../scripts/auto-migrate.js";

function setupTempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-gw-mig-"));
  const homeDir = path.join(root, "home");
  const appDataDir = path.join(root, "appdata");
  const dataDir = path.join(root, "gateway-data");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(appDataDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  return { root, homeDir, appDataDir, dataDir };
}

test("resolveClientPath resolves expected paths across Claude Code, Cursor, Claude Desktop, and Gemini CLI", () => {
  const { root, homeDir, appDataDir } = setupTempEnv();
  try {
    assert.equal(resolveClientPath("claude-code", { homeDir }), path.join(homeDir, ".claude.json"));
    assert.equal(resolveClientPath("cursor", { homeDir, globalOnly: true }), path.join(homeDir, ".cursor", "mcp.json"));
    assert.equal(resolveClientPath("gemini", { homeDir }), path.join(homeDir, ".gemini", "settings.json"));
    assert.equal(
      resolveClientPath("claude-desktop", { homeDir, appDataDir, platform: "win32" }),
      path.join(appDataDir, "Claude", "claude_desktop_config.json")
    );
    assert.equal(
      resolveClientPath("claude-desktop", { homeDir, platform: "darwin" }),
      path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    );
    assert.equal(
      resolveClientPath("claude-desktop", { homeDir, platform: "linux" }),
      path.join(homeDir, ".config", "Claude", "claude_desktop_config.json")
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migration dry-run, apply, backup, idempotency, and restore work for all supported clients", () => {
  const { root, homeDir, appDataDir, dataDir } = setupTempEnv();
  const prevDataDir = process.env.MCP_GATEWAY_DATA_DIR;
  process.env.MCP_GATEWAY_DATA_DIR = dataDir;

  try {
    const clientTargets = [
      { name: "claude-code", file: resolveClientPath("claude-code", { homeDir }) },
      { name: "cursor", file: resolveClientPath("cursor", { homeDir, globalOnly: true }) },
      { name: "claude-desktop", file: resolveClientPath("claude-desktop", { homeDir, appDataDir, platform: "win32" }) },
      { name: "gemini", file: resolveClientPath("gemini", { homeDir }) },
    ];

    for (const c of clientTargets) {
      fs.mkdirSync(path.dirname(c.file), { recursive: true });
      const originalPayload = {
        theme: "dark",
        mcpServers: {
          [`${c.name}-github`]: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
              GITHUB_PERSONAL_ACCESS_TOKEN: `MOCK_TOKEN_FOR_${c.name.toUpperCase()}`,
            },
          },
        },
      };
      const originalRaw = JSON.stringify(originalPayload, null, 2);
      fs.writeFileSync(c.file, originalRaw, "utf8");

      // 1. Dry-run must NOT modify client file
      const dryRes = migrateClientConfig({
        client: c.name,
        homeDir,
        appDataDir,
        platform: "win32",
        globalOnly: true,
        allowedDirs: [root],
        apply: false,
      });
      assert.equal(dryRes.status, "dry_run");
      assert.equal(dryRes.discoveredCount, 1);
      assert.equal(fs.readFileSync(c.file, "utf8"), originalRaw);

      // 2. Apply + replaceClient creates backup, preserves non-mcpServers keys, masks secrets
      const applyRes = migrateClientConfig({
        client: c.name,
        homeDir,
        appDataDir,
        platform: "win32",
        globalOnly: true,
        allowedDirs: [root],
        apply: true,
        replaceClient: true,
      });
      assert.equal(applyRes.status, "migrated");
      assert.ok(applyRes.backupPath && fs.existsSync(applyRes.backupPath));
      assert.ok(applyRes.maskedKeys.length >= 1);

      const updatedClient = JSON.parse(fs.readFileSync(c.file, "utf8"));
      assert.equal(updatedClient.theme, "dark");
      assert.deepEqual(Object.keys(updatedClient.mcpServers), ["mcp-gateway"]);

      // 3. Idempotency: re-running reports already_migrated and does NOT modify file
      const repeatRes = migrateClientConfig({
        client: c.name,
        homeDir,
        appDataDir,
        platform: "win32",
        globalOnly: true,
        allowedDirs: [root],
        apply: true,
        replaceClient: true,
      });
      assert.equal(repeatRes.status, "already_migrated");

      // 4. Restore validates backup, creates pre-restore safety backup, and restores exact original content
      const restoreRes = restoreClientConfig(applyRes.backupPath, {
        client: c.name,
        homeDir,
        appDataDir,
        platform: "win32",
        globalOnly: true,
        allowedDirs: [root],
      });
      assert.equal(restoreRes.targetPath, c.file);
      assert.equal(restoreRes.backupPath, applyRes.backupPath);
      assert.ok(restoreRes.backupTimestamp);
      assert.ok(restoreRes.preRestoreBackup && fs.existsSync(restoreRes.preRestoreBackup));
      const preRestoreObj = JSON.parse(fs.readFileSync(restoreRes.preRestoreBackup, "utf8"));
      assert.deepEqual(Object.keys(preRestoreObj.mcpServers), ["mcp-gateway"]);
      assert.equal(fs.readFileSync(c.file, "utf8"), originalRaw);
    }

    // Verify cross-platform non-Windows path resolution (darwin/linux)
    assert.equal(resolveClientPath("claude-code", { homeDir, platform: "darwin" }), path.join(homeDir, ".claude.json"));
    assert.equal(resolveClientPath("cursor", { homeDir, platform: "linux", globalOnly: true }), path.join(homeDir, ".cursor", "mcp.json"));
    assert.equal(resolveClientPath("gemini", { homeDir, platform: "darwin" }), path.join(homeDir, ".gemini", "settings.json"));

    // Verify gateway config.json & .env received masked configs without plaintext tokens
    const gwConfig = JSON.parse(fs.readFileSync(path.join(dataDir, "config.json"), "utf8"));
    assert.ok(!JSON.stringify(gwConfig).includes("MOCK_TOKEN_FOR_"));
    const envContent = fs.readFileSync(path.join(dataDir, ".env"), "utf8");
    assert.ok(envContent.includes("MOCK_TOKEN_FOR_CURSOR"));
  } finally {
    if (prevDataDir === undefined) delete process.env.MCP_GATEWAY_DATA_DIR;
    else process.env.MCP_GATEWAY_DATA_DIR = prevDataDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migration rejects unsupported clients and malformed config files without modifying files", () => {
  const { root, homeDir, appDataDir } = setupTempEnv();
  try {
    assert.throws(
      () => migrateClientConfig({ client: "unknown-ide", homeDir, appDataDir }),
      /Unsupported client/
    );

    const badFile = path.join(homeDir, "bad-config.json");
    const badContent = JSON.stringify({ theme: "light" });
    fs.writeFileSync(badFile, badContent, "utf8");

    assert.throws(
      () => migrateClientConfig({ file: badFile, allowedDirs: [root], apply: true }),
      /missing "mcpServers"/
    );
    assert.equal(fs.readFileSync(badFile, "utf8"), badContent);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

