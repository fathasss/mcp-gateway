# MCP Gateway (Multi-Agent Dynamic Tool Router)

<div align="center">

[**English**](README.md) · [**Türkçe**](README.tr.md)

</div>

Gemini CLI, Claude ve LLM modelleri için çoklu MCP (Model Context Protocol) sunucularını tek bir çatı altında birleştiren, token tasarruflu akıllı gateway ve yönlendirici.

---

## 🚀 Neden MCP Gateway?

Google Gemini API ve pek çok modern LLM istemcisi **64 veya 128 fonksiyon deklarasyonu sınırına** sahiptir. Çok sayıda MCP sunucusu (özellikle 200+ araç barındıran tersine mühendislik ajanları gibi) doğrudan istemciye bağlandığında:
1. **`400 INVALID_ARGUMENT`** hatası alınır (fonksiyon sınırı aşılır).
2. Her bir prompt sorgusunda yüzlerce fonksiyon şeması modele gönderildiğinden sorgu başına **80.000+ gereksiz token** harcanır.
3. Editörler (Unreal, Unity vb.) kapalı olduğunda istemci bağlantı hataları verir.

**MCP Gateway**, arka plandaki **400+ aracı** Gemini'ye sadece **8 temel araç** olarak sunar. İhtiyaç duyulan fonksiyonları dinamik indeks üzerinden arar (`search_tools`) ve çalıştırır (`call_tool`).

---

## 🏛️ Mimari Şema

```
                                  [ Gemini CLI / Claude ]
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
          │ (stdio)   │ (stdio)   │ (stdio) │ (stdio) │ (HTTP)    │ (Stream)  │ (Çoklu)
          ▼           ▼           ▼         ▼         ▼           ▼           ▼
       [House]      [REA]    [Obsidian]   [CRW]     [n8n]      [Unreal]   [GEV/Diğer]
      (18 Araç)   (207 Araç)  (14 Araç)  (8 Araç)  (55 Araç)    (3 Araç)   (30+ Araç)
          │                                                       │
      [Docker]                                                [Port 8000]
     (Ferhunde)                                                (UE5 MCP)
```

---

## 🔌 Desteklenen & Bağlı MCP Sunucuları

| Sunucu Adı | Taşıma | Açıklama | Araç Sayısı |
| :--- | :--- | :--- | :--- |
| **`house`** | stdio (Docker) | SmartHome: Dreame D9 Max ("Ferhunde") süpürge ve Samsung Smart TV kontrolü | 18 araç |
| **`rea`** | stdio (npx) | Tersine mühendislik: APK, Ghidra, IDA, radare2, decompilation analizi | 207 araç |
| **`n8n`** | http (SSE) | İş akışı otomasyonu, agent builder, workflow çalıştırma (`:9876`) | 55 araç |
| **`comfyui`** | stdio (exe) | ComfyUI yerel görsel üretim iş akışları ve model yönetimi (`:8088`) | 39 araç |
| **`whatsapp`** | StreamableHTTP | WhatsApp çoklu oturum, bireysel/grup mesajlaşma, medya, QR kod ve aktivite yönetimi (`:3002`) | 32 araç |
| **`gods-eye-view`** | stdio (Docker) | 3D dünya ve gerçek zamanlı OSINT/GEOINT konsolu: Uçuş, askeri hava trafiği, gemi (AIS), uydu, deprem, yangın, CCTV/ALPR kamera (`:4173`) | 30 araç |
| **`moneyprinter`** | stdio (Python) | MoneyPrinterTurbo otomatik kısa video (Shorts/Reels/TikTok), senaryo, TTS ve altyazı üretimi | 17 araç |
| **`obsidian`** | stdio (npx) | Yerel Obsidian bilgi kasası not okuma, yazma ve dosya işlemleri | 14 araç |
| **`blender`** | stdio (uvx) | Blender 3D modelleme, bpy Python scriptleri ve render | 9 araç |
| **`crw`** | stdio (npx) | Canlı internet erişimi, Markdown dönüştürücü ve web scraping | 8 araç |
| **`has-search`** | stdio (Docker) | Büyük doküman indeksleme (PDF, MD, TXT) ve yerel LanceDB + MiniLM anlamsal arama (RAG) | 4 araç |
| **`unreal`** | StreamableHTTP | Unreal Engine 5 editör otomasyonu, aktör, level, blueprint yönetimi (`:8000`) | 3 araç |
| **`prompts`** | stdio (npx) | Hazır prompt şablonları kütüphanesi (Awesome ChatGPT Prompts) | 2 araç |
| **`unity`** | http (`:9000`) | Unity 3D hiyerarşi, GameObject, bileşen ve C# script kontrolü | Dinamik |

---

## ✨ Öne Çıkan Özellikler

- **Çoklu Protokol Desteği:** `stdio`, standart `SSE` ve Unreal Engine 5 gibi modern sistemler için oturum tabanlı **`StreamableHTTP`** desteği.
- **Hızlı Kısayollar (Shortcuts):** Sık kullanılan refleksif komutlar (Ferhunde süpürge durumu, TV kumandası vb.) arama adımı olmadan tek adımda çalışır.
- **Güvenli Token Yönetimi:** Hassas tokenlar `.env` dosyasından okunur; `config.json` içindeki `${TOKEN_NAME}` şablonları çalışma anında otomatik çözümlenir.
- **Çift Dilli (TR / EN) Akıllı Arama:** Gateway hem Türkçe hem İngilizce dil modunu destekler. Gelişmiş eşanlamlı genişletici (synonym engine) sayesinde `"deprem"` araması İngilizce `get_earthquakes` aracını, `"aircraft"` araması ise ilgili Türkçe veya İngilizce araçları otomatik bulur.
- **Toleranslı Çalışma (Fault Tolerant):** Oyun motorları (Unreal/Unity) veya harici servisler kapalıyken gateway çökmez; hata sessizce yakalanır ve servis açıldığında tek komutla bağlanır.

---

## ⚡ Özel Port ve Çakışma Yönetimi

Bazı MCP sunucuları varsayılan olarak aynı portları kullanır veya yerel servislerle çakışır. Gateway mimarisinde bu portlar ayrıştırılmıştır:

* **Unreal Engine 5 MCP (`:8000`):** Unreal Engine MCP eklentisi varsayılan `8000` portundan Streamable HTTP olarak yayın yapar.
* **Unity 3D MCP (`:9000`):** Unity MCP sunucusu da varsayılan olarak `8000` portunu kullanmak ister. Port çakışmasını önlemek adına Unity tarafında dinleme portu `9000` olarak yapılandırılmıştır (`http://127.0.0.1:9000/mcp`).
* **n8n Automation (`:9876`):** n8n varsayılan portu `5678` yerine Docker üzerinde `9876` dış portuna yönlendirilmiştir (`http://localhost:9876/mcp-server/http`).
* **ComfyUI (`:8088`):** Standart `8188` portu yerine `8088` üzerinde çalışır.
* **God's Eye View (`:4173`):** Web arayüzü ve API dev sunucusu `4173` portundadır.
* **WhatsApp WhiskeySocket (`:3002`):** Baileys MCP Streamable HTTP servisi `3002` portunda çalışır (`http://localhost:3002/mcp`).

---

## 🛠️ CLI ile Dinamik MCP Sunucusu Ekleme & Yönetme

Herhangi bir JSON dosyasını elle düzenlemeden veya gateway'i kapatmadan doğrudan komut satırından MCP sunucusu ekleyebilir, silebilir ve yönetebilirsiniz:

```bash
# Tüm sunucuları ve durumlarını listele
npm run mcp -- list

# 1. HTTP / StreamableHTTP sunucusu ekleme (Tekil veya Çoklu Dil Açıklaması ile)
npm run mcp -- add whatsapp --url http://localhost:3002/mcp --desc-tr "WhatsApp Mesajlaşma" --desc-en "WhatsApp Messaging"

# 2. Stdio sunucusu ekleme (komut '--' sonrasına yazılır)
npm run mcp -- add my-server --desc "Örnek stdio sunucu" -- node C:/path/to/server.js

# 3. Docker exec ile stdio sunucusu ekleme
npm run mcp -- add docker-mcp --desc "Konteyner içi MCP" -- docker exec -i my-container node index.js

# 4. Hazır JSON veya farklı formatları (Claude/OpenCode/Gemini) yapıştırarak ekleme
npm run mcp -- add-json '{"custom-mcp": {"type": "remote", "url": "http://localhost:4000/mcp"}}'

# Sunucu durumlarını değiştirme veya silme
npm run mcp -- disable unreal
npm run mcp -- enable unreal
npm run mcp -- remove my-server

# Tek bir sunucunun veya tüm indeksin önbelleğini yenileme
npm run mcp -- refresh whatsapp
npm run mcp -- refresh
```

---

## 🔒 Güvenlik & GitHub Gönderimi (Sanitization)

Projede iki katmanlı güvenlik uygulanır:
1. **`.gitignore` Koruması:** `.env`, `config.json` ve çalışma zamanı önbelleği olan `tools-cache.json` doğrudan `.gitignore` içindedir; hiçbir zaman Git geçmişine girmez.
2. **Config Maskeleme (`npm run mask`):** `config.json` içerisindeki yerel Windows kullanıcı adları ve özel dosya yolları GitHub'a gönderilmeden önce maskelenerek `config.example.json` oluşturulur:
   ```bash
   npm run mask
   ```
   Hassas API anahtarları ise `config.json` içinde düz metin olarak değil, `${N8N_TOKEN}` gibi dinamik ortam değişkeni şablonları olarak tutulur.

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

## 🤖 Gemini CLI & Claude CLI Entegrasyonu

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

- **God's Eye View (OSINT / Harita):**  
  `> Son 24 saatteki depremleri getir ve haritada göster`  
  *(Gateway `gods-eye-view` üzerinden `get_earthquakes` aracını çalıştırıp canlı harita bağlantısı döner)*

- **İndeks Yenileme:**  
  `> MCP indeksini yenile`  
  *(Model `refresh_tools_index` fonksiyonunu çağırarak önbelleği günceller)*

---

## 📄 Lisans
MIT
