#!/usr/bin/env node

import fs from "node:fs";
import { getGatewayPaths } from "../src/client-pool.js";
import { getCoreToolsDefinition, CORE_TOOL_COUNT } from "../src/server.js";
import { LOCALES } from "../src/i18n/locales.js";
import { redactSecretsFromText } from "../src/security.js";

const { configPath, envPath, cachePath } = getGatewayPaths();

function loadEnvKeys() {
  const keys = new Set(Object.keys(process.env));
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (k && v) keys.add(k);
      }
    }
  }
  return keys;
}

function extractPlaceholders(obj) {
  const vars = new Set();
  const raw = JSON.stringify(obj || {});
  const regex = /\$\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    vars.add(match[1]);
  }
  return [...vars];
}

function runDoctor() {
  console.log("=== MCP Gateway Doctor & Token Optimizer Diagnostics ===\n");

  if (!fs.existsSync(configPath)) {
    console.error("[FAIL] config.json not found at:", configPath);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    console.error("[FAIL] config.json is not valid JSON:", err.message);
    process.exit(1);
  }

  const servers = config.servers || {};
  const serverEntries = Object.entries(servers);
  const enabledServers = serverEntries.filter(([, s]) => s.enabled !== false);

  console.log(`[INFO] Configured Servers : ${serverEntries.length} (${enabledServers.length} enabled, ${serverEntries.length - enabledServers.length} disabled)`);

  // 1. Check Environment Variable Placeholders (without logging secret values)
  const envKeys = loadEnvKeys();
  const missingVars = [];
  for (const [id, s] of enabledServers) {
    const needed = [
      ...extractPlaceholders(s.env),
      ...extractPlaceholders(s.headers),
      ...extractPlaceholders(s.args),
    ];
    for (const varName of needed) {
      if (!envKeys.has(varName)) {
        missingVars.push({ server: id, variable: varName });
      }
    }
  }

  if (missingVars.length === 0) {
    console.log("[PASS] Environment secrets: All ${VAR} placeholders resolved in .env / environment.");
  } else {
    console.warn("[WARN] Missing environment variables in .env:");
    for (const m of missingVars) {
      console.warn(`       - Server "${m.server}" requires \${${m.variable}}`);
    }
  }

  // 2. Check Port / URL Collisions across HTTP/SSE/StreamableHTTP servers
  const portMap = new Map();
  const collisions = [];
  for (const [id, s] of enabledServers) {
    const rawUrl = s.url || s.httpUrl;
    if (!rawUrl) continue;
    try {
      const u = new URL(rawUrl);
      const hostPort = `${u.hostname}:${u.port || (u.protocol === "https:" ? "443" : "80")}${u.pathname}`;
      if (portMap.has(hostPort)) {
        collisions.push({ endpoint: hostPort, servers: [portMap.get(hostPort), id] });
      } else {
        portMap.set(hostPort, id);
      }
    } catch {
      console.warn(`[WARN] Server "${id}" has invalid URL: ${rawUrl}`);
    }
  }

  if (collisions.length === 0) {
    console.log("[PASS] Endpoint isolation : No duplicate HTTP/StreamableHTTP endpoints detected.");
  } else {
    console.warn("[WARN] Endpoint collisions detected:");
    for (const c of collisions) {
      console.warn(`       - ${c.endpoint} is shared by: ${c.servers.join(", ")}`);
    }
  }

  // 3. Check Tools Cache & Calculate Token Savings
  if (!fs.existsSync(cachePath)) {
    console.warn("[WARN] tools-cache.json not found. Run `npm run refresh` to index downstream tools.");
    return;
  }

  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch (err) {
    console.error("[FAIL] tools-cache.json is corrupted:", err.message);
    return;
  }

  const totalTools = cache.tools?.length || 0;
  const summaries = cache.serverSummaries || {};
  console.log(`[INFO] Cache Last Updated : ${cache.lastUpdated || "unknown"}`);
  console.log(`[INFO] Total Indexed Tools: ${totalTools}\n`);

  console.log("--- Server Status Breakdown ---");
  for (const [id, s] of serverEntries) {
    if (s.enabled === false) {
      console.log(`  [-] ${id.padEnd(16)} DISABLED`);
      continue;
    }
    const sum = summaries[id];
    if (!sum) {
      console.log(`  [?] ${id.padEnd(16)} NOT INDEXED (run: npm run mcp -- refresh ${id})`);
    } else if (sum.status && sum.status.startsWith("error")) {
      console.log(`  [!] ${id.padEnd(16)} OFFLINE / ERROR (${redactSecretsFromText(sum.status)})`);
    } else {
      console.log(`  [OK] ${id.padEnd(15)} ${String(sum.toolCount).padStart(3)} tools (${s.transport})`);
    }
  }

  // 4. Token Savings Estimate (chars / 4 heuristic on compact JSON tool declarations)
  const coreTools = getCoreToolsDefinition(LOCALES.en);
  const activeShortcutCount = enabledServers.reduce(
    (acc, [, s]) => acc + (Array.isArray(s.shortcuts) ? s.shortcuts.length : 0),
    0
  );
  const exposedToolCount = CORE_TOOL_COUNT + activeShortcutCount;

  const compactSchemaChars = (cache.tools || []).reduce(
    (sum, t) => sum + JSON.stringify({ name: t.name, description: t.description, inputSchema: t.inputSchema }).length,
    0
  );
  const gatewayCoreChars = coreTools.reduce(
    (sum, t) => sum + JSON.stringify({ name: t.name, description: t.description, inputSchema: t.inputSchema }).length,
    0
  );

  const estimatedDirectTokens = Math.round(compactSchemaChars / 4);
  const estimatedGatewayTokens = Math.round(gatewayCoreChars / 4) + activeShortcutCount * 40;
  const savedTokens = Math.max(0, estimatedDirectTokens - estimatedGatewayTokens);
  const reductionPct = estimatedDirectTokens > 0
    ? ((savedTokens / estimatedDirectTokens) * 100).toFixed(1)
    : "0.0";

  console.log("\n--- Token & Context Optimization Estimate (chars / 4 heuristic) ---");
  console.log(`  Direct MCP Load (est., without Gateway) : ~${estimatedDirectTokens.toLocaleString()} tokens / turn (${totalTools} tools)`);
  console.log(`  Gateway Footprint (est., base + short.) : ~${estimatedGatewayTokens.toLocaleString()} tokens / turn (${CORE_TOOL_COUNT} core + ${activeShortcutCount} shortcuts = ${exposedToolCount} tools)`);
  console.log(`  Estimated Declaration Savings / Turn    : ~${savedTokens.toLocaleString()} tokens (~${reductionPct}% schema reduction)`);
  console.log(`  64/128 Function Cap Status              : ${exposedToolCount <= 64 ? "SAFE" : "WARNING"} (${exposedToolCount} / 64 declarations used)`);
  console.log("  Note: Figures are character-based estimates of tool declaration schemas; runtime search_tools/call_tool turns add per-call payload.\n");
}

runDoctor();
