#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "../src/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

// Standard IEEE 802.3 CRC-32 lookup table for PKZIP
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of entries) {
    // Enforce POSIX forward-slash paths inside ZIP
    const posixName = name.replace(/\\/g, "/").replace(/^\/+/, "");
    const nameBuf = Buffer.from(posixName, "utf8");
    const uncompressed = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    const compressed = zlib.deflateRawSync(uncompressed);
    const useStore = compressed.length >= uncompressed.length;
    const payload = useStore ? uncompressed : compressed;
    const method = useStore ? 0 : 8;
    const crc = crc32(uncompressed);

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed to extract
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x5421, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra len

    localParts.push(localHeader, nameBuf, payload);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x031e, 4); // Unix + PKZIP 3.0
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5421, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

export function readZipEntries(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const entries = [];
  let pos = 0;

  // Locate End of Central Directory (search backwards)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid ZIP archive: EOCD signature not found.");
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  pos = cdOffset;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory signature at offset ${pos}`);
    }
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");

    // Extract payload from local header
    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawPayload = buf.subarray(dataStart, dataStart + compressedSize);
    const content = method === 0 ? rawPayload : zlib.inflateRawSync(rawPayload);

    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      content: content.toString("utf8"),
    });

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

const SKILL_README = `# MCP Gateway — Intelligent Tool Orchestration (Skill Package)

Manage multiple MCP servers through a single gateway, discover tools on demand, and reduce unnecessary tool context for AI coding agents.

## Two-Part Architecture

This Agensi skill package contains the agent orchestration layer (\`SKILL.md\` and \`references/\`):
1. **Skill Layer (this package):** Teaches your AI agent when and how to install, configure, migrate, and route tools through MCP Gateway safely.
2. **Gateway Runtime (GitHub):** Open-source Node.js server at https://github.com/fathasss/mcp-gateway (MIT License).

## Quick Start

1. Install this skill in your AI coding agent (Claude Code, Cursor, Claude Desktop, or Gemini CLI).
2. Ask your agent: *"Check if MCP Gateway is installed and help me set it up."*
3. Your agent will follow **Phase A** in \`SKILL.md\` (check Node.js >= 18, install from GitHub, preview migration, ask for confirmation before modifying configs, and verify connection).
4. Once connected, your agent switches to **Phase B** to discover and execute tools across your MCP servers via \`search_tools\` and \`call_tool\`.

## Contents

- \`SKILL.md\` — Agent instructions and two-phase routing protocol
- \`references/installation-guide.md\` — Setup, update, rollback, and uninstall steps
- \`references/supported-clients.md\` — Client compatibility matrix, skill paths, and limitations
- \`references/gateway-tool-reference.md\` — Exact schemas, defaults, and responses for all 5 core tools
- \`references/troubleshooting.md\` — Common errors and diagnostics
- \`references/security-guide.md\` — Credential storage, redaction boundaries, and confirmation rules
- \`LICENSE\` — MIT License
- \`CHANGELOG.md\` — Version history
`;

export function buildAgensiPackage(options = {}) {
  const outBase = options.distDir ? path.resolve(options.distDir) : path.join(rootDir, "dist");
  const stageDir = path.join(outBase, "mcp-gateway-skill");
  const zipPath = path.join(outBase, "mcp-gateway-skill.zip");

  if (fs.existsSync(stageDir)) {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(stageDir, "references"), { recursive: true });

  const staticFiles = [
    "SKILL.md",
    "LICENSE",
    "CHANGELOG.md",
    "references/installation-guide.md",
    "references/supported-clients.md",
    "references/gateway-tool-reference.md",
    "references/troubleshooting.md",
    "references/security-guide.md",
  ];

  const entries = [];
  for (const relPath of staticFiles) {
    const srcPath = path.join(rootDir, relPath);
    if (!fs.existsSync(srcPath)) {
      throw new Error(`Required skill package file missing: ${srcPath}`);
    }
    const content = fs.readFileSync(srcPath);
    const destPath = path.join(stageDir, relPath);
    writeFileAtomic(destPath, content, null);
    entries.push({ name: relPath.replace(/\\/g, "/"), data: content });
  }

  // Write skill-specific README.md
  const readmeBuf = Buffer.from(SKILL_README, "utf8");
  writeFileAtomic(path.join(stageDir, "README.md"), readmeBuf, null);
  entries.splice(1, 0, { name: "README.md", data: readmeBuf });

  // Build pure-Node ZIP with SKILL.md at root and POSIX '/' paths
  const zipBuffer = createZipBuffer(entries);
  writeFileAtomic(zipPath, zipBuffer, null);

  // Automatic self-verification
  const verifiedEntries = readZipEntries(zipPath);
  const entryNames = verifiedEntries.map((e) => e.name);

  if (!entryNames.includes("SKILL.md")) {
    throw new Error("Package verification failed: SKILL.md is missing at ZIP root.");
  }
  if (entryNames.some((n) => n.includes("\\"))) {
    throw new Error("Package verification failed: ZIP contains Windows backslash paths.");
  }
  const forbidden = entryNames.filter(
    (n) =>
      n.includes(".env") ||
      n.endsWith("config.json") ||
      n.endsWith("tools-cache.json") ||
      n.includes("node_modules") ||
      n.endsWith(".js") ||
      n.endsWith(".log")
  );
  if (forbidden.length > 0) {
    throw new Error(`Package verification failed: forbidden files included: ${forbidden.join(", ")}`);
  }

  return {
    stageDir,
    zipPath,
    sizeBytes: fs.statSync(zipPath).size,
    entries: entryNames,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = buildAgensiPackage();
    console.log("=== Agensi Skill Package Built & Verified ===");
    console.log(`ZIP Path   : ${result.zipPath}`);
    console.log(`Stage Dir  : ${result.stageDir}`);
    console.log(`ZIP Size   : ${(result.sizeBytes / 1024).toFixed(1)} KB`);
    console.log("Entries    :");
    for (const entry of result.entries) {
      console.log(`  - ${entry}`);
    }
    console.log("[PASS] Root SKILL.md verified, POSIX '/' paths verified, zero secrets/source leaked.");
  } catch (err) {
    console.error(`[FAIL] ${err.message}`);
    process.exit(1);
  }
}
