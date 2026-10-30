// Çift yönlü arama genişletici (TR <-> EN)
export const SYNONYM_MAP = {
  // Havacılık & Uçuş
  "ucak": ["aircraft", "flight", "plane", "aviation", "adsb"],
  "uçak": ["aircraft", "flight", "plane", "aviation", "adsb"],
  "ucus": ["flight", "aviation", "track"],
  "uçuş": ["flight", "aviation", "track"],
  "aircraft": ["ucak", "uçak", "ucus", "uçuş", "havacilik"],
  "flight": ["ucak", "uçak", "ucus", "uçuş"],

  // Deprem & Sismik
  "deprem": ["earthquake", "seismic", "usgs"],
  "earthquake": ["deprem", "sismik"],

  // Gemi & Denizcilik
  "gemi": ["vessel", "ship", "maritime", "ais"],
  "vessel": ["gemi", "denizcilik", "tekne"],
  "ship": ["gemi", "denizcilik"],

  // Uydu & Uzay
  "uydu": ["satellite", "celestrak", "orbit", "iss"],
  "firlatma": ["launch", "rocket"],
  "fırlatma": ["launch", "rocket"],
  "satellite": ["uydu", "yörünge"],
  "launch": ["firlatma", "fırlatma", "roket"],

  // Yangın & Afet
  "yangin": ["fire", "wildfire", "firms"],
  "yangın": ["fire", "wildfire", "firms"],
  "fire": ["yangin", "yangın", "ates"],

  // Kamera & Gözetim
  "kamera": ["camera", "cctv", "alpr", "snapshot"],
  "plaka": ["alpr", "plate", "license"],
  "cctv": ["kamera", "mobese", "goruntu"],
  "camera": ["kamera", "fotograf"],

  // Mesajlaşma (WhatsApp)
  "mesaj": ["message", "chat", "send", "whatsapp"],
  "grup": ["group", "participant"],
  "hesap": ["account", "session"],
  "message": ["mesaj", "sohbet", "ileti"],
  "chat": ["sohbet", "mesaj"],

  // Akıllı Ev (House)
  "supurge": ["vacuum", "dreame", "robot", "ferhunde"],
  "süpürge": ["vacuum", "dreame", "robot", "ferhunde"],
  "televizyon": ["tv", "samsung", "power"],
  "vacuum": ["supurge", "süpürge", "temizlik"],
  "tv": ["televizyon", "ekran"],

  // Not & Obsidian
  "not": ["note", "obsidian", "read_file", "write_file"],
  "dosya": ["file", "filesystem", "read", "write"],
  "note": ["not", "yazi", "dokuman"],
  "file": ["dosya", "belge"],

  // Web & Arama
  "arama": ["search", "query", "find", "crawl"],
  "web": ["crawler", "scrape", "markdown", "crw"],
  "search": ["arama", "bul", "sorgula"],

  // Hava Durumu
  "hava": ["weather", "wind", "radar", "cyclone"],
  "ruzgar": ["wind", "forecast"],
  "rüzgar": ["wind", "forecast"],
  "weather": ["hava", "durum", "meteoroloji", "yagis"],
  "wind": ["ruzgar", "rüzgar", "firtina"]
};

export function expandSearchTerms(query) {
  if (!query || typeof query !== "string") return [];
  const rawTerms = query
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ""))
    .filter(w => w.length > 1);

  const termSet = new Set(rawTerms);

  for (const term of rawTerms) {
    if (SYNONYM_MAP[term]) {
      for (const syn of SYNONYM_MAP[term]) {
        termSet.add(syn);
      }
    }
  }

  return Array.from(termSet);
}

