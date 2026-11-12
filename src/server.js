import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { toolRegistry } from "./tool-registry.js";
import { clientPool, loadConfig } from "./client-pool.js";
import { addServer, parseJsonConfig, removeServer, setServerEnabled } from "./manager.js";
import { LOCALES, getActiveLanguage } from "./i18n/locales.js";
import { redactConfigObject, redactSecretsFromText } from "./security.js";

export function getCoreToolsDefinition(t) {
  return [
    {
      name: "search_tools",
      description: t.coreTools.search_tools.description,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: t.coreTools.search_tools.queryDesc,
          },
          server: {
            type: "string",
            description: t.coreTools.search_tools.serverDesc,
          },
          limit: {
            type: "number",
            description: t.coreTools.search_tools.limitDesc,
          },
        },
        required: ["query"],
      },
    },
    {
      name: "call_tool",
      description: t.coreTools.call_tool.description,
      inputSchema: {
        type: "object",
        properties: {
          server: {
            type: "string",
            description: t.coreTools.call_tool.serverDesc,
          },
          tool: {
            type: "string",
            description: t.coreTools.call_tool.toolDesc,
          },
          arguments: {
            type: "object",
            description: t.coreTools.call_tool.argumentsDesc,
          },
        },
        required: ["server", "tool"],
      },
    },
    {
      name: "list_mcp_servers",
      description: t.coreTools.list_mcp_servers.description,
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "refresh_tools_index",
      description: t.coreTools.refresh_tools_index.description,
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "manage_mcp_server",
      description: t.coreTools.manage_mcp_server.description,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["add", "add_json", "remove", "enable", "disable"],
            description: t.coreTools.manage_mcp_server.actionDesc,
          },
          id: {
            type: "string",
            description: t.coreTools.manage_mcp_server.idDesc,
          },
          transport: {
            type: "string",
            enum: ["stdio", "http", "streamableHttp", "sse"],
            description: t.coreTools.manage_mcp_server.transportDesc,
          },
          url: {
            type: "string",
            description: t.coreTools.manage_mcp_server.urlDesc,
          },
          command: {
            type: "string",
            description: t.coreTools.manage_mcp_server.commandDesc,
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: t.coreTools.manage_mcp_server.argsDesc,
          },
          env: {
            type: "object",
            description: t.coreTools.manage_mcp_server.envDesc,
          },
          headers: {
            type: "object",
            description: t.coreTools.manage_mcp_server.headersDesc,
          },
          description: {
            type: "string",
            description: t.coreTools.manage_mcp_server.descriptionDesc,
          },
          json: {
            description: t.coreTools.manage_mcp_server.jsonDesc,
          },
          verify: {
            type: "boolean",
            description: t.coreTools.manage_mcp_server.verifyDesc,
          },
        },
        required: ["action"],
      },
    },
  ];
}

export const CORE_TOOL_COUNT = getCoreToolsDefinition(LOCALES.en).length;

function buildDynamicShortcuts(t) {
  const config = loadConfig();
  toolRegistry.ensureFreshCache();
  const shortcutTools = [];
  const shortcutOwnerMap = new Map();

  for (const [serverId, sConf] of Object.entries(config.servers || {})) {
    if (sConf.enabled === false || !Array.isArray(sConf.shortcuts)) continue;
    for (const toolName of sConf.shortcuts) {
      if (!toolName || shortcutOwnerMap.has(toolName)) continue;
      shortcutOwnerMap.set(toolName, serverId);

      const cachedTool = toolRegistry.getTool(serverId, toolName);
      const localePreset = t.coreTools?.[toolName];

      let inputSchema = cachedTool?.inputSchema || { type: "object", properties: {} };

      shortcutTools.push({
        name: toolName,
        description: localePreset?.description || cachedTool?.description || `Shortcut tool '${toolName}' on server '${serverId}'`,
        inputSchema,
      });
    }
  }

  return { shortcutTools, shortcutOwnerMap };
}

export function createOrchestratorServer() {
  const lang = getActiveLanguage();
  const t = LOCALES[lang] || LOCALES.tr;

  const server = new Server(
    {
      name: "mcp-gateway",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Core orchestrator tools exposed to the host AI agent
  const BASE_CORE_TOOLS = getCoreToolsDefinition(t);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const { shortcutTools } = buildDynamicShortcuts(t);
    return { tools: [...BASE_CORE_TOOLS, ...shortcutTools] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      // 1. Search Tools
      if (name === "search_tools") {
        if (typeof args.query !== "string") {
          throw new Error("Missing or invalid 'query' parameter for search_tools.");
        }
        const results = toolRegistry.searchTools(args.query, args.server, args.limit || 8);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  found: results.length,
                  tools: results.map((r) => ({
                    server: r.server,
                    name: r.name,
                    description: r.description,
                    inputSchema: r.inputSchema,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // 2. Call Downstream Tool
      if (name === "call_tool") {
        if (!args.server || typeof args.server !== "string") {
          throw new Error("Missing required 'server' parameter for call_tool.");
        }
        if (!args.tool || typeof args.tool !== "string") {
          throw new Error("Missing required 'tool' parameter for call_tool.");
        }
        return await clientPool.callTool(args.server, args.tool, args.arguments || {});
      }

      // 3. List MCP Servers
      if (name === "list_mcp_servers") {
        const config = loadConfig();
        toolRegistry.ensureFreshCache();
        const summaries = toolRegistry.cache.serverSummaries || {};
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  configuredServers: redactConfigObject(config.servers || {}),
                  runtimeStatus: summaries,
                  totalIndexedTools: toolRegistry.cache.tools?.length || 0,
                  lastUpdated: toolRegistry.cache.lastUpdated,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // 4. Refresh Tools Index
      if (name === "refresh_tools_index") {
        const updated = await toolRegistry.refreshCache();
        return {
          content: [
            {
              type: "text",
              text: t.messages.indexSuccess(updated.tools.length),
            },
          ],
        };
      }

      // 5. Hot-Plug / Manage MCP Server
      if (name === "manage_mcp_server") {
        const action = args.action;
        if (action === "add") {
          const result = await addServer({
            id: args.id,
            name: args.id,
            description: args.description || "",
            transport: args.transport || (args.url ? "http" : "stdio"),
            url: args.url,
            command: args.command,
            args: args.args || [],
            env: args.env || {},
            headers: args.headers || {},
            verify: args.verify !== false,
          });
          return {
            content: [{ type: "text", text: JSON.stringify({ action: "add", ...result }, null, 2) }],
          };
        }

        if (action === "add_json") {
          if (!args.json) {
            throw new Error(t.cli.jsonInputRequired);
          }
          const parsedServers = parseJsonConfig(args.json);
          const results = [];
          for (const srv of parsedServers) {
            const r = await addServer({
              ...srv,
              verify: args.verify !== false,
            });
            results.push(r);
          }
          return {
            content: [{ type: "text", text: JSON.stringify({ action: "add_json", servers: results }, null, 2) }],
          };
        }

        if (action === "remove") {
          const result = await removeServer(args.id);
          return {
            content: [{ type: "text", text: JSON.stringify({ action: "remove", ...result }, null, 2) }],
          };
        }

        if (action === "enable" || action === "disable") {
          const result = await setServerEnabled(args.id, action === "enable");
          return {
            content: [{ type: "text", text: JSON.stringify({ action, ...result }, null, 2) }],
          };
        }

        throw new Error(`Unsupported manage_mcp_server action: ${action}`);
      }

      // 6. Dynamic Shortcuts (configured per server in config.json)
      const { shortcutOwnerMap } = buildDynamicShortcuts(t);
      if (shortcutOwnerMap.has(name)) {
        const targetServerId = shortcutOwnerMap.get(name);
        return await clientPool.callTool(targetServerId, name, args);
      }

      throw new Error(t.messages.unknownTool(name));
    } catch (err) {
      return {
        content: [{ type: "text", text: t.messages.gatewayError(redactSecretsFromText(err.message)) }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startOrchestrator() {
  const lang = getActiveLanguage();
  const t = LOCALES[lang] || LOCALES.tr;
  const server = createOrchestratorServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(t.messages.gatewayStarted);
}
