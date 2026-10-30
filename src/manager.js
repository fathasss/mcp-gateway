import { clientPool, loadConfig } from "./client-pool.js";
import { toolRegistry } from "./tool-registry.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTranslation } from "./i18n/locales.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "..", "config.json");

export async function addServer(options) {
  const {
    id,
    name = id,
    description = "",
    descriptionTr,
    descriptionEn,
    transport = "stdio",
    url,
    command,
    args = [],
    env = {},
    headers = {},
    shortcuts = [],
    verify = true
  } = options;

  const t = getTranslation();

  if (!id) {
    throw new Error(t.messages.idRequired);
  }

  const config = loadConfig();
  if (!config.servers) {
    config.servers = {};
  }

  // description TR/EN desteği
  let finalDescription = description;
  if (descriptionTr || descriptionEn) {
    finalDescription = {
      tr: descriptionTr || (typeof description === "string" ? description : description?.tr || ""),
      en: descriptionEn || (typeof description === "string" ? description : description?.en || "")
    };
  }

  const serverConfig = {
    id,
    name,
    description: finalDescription,
    transport,
    enabled: true,
    shortcuts
  };

  if (transport === "http" || transport === "sse" || transport === "streamableHttp") {
    if (!url) throw new Error(t.messages.urlRequired);
    serverConfig.url = url;
    if (Object.keys(headers).length > 0) serverConfig.headers = headers;
  } else {
    if (!command) throw new Error(t.messages.commandRequired);
    serverConfig.command = command;
    serverConfig.args = args;
    if (Object.keys(env).length > 0) serverConfig.env = env;
  }

  // Kaydet
  config.servers[id] = serverConfig;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  console.log(t.messages.configWritten(id));

  if (verify) {
    console.log(t.messages.verifyingServer(id));
    try {
      await toolRegistry.refreshSingleServer(id);
      console.log(t.messages.verifySuccess(id));
    } catch (err) {
      console.warn(t.messages.verifyWarning(err.message));
    } finally {
      await clientPool.closeAll();
    }
  } else {
    console.log(t.messages.verifySkipped);
  }
}

export function parseJsonConfig(jsonStr) {
  const t = getTranslation();
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(t.messages.invalidJson(err.message));
  }

  // Eğer { "mcpServers": { ... } } formatındaysa ayıkla
  let serversObj = parsed.mcpServers || parsed.servers || parsed;

  const results = [];
  for (const [id, raw] of Object.entries(serversObj)) {
    if (typeof raw !== "object" || raw === null) continue;

    const isHttp = raw.url || raw.httpUrl || raw.transport === "http" || raw.type === "remote";
    const server = {
      id: raw.id || id,
      name: raw.name || id,
      description: raw.description || "",
      transport: raw.transport || (isHttp ? "http" : "stdio"),
      enabled: raw.enabled !== false,
      shortcuts: raw.shortcuts || []
    };

    if (server.transport === "http" || server.transport === "sse" || server.transport === "streamableHttp" || isHttp) {
      server.url = raw.url || raw.httpUrl;
      server.transport = "http";
      if (raw.headers) server.headers = raw.headers;
    } else {
      server.command = raw.command;
      server.args = raw.args || [];
      if (raw.env) server.env = raw.env;
    }

    results.push(server);
  }

  if (results.length === 0) {
    throw new Error(t.messages.noServerFoundInJson);
  }

  return results;
}

export function removeServer(id) {
  const t = getTranslation();
  const config = loadConfig();
  if (!config.servers || !config.servers[id]) {
    throw new Error(t.messages.serverNotFound(id));
  }

  delete config.servers[id];
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  console.log(t.messages.serverRemovedConfig(id));

  // Önbellekten de temizle
  toolRegistry.removeServerFromCache(id);
  console.log(t.messages.serverRemovedCache(id));
}

export function setServerEnabled(id, enabled) {
  const t = getTranslation();
  const config = loadConfig();
  if (!config.servers || !config.servers[id]) {
    throw new Error(t.messages.serverNotFound(id));
  }

  config.servers[id].enabled = enabled;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  console.log(t.messages.serverStatusChanged(id, enabled));
}

