import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertPathWithinAllowedDirs,
  backupFile,
  isSensitiveKey,
  maskHomePaths,
  redactConfigObject,
  redactSecretsFromText,
  restoreFile,
  writeFileAtomic,
} from "../src/security.js";
import { maskConfigFile } from "../scripts/mask-config.js";

test("isSensitiveKey matches case-insensitive secret field variations and preserves safe keys", () => {
  const sensitiveKeys = [
    "apiKey",
    "API_KEY",
    "access_token",
    "accessToken",
    "refresh_token",
    "GITHUB_PERSONAL_ACCESS_TOKEN",
    "password",
    "PASSWORD",
    "clientSecret",
    "client_secret",
    "privateKey",
    "private_key",
    "Authorization",
    "x-api-key",
  ];
  for (const key of sensitiveKeys) {
    assert.equal(isSensitiveKey(key), true, `Expected ${key} to be detected as sensitive`);
  }

  const safeKeys = ["id", "name", "transport", "url", "command", "description", "enabled", "authUrl", "tokenEndpoint"];
  for (const key of safeKeys) {
    assert.equal(isSensitiveKey(key), false, `Expected ${key} to be non-sensitive`);
  }
});

test("redactConfigObject masks top-level, nested objects, arrays, and preserves non-sensitive fields", () => {
  const mockFixture = {
    version: "1.0.0",
    servers: {
      demo: {
        id: "demo",
        transport: "stdio",
        command: "C:\\Users\\alice\\tools\\demo.exe",
        args: ["--config", "/Users/alice/cfg.json", "--api-key=MOCK_INLINE_SECRET_999"],
        env: {
          apiKey: "MOCK_API_KEY_VALUE",
          access_token: "MOCK_ACCESS_TOKEN_VALUE",
          GITHUB_PERSONAL_ACCESS_TOKEN: "MOCK_GH_TOKEN_VALUE",
          password: "MOCK_PASSWORD_VALUE",
          clientSecret: "MOCK_CLIENT_SECRET_VALUE",
          PUBLIC_REGION: "eu-west-1",
          ALREADY_MASKED: "${EXISTING_PLACEHOLDER}",
        },
        nested: {
          authList: [
            { privateKey: "MOCK_PRIVATE_KEY_VALUE", label: "primary" },
            { refresh_token: "MOCK_REFRESH_TOKEN_VALUE", active: true },
          ],
        },
      },
      remote: {
        id: "remote",
        transport: "http",
        url: "https://user:MOCK_URL_PASS@api.example.com/mcp",
        headers: {
          Authorization: "Bearer MOCK_BEARER_VALUE",
          "X-Custom-Header": "plain-header-value",
        },
      },
    },
  };

  const redacted = redactConfigObject(mockFixture);

  assert.equal(redacted.servers.demo.id, "demo");
  assert.equal(redacted.servers.demo.env.PUBLIC_REGION, "eu-west-1");
  assert.equal(redacted.servers.demo.env.ALREADY_MASKED, "${EXISTING_PLACEHOLDER}");
  assert.equal(redacted.servers.demo.env.apiKey, "${API_KEY}");
  assert.equal(redacted.servers.demo.env.access_token, "${ACCESS_TOKEN}");
  assert.equal(redacted.servers.demo.env.GITHUB_PERSONAL_ACCESS_TOKEN, "${GITHUB_PERSONAL_ACCESS_TOKEN}");
  assert.equal(redacted.servers.demo.env.password, "${PASSWORD}");
  assert.equal(redacted.servers.demo.env.clientSecret, "${CLIENT_SECRET}");

  assert.equal(redacted.servers.demo.nested.authList[0].privateKey, "${PRIVATE_KEY}");
  assert.equal(redacted.servers.demo.nested.authList[0].label, "primary");
  assert.equal(redacted.servers.demo.nested.authList[1].refresh_token, "${REFRESH_TOKEN}");
  assert.equal(redacted.servers.demo.nested.authList[1].active, true);

  assert.equal(redacted.servers.remote.headers.Authorization, "Bearer ${AUTH_TOKEN}");
  assert.equal(redacted.servers.remote.headers["X-Custom-Header"], "plain-header-value");
  assert.ok(!JSON.stringify(redacted).includes("MOCK_"));
});

test("maskHomePaths handles Windows, macOS, and Linux home directories", () => {
  assert.equal(maskHomePaths("C:\\Users\\bob\\app\\index.js"), "C:/Users/USERNAME/app\\index.js");
  assert.equal(maskHomePaths("/Users/bob/projects/mcp"), "/Users/USERNAME/projects/mcp");
  assert.equal(maskHomePaths("/home/bob/workspace/mcp"), "/home/USERNAME/workspace/mcp");
});

test("redactSecretsFromText strips known secrets and bearer tokens from error strings", () => {
  const errText = "Connection failed with Bearer MOCK_SUPER_SECRET_TOKEN_98765 and secret MOCK_KNOWN_VAL";
  const safe = redactSecretsFromText(errText, ["MOCK_KNOWN_VAL"]);
  assert.ok(!safe.includes("MOCK_SUPER_SECRET_TOKEN_98765"));
  assert.ok(!safe.includes("MOCK_KNOWN_VAL"));
  assert.ok(safe.includes("[REDACTED]"));
});

test("assertPathWithinAllowedDirs blocks path traversal outside allowed directories", () => {
  const base = path.join(os.tmpdir(), "mcp-gw-sec-base");
  const valid = assertPathWithinAllowedDirs(path.join(base, "config.json"), [base]);
  assert.equal(valid, path.resolve(path.join(base, "config.json")));

  assert.throws(() => {
    assertPathWithinAllowedDirs(path.join(base, "..", "outside.json"), [base]);
  }, /Path access denied/);
});

test("maskConfigFile masks secrets atomically, backs up existing example, and preserves original config", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-gw-mask-"));
  try {
    const configPath = path.join(tmpDir, "config.json");
    const examplePath = path.join(tmpDir, "config.example.json");

    const originalConfig = {
      version: "1.0.0",
      servers: {
        svc: {
          id: "svc",
          transport: "stdio",
          command: "/home/devuser/bin/server",
          args: [],
          env: {
            apiKey: "MOCK_SECRET_KEY_12345",
            NORMAL_FLAG: "true",
          },
        },
      },
    };
    writeFileAtomic(configPath, JSON.stringify(originalConfig, null, 2), "utf8");
    writeFileAtomic(examplePath, JSON.stringify({ old: true }), "utf8");

    const { outputPath } = maskConfigFile({ baseDir: tmpDir });
    const maskedContent = fs.readFileSync(outputPath, "utf8");
    const parsedMasked = JSON.parse(maskedContent);

    assert.equal(parsedMasked.servers.svc.env.apiKey, "${API_KEY}");
    assert.equal(parsedMasked.servers.svc.env.NORMAL_FLAG, "true");
    assert.equal(parsedMasked.servers.svc.command, "/home/USERNAME/bin/server");
    assert.ok(!maskedContent.includes("MOCK_SECRET_KEY_12345"));

    // Original config.json remains untouched
    const currentOriginal = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(currentOriginal.servers.svc.env.apiKey, "MOCK_SECRET_KEY_12345");

    // Backup of previous config.example.json was created
    const backups = fs.readdirSync(tmpDir).filter((f) => f.startsWith("config.example.json.bak."));
    assert.equal(backups.length, 1);

    // Verify restoreFile works cleanly
    const targetRestore = path.join(tmpDir, "restore-target.json");
    const bak = backupFile(configPath);
    writeFileAtomic(targetRestore, "corrupted", "utf8");
    restoreFile(bak, targetRestore);
    assert.equal(JSON.parse(fs.readFileSync(targetRestore, "utf8")).servers.svc.env.apiKey, "MOCK_SECRET_KEY_12345");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

