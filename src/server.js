import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { toolRegistry } from "./tool-registry.js";
import { clientPool, loadConfig } from "./client-pool.js";
import { LOCALES, getActiveLanguage } from "./i18n/locales.js";

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

  // Gemini ve Claude'a sunulan çekirdek orkestratör araçları
  const CORE_TOOLS = [
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
    // Sık kullanılan doğrudan kısayollar
    {
      name: "vacuum_get_status",
      description: t.coreTools.vacuum_get_status.description,
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "vacuum_locate",
      description: t.coreTools.vacuum_locate.description,
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "tv_get_status",
      description: t.coreTools.tv_get_status.description,
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "tv_power",
      description: t.coreTools.tv_power.description,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["on", "off"],
            description: t.coreTools.tv_power.actionDesc,
          },
        },
        required: ["action"],
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: CORE_TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      // 1. Arama Aracı
      if (name === "search_tools") {
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

      // 2. Alt Araç Çalıştırma
      if (name === "call_tool") {
        const client = await clientPool.getClient(args.server);
        const res = await client.callTool({
          name: args.tool,
          arguments: args.arguments || {},
        });
        return res;
      }

      // 3. Sunucu Listesi
      if (name === "list_mcp_servers") {
        const config = loadConfig();
        const summaries = toolRegistry.cache.serverSummaries || {};
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  configuredServers: config.servers,
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

      // 4. İndeks Yenileme
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

      // Kısayollar: vacuum_get_status, vacuum_locate, tv_get_status, tv_power
      if (["vacuum_get_status", "vacuum_locate", "tv_get_status", "tv_power"].includes(name)) {
        const client = await clientPool.getClient("house");
        return await client.callTool({
          name: name,
          arguments: args,
        });
      }

      throw new Error(t.messages.unknownTool(name));
    } catch (err) {
      return {
        content: [{ type: "text", text: t.messages.gatewayError(err.message) }],
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
