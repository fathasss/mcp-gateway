import fs from "node:fs";
import { clientPool, getGatewayPaths, loadConfig } from "./client-pool.js";
import { expandSearchTerms } from "./i18n/synonyms.js";
import { getTranslation } from "./i18n/locales.js";
import { redactSecretsFromText, writeFileAtomic } from "./security.js";

export class ToolRegistry {
  constructor() {
    this.cacheMtime = 0;
    this.lastCachePath = null;
    this.cache = this.loadCache();
  }

  getCachePath() {
    return getGatewayPaths().cachePath;
  }

  loadCache() {
    const cachePath = this.getCachePath();
    this.lastCachePath = cachePath;
    if (fs.existsSync(cachePath)) {
      try {
        const stat = fs.statSync(cachePath);
        this.cacheMtime = stat.mtimeMs;
        return JSON.parse(fs.readFileSync(cachePath, "utf8"));
      } catch (e) {
        console.error("[Registry] Cache read error:", redactSecretsFromText(e.message));
      }
    }
    this.cacheMtime = 0;
    return { lastUpdated: null, tools: [], serverSummaries: {} };
  }

  ensureFreshCache() {
    const cachePath = this.getCachePath();
    if (cachePath !== this.lastCachePath) {
      this.cache = this.loadCache();
      return;
    }
    if (fs.existsSync(cachePath)) {
      try {
        const stat = fs.statSync(cachePath);
        if (stat.mtimeMs > this.cacheMtime) {
          this.cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
          this.cacheMtime = stat.mtimeMs;
        }
      } catch {
        // ignore transient read error
      }
    }
  }

  saveCache(data) {
    const cachePath = this.getCachePath();
    this.lastCachePath = cachePath;
    this.cache = data;
    writeFileAtomic(cachePath, JSON.stringify(data, null, 2) + "\n", "utf8");
    if (fs.existsSync(cachePath)) {
      this.cacheMtime = fs.statSync(cachePath).mtimeMs;
    }
  }

  async refreshCache() {
    const config = loadConfig();
    const t = getTranslation();
    const allTools = [];
    const summaries = {};

    console.error(t.messages.indexingStart);

    for (const [serverId, sConf] of Object.entries(config.servers)) {
      if (!sConf.enabled) continue;
      try {
        console.error(t.messages.indexingServer(serverId));
        const client = await clientPool.getClient(serverId);
        const res = await client.listTools();
        const tools = res.tools || [];
        
        summaries[serverId] = {
          name: sConf.name,
          description: sConf.description,
          toolCount: tools.length,
          status: "connected",
        };

        for (const tool of tools) {
          allTools.push({
            server: serverId,
            serverName: sConf.name,
            name: tool.name,
            description: tool.description || "",
            inputSchema: tool.inputSchema || { type: "object", properties: {} },
          });
        }
        console.error(t.messages.indexedTools(serverId, tools.length));
      } catch (err) {
        const safeErr = redactSecretsFromText(err.message);
        console.error(t.messages.indexingError(serverId, safeErr));
        summaries[serverId] = {
          name: sConf.name,
          description: sConf.description,
          toolCount: 0,
          status: "error: " + safeErr,
        };
      }
    }

    const cacheData = {
      lastUpdated: new Date().toISOString(),
      tools: allTools,
      serverSummaries: summaries,
    };

    this.saveCache(cacheData);
    console.error(t.messages.indexingDone(allTools.length));
    return cacheData;
  }

  async refreshSingleServer(serverId) {
    this.ensureFreshCache();
    const config = loadConfig();
    const t = getTranslation();
    const sConf = config.servers[serverId];
    if (!sConf) {
      throw new Error(t.messages.unknownServer(serverId));
    }

    const currentTools = (this.cache.tools || []).filter(item => item.server !== serverId);
    const summaries = { ...(this.cache.serverSummaries || {}) };

    if (!sConf.enabled) {
      delete summaries[serverId];
      const cacheData = {
        lastUpdated: new Date().toISOString(),
        tools: currentTools,
        serverSummaries: summaries,
      };
      this.saveCache(cacheData);
      return cacheData;
    }

    console.error(t.messages.indexingServer(serverId));
    const client = await clientPool.getClient(serverId);
    const res = await client.listTools();
    const tools = res.tools || [];

    summaries[serverId] = {
      name: sConf.name,
      description: sConf.description,
      toolCount: tools.length,
      status: "connected",
    };

    const newTools = tools.map(item => ({
      server: serverId,
      serverName: sConf.name,
      name: item.name,
      description: item.description || "",
      inputSchema: item.inputSchema || { type: "object", properties: {} },
    }));

    const cacheData = {
      lastUpdated: new Date().toISOString(),
      tools: [...currentTools, ...newTools],
      serverSummaries: summaries,
    };

    this.saveCache(cacheData);
    console.error(t.messages.indexedTools(serverId, tools.length));
    return cacheData;
  }

  removeServerFromCache(serverId) {
    this.ensureFreshCache();
    const currentTools = (this.cache.tools || []).filter(t => t.server !== serverId);
    const summaries = { ...(this.cache.serverSummaries || {}) };
    delete summaries[serverId];

    const cacheData = {
      lastUpdated: new Date().toISOString(),
      tools: currentTools,
      serverSummaries: summaries,
    };
    this.saveCache(cacheData);
  }

  searchTools(query, serverFilter = null, limit = 8) {
    this.ensureFreshCache();
    let list = this.cache.tools || [];
    if (serverFilter) {
      list = list.filter((t) => t.server === serverFilter || t.serverName === serverFilter);
    }

    if (!query || !query.trim()) {
      return list.slice(0, limit);
    }

    const terms = expandSearchTerms(query);
    if (terms.length === 0) {
      return list.slice(0, limit);
    }

    const scored = [];
    for (const t of list) {
      let score = 0;
      const tName = t.name.toLowerCase();
      const tDesc = (t.description || "").toLowerCase();
      const sDesc = (typeof t.serverDescription === "object"
        ? Object.values(t.serverDescription).join(" ")
        : (t.serverName || "")).toLowerCase();

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
