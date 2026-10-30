# MCP Gateway (Multi-Agent Dynamic Tool Router)

<div align="center">

[**English**](README.md) · [**Türkçe**](README.tr.md)

</div>

Gemini CLI, Claude, and LLM models often struggle with high token usage and function declaration limits. **MCP Gateway** consolidates multiple MCP (Model Context Protocol) servers under a single intelligent, dynamic routing layer.

---

## 🚀 Why MCP Gateway?

Google Gemini API and many modern LLM clients have strict **64 or 128 function declaration limits**. When multiple MCP servers (especially reverse engineering or complex tooling with 200+ tools) are connected directly:
1. **`400 INVALID_ARGUMENT`** occurs due to exceeding function declaration caps.
2. Every prompt turn sends hundreds of tool definitions, consuming **80,000+ unnecessary tokens** per request.
3. If an editor (Unreal, Unity, etc.) is closed, the client throws connection errors and breaks the session.

**MCP Gateway** exposes only **8 core orchestrator tools** to the client while managing **400+ tools** in the background. It dynamically searches (`search_tools`) and invokes (`call_tool`) tools on demand.

---

## 🏛️ Architecture Overview

```
                                  [ Gemini CLI / Claude ]
                           (Sees only 8 core tools: ~300 tokens)
                             ├── search_tools (Dynamic tool discovery)
                             ├── call_tool (Sub-server execution)
                             ├── list_mcp_servers (Server health & count)
                             ├── refresh_tools_index (Cache re-indexing)
                             └── [Instant Shortcuts]
                                   ├── vacuum_get_status / vacuum_locate
                                   └── tv_get_status / tv_power
                                            │
                                            │ (stdio)
                                            ▼
                                     [ mcp-gateway ]
                                            │
          ┌───────────┬───────────┬─────────┼─────────┬───────────┬───────────┐
          │ (stdio)   │ (stdio)   │ (stdio) │ (stdio) │ (HTTP)    │ (Stream)  │ (Multi)
          ▼           ▼           ▼         ▼         ▼           ▼           ▼
       [House]      [REA]    [Obsidian]   [CRW]     [n8n]      [Unreal]   [GEV/Others]
      (18 Tools)  (207 Tools) (14 Tools) (8 Tools) (55 Tools)  (3 Tools)   (30+ Tools)
          │                                                       │
      [Docker]                                                [Port 8000]
     (Ferhunde)                                                (UE5 MCP)
```

---

## 🔌 Connected & Supported MCP Servers

| Server Name | Transport | Description | Tool Count |
| :--- | :--- | :--- | :--- |
| **`house`** | stdio (Docker) | SmartHome: Dreame D9 Max vacuum & Samsung Smart TV control | 18 tools |
| **`rea`** | stdio (npx) | Reverse engineering: APK, Ghidra, IDA, radare2, decompilation analysis | 207 tools |
| **`n8n`** | http (SSE) | Workflow automation, agent builder, workflow runner (`:9876`) | 55 tools |
| **`comfyui`** | stdio (exe) | ComfyUI local image generation workflows & model management (`:8088`) | 39 tools |
| **`whatsapp`** | StreamableHTTP | WhatsApp multi-session, group/chat messaging, media, QR, activity history (`:3002`) | 32 tools |
| **`gods-eye-view`** | stdio (Docker) | 3D globe real-time OSINT/GEOINT: Live flights, military radar, ships (AIS), satellites, quakes, CCTV/ALPR (`:4173`) | 30 tools |
| **`moneyprinter`** | stdio (Python) | MoneyPrinterTurbo automated video generation (Shorts/Reels/TikTok), TTS, subtitles | 17 tools |
| **`obsidian`** | stdio (npx) | Local Obsidian knowledge vault note read/write & filesystem operations | 14 tools |
| **`blender`** | stdio (uvx) | Blender 3D modeling, bpy Python scripts, rendering | 9 tools |
| **`crw`** | stdio (npx) | Live internet access, Markdown conversion, web crawling & scraping | 8 tools |
| **`has-search`** | stdio (Docker) | Large document indexing (PDF, MD, TXT) with local LanceDB + MiniLM semantic search (RAG) | 4 tools |
| **`unreal`** | StreamableHTTP | Unreal Engine 5 editor automation, actor, blueprint, level, asset management (`:8000`) | 3 tools |
| **`prompts`** | stdio (npx) | Curated AI prompt templates library (Awesome ChatGPT Prompts) | 2 tools |
| **`unity`** | http (`:9000`) | Unity 3D engine hierarchy, GameObject, component, and C# script control | Dynamic |

---

## ✨ Key Features

- **Multi-Protocol Support:** Seamless communication over `stdio`, standard `SSE`, and session-based **`StreamableHTTP`**.
- **Reflex Shortcuts:** Frequently used quick commands (vacuum status, TV remote, etc.) execute directly without search steps.
- **Secure Token Management:** Sensitive credentials reside in `.env`; `${TOKEN_NAME}` templates in `config.json` resolve at runtime.
- **Bilingual (TR / EN) Intelligent Search:** Built-in synonym engine bridges cross-language searches (e.g. searching `"deprem"` discovers English `get_earthquakes`).
- **Fault Tolerant:** If external game engines or services are offline, the gateway remains resilient; requests fail gracefully and reconnect once back online.

---

## ⚡ Custom Port & Collision Management

Several MCP servers default to the same port or conflict with local web applications. The gateway topology isolates them cleanly:

* **Unreal Engine 5 MCP (`:8000`):** Default Unreal Engine MCP Streamable HTTP service.
* **Unity 3D MCP (`:9000`):** Unity MCP defaults to `8000`. To prevent collisions with Unreal Engine, Unity MCP is configured to listen on port `9000` (`http://127.0.0.1:9000/mcp`).
* **n8n Automation (`:9876`):** Mapped from internal `5678` to host `9876` (`http://localhost:9876/mcp-server/http`).
* **ComfyUI (`:8088`):** Runs on port `8088` instead of default `8188`.
* **God's Eye View (`:4173`):** Web client & API proxy dev server operates on port `4173`.
* **WhatsApp WhiskeySocket (`:3002`):** Baileys MCP Streamable HTTP endpoint runs on port `3002` (`http://localhost:3002/mcp`).

---

## 🛠️ CLI Dynamic Server Management

Add, remove, and manage sub-servers from the command line without editing JSON files or restarting the gateway:

```bash
# List all servers and runtime tool count
npm run mcp -- list

# 1. Add an HTTP / StreamableHTTP server (with optional bilingual descriptions)
npm run mcp -- add whatsapp --url http://localhost:3002/mcp --desc-en "WhatsApp Messaging" --desc-tr "WhatsApp Mesajlaşma"

# 2. Add a Stdio server (command follows '--')
npm run mcp -- add my-server --desc "Custom stdio server" -- node C:/path/to/server.js

# 3. Add a Docker container stdio server
npm run mcp -- add docker-mcp --desc "Container MCP" -- docker exec -i my-container node index.js

# 4. Import from raw JSON (supports Claude, OpenCode, Gemini formats)
npm run mcp -- add-json '{"custom-mcp": {"type": "remote", "url": "http://localhost:4000/mcp"}}'

# Enable, disable, or remove servers
npm run mcp -- disable unreal
npm run mcp -- enable unreal
npm run mcp -- remove my-server

# Refresh single server cache or full index
npm run mcp -- refresh whatsapp
npm run mcp -- refresh
```

---

## 🔒 Security & Git Sanitization

1. **`.gitignore` Isolation:** `.env`, `config.json`, and dynamic runtime cache `tools-cache.json` are excluded from Git to prevent credential and local path leaks.
2. **Configuration Masking (`npm run mask`):** Generates a sanitized `config.example.json` with generic paths and token placeholders:
   ```bash
   npm run mask
   ```

---

## ⚙️ Installation & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and provide your secrets:
```env
N8N_TOKEN=your_jwt_token_here
```

### 3. Index Tools
To index tools from connected servers into local cache:
```bash
npm run refresh
```

---

## 🤖 Gemini CLI & Claude CLI Integration

### Gemini CLI (`~/.gemini/settings.json`)
```json
{
  "mcpServers": {
    "mcp-gateway": {
      "command": "node",
      "args": [
        "C:/Users/USERNAME/Desktop/apps/mcp-gateway/index.js"
      ]
    }
  }
}
```

### Claude CLI (`~/.claude.json`)
```json
{
  "mcpServers": {
    "mcp-gateway": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:/Users/USERNAME/Desktop/apps/mcp-gateway/index.js"
      ]
    }
  }
}
```

---

## 📄 License
MIT
