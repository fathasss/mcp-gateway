import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTranslation } from "./i18n/locales.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "..", "config.json");


// Load .env if present
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const envLines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

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
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

class ClientPool {
  constructor() {
    this.clients = new Map();
  }

  async getClient(serverId) {
    if (this.clients.has(serverId)) {
      return this.clients.get(serverId);
    }

    const config = loadConfig();
    const t = getTranslation();
    const serverConf = config.servers[serverId];
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

    const targetUrl = new URL(serverConf.url || serverConf.httpUrl || "http://localhost");

    if (serverConf.transport === "sse") {
      const transport = new SSEClientTransport(targetUrl, {
        headers: resolveHeaders(serverConf.headers),
      });
      await client.connect(transport);
    } else if (serverConf.transport === "http" || serverConf.transport === "streamableHttp") {
      // Try StreamableHTTP first, fallback to SSE if needed
      try {
        const transport = new StreamableHTTPClientTransport(targetUrl, {
          requestInit: { headers: resolveHeaders(serverConf.headers) },
        });
        await client.connect(transport);
      } catch (err) {
        console.error(t.messages.streamableHttpFallback(serverId, err.message));
        const sseTransport = new SSEClientTransport(targetUrl, {
          headers: resolveHeaders(serverConf.headers),
        });
        await client.connect(sseTransport);
      }
    } else {
      // stdio
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
      await client.connect(transport);
    }

    this.clients.set(serverId, client);
    return client;
  }

  async callTool(serverId, toolName, args) {
    const client = await this.getClient(serverId);
    return await client.callTool({
      name: toolName,
      arguments: args || {},
    });
  }

  async closeAll() {
    for (const [id, client] of this.clients.entries()) {
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
