import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseJsonConfig } from "../src/manager.js";
import { ToolRegistry } from "../src/tool-registry.js";
import { CORE_TOOL_COUNT, getCoreToolsDefinition } from "../src/server.js";
import { LOCALES } from "../src/i18n/locales.js";

test("parseJsonConfig parses standard mcpServers formats and rejects invalid payloads", () => {
  const parsed = parseJsonConfig({
    mcpServers: {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: "MOCK_VAL" },
      },
      remote: {
        url: "http://localhost:8080/mcp",
        headers: { Authorization: "Bearer MOCK_REMOTE" },
      },
    },
  });

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, "github");
  assert.equal(parsed[0].transport, "stdio");
  assert.equal(parsed[1].id, "remote");
  assert.equal(parsed[1].transport, "http");

  assert.throws(() => parseJsonConfig("not-json"), /Invalid JSON|Geçersiz JSON/);
  assert.throws(() => parseJsonConfig("[]"), /No valid MCP server|geçerli bir MCP sunucu/);
  assert.throws(() => parseJsonConfig({}), /No valid MCP server|geçerli bir MCP sunucu/);
});

test("ToolRegistry discovers tools with English and Turkish synonyms", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-gw-reg-"));
  const prevDataDir = process.env.MCP_GATEWAY_DATA_DIR;
  process.env.MCP_GATEWAY_DATA_DIR = tmpDir;

  try {
    const registry = new ToolRegistry();
    registry.saveCache({
      lastUpdated: new Date().toISOString(),
      serverSummaries: {
        github: { name: "github", toolCount: 2, status: "connected" },
        mail: { name: "mail", toolCount: 1, status: "connected" },
      },
      tools: [
        {
          server: "github",
          serverName: "github",
          name: "create_pull_request",
          description: "Create a pull request in a repository",
          inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
        },
        {
          server: "github",
          serverName: "github",
          name: "list_issues",
          description: "List issues in a GitHub repository",
          inputSchema: { type: "object", properties: {} },
        },
        {
          server: "mail",
          serverName: "mail",
          name: "send_email",
          description: "Send an email message via SMTP",
          inputSchema: { type: "object", properties: { to: { type: "string" } }, required: ["to"] },
        },
      ],
    });

    const prHits = registry.searchTools("pull request", "github", 5);
    assert.equal(prHits.length, 1);
    assert.equal(prHits[0].name, "create_pull_request");

    // Bilingual synonym match ("eposta" -> "email", "send")
    const trHits = registry.searchTools("eposta", null, 5);
    assert.ok(trHits.some((t) => t.name === "send_email"));

    const tool = registry.getTool("github", "create_pull_request");
    assert.ok(tool);
    assert.deepEqual(tool.inputSchema.required, ["title"]);
  } finally {
    if (prevDataDir === undefined) delete process.env.MCP_GATEWAY_DATA_DIR;
    else process.env.MCP_GATEWAY_DATA_DIR = prevDataDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CORE_TOOL_COUNT matches getCoreToolsDefinition across locales", () => {
  const enTools = getCoreToolsDefinition(LOCALES.en);
  const trTools = getCoreToolsDefinition(LOCALES.tr);
  assert.equal(enTools.length, CORE_TOOL_COUNT);
  assert.equal(trTools.length, CORE_TOOL_COUNT);
  assert.deepEqual(
    enTools.map((t) => t.name),
    ["search_tools", "call_tool", "list_mcp_servers", "refresh_tools_index", "manage_mcp_server"]
  );
});

