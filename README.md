# MCP Gateway (Multi-Agent Tool Gateway)

Gemini CLI ve LLM modelleri için akıllı MCP Gateway ve Dinamik Araç Yönlendiricisi.

## Amaç
Google Gemini API'nin **64/128 fonksiyon limiti** ve çok sayıda MCP sunucusu (özellikle 200+ araçlı `rea-agents`) bağlandığında ortaya çıkan **`400 INVALID_ARGUMENT`** hatasını önler. 
Her sorguda yüzlerce aracın devasa şemasını API'ye göndermek yerine, Gemini'ye sadece **8 temel araç** sunar; arka plandaki 240+ araca dinamik arama (`search_tools`) ve çalıştırma (`call_tool`) ile erişim sağlar.

## Mimarisi

```
                                [ Gemini CLI ]
                     (Sadece 8 araç görür: ~300 token yükü)
                        ├── vacuum_get_status / vacuum_locate
                        ├── tv_power / tv_get_status
                        ├── search_tools(query, server)
                        ├── call_tool(server, tool, args)
                        ├── list_mcp_servers
                        └── refresh_tools_index
                                      │
                         [ mcp-gateway ] (Gateway)
                                      │
       ┌──────────────┬───────────────┼───────────────┬──────────────┐
       ▼              ▼               ▼               ▼              ▼
[has-smarthouse]    [rea]        [obsidian]         [crw]        [comfyui/n8n]
  (15 Araç)       (207 Araç)      (14 Araç)        (8 Araç)         (...)
```

## Yapılandırma (`config.json`)
Bağlı alt MCP sunucuları `config.json` dosyasından yönetilir:
- **`house`**: `has-smarthouse-mcp` (Docker)
- **`rea`**: `rea-agents` (207 Tersine Mühendislik aracı)
- **`obsidian`**: Kişisel notlar kasası
- **`crw`**: Canlı web kazıma ve tarama
- **`comfyui`**: Görsel üretim iş akışları
- **`n8n`**: İş akışı otomasyonu

## Komutlar
- **Başlatma**: `node index.js`
- **İndeks Yenileme**: `node refresh.js`
