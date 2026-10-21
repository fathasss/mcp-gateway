import { toolRegistry } from "./src/tool-registry.js";
import { clientPool } from "./src/client-pool.js";

async function main() {
  console.log("Starting index refresh...");
  await toolRegistry.refreshCache();
  await clientPool.closeAll();
  console.log("Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Index error:", err);
  process.exit(1);
});
