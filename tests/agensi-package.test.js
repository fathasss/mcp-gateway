import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgensiPackage, readZipEntries } from "../scripts/build-agensi-package.js";
import { getCoreToolsDefinition } from "../src/server.js";
import { LOCALES } from "../src/i18n/locales.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

test("buildAgensiPackage produces a valid, secret-free ZIP with SKILL.md at root and POSIX paths", () => {
  const tmpDist = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-gw-agensi-"));
  try {
    const result = buildAgensiPackage({ distDir: tmpDist });
    assert.ok(fs.existsSync(result.zipPath));

    const entries = readZipEntries(result.zipPath);
    const names = entries.map((e) => e.name);

    const expectedFiles = [
      "SKILL.md",
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "references/installation-guide.md",
      "references/supported-clients.md",
      "references/gateway-tool-reference.md",
      "references/troubleshooting.md",
      "references/security-guide.md",
    ];

    assert.deepEqual(names.sort(), expectedFiles.sort());

    for (const name of names) {
      assert.ok(!name.includes("\\"), `ZIP entry must use POSIX '/' separators: ${name}`);
      assert.ok(!name.endsWith(".js"), `Skill-only Agensi ZIP must not bundle JS source: ${name}`);
      assert.ok(!name.includes(".env") && !name.endsWith("config.json") && !name.endsWith("tools-cache.json"));
    }

    // Verify exact byte-for-byte match between packaged static files and workspace files
    for (const relPath of expectedFiles.filter((f) => f !== "README.md")) {
      const entry = entries.find((e) => e.name === relPath);
      const workspaceContent = fs.readFileSync(path.join(rootDir, relPath), "utf8");
      assert.equal(entry.content, workspaceContent, `ZIP entry "${relPath}" must match workspace file`);
    }

    const skillEntry = entries.find((e) => e.name === "SKILL.md");
    assert.ok(skillEntry && skillEntry.content.length > 500);

    // Every core Gateway tool name and reference file must appear in SKILL.md
    const coreTools = getCoreToolsDefinition(LOCALES.en);
    for (const tool of coreTools) {
      assert.ok(
        skillEntry.content.includes(tool.name),
        `SKILL.md must reference real Gateway tool "${tool.name}"`
      );
    }
    for (const refFile of expectedFiles.filter((f) => f.startsWith("references/"))) {
      assert.ok(
        skillEntry.content.includes(refFile),
        `SKILL.md must reference supporting file "${refFile}"`
      );
    }

    // Safety assertions in SKILL.md: forbid pre-install Gateway tool calls, warn about npm lifecycle scripts, forbid chat secrets
    assert.match(skillEntry.content, /if those tools are not present.*do not/i);
    assert.match(skillEntry.content, /lifecycle scripts/i);
    assert.match(skillEntry.content, /never ask the user to paste raw secrets/i);

    // Verify references/gateway-tool-reference.md documents all tool names, required fields, and manage_mcp_server.action enums
    const toolRefEntry = entries.find((e) => e.name === "references/gateway-tool-reference.md");
    for (const tool of coreTools) {
      assert.ok(toolRefEntry.content.includes(tool.name), `Tool reference missing tool "${tool.name}"`);
      for (const reqField of tool.inputSchema.required || []) {
        assert.ok(
          toolRefEntry.content.includes(reqField),
          `Tool reference missing required field "${reqField}" for "${tool.name}"`
        );
      }
    }
    const manageTool = coreTools.find((t) => t.name === "manage_mcp_server");
    for (const actionEnum of manageTool.inputSchema.properties.action.enum) {
      assert.ok(
        toolRefEntry.content.includes(`"${actionEnum}"`),
        `Tool reference missing manage_mcp_server action enum "${actionEnum}"`
      );
    }

    // Ensure no personal/local identifiers or credentials exist in any packaged file
    const forbiddenTerms = ["ferhunde", "has-smarthouse", "gods-eye-view", "moneyprinter", "es4tsw9hacxonhlz"];
    for (const entry of entries) {
      const lower = entry.content.toLowerCase();
      for (const term of forbiddenTerms) {
        assert.ok(!lower.includes(term), `Forbidden personal term "${term}" found in ${entry.name}`);
      }
    }
  } finally {
    fs.rmSync(tmpDist, { recursive: true, force: true });
  }
});
