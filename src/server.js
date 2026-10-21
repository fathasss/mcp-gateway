import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { toolRegistry } from "./tool-registry.js";
import { clientPool, loadConfig } from "./client-pool.js";

export function createOrchestratorServer() {
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

  // Gemini'ye sunulan çekirdek orkestratör araçları
  const CORE_TOOLS = [
    {
      name: "search_tools",
      description:
        "İhtiyaç duyulan işleme uygun MCP araçlarını ve parametre şemalarını arar (örn: 'süpürge', 'tv', 'apk analizi', 'not arama', 'web scraping'). Bir işlem yapmadan önce doğru aracı bulmak için çağrılır.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Aranacak işlem veya araç terimleri (örn: 'süpürge durumu', 'not ara', 'apk disasm')",
          },
          server: {
            type: "string",
            description: "İsteğe bağlı: Belirli bir sunucuda arama yapmak için ('house', 'rea', 'obsidian', 'crw', 'comfyui', 'n8n')",
          },
          limit: {
            type: "number",
            description: "Döndürülecek maksimum araç sayısı (varsayılan: 8)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "call_tool",
      description:
        "Belirtilen alt MCP sunucusundaki aracı verilen parametrelerle çalıştırır.",
      inputSchema: {
        type: "object",
        properties: {
          server: {
            type: "string",
            description: "Aracın ait olduğu sunucu ID'si (örn: 'house', 'rea', 'obsidian', 'crw', 'comfyui', 'n8n')",
          },
          tool: {
            type: "string",
            description: "Çalıştırılacak aracın adı (örn: 'vacuum_get_status', 'tv_power', 'read_file')",
          },
          arguments: {
            type: "object",
            description: "Araca gönderilecek parametreler",
          },
        },
        required: ["server", "tool"],
      },
    },
    {
      name: "list_mcp_servers",
      description: "Gateway arkasında bağlı tüm alt MCP sunucularını, durumlarını ve araç sayılarını listeler.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "refresh_tools_index",
      description: "Tüm alt MCP sunucularını yeniden tarayarak araç indeksini günceller.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    // Sık kullanılan doğrudan kısayollar (Kullanıcı doğrudan tek kelimeyle süpürgeyi sorgulayabilsin diye)
    {
      name: "vacuum_get_status",
      description: "Robot süpürgenin (Ferhunde) anlık durumunu, pil seviyesini ve şarjını doğrudan sorgular.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "vacuum_locate",
      description: "Robot süpürgenin yerini bulmak için ses çıkarmasını ('Buradayım!') sağlar.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "tv_get_status",
      description: "Samsung TV'nin açık/kapalı durumunu ve ağ bilgilerini sorgular.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "tv_power",
      description: "Samsung TV'yi açar ('on') veya kapatır ('off').",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["on", "off"],
            description: "İşlem: 'on' (aç) veya 'off' (kapat)",
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
              text: `İndeks başarıyla güncellendi. Toplam ${updated.tools.length} araç kaydedildi.`,
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

      throw new Error(`Bilinmeyen araç: ${name}`);
    } catch (err) {
      return {
        content: [{ type: "text", text: `[Gateway Hatası] ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startOrchestrator() {
  const server = createOrchestratorServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Gateway] MCP Gateway başarıyla çalışıyor.");
}
