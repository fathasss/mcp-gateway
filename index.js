import { startOrchestrator } from "./src/server.js";
import { getTranslation } from "./src/i18n/locales.js";

const t = getTranslation();

startOrchestrator().catch((err) => {
  console.error(t.messages.criticalGatewayError, err);
  process.exit(1);
});
