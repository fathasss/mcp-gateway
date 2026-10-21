import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clientPool, loadConfig } from "./client-pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cachePath = path.join(__dirname, "..", "tools-cache.json");

export class ToolRegistry {
  constructor() {
    this.cache = this.loadCache();
  }

  loadCache() {
    if (fs.existsSync(cachePath)) {
      try {
        return JSON.parse(fs.readFileSync(cachePath, "utf8"));
      } catch (e) {
        console.error("[Registry] Cache okuma hatası:", e.message);
      }
    }
    return { lastUpdated: null, tools: [], serverSummaries: {} };
  }

  saveCache(data) {
    this.cache = data;
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf8");
  }

  async refreshCache() {
    const config = loadConfig();
    const allTools = [];
    const summaries = {};

    console.error("[Registry] Alt MCP sunucularından araçlar indeksleniyor...");

    for (const [serverId, sConf] of Object.entries(config.servers)) {
      if (!sConf.enabled) continue;
      try {
        console.error(`[Registry] ${serverId} sorgulanıyor...`);
        const client = await clientPool.getClient(serverId);
        const res = await client.listTools();
        const tools = res.tools || [];
        
        summaries[serverId] = {
          name: sConf.name,
          description: sConf.description,
          toolCount: tools.length,
          status: "connected",
        };

        for (const t of tools) {
          allTools.push({
            server: serverId,
            serverName: sConf.name,
            name: t.name,
            description: t.description || "",
            inputSchema: t.inputSchema || { type: "object", properties: {} },
          });
        }
        console.error(`[Registry] ${serverId}: ${tools.length} araç kaydedildi.`);
      } catch (err) {
        console.error(`[Registry] ${serverId} hatası:`, err.message);
        summaries[serverId] = {
          name: sConf.name,
          description: sConf.description,
          toolCount: 0,
          status: "error: " + err.message,
        };
      }
    }

    const cacheData = {
      lastUpdated: new Date().toISOString(),
      tools: allTools,
      serverSummaries: summaries,
    };

    this.saveCache(cacheData);
    console.error(`[Registry] İndeksleme tamamlandı. Toplam araç: ${allTools.length}`);
    return cacheData;
  }

  searchTools(query, serverFilter = null, limit = 8) {
    let list = this.cache.tools || [];
    if (serverFilter) {
      list = list.filter((t) => t.server === serverFilter || t.serverName === serverFilter);
    }

    if (!query || !query.trim()) {
      return list.slice(0, limit);
    }

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1);

    const scored = [];
    for (const t of list) {
      let score = 0;
      const tName = t.name.toLowerCase();
      const tDesc = (t.description || "").toLowerCase();
      const sDesc = (t.serverName || "").toLowerCase();

      for (const term of terms) {
        if (tName.includes(term)) score += 10;
        if (tDesc.includes(term)) score += 4;
        if (sDesc.includes(term)) score += 2;
      }

      if (score > 0) {
        scored.push({ tool: t, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.tool);
  }

  getTool(serverId, toolName) {
    return (this.cache.tools || []).find(
      (t) => (t.server === serverId || t.serverName === serverId) && t.name === toolName
    );
  }
}

export const toolRegistry = new ToolRegistry();
