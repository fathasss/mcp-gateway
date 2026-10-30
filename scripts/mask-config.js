import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const configPath = path.join(rootDir, "config.json");
const configExamplePath = path.join(rootDir, "config.example.json");

if (!fs.existsSync(configPath)) {
  console.error("config.json bulunamadı.");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
const masked = JSON.parse(JSON.stringify(raw));

// Masking kuralları:
// 1. Windows kullanıcı yolları (C:/Users/... veya C:\Users\...) -> generic yollara çevir
// 2. Token veya auth alanları şablona çevir
for (const [id, s] of Object.entries(masked.servers || {})) {
  if (s.command) {
    s.command = s.command.replace(/C:[\\/]Users[\\/][^\\/]+[\\/]/gi, "C:/Users/USERNAME/");
  }
  if (Array.isArray(s.args)) {
    s.args = s.args.map((arg) => {
      if (typeof arg === "string") {
        return arg.replace(/C:[\\/]Users[\\/][^\\/]+[\\/]/gi, "C:/Users/USERNAME/");
      }
      return arg;
    });
  }
}

fs.writeFileSync(configExamplePath, JSON.stringify(masked, null, 2), "utf8");
console.log(`[Success] Maskelenmiş config.example.json dosyası oluşturuldu: ${configExamplePath}`);

