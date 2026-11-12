import { clientPool, getGatewayPaths, loadConfig, reloadEnv, saveConfig } from "./client-pool.js";
import { toolRegistry } from "./tool-registry.js";
import fs from "node:fs";
import { getTranslation } from "./i18n/locales.js";
import {
  isPlaceholderValue,
  isSensitiveKey,
  redactSecretsFromText,
  writeFileAtomic,
} from "./security.js";

function sanitizeEnvVariableName(serverId, keyName) {
  const cleanServer = String(serverId).replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  const cleanKey = String(keyName).replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  if (!cleanServer || cleanKey === cleanServer || cleanKey.startsWith(`${cleanServer}_`)) {
    return cleanKey || "SECRET";
  }
  return `${cleanServer}_${cleanKey}`;
}

export function maskAndSaveServerSecrets(serverId, envObj = {}, headersObj = {}) {
  const { envPath } = getGatewayPaths();
  const extractedSecrets = {};
  const maskedEnv = { ...(envObj || {}) };
  const maskedHeaders = { ...(headersObj || {}) };

  for (const [k, v] of Object.entries(maskedEnv)) {
    if (typeof v === "string" && v.length > 0 && !isPlaceholderValue(v) && isSensitiveKey(k)) {
      const envVar = sanitizeEnvVariableName(serverId, k);
      extractedSecrets[envVar] = v;
      maskedEnv[k] = `\${${envVar}}`;
    }
  }

  for (const [k, v] of Object.entries(maskedHeaders)) {
    if (typeof v === "string" && v.length > 0 && !isPlaceholderValue(v) && isSensitiveKey(k)) {
      const envVar = sanitizeEnvVariableName(serverId, k === "Authorization" ? "TOKEN" : k);
      const bearerMatch = v.match(/^Bearer\s+(.+)$/i);
      if (bearerMatch) {
        extractedSecrets[envVar] = bearerMatch[1].trim();
        maskedHeaders[k] = `Bearer \${${envVar}}`;
      } else {
        extractedSecrets[envVar] = v;
        maskedHeaders[k] = `\${${envVar}}`;
      }
    }
  }

  const secretEntries = Object.entries(extractedSecrets);
  if (secretEntries.length > 0) {
    let existingContent = "";
    if (fs.existsSync(envPath)) {
      existingContent = fs.readFileSync(envPath, "utf8");
    }

    const linesToAdd = [];
    for (const [key, val] of secretEntries) {
      const keyRegex = new RegExp(`^\\s*${key}\\s*=`, "m");
      if (!keyRegex.test(existingContent)) {
        linesToAdd.push(`${key}=${val}`);
      }
      process.env[key] = val;
    }

    if (linesToAdd.length > 0) {
      const prefix = existingContent.length > 0 && !existingContent.endsWith("\n") ? "\n" : "";
      const newContent = `${existingContent}${prefix}# Auto-extracted secrets\n${linesToAdd.join("\n")}\n`;
      writeFileAtomic(envPath, newContent, "utf8");
    }
    reloadEnv();
  }

  return {
    env: maskedEnv,
    headers: maskedHeaders,
    maskedKeys: Object.keys(extractedSecrets),
  };
}

export async function addServer(options) {
  const {
    id,
    name = id,
    description = "",
    descriptionTr,
    descriptionEn,
    transport: rawTransport,
    url,
    command,
    args = [],
    env = {},
    headers = {},
    shortcuts = [],
    verify = true,
  } = options;

  const t = getTranslation();

  if (!id || typeof id !== "string" || !id.trim()) {
    throw new Error(t.messages.idRequired);
  }

  const transport = rawTransport || (url ? "http" : "stdio");

  const config = loadConfig();
  if (!config.servers) {
    config.servers = {};
  }

  let finalDescription = description;
  if (descriptionTr || descriptionEn) {
    finalDescription = {
      tr: descriptionTr || (typeof description === "string" ? description : description?.tr || ""),
      en: descriptionEn || (typeof description === "string" ? description : description?.en || ""),
    };
  }

  const { env: safeEnv, headers: safeHeaders, maskedKeys } = maskAndSaveServerSecrets(id, env, headers);

  const serverConfig = {
    id,
    name,
    description: finalDescription,
    transport,
    enabled: true,
    shortcuts,
  };

  if (transport === "http" || transport === "sse" || transport === "streamableHttp") {
    if (!url) throw new Error(t.messages.urlRequired);
    serverConfig.url = url;
    if (Object.keys(safeHeaders).length > 0) serverConfig.headers = safeHeaders;
  } else {
    if (!command) throw new Error(t.messages.commandRequired);
    serverConfig.command = command;
    serverConfig.args = args;
    if (Object.keys(safeEnv).length > 0) serverConfig.env = safeEnv;
  }

  await clientPool.closeClient(id);

  config.servers[id] = serverConfig;
  saveConfig(config);
  console.error(t.messages.configWritten(id));

  let indexedTools = 0;
  let verifyStatus = "skipped";

  if (verify) {
    console.error(t.messages.verifyingServer(id));
    try {
      const updatedCache = await toolRegistry.refreshSingleServer(id);
      indexedTools = updatedCache.serverSummaries?.[id]?.toolCount || 0;
      verifyStatus = "connected";
      console.error(t.messages.verifySuccess(id));
    } catch (err) {
      const safeMsg = redactSecretsFromText(err.message);
      verifyStatus = `warning: ${safeMsg}`;
      console.error(t.messages.verifyWarning(safeMsg));
    } finally {
      await clientPool.closeClient(id);
    }
  } else {
    console.error(t.messages.verifySkipped);
  }

  return {
    id,
    transport,
    indexedTools,
    status: verifyStatus,
    maskedSecrets: maskedKeys,
  };
}

export function parseJsonConfig(jsonInput) {
  const t = getTranslation();
  let parsed;
  if (typeof jsonInput === "object" && jsonInput !== null && !Array.isArray(jsonInput)) {
    parsed = jsonInput;
  } else if (typeof jsonInput === "string") {
    try {
      parsed = JSON.parse(jsonInput);
    } catch (err) {
      throw new Error(t.messages.invalidJson(err.message));
    }
  } else {
    throw new Error(t.messages.invalidJson("Expected JSON object or JSON string."));
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(t.messages.noServerFoundInJson);
  }

  const serversObj = parsed.mcpServers || parsed.servers || parsed;
  if (!serversObj || typeof serversObj !== "object" || Array.isArray(serversObj)) {
    throw new Error(t.messages.noServerFoundInJson);
  }

  const results = [];
  for (const [id, raw] of Object.entries(serversObj)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;

    const isHttp = Boolean(
      raw.url ||
      raw.httpUrl ||
      raw.transport === "http" ||
      raw.transport === "streamableHttp" ||
      raw.transport === "sse" ||
      raw.type === "remote"
    );

    if (!isHttp && !raw.command) {
      continue;
    }

    const server = {
      id: raw.id || id,
      name: raw.name || id,
      description: raw.description || "",
      transport: raw.transport || (isHttp ? "http" : "stdio"),
      enabled: raw.enabled !== false,
      shortcuts: Array.isArray(raw.shortcuts) ? raw.shortcuts : [],
    };

    if (server.transport === "http" || server.transport === "sse" || server.transport === "streamableHttp" || isHttp) {
      server.url = raw.url || raw.httpUrl;
      if (!server.url) continue;
      if (!["http", "sse", "streamableHttp"].includes(server.transport)) {
        server.transport = "http";
      }
      if (raw.headers && typeof raw.headers === "object") server.headers = raw.headers;
    } else {
      server.command = raw.command;
      server.args = Array.isArray(raw.args) ? raw.args : [];
      if (raw.env && typeof raw.env === "object") server.env = raw.env;
    }

    results.push(server);
  }

  if (results.length === 0) {
    throw new Error(t.messages.noServerFoundInJson);
  }

  return results;
}

export async function removeServer(id) {
  const t = getTranslation();
  if (!id || typeof id !== "string") {
    throw new Error(t.messages.idRequired);
  }
  const config = loadConfig();
  if (!config.servers || !config.servers[id]) {
    throw new Error(t.messages.serverNotFound(id));
  }

  await clientPool.closeClient(id);
  delete config.servers[id];
  saveConfig(config);
  console.error(t.messages.serverRemovedConfig(id));

  toolRegistry.removeServerFromCache(id);
  console.error(t.messages.serverRemovedCache(id));
  return { id, status: "removed" };
}

export async function setServerEnabled(id, enabled) {
  const t = getTranslation();
  if (!id || typeof id !== "string") {
    throw new Error(t.messages.idRequired);
  }
  const config = loadConfig();
  if (!config.servers || !config.servers[id]) {
    throw new Error(t.messages.serverNotFound(id));
  }

  await clientPool.closeClient(id);
  config.servers[id].enabled = enabled;
  saveConfig(config);
  console.error(t.messages.serverStatusChanged(id, enabled));

  let indexedTools = 0;
  if (enabled) {
    try {
      const updated = await toolRegistry.refreshSingleServer(id);
      indexedTools = updated.serverSummaries?.[id]?.toolCount || 0;
    } catch {
      // ignore if offline
    } finally {
      await clientPool.closeClient(id);
    }
  } else {
    toolRegistry.removeServerFromCache(id);
  }

  return { id, enabled, indexedTools };
}
