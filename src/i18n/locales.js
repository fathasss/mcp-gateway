export const LOCALES = {
  tr: {
    coreTools: {
      search_tools: {
        description: "İhtiyaç duyulan işleme uygun MCP araçlarını ve parametre şemalarını arar (örn: 'süpürge', 'tv', 'whatsapp mesajı', 'apk analizi', 'not arama', 'deprem', 'uçuş takibi'). Bir işlem yapmadan önce doğru aracı bulmak için çağrılır.",
        queryDesc: "Aranacak işlem veya araç terimleri (örn: 'whatsapp mesaj gönder', 'deprem listesi', 'süpürge durumu')",
        serverDesc: "İsteğe bağlı: Belirli bir sunucuda arama yapmak için filtre",
        limitDesc: "Döndürülecek maksimum araç sayısı (varsayılan: 8)"
      },
      call_tool: {
        description: "Belirtilen alt MCP sunucusundaki aracı verilen parametrelerle çalıştırır.",
        serverDesc: "Aracın ait olduğu sunucu ID'si (örn: 'house', 'whatsapp', 'gods-eye-view', 'obsidian', 'crw', 'n8n')",
        toolDesc: "Çalıştırılacak aracın adı (örn: 'chat_send_message', 'vacuum_get_status', 'get_earthquakes')",
        argumentsDesc: "Araca gönderilecek parametreler"
      },
      list_mcp_servers: {
        description: "Gateway arkasında bağlı tüm alt MCP sunucularını, bağlantı durumlarını ve araç sayılarını listeler."
      },
      refresh_tools_index: {
        description: "Tüm alt MCP sunucularını yeniden tarayarak araç indeksini ve önbelleğini günceller."
      },
      vacuum_get_status: {
        description: "Robot süpürgenin (Ferhunde) anlık durumunu, pil seviyesini ve şarjını doğrudan sorgular."
      },
      vacuum_locate: {
        description: "Robot süpürgenin yerini bulmak için ses çıkarmasını ('Buradayım!') sağlar."
      },
      tv_get_status: {
        description: "Samsung TV'nin açık/kapalı durumunu ve ağ bilgilerini sorgular."
      },
      tv_power: {
        description: "Samsung TV'yi açar ('on') veya kapatır ('off').",
        actionDesc: "İşlem: 'on' (aç) veya 'off' (kapat)"
      }
    },
    messages: {
      criticalGatewayError: "Kritik Gateway Hatası:",
      gatewayStarted: "[Gateway] MCP Gateway başarıyla çalışıyor. Aktif Dil: Türkçe (TR)",
      indexSuccess: (count) => `İndeks başarıyla güncellendi. Toplam ${count} araç kaydedildi.`,
      unknownTool: (name) => `Bilinmeyen araç: ${name}`,
      gatewayError: (msg) => `[Gateway Hatası] ${msg}`,
      unknownServer: (id) => `Bilinmeyen alt MCP sunucusu: ${id}`,
      serverDisabled: (id) => `MCP sunucusu devre dışı bırakılmış: ${id}`,
      streamableHttpFallback: (id, msg) => `[Gateway] ${id} StreamableHTTP denemesi başarısız oldu, SSE deneniyor: ${msg}`,
      indexingStart: "[Registry] Alt MCP sunucularından araçlar indeksleniyor...",
      indexingServer: (id) => `[Registry] ${id} sorgulanıyor...`,
      indexedTools: (id, count) => `[Registry] ${id}: ${count} araç kaydedildi.`,
      indexingError: (id, msg) => `[Registry] ${id} hatası: ${msg}`,
      indexingDone: (count) => `[Registry] İndeksleme tamamlandı. Toplam araç: ${count}`,
      configWritten: (id) => `[Config] '${id}' sunucusu config.json dosyasına yazıldı.`,
      serverRemovedConfig: (id) => `[Config] '${id}' sunucusu config.json dosyasından silindi.`,
      serverRemovedCache: (id) => `[Cache] '${id}' sunucusu önbellekten temizlendi.`,
      serverStatusChanged: (id, enabled) => `[Config] '${id}' sunucusu ${enabled ? "aktif edildi" : "devre dışı bırakıldı"}.`,
      verifyingServer: (id) => `[Verify] '${id}' sunucusuna bağlanılıyor ve araçlar taranıyor...`,
      verifySuccess: (id) => `[Success] '${id}' sunucusu başarıyla eklendi ve önbelleğe alındı.`,
      verifyWarning: (msg) => `[Warning] Sunucu kaydedildi ancak araç taramasında hata oluştu: ${msg}`,
      verifySkipped: "[Skip] Doğrulama atlandı. İndeksi güncellemek için 'npm run refresh' çalıştırabilirsiniz.",
      serverNotFound: (id) => `'${id}' adında bir sunucu bulunamadı.`,
      invalidJson: (msg) => `Geçersiz JSON verisi: ${msg}`,
      noServerFoundInJson: "JSON içinde geçerli bir MCP sunucu tanımı bulunamadı.",
      idRequired: "Server 'id' zorunludur.",
      urlRequired: "HTTP/SSE transport için 'url' parametresi zorunludur.",
      commandRequired: "stdio transport için 'command' parametresi zorunludur.",
      startingRefresh: "İndeks yenileme başlatılıyor...",
      refreshDone: "Yenileme tamamlandı!",
      indexError: "İndeks hatası:",
      statusActive: (count) => `[AKTİF - ${count} araç]`,
      statusDisabled: "[DEVRE DIŞI]",
      notIndexed: "indekslenmedi"
    },
    cli: {
      helpText: `
MCP Gateway Yönetim CLI

Kullanım:
  node cli.js add <id> [seçenekler] [-- <komut> <argümanlar...>]
  node cli.js add-json <json_string_veya_dosya_yolu>
  node cli.js remove <id>
  node cli.js enable <id>
  node cli.js disable <id>
  node cli.js list
  node cli.js refresh [id]

Seçenekler (add için):
  --transport <stdio|http|sse> (Varsayılan: stdio, --url verilirse http)
  --url <url>                  (HTTP/StreamableHTTP veya SSE uç noktası)
  --desc <açıklama>            (Sunucu açıklaması)
  --desc-tr <açıklama>         (Türkçe açıklama)
  --desc-en <açıklama>         (İngilizce açıklama)
  --name <görünen_ad>          (Sunucu adı)
  --env <K=V>                  (Ortam değişkeni, birden fazla verilebilir)
  --header <K=V>               (HTTP başlığı, birden fazla verilebilir)
  --no-verify                  (Eklerken canlı bağlantı ve araç testini atla)
  --lang <tr|en>               (CLI çıktı dilini seç)
`,
      connectedServersHeader: "\nBağlı MCP Sunucuları:\n",
      idRequiredForCommand: (cmd) => `Hata: Sunucu id'si belirtilmelidir. Örn: node cli.js ${cmd} <id>`,
      jsonInputRequired: "Hata: JSON verisi veya dosya yolu belirtilmelidir.",
      addingServer: (id) => `\nSunucu ekleniyor: ${id}`,
      refreshingServer: (id) => `'${id}' sunucusu yenileniyor...`,
      refreshingAll: "Tüm sunucular yenileniyor...",
      refreshComplete: "Yenileme tamamlandı.",
      unknownCommand: (cmd) => `Bilinmeyen komut: ${cmd}`,
      cliError: "[CLI Hatası]:"
    }
  },
  en: {
    coreTools: {
      search_tools: {
        description: "Searches for matching MCP tools and parameter schemas for the required task (e.g., 'vacuum', 'tv', 'whatsapp message', 'apk analysis', 'notes', 'earthquakes', 'flight tracker'). Call this first to discover the appropriate tool.",
        queryDesc: "Task or tool search terms (e.g., 'send whatsapp message', 'earthquake list', 'vacuum status')",
        serverDesc: "Optional: Filter search within a specific MCP server",
        limitDesc: "Maximum number of tools to return (default: 8)"
      },
      call_tool: {
        description: "Executes a tool on a specified sub-MCP server with provided arguments.",
        serverDesc: "Target server ID (e.g., 'house', 'whatsapp', 'gods-eye-view', 'obsidian', 'crw', 'n8n')",
        toolDesc: "Name of the tool to execute (e.g., 'chat_send_message', 'vacuum_get_status', 'get_earthquakes')",
        argumentsDesc: "Parameters/arguments to pass to the tool"
      },
      list_mcp_servers: {
        description: "Lists all connected sub-MCP servers behind the gateway, their status, and tool counts."
      },
      refresh_tools_index: {
        description: "Re-scans all sub-MCP servers to refresh the dynamic tool registry and cache."
      },
      vacuum_get_status: {
        description: "Quick status query for the robot vacuum (battery level, cleaning status, dock)."
      },
      vacuum_locate: {
        description: "Plays a locator chime on the robot vacuum to find its location."
      },
      tv_get_status: {
        description: "Checks Samsung Smart TV power status and network details."
      },
      tv_power: {
        description: "Powers on or off the Samsung Smart TV.",
        actionDesc: "Action: 'on' or 'off'"
      }
    },
    messages: {
      criticalGatewayError: "Critical Gateway Error:",
      gatewayStarted: "[Gateway] MCP Gateway running successfully. Active Language: English (EN)",
      indexSuccess: (count) => `Index refreshed successfully. Total ${count} tools registered.`,
      unknownTool: (name) => `Unknown tool: ${name}`,
      gatewayError: (msg) => `[Gateway Error] ${msg}`,
      unknownServer: (id) => `Unknown sub-MCP server: ${id}`,
      serverDisabled: (id) => `MCP server is disabled: ${id}`,
      streamableHttpFallback: (id, msg) => `[Gateway] ${id} StreamableHTTP attempt failed, trying SSE fallback: ${msg}`,
      indexingStart: "[Registry] Indexing tools from sub-MCP servers...",
      indexingServer: (id) => `[Registry] Querying ${id}...`,
      indexedTools: (id, count) => `[Registry] ${id}: ${count} tools registered.`,
      indexingError: (id, msg) => `[Registry] Error in ${id}: ${msg}`,
      indexingDone: (count) => `[Registry] Indexing completed. Total tools: ${count}`,
      configWritten: (id) => `[Config] Server '${id}' written to config.json.`,
      serverRemovedConfig: (id) => `[Config] Server '${id}' removed from config.json.`,
      serverRemovedCache: (id) => `[Cache] Server '${id}' removed from cache.`,
      serverStatusChanged: (id, enabled) => `[Config] Server '${id}' is now ${enabled ? "enabled" : "disabled"}.`,
      verifyingServer: (id) => `[Verify] Connecting to '${id}' and scanning tools...`,
      verifySuccess: (id) => `[Success] Server '${id}' successfully connected and cached.`,
      verifyWarning: (msg) => `[Warning] Server saved but tool scanning encountered an error: ${msg}`,
      verifySkipped: "[Skip] Verification skipped. You can run 'npm run refresh' to update the cache.",
      serverNotFound: (id) => `Server '${id}' was not found.`,
      invalidJson: (msg) => `Invalid JSON payload: ${msg}`,
      noServerFoundInJson: "No valid MCP server definitions found in JSON.",
      idRequired: "Server 'id' is required.",
      urlRequired: "The 'url' parameter is required for HTTP/SSE transport.",
      commandRequired: "The 'command' parameter is required for stdio transport.",
      startingRefresh: "Starting index refresh...",
      refreshDone: "Done!",
      indexError: "Index error:",
      statusActive: (count) => `[ACTIVE - ${count} tools]`,
      statusDisabled: "[DISABLED]",
      notIndexed: "not indexed"
    },
    cli: {
      helpText: `
MCP Gateway Management CLI

Usage:
  node cli.js add <id> [options] [-- <command> <args...>]
  node cli.js add-json <json_string_or_filepath>
  node cli.js remove <id>
  node cli.js enable <id>
  node cli.js disable <id>
  node cli.js list
  node cli.js refresh [id]

Options (for add):
  --transport <stdio|http|sse> (Default: stdio, auto-http if --url is provided)
  --url <url>                  (HTTP/StreamableHTTP or SSE endpoint)
  --desc <description>         (Server description)
  --desc-tr <description>      (Turkish description)
  --desc-en <description>      (English description)
  --name <display_name>        (Display name)
  --env <K=V>                  (Environment variable, can be repeated)
  --header <K=V>               (HTTP Header, can be repeated)
  --no-verify                  (Skip connection test and schema discovery)
  --lang <tr|en>               (CLI output language)
`,
      connectedServersHeader: "\nConnected MCP Servers:\n",
      idRequiredForCommand: (cmd) => `Error: Server ID must be specified. E.g.: node cli.js ${cmd} <id>`,
      jsonInputRequired: "Error: JSON string or file path must be specified.",
      addingServer: (id) => `\nAdding server: ${id}`,
      refreshingServer: (id) => `Refreshing '${id}' server...`,
      refreshingAll: "Refreshing all servers...",
      refreshComplete: "Refresh completed.",
      unknownCommand: (cmd) => `Unknown command: ${cmd}`,
      cliError: "[CLI Error]:"
    }
  }
};

export function getActiveLanguage() {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--lang" && args[i + 1]) {
      const val = args[i + 1].toLowerCase();
      if (val === "en" || val === "tr") return val;
    }
    if (args[i].startsWith("--lang=")) {
      const val = args[i].split("=")[1].toLowerCase();
      if (val === "en" || val === "tr") return val;
    }
  }

  const envLang = process.env.MCP_GATEWAY_LANG || process.env.GATEWAY_LANG;
  if (envLang && (envLang.toLowerCase() === "en" || envLang.toLowerCase() === "tr")) {
    return envLang.toLowerCase();
  }

  return "tr"; // Varsayılan dil
}

export function getTranslation() {
  const lang = getActiveLanguage();
  return LOCALES[lang] || LOCALES.tr;
}

export function resolveLocalizedText(text, lang) {
  if (!text) return "";
  if (typeof text === "string") return text;
  if (typeof text === "object") {
    const targetLang = lang || getActiveLanguage();
    return text[targetLang] || text.en || text.tr || Object.values(text)[0] || "";
  }
  return String(text);
}
