#!/usr/bin/env node

import { addServer, parseJsonConfig, removeServer, setServerEnabled } from "./src/manager.js";
import { toolRegistry } from "./src/tool-registry.js";
import { clientPool, loadConfig } from "./src/client-pool.js";
import { getTranslation, resolveLocalizedText, getActiveLanguage } from "./src/i18n/locales.js";

const args = process.argv.slice(2);
const command = args[0] === "--lang" || args[0]?.startsWith("--lang=") ? args[2] : args[0];
const t = getTranslation();
const lang = getActiveLanguage();

function printHelp() {
  console.log(t.cli.helpText);
}

async function main() {
  if (!command || command === "--help" || command === "-h" || command === "help" || args[0] === "--help") {
    printHelp();
    return;
  }

  if (command === "list") {
    const config = loadConfig();
    toolRegistry.ensureFreshCache();
    console.log(t.cli.connectedServersHeader);
    for (const [id, s] of Object.entries(config.servers || {})) {
      const summary = toolRegistry.cache.serverSummaries?.[id];
      const count = summary ? t.messages.statusActive(summary.toolCount) : t.messages.notIndexed;
      const status = s.enabled ? count : t.messages.statusDisabled;
      const desc = resolveLocalizedText(s.description, lang) || s.name;
      console.log(`• ${id.padEnd(16)} ${s.transport.padEnd(8)} ${status.padEnd(24)} ${desc}`);
    }
    console.log("");
    return;
  }

  if (command === "remove") {
    const id = args[1];
    if (!id) {
      console.error(t.cli.idRequiredForCommand("remove"));
      process.exit(1);
    }
    removeServer(id);
    return;
  }

  if (command === "enable" || command === "disable") {
    const id = args[1];
    if (!id) {
      console.error(t.cli.idRequiredForCommand(command));
      process.exit(1);
    }
    setServerEnabled(id, command === "enable");
    return;
  }

  if (command === "refresh") {
    const targetId = args[1];
    if (targetId) {
      console.log(t.cli.refreshingServer(targetId));
      await toolRegistry.refreshSingleServer(targetId);
      await clientPool.closeAll();
    } else {
      console.log(t.cli.refreshingAll);
      await toolRegistry.refreshCache();
      await clientPool.closeAll();
    }
    console.log(t.cli.refreshComplete);
    return;
  }

  if (command === "add-json") {
    let jsonInput = args[1];
    if (!jsonInput) {
      console.error(t.cli.jsonInputRequired);
      process.exit(1);
    }

    const fs = await import("node:fs");
    if (fs.existsSync(jsonInput)) {
      jsonInput = fs.readFileSync(jsonInput, "utf8");
    }

    const servers = parseJsonConfig(jsonInput);
    for (const s of servers) {
      console.log(t.cli.addingServer(s.id));
      await addServer(s);
    }
    return;
  }

  if (command === "add") {
    const id = args[1];
    if (!id || id.startsWith("-")) {
      console.error(t.cli.idRequiredForCommand("add"));
      process.exit(1);
    }

    const restArgs = args.slice(2);
    let transport = "stdio";
    let url = "";
    let desc = "";
    let descTr = "";
    let descEn = "";
    let name = id;
    let verify = true;
    const env = {};
    const headers = {};

    let commandAndArgs = [];
    const doubleDashIdx = restArgs.indexOf("--");
    let optionsList = restArgs;

    if (doubleDashIdx !== -1) {
      optionsList = restArgs.slice(0, doubleDashIdx);
      commandAndArgs = restArgs.slice(doubleDashIdx + 1);
    }

    for (let i = 0; i < optionsList.length; i++) {
      const opt = optionsList[i];
      if (opt === "--transport" && optionsList[i + 1]) {
        transport = optionsList[++i];
      } else if (opt === "--url" && optionsList[i + 1]) {
        url = optionsList[++i];
        transport = "http";
      } else if (opt === "--desc" && optionsList[i + 1]) {
        desc = optionsList[++i];
      } else if (opt === "--desc-tr" && optionsList[i + 1]) {
        descTr = optionsList[++i];
      } else if (opt === "--desc-en" && optionsList[i + 1]) {
        descEn = optionsList[++i];
      } else if (opt === "--name" && optionsList[i + 1]) {
        name = optionsList[++i];
      } else if (opt === "--no-verify") {
        verify = false;
      } else if (opt === "--env" && optionsList[i + 1]) {
        const [k, ...v] = optionsList[++i].split("=");
        if (k) env[k.trim()] = v.join("=").trim();
      } else if (opt === "--header" && optionsList[i + 1]) {
        const [k, ...v] = optionsList[++i].split("=");
        if (k) headers[k.trim()] = v.join("=").trim();
      }
    }

    let cmd = "";
    let cmdArgs = [];
    if (commandAndArgs.length > 0) {
      cmd = commandAndArgs[0];
      cmdArgs = commandAndArgs.slice(1);
    }

    await addServer({
      id,
      name,
      description: desc,
      descriptionTr: descTr,
      descriptionEn: descEn,
      transport,
      url: url || undefined,
      command: cmd || undefined,
      args: cmdArgs,
      env,
      headers,
      verify
    });
    return;
  }

  console.error(t.cli.unknownCommand(command));
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(`\n${t.cli.cliError}`, err.message);
  process.exit(1);
});
