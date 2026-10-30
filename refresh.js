import { toolRegistry } from "./src/tool-registry.js";
import { clientPool } from "./src/client-pool.js";
import { getTranslation } from "./src/i18n/locales.js";

const t = getTranslation();

async function main() {
  console.log(t.messages.startingRefresh);
  await toolRegistry.refreshCache();
  await clientPool.closeAll();
  console.log(t.messages.refreshDone);
  process.exit(0);
}

main().catch((err) => {
  console.error(t.messages.indexError, err);
  process.exit(1);
});
