import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

function collectJsFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(full, result);
    } else if (entry.name.endsWith(".js")) {
      result.push(full);
    }
  }
  return result;
}

test("all JavaScript files pass node --check syntax validation", () => {
  const files = collectJsFiles(rootDir);
  assert.ok(files.length >= 10, "Expected at least 10 JS files in project");
  for (const file of files) {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  }
});

