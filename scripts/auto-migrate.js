#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maskAndSaveServerSecrets, parseJsonConfig } from "../src/manager.js";
import { getGatewayPaths, loadConfig, saveConfig } from "../src/client-pool.js";
import {
  assertPathWithinAllowedDirs,
  backupFile,
  redactSecretsFromText,
  restoreFile,
  writeFileAtomic,
} from "../src/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

export const SUPPORTED_CLIENTS = ["claude-code", "claude-desktop", "cursor", "gemini"];

export function resolveClientPath(clientName, options = {}) {
  const home = options.homeDir || os.homedir();
  const appData = options.appDataDir || process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const platform = options.platform || process.platform;
  const cwd = options.cwd || process.cwd();

  switch (clientName) {
    case "claude-code":
      return path.join(home, ".claude.json");
    case "claude-desktop":
      if (platform === "win32") {
        return path.join(appData, "Claude", "claude_desktop_config.json");
      }
      if (platform === "darwin") {
        return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
      }
      return path.join(home, ".config", "Claude", "claude_desktop_config.json");
    case "cursor": {
      const workspaceCursor = path.join(cwd, ".cursor", "mcp.json");
      if (options.workspaceOnly || (!options.globalOnly && fs.existsSync(workspaceCursor))) {
        return workspaceCursor;
      }
      return path.join(home, ".cursor", "mcp.json");
    }
    case "gemini":
      return path.join(home, ".gemini", "settings.json");
    default:
      return null;
  }
}

function getAllowedTargetDirs(options = {}) {
  const home = options.homeDir || os.homedir();
  const appData = options.appDataDir || process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const dirs = [home, appData, rootDir, process.cwd(), os.tmpdir()];
  if (Array.isArray(options.allowedDirs)) {
    dirs.push(...options.allowedDirs);
  }
  return dirs;
}

export function migrateClientConfig(options = {}) {
  const {
    client,
    file,
    apply = false,
    replaceClient = false,
    gatewayEntryPath = path.join(rootDir, "index.js").replace(/\\/g, "/"),
  } = options;

  let targetPath = null;
  if (client) {
    if (!SUPPORTED_CLIENTS.includes(client)) {
      throw new Error(
        `Unsupported client "${client}". Supported clients: ${SUPPORTED_CLIENTS.join(", ")}. Use --file <path> for custom config files.`
      );
    }
    targetPath = resolveClientPath(client, options);
  } else if (file) {
    targetPath = path.resolve(file);
  } else {
    throw new Error("Please specify --client <name> or --file <path>.");
  }

  targetPath = assertPathWithinAllowedDirs(targetPath, getAllowedTargetDirs(options));

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Configuration file not found: ${targetPath}`);
  }

  const rawClientContent = fs.readFileSync(targetPath, "utf8");
  let clientJson;
  try {
    clientJson = JSON.parse(rawClientContent);
  } catch (err) {
    throw new Error(`Failed to parse JSON in ${targetPath}: ${err.message}`);
  }

  if (!clientJson || typeof clientJson !== "object" || Array.isArray(clientJson)) {
    throw new Error(`Unsupported config format in ${targetPath}: root JSON value must be an object.`);
  }

  const hasMcpServersBlock =
    clientJson.mcpServers && typeof clientJson.mcpServers === "object" && !Array.isArray(clientJson.mcpServers);
  const hasServersBlock =
    clientJson.servers && typeof clientJson.servers === "object" && !Array.isArray(clientJson.servers);

  if (!hasMcpServersBlock && !hasServersBlock) {
    throw new Error(
      `Unsupported config format in ${targetPath}: missing "mcpServers" (or "servers") object.`
    );
  }

  const containerKey = hasMcpServersBlock ? "mcpServers" : "servers";
  const alreadyHasGateway = Boolean(clientJson[containerKey]["mcp-gateway"]);
  const rawExternalEntries = Object.entries(clientJson[containerKey]).filter(([id]) => id !== "mcp-gateway");

  if (rawExternalEntries.length === 0) {
    return {
      status: alreadyHasGateway ? "already_migrated" : "empty",
      targetPath,
      discoveredCount: 0,
      addedIds: [],
      updatedIds: [],
      maskedKeys: [],
      backupPath: null,
      applied: false,
    };
  }

  const parsedServers = parseJsonConfig({ [containerKey]: Object.fromEntries(rawExternalEntries) });

  const gatewayConfig = loadConfig();
  if (!gatewayConfig.servers) gatewayConfig.servers = {};

  const addedIds = [];
  const updatedIds = [];
  const allMaskedKeys = [];
  const preparedServers = [];

  for (const srv of parsedServers) {
    if (gatewayConfig.servers[srv.id]) {
      updatedIds.push(srv.id);
    } else {
      addedIds.push(srv.id);
    }
    preparedServers.push(srv);
  }

  if (!apply) {
    return {
      status: "dry_run",
      targetPath,
      discoveredCount: preparedServers.length,
      servers: preparedServers.map((s) => ({ id: s.id, transport: s.transport, target: s.url || s.command })),
      addedIds,
      updatedIds,
      maskedKeys: [],
      backupPath: null,
      applied: false,
    };
  }

  const { configPath } = getGatewayPaths();
  const gatewayBackup = fs.existsSync(configPath) ? backupFile(configPath) : null;
  let clientBackup = null;
  const completedSteps = [];

  try {
    for (const srv of preparedServers) {
      const { env: safeEnv, headers: safeHeaders, maskedKeys } = maskAndSaveServerSecrets(
        srv.id,
        srv.env || {},
        srv.headers || {}
      );
      if (srv.env) srv.env = safeEnv;
      if (srv.headers) srv.headers = safeHeaders;
      allMaskedKeys.push(...maskedKeys);
      gatewayConfig.servers[srv.id] = srv;
    }
    completedSteps.push("extract_secrets_to_env");

    saveConfig(gatewayConfig);
    JSON.parse(fs.readFileSync(configPath, "utf8"));
    completedSteps.push("write_and_verify_gateway_config");

    if (replaceClient) {
      clientBackup = backupFile(targetPath);
      completedSteps.push("backup_client_config");
      const updatedClient = {
        ...clientJson,
        [containerKey]: {
          "mcp-gateway": {
            command: "node",
            args: [gatewayEntryPath],
          },
        },
      };
      writeFileAtomic(targetPath, JSON.stringify(updatedClient, null, 2) + "\n", "utf8");
      const verifiedClient = JSON.parse(fs.readFileSync(targetPath, "utf8"));
      if (!verifiedClient?.[containerKey]?.["mcp-gateway"]) {
        throw new Error(`Post-write verification failed for ${targetPath}`);
      }
      completedSteps.push("replace_and_verify_client_config");
    }
  } catch (err) {
    const rolledBack = [];
    if (gatewayBackup && fs.existsSync(gatewayBackup)) {
      restoreFile(gatewayBackup, configPath);
      rolledBack.push(`restored ${configPath}`);
    }
    if (clientBackup && fs.existsSync(clientBackup)) {
      restoreFile(clientBackup, targetPath);
      rolledBack.push(`restored ${targetPath}`);
    }
    const detail = `Migration failed after steps [${completedSteps.join(", ") || "none"}]; rollback [${rolledBack.join(", ") || "none"}]: ${err.message}`;
    throw new Error(detail);
  }

  return {
    status: "migrated",
    targetPath,
    discoveredCount: preparedServers.length,
    servers: preparedServers.map((s) => ({ id: s.id, transport: s.transport, target: s.url || s.command })),
    addedIds,
    updatedIds,
    maskedKeys: [...new Set(allMaskedKeys)],
    backupPath: clientBackup,
    gatewayBackupPath: gatewayBackup,
    completedSteps,
    applied: true,
    replacedClient: replaceClient,
  };
}

export function restoreClientConfig(backupPath, options = {}) {
  let targetPath = options.file ? path.resolve(options.file) : null;
  if (options.client) {
    if (!SUPPORTED_CLIENTS.includes(options.client)) {
      throw new Error(`Unsupported client "${options.client}".`);
    }
    targetPath = resolveClientPath(options.client, options);
  }
  if (!targetPath) {
    throw new Error("Please specify --client <name> or --file <path> to restore.");
  }

  const allowedDirs = getAllowedTargetDirs(options);
  const safeBackup = assertPathWithinAllowedDirs(path.resolve(backupPath), allowedDirs);
  const safeTarget = assertPathWithinAllowedDirs(targetPath, allowedDirs);

  if (!fs.existsSync(safeBackup)) {
    throw new Error(`Backup file not found: ${safeBackup}`);
  }

  // Validate backup JSON before touching target file
  JSON.parse(fs.readFileSync(safeBackup, "utf8"));
  const stat = fs.statSync(safeBackup);
  const backupTimestamp = stat.mtime.toISOString();

  // Back up current target file before restoring over it
  const preRestoreBackup = fs.existsSync(safeTarget) ? backupFile(safeTarget) : null;

  restoreFile(safeBackup, safeTarget);
  JSON.parse(fs.readFileSync(safeTarget, "utf8"));

  return {
    targetPath: safeTarget,
    backupPath: safeBackup,
    backupTimestamp,
    preRestoreBackup,
  };
}

function printHelp() {
  console.log(`
Usage:
  node scripts/auto-migrate.js [options]

Options:
  --client <name>        Target client preset: claude-code | claude-desktop | cursor | gemini
  --file <path>          Path to an explicit MCP JSON configuration file
  --apply                Write imported servers to config.json and extract secrets to .env (default: dry-run)
  --replace-client       Backup target client config and replace its mcpServers with single mcp-gateway entry
  --restore <bak-path>   Restore a client config from a backup file
  --help, -h             Show this help message

Examples:
  node scripts/auto-migrate.js --client cursor
  node scripts/auto-migrate.js --client claude-code --apply --replace-client
  node scripts/auto-migrate.js --client cursor --restore ~/.cursor/mcp.json.bak.1731420000000
`);
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  let client = null;
  let file = null;
  let apply = false;
  let replaceClient = false;
  let restorePath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--client" && args[i + 1]) client = args[++i];
    else if (arg === "--file" && args[i + 1]) file = args[++i];
    else if (arg === "--apply") apply = true;
    else if (arg === "--replace-client") replaceClient = true;
    else if (arg === "--restore" && args[i + 1]) restorePath = args[++i];
  }

  if (restorePath) {
    const restored = restoreClientConfig(restorePath, { client, file });
    console.log(`[OK] Restored client configuration: ${restored.targetPath}`);
    console.log(`     Backup source: ${restored.backupPath} (timestamp: ${restored.backupTimestamp || "unknown"})`);
    if (restored.preRestoreBackup) {
      console.log(`     Pre-restore safety backup: ${restored.preRestoreBackup}`);
    }
    return;
  }

  const result = migrateClientConfig({ client, file, apply, replaceClient });

  if (result.status === "already_migrated") {
    console.log(`[INFO] ${result.targetPath} is already migrated to 'mcp-gateway'. No changes made.`);
    return;
  }
  if (result.status === "empty") {
    console.log(`[INFO] No external MCP servers found to migrate in ${result.targetPath}.`);
    return;
  }

  console.log(`=== MCP Gateway Auto-Migration (${result.applied ? "APPLY MODE" : "DRY-RUN PREVIEW"}) ===`);
  console.log(`Source Config     : ${result.targetPath}`);
  console.log(`Discovered Servers: ${result.discoveredCount} (${result.addedIds.length} new, ${result.updatedIds.length} existing)`);
  for (const srv of result.servers) {
    console.log(`  • ${srv.id.padEnd(18)} [${srv.transport}] ${srv.target || ""}`);
  }

  if (!result.applied) {
    console.log("\n[DRY-RUN] No files were modified. Re-run with `--apply` to save to MCP Gateway.");
    return;
  }

  if (result.maskedKeys.length > 0) {
    console.log(`[OK] Extracted ${result.maskedKeys.length} secret(s) to .env: ${result.maskedKeys.map((k) => `\${${k}}`).join(", ")}`);
  }
  if (result.backupPath) {
    console.log(`[OK] Created client config backup: ${result.backupPath}`);
  }
  if (result.replacedClient) {
    console.log(`[OK] Replaced mcpServers in ${result.targetPath} with single 'mcp-gateway' entry.`);
  }
  console.log("\nNext Step: Run `npm run refresh` and `npm run doctor`.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (err) {
    console.error(`[ERROR] ${redactSecretsFromText(err.message)}`);
    process.exit(1);
  }
}
