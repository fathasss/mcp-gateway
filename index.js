import { startOrchestrator } from "./src/server.js";

startOrchestrator().catch((err) => {
  console.error("Kritik Gateway Hatası:", err);
  process.exit(1);
});
