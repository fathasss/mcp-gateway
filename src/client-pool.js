import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTranslation } from "./i18n/locales.js";
import { assertPathWithinAllowedDirs, redactSecretsFromText, writeFileAtomic } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const gatewayRootDir = path.join(__dirname, "..");

export function getGatewayPaths() {
  const dataDir = process.env.MCP_GATEWAY_DATA_DIR
    ? path.resolve(process.env.MCP_GATEWAY_DATA_DIR)
    : gatewayRootDir;

  return {
    dataDir,
    configPath: assertPathWithinAllowedDirs(path.join(dataDir, "config.json"), [dataDir]),
    envPath: assertPathWithinAllowedDirs(path.join(dataDir, ".env"), [dataDir]),
    cachePath: assertPathWithinAllowedDirs(path.join(dataDir, "tools-cache.json"), [dataDir]),
  };
}

export function reloadEnv() {
  const { envPath } = getGatewayPaths();
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}
reloadEnv();

function resolveEnvVars(envObj = {}) {
  const resolved = {};
  for (const [k, v] of Object.entries(envObj)) {
    resolved[k] = typeof v === "string" ? v.replace(/\${([^}]+)\}/g, (_, name) => process.env[name] || "") : v;
  }
  return resolved;
}

function resolveHeaders(headers = {}) {
  const resolved = {};
  for (const [k, v] of Object.entries(headers)) {
    resolved[k] = typeof v === "string" ? v.replace(/\${([^}]+)\}/g, (_, name) => process.env[name] || "") : v;
  }
  return resolved;
}

export function loadConfig() {
  const { configPath } = getGatewayPaths();
  if (!fs.existsSync(configPath)) {
    const initial = { version: "1.0.0", servers: {} };
    writeFileAtomic(configPath, JSON.stringify(initial, null, 2) + "\n", "utf8");
    return initial;
  }
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

export function saveConfig(config) {
  const { configPath } = getGatewayPaths();
  writeFileAtomic(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}

class ClientPool {
  constructor() {
    this.clients = new Map();
  }

  async getClient(serverId) {
    if (this.clients.has(serverId)) {
      return this.clients.get(serverId);
    }

    reloadEnv();
    const config = loadConfig();
    const t = getTranslation();
    const serverConf = config.servers?.[serverId];
    if (!serverConf) {
      throw new Error(t.messages.unknownServer(serverId));
    }

    if (!serverConf.enabled) {
      throw new Error(t.messages.serverDisabled(serverId));
    }

    const client = new Client(
      {
        name: "mcp-gateway",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    client.onclose = () => {
      if (this.clients.get(serverId) === client) {
        this.clients.delete(serverId);
      }
    };

    const connectOpts = process.env.MCP_GATEWAY_TOOL_TIMEOUT_MS
      ? { timeout: Number(process.env.MCP_GATEWAY_TOOL_TIMEOUT_MS) }
      : undefined;

    const targetUrl = new URL(serverConf.url || serverConf.httpUrl || "http://localhost");

    if (serverConf.transport === "sse") {
      const transport = new SSEClientTransport(targetUrl, {
        headers: resolveHeaders(serverConf.headers),
      });
      await client.connect(transport, connectOpts);
    } else if (serverConf.transport === "http" || serverConf.transport === "streamableHttp") {
      try {
        const transport = new StreamableHTTPClientTransport(targetUrl, {
          requestInit: { headers: resolveHeaders(serverConf.headers) },
        });
        await client.connect(transport, connectOpts);
      } catch (err) {
        console.error(t.messages.streamableHttpFallback(serverId, redactSecretsFromText(err.message)));
        const sseTransport = new SSEClientTransport(targetUrl, {
          headers: resolveHeaders(serverConf.headers),
        });
        await client.connect(sseTransport, connectOpts);
      }
    } else {
      let cmd = serverConf.command;
      if (process.platform === "win32") {
        if (cmd === "npx" || cmd === "npx.cmd") cmd = "npx.cmd";
        else if (cmd === "npm" || cmd === "npm.cmd") cmd = "npm.cmd";
      }

      const transport = new StdioClientTransport({
        command: cmd,
        args: serverConf.args || [],
        env: { ...process.env, ...resolveEnvVars(serverConf.env || {}) },
      });
      await client.connect(transport, connectOpts);
    }

    this.clients.set(serverId, client);
    return client;
  }

  async callTool(serverId, toolName, args) {
    const client = await this.getClient(serverId);
    const reqOpts = process.env.MCP_GATEWAY_TOOL_TIMEOUT_MS
      ? { timeout: Number(process.env.MCP_GATEWAY_TOOL_TIMEOUT_MS) }
      : undefined;
    return await client.callTool(
      {
        name: toolName,
        arguments: args || {},
      },
      undefined,
      reqOpts
    );
  }

  async closeClient(serverId) {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        await client.close();
      } catch {
        // ignore
      }
      this.clients.delete(serverId);
    }
  }

  async closeAll() {
    for (const [, client] of this.clients.entries()) {
      try {
        await client.close();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }
}

export const clientPool = new ClientPool();
