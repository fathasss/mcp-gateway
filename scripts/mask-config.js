#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPathWithinAllowedDirs,
  backupFile,
  redactConfigObject,
  redactSecretsFromText,
  writeFileAtomic,
} from "../src/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

export function maskConfigFile(options = {}) {
  const baseDir = options.baseDir ? path.resolve(options.baseDir) : rootDir;
  const inputPath = assertPathWithinAllowedDirs(
    options.inputPath || path.join(baseDir, "config.json"),
    [baseDir]
  );
  const outputPath = assertPathWithinAllowedDirs(
    options.outputPath || path.join(baseDir, "config.example.json"),
    [baseDir]
  );

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input configuration file not found: ${inputPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const masked = redactConfigObject(raw);

  if (options.backup !== false && fs.existsSync(outputPath)) {
    backupFile(outputPath);
  }

  writeFileAtomic(outputPath, JSON.stringify(masked, null, 2) + "\n", "utf8");
  return { inputPath, outputPath, masked };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const inputIdx = args.indexOf("--input");
    const outputIdx = args.indexOf("--output");
    const result = maskConfigFile({
      inputPath: inputIdx !== -1 ? args[inputIdx + 1] : undefined,
      outputPath: outputIdx !== -1 ? args[outputIdx + 1] : undefined,
    });
    console.log(`[Success] Masked example configuration written atomically: ${result.outputPath}`);
  } catch (err) {
    console.error(`[Error] ${redactSecretsFromText(err.message)}`);
    process.exit(1);
  }
}
