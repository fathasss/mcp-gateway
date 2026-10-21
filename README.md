# MCP Gateway (Multi-Agent Dynamic Tool Router)

Gemini CLI, Claude ve LLM modelleri için çoklu MCP (Model Context Protocol) sunucularını tek bir çatı altında birleştiren, token tasarruflu akıllı gateway ve yönlendirici.

---

## 🚀 Neden MCP Gateway?

Google Gemini API ve pek çok modern LLM istemcisi **64 veya 128 fonksiyon deklarasyonu sınırına** sahiptir. Çok sayıda MCP sunucusu (özellikle 200+ araç barındıran tersine mühendislik ajanları gibi) doğrudan istemciye bağlandığında:
1. **`400 INVALID_ARGUMENT`** hatası alınır (fonksiyon sınırı aşılır).
2. Her bir prompt sorgusunda yüzlerce fonksiyon şeması modele gönderildiğinden sorgu başına **80.000+ gereksiz token** harcanır.
3. Editörler (Unreal, Unity vb.) kapalı olduğunda istemci bağlantı hataları verir.

**MCP Gateway**, arka plandaki **310+ aracı** Gemini'ye sadece **8 temel araç** olarak sunar. İhtiyaç duyulan fonksiyonları dinamik indeks üzerinden arar (`search_tools`) ve çalıştırır (`call_tool`).

---

## 🏛️ Mimari Şema

```
                                  [ Gemini CLI ]
                       (Sadece 8 araç görür: ~300 token yükü)
                         ├── search_tools (Araç arama)
                         ├── call_tool (Dinamik çalıştırma)
                         ├── list_mcp_servers (Sunucu durumları)
                         ├── refresh_tools_index (İndeks güncelleme)
                         └── [Hızlı Kısayollar]
                               ├── vacuum_get_status / vacuum_locate
                               └── tv_get_status / tv_power
                                        │
                                        │ (stdio)
                                        ▼
                                 [ mcp-gateway ]
                                        │
      ┌───────────┬───────────┬─────────┼─────────┬───────────┬───────────┐
      │ (stdio)   │ (stdio)   │ (stdio) │ (stdio) │ (HTTP)    │ (Stream)  │ (HTTP)
      ▼           ▼           ▼         ▼         ▼           ▼           ▼
   [House]      [REA]    [Obsidian]   [CRW]     [n8n]      [Unreal]    [Unity]
  (15 Araç)   (207 Araç)  (14 Araç)  (8 Araç)  (55 Araç)    (3 Araç)     (...)
      │                                                       │
  [Docker]                                                [Port 8000]
 (Ferhunde)                                                (UE5 MCP)
```

---

## 🔌 Desteklenen & Bağlı MCP Sunucuları

| Sunucu Adı | Taşıma | Açıklama | Araç Sayısı |
| :--- | :--- | :--- | :--- |
| **`house`** | stdio (Docker) | SmartHome: Dreame D9 Max ("Ferhunde") süpürge ve Samsung Smart TV kontrolü | 15 araç |
| **`rea`** | stdio (npx) | Tersine mühendislik: APK, Ghidra, IDA, radare2, decompilation analizi | 207 araç |
| **`n8n`** | http (SSE) | İş akışı otomasyonu, agent builder, workflow çalıştırma | 55 araç |
| **`unreal`** | StreamableHTTP | Unreal Engine 5 editör otomasyonu, aktör, level, blueprint yönetimi (`:8000`) | 3 araç |
| **`unity`** | http (`:9000`) | Unity 3D hiyerarşi, GameObject, bileşen ve C# script kontrolü | Dinamik |
| **`blender`** | stdio (uvx) | Blender 3D modelleme, bpy Python scriptleri ve render | 9 araç |
| **`obsidian`** | stdio (npx) | Yerel Obsidian bilgi kasası not okuma, yazma ve dosya işlemleri | 14 araç |
| **`crw`** | stdio (npx) | Canlı internet erişimi, Markdown dönüştürücü ve web scraping | 8 araç |
| **`comfyui`** | stdio (cmd) | ComfyUI yerel görsel üretim iş akışları | Dinamik |

---

## ✨ Öne Çıkan Özellikler

- **Çoklu Protokol Desteği:** `stdio`, standart `SSE` ve Unreal Engine 5 gibi modern sistemler için oturum tabanlı **`StreamableHTTP`** desteği.
- **Hızlı Kısayollar (Shortcuts):** Sık kullanılan refleksif komutlar (Ferhunde süpürge durumu, TV kumandası vb.) arama adımı olmadan tek adımda çalışır.
- **Güvenli Token Yönetimi:** Hassas tokenlar `.env` dosyasından okunur; `config.json` içindeki `${TOKEN_NAME}` şablonları çalışma anında otomatik çözümlenir.
- **Toleranslı Çalışma (Fault Tolerant):** Oyun motorları (Unreal/Unity) veya harici servisler kapalıyken gateway çökmez; hata sessizce yakalanır ve servis açıldığında tek komutla bağlanır.

---

## ⚙️ Kurulum & Yapılandırma

### 1. Bağımlılıkları Yükleyin
```bash
npm install
```

### 2. Ortam Değişkenlerini Tanımlayın
`.env.example` dosyasını `.env` olarak kopyalayın ve tokenlarınızı girin:
```env
N8N_TOKEN=your_jwt_token_here
```

### 3. Araçları İndeksleyin
Bağlı sunuculardaki araçları yerel önbelleğe (`tools-cache.json`) almak için:
```bash
npm run refresh
```

---

## 🤖 Gemini CLI Entegrasyonu

Gemini CLI ayar dosyanıza (`~/.gemini/settings.json`) sadece gateway'i eklemeniz yeterlidir:

```json
{
  "mcpServers": {
    "mcp-gateway": {
      "command": "node",
      "args": [
        "C:/Users/fatih/Desktop/apps/mcp-gateway/index.js"
      ]
    }
  }
}
```

---

## 🛠️ Kullanım Örnekleri (Gemini CLI)

- **Ev Kontrolü:**  
  `> Ferhunde ne durumda?`  
  *(Shortcut üzerinden `vacuum_get_status` doğrudan tetiklenir)*

- **Unreal Engine:**  
  `> Unreal'daki toolset'leri listele`  
  *(Gateway arka planda `list_toolsets` aracını bulup çalıştırır)*

- **Tersine Mühendislik:**  
  `> Şu APK dosyasının manifestini analiz et`  
  *(Gateway 207 araç içinden uygun REA analiz aracını dinamik seçer)*

- **İndeks Yenileme:**  
  `> MCP indeksini yenile`  
  *(Model `refresh_tools_index` fonksiyonunu çağırarak önbelleği günceller)*

---

## 📄 Lisans
MIT
