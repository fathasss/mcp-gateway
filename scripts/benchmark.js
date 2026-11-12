#!/usr/bin/env node

import { getCoreToolsDefinition, CORE_TOOL_COUNT } from "../src/server.js";
import { LOCALES } from "../src/i18n/locales.js";

function generateMockTool(serverIdx, toolIdx) {
  return {
    name: `srv${serverIdx}_action_${toolIdx}`,
    description: `Perform operation #${toolIdx} on downstream service ${serverIdx} with validated parameters and structured JSON response.`,
    inputSchema: {
      type: "object",
      properties: {
        targetId: { type: "string", description: "Unique resource identifier" },
        filter: { type: "string", description: "Optional query filter expression" },
        limit: { type: "number", description: "Maximum number of items to return" },
      },
      required: ["targetId"],
    },
  };
}

function estimateTokens(obj) {
  const json = typeof obj === "string" ? obj : JSON.stringify(obj);
  return {
    bytes: Buffer.byteLength(json, "utf8"),
    tokens: Math.round(json.length / 4),
  };
}

export function runBenchmark() {
  const coreTools = getCoreToolsDefinition(LOCALES.en);
  const coreCost = estimateTokens(coreTools);

  const scenarios = [
    { name: "Small (2 servers, 10 tools)", servers: 2, toolsPerServer: 5, turns: 5 },
    { name: "Medium (5 servers, 60 tools)", servers: 5, toolsPerServer: 12, turns: 5 },
    { name: "Large (12 servers, 250 tools)", servers: 12, toolsPerServer: 21, turns: 5 },
  ];

  const results = [];

  for (const sc of scenarios) {
    const allTools = [];
    for (let s = 0; s < sc.servers; s++) {
      for (let t = 0; t < sc.toolsPerServer; t++) {
        if (allTools.length < sc.servers * sc.toolsPerServer) {
          allTools.push(generateMockTool(s, t));
        }
      }
    }
    const totalToolCount = sc.name.includes("250") ? 250 : allTools.length;
    const toolset = allTools.slice(0, totalToolCount);

    const directSchemaCost = estimateTokens(toolset);
    // Same task: 5-turn session invoking 1 target tool
    const taskCallPayload = estimateTokens({ targetId: "item-42", filter: "active", limit: 10 });
    const searchResultSample = estimateTokens({
      found: 5,
      tools: toolset.slice(0, 5),
    });

    const directSessionTokens = directSchemaCost.tokens * sc.turns + taskCallPayload.tokens;
    const gatewaySessionTokens =
      coreCost.tokens * sc.turns + searchResultSample.tokens + taskCallPayload.tokens;

    const savingsPct = ((directSessionTokens - gatewaySessionTokens) / directSessionTokens) * 100;

    results.push({
      scenario: sc.name,
      toolCount: toolset.length,
      turns: sc.turns,
      directPerTurnTokens: directSchemaCost.tokens,
      gatewayPerTurnTokens: coreCost.tokens,
      directSessionTokens,
      gatewaySessionTokens,
      savingsPct: Number(savingsPct.toFixed(1)),
    });
  }

  const pcts = results.map((r) => r.savingsPct).sort((a, b) => a - b);
  const meanPct = (pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1);
  const medianPct = pcts[Math.floor(pcts.length / 2)].toFixed(1);

  return {
    environment: {
      node: process.version,
      platform: `${process.platform} (${process.arch})`,
      coreToolCount: CORE_TOOL_COUNT,
      coreSchemaBytes: coreCost.bytes,
      coreSchemaEstTokens: coreCost.tokens,
      methodology: "Compact JSON declaration character length / 4 heuristic over a 5-turn single-tool task (including 1 search_tools lookup of 5 schemas + 1 call_tool invocation).",
    },
    results,
    summary: {
      meanSavingsPct: Number(meanSavingsPct(pcts)),
      medianSavingsPct: Number(medianPct),
    },
  };
}

function meanSavingsPct(pcts) {
  return (pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const report = runBenchmark();
  console.log("=== MCP Gateway Benchmark (Synthetic Reproducible Suite) ===");
  console.log(`Environment : Node ${report.environment.node} on ${report.environment.platform}`);
  console.log(`Core Tools  : ${report.environment.coreToolCount} tools (${report.environment.coreSchemaBytes} bytes, ~${report.environment.coreSchemaEstTokens} est. tokens/turn)`);
  console.log(`Methodology : ${report.environment.methodology}\n`);

  for (const r of report.results) {
    console.log(`• ${r.scenario}`);
    console.log(`    Direct MCP (5 turns)  : ~${r.directSessionTokens.toLocaleString()} est. tokens (~${r.directPerTurnTokens.toLocaleString()}/turn)`);
    console.log(`    MCP Gateway (5 turns) : ~${r.gatewaySessionTokens.toLocaleString()} est. tokens (~${r.gatewayPerTurnTokens.toLocaleString()}/turn + search)`);
    console.log(`    Estimated Reduction   : ${r.savingsPct}%`);
  }

  console.log(`\nSummary: Mean reduction = ${report.summary.meanSavingsPct}% | Median reduction = ${report.summary.medianSavingsPct}%`);
  console.log("Limitations: Estimates use chars/4 heuristic on synthetic schemas; actual token counts vary by LLM tokenizer and number of distinct search_tools calls.");
}

