import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const MOCK_SERVER_CODE = `
import { Server } from "${pathToFileURL(path.join(rootDir, "node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js")).href}";
import { StdioServerTransport } from "${pathToFileURL(path.join(rootDir, "node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js")).href}";
import { CallToolRequestSchema, ListToolsRequestSchema } from "${pathToFileURL(path.join(rootDir, "node_modules/@modelcontextprotocol/sdk/dist/esm/types.js")).href}";

const server = new Server({ name: "mock-downstream", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo_widget",
      description: "Echoes widget input and confirms mock env token presence without revealing it",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Message to echo" }
        },
        required: ["message"]
      }
    },
    {
      name: "slow_widget",
      description: "Waits longer than the configured timeout for timeout testing",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "crash_exit",
      description: "Simulates a sudden downstream process crash",
      inputSchema: {
        type: "object",
        properties: {}
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "echo_widget") {
    const hasToken = Boolean(process.env.MOCK_API_KEY);
    return {
      content: [{ type: "text", text: JSON.stringify({ echoed: req.params.arguments?.message, hasToken }) }]
    };
  }
  if (req.params.name === "slow_widget") {
    await new Promise((resolve) => setTimeout(resolve, 3500));
    return { content: [{ type: "text", text: "finished-slow" }] };
  }
  if (req.params.name === "crash_exit") {
    process.exit(1);
  }
  throw new Error("Unknown mock tool: " + req.params.name);
});

const transport = new StdioServerTransport();
await server.connect(transport);
`;

const FAIL_WITH_SECRET_SERVER_CODE = `
process.exit(1);
`;

test("end-to-end MCP Gateway integration with live downstream stdio server, update, crash recovery, and error handling", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-gw-e2e-"));
  const mockServerPath = path.join(tmpDir, "mock-downstream.mjs");
  const failingServerPath = path.join(tmpDir, "fail-downstream.mjs");
  fs.writeFileSync(mockServerPath, MOCK_SERVER_CODE, "utf8");
  fs.writeFileSync(failingServerPath, FAIL_WITH_SECRET_SERVER_CODE, "utf8");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(rootDir, "index.js")],
    env: {
      ...process.env,
      MCP_GATEWAY_DATA_DIR: tmpDir,
      MCP_GATEWAY_LANG: "en",
    },
  });

  const client = new Client({ name: "integration-test-client", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);

    // 1. Verify initial 5 core tools
    const initialTools = await client.listTools();
    assert.deepEqual(
      initialTools.tools.map((t) => t.name),
      ["search_tools", "call_tool", "list_mcp_servers", "refresh_tools_index", "manage_mcp_server"]
    );

    // 2. Hot-plug mock downstream server via manage_mcp_server
    const addRes = await client.callTool({
      name: "manage_mcp_server",
      arguments: {
        action: "add",
        id: "mock-svc",
        transport: "stdio",
        command: process.execPath,
        args: [mockServerPath],
        env: { MOCK_API_KEY: "MOCK_INTEGRATION_SECRET_XYZ" },
        description: "Mock integration downstream server",
        verify: true,
      },
    });
    assert.equal(addRes.isError, undefined);
    const addPayload = JSON.parse(addRes.content[0].text);
    assert.equal(addPayload.status, "connected");
    assert.equal(addPayload.indexedTools, 3);
    assert.ok(addPayload.maskedSecrets.includes("MOCK_SVC_MOCK_API_KEY"));

    // 3. Update existing server via action: "add" with existing id
    const updateRes = await client.callTool({
      name: "manage_mcp_server",
      arguments: {
        action: "add",
        id: "mock-svc",
        transport: "stdio",
        command: process.execPath,
        args: [mockServerPath],
        env: { MOCK_API_KEY: "MOCK_INTEGRATION_SECRET_UPDATED" },
        description: "Updated mock integration downstream server",
        verify: true,
      },
    });
    assert.equal(updateRes.isError, undefined);

    // 4. list_mcp_servers must show updated description and redact secrets
    const listRes = await client.callTool({ name: "list_mcp_servers", arguments: {} });
    const listText = listRes.content[0].text;
    assert.ok(listText.includes("Updated mock integration downstream server"));
    assert.ok(!listText.includes("MOCK_INTEGRATION_SECRET_XYZ"));
    assert.ok(!listText.includes("MOCK_INTEGRATION_SECRET_UPDATED"));

    // 5. search_tools discovers echo_widget
    const searchRes = await client.callTool({
      name: "search_tools",
      arguments: { query: "echo widget", server: "mock-svc", limit: 5 },
    });
    const searchPayload = JSON.parse(searchRes.content[0].text);
    assert.ok(searchPayload.found >= 1);
    assert.equal(searchPayload.tools[0].name, "echo_widget");

    // 6. call_tool executes downstream echo_widget and confirms env token was injected
    const callRes = await client.callTool({
      name: "call_tool",
      arguments: {
        server: "mock-svc",
        tool: "echo_widget",
        arguments: { message: "hello-gateway" },
      },
    });
    assert.equal(callRes.isError, undefined);
    const echoOut = JSON.parse(callRes.content[0].text);
    assert.equal(echoOut.echoed, "hello-gateway");
    assert.equal(echoOut.hasToken, true);

    // 7. Crash downstream process and verify gateway recovers cleanly on subsequent call_tool
    const crashCall = await client.callTool({
      name: "call_tool",
      arguments: { server: "mock-svc", tool: "crash_exit", arguments: {} },
    });
    assert.equal(crashCall.isError, true);

    const recoveredCall = await client.callTool({
      name: "call_tool",
      arguments: {
        server: "mock-svc",
        tool: "echo_widget",
        arguments: { message: "after-crash" },
      },
    });
    assert.equal(recoveredCall.isError, undefined);
    assert.equal(JSON.parse(recoveredCall.content[0].text).echoed, "after-crash");

    // 8. Failing downstream with secret env variable must not leak secret in manage_mcp_server error
    const failSecretAdd = await client.callTool({
      name: "manage_mcp_server",
      arguments: {
        action: "add",
        id: "fail-svc",
        transport: "stdio",
        command: process.execPath,
        args: [failingServerPath],
        env: { SECRET_TO_LEAK: "MOCK_LEAKED_SECRET_999" },
        verify: true,
      },
    });
    const failPayload = JSON.parse(failSecretAdd.content[0].text);
    assert.match(failPayload.status, /^warning/i);
    assert.ok(!failSecretAdd.content[0].text.includes("MOCK_LEAKED_SECRET_999"));

    const refreshAfterFail = await client.callTool({ name: "refresh_tools_index", arguments: {} });
    assert.ok(!refreshAfterFail.content[0].text.includes("MOCK_LEAKED_SECRET_999"));

    await client.callTool({
      name: "manage_mcp_server",
      arguments: { action: "remove", id: "fail-svc" },
    });

    // 9. Error handling tests
    const offlineCall = await client.callTool({
      name: "call_tool",
      arguments: { server: "nonexistent-server", tool: "ping" },
    });
    assert.equal(offlineCall.isError, true);

    const missingParamCall = await client.callTool({
      name: "call_tool",
      arguments: { server: "mock-svc" },
    });
    assert.equal(missingParamCall.isError, true);

    const invalidJsonAdd = await client.callTool({
      name: "manage_mcp_server",
      arguments: { action: "add_json", json: "{not-valid-json" },
    });
    assert.equal(invalidJsonAdd.isError, true);

    // 10. Disable & Remove server
    const disableRes = await client.callTool({
      name: "manage_mcp_server",
      arguments: { action: "disable", id: "mock-svc" },
    });
    assert.equal(JSON.parse(disableRes.content[0].text).enabled, false);

    const removeRes = await client.callTool({
      name: "manage_mcp_server",
      arguments: { action: "remove", id: "mock-svc" },
    });
    assert.equal(JSON.parse(removeRes.content[0].text).status, "removed");
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("MCP_GATEWAY_TOOL_TIMEOUT_MS enforces downstream tool call timeouts", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-gw-timeout-"));
  const mockServerPath = path.join(tmpDir, "mock-downstream.mjs");
  fs.writeFileSync(mockServerPath, MOCK_SERVER_CODE, "utf8");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(rootDir, "index.js")],
    env: {
      ...process.env,
      MCP_GATEWAY_DATA_DIR: tmpDir,
      MCP_GATEWAY_LANG: "en",
      MCP_GATEWAY_TOOL_TIMEOUT_MS: "1500",
    },
  });

  const client = new Client({ name: "timeout-test-client", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    const addSlowRes = await client.callTool({
      name: "manage_mcp_server",
      arguments: {
        action: "add",
        id: "slow-svc",
        transport: "stdio",
        command: process.execPath,
        args: [mockServerPath],
        verify: true,
      },
    });
    assert.equal(JSON.parse(addSlowRes.content[0].text).status, "connected");

    const timeoutRes = await client.callTool({
      name: "call_tool",
      arguments: { server: "slow-svc", tool: "slow_widget", arguments: {} },
    });
    assert.equal(timeoutRes.isError, true);
    assert.match(timeoutRes.content[0].text, /timed out|timeout/i);
  } finally {
    await client.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
