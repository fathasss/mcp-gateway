import fs from "node:fs";
import path from "node:path";

const NON_SECRET_KEY_EXCLUSIONS = /^(auth_?url|token_?url|token_?endpoint|auth_?mode|auth_?type|key_?name|shortcut_?key|hotkey|public_?key)$/i;

const SENSITIVE_KEY_REGEX = /(api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|private[-_]?key|secret[-_]?key|webhook[-_]?secret|signing[-_]?secret|session[-_]?key|auth[-_]?token|personal[-_]?access[-_]?token|bearer|password|passwd|pwd|jwt|cookie|credential|authorization|x-api-key|x-auth-token)/i;

const SENSITIVE_SUFFIX_REGEX = /(secret|token|password|passwd|apikey|privatekey)$/i;

export function isSensitiveKey(keyName) {
  if (!keyName || typeof keyName !== "string") return false;
  const trimmed = keyName.trim();
  if (NON_SECRET_KEY_EXCLUSIONS.test(trimmed)) return false;
  if (trimmed.toLowerCase() === "auth" || trimmed.toLowerCase() === "key") return true;
  return SENSITIVE_KEY_REGEX.test(trimmed) || SENSITIVE_SUFFIX_REGEX.test(trimmed);
}

export function isPlaceholderValue(value) {
  if (typeof value !== "string") return false;
  return /\$\{[A-Za-z0-9_]+\}/.test(value);
}

export function maskHomePaths(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/([A-Za-z]:)[\\/]Users[\\/][^\\/\\s"']+[\\/]?/gi, (_, drive) => `${drive}/Users/USERNAME/`)
    .replace(/\/Users\/[^/\s"']+(\/)?/g, (_, slash) => `/Users/USERNAME${slash || ""}`)
    .replace(/\/home\/[^/\s"']+(\/)?/g, (_, slash) => `/home/USERNAME${slash || ""}`);
}

export function maskInlineSecretInString(str) {
  if (typeof str !== "string") return str;
  let masked = maskHomePaths(str);

  // Mask --flag=secret or --flag secret style values when not already placeholder
  masked = masked.replace(
    /(--?(?:api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|private[-_]?key|token|secret|password|passwd|auth)=)(?!\$\{)([^\s"']+)/gi,
    "$1${REDACTED}"
  );

  // Mask Bearer <token>
  masked = masked.replace(/\b(Bearer\s+)(?!\$\{)([A-Za-z0-9._\-+/=]+)/gi, "$1${REDACTED}");

  // Mask basic auth credentials in URLs: https://user:pass@host
  masked = masked.replace(/(https?:\/\/[^:/@\s]+:)(?!\$\{)([^@\s]+)@/gi, "$1${REDACTED}@");

  return masked;
}

function toPlaceholderName(keyName) {
  return String(keyName)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase() || "SECRET";
}

export function redactValueForKey(keyName, value) {
  if (typeof value !== "string") return value;
  if (value.length === 0 || isPlaceholderValue(value)) return value;

  const placeholder = toPlaceholderName(keyName === "Authorization" ? "AUTH_TOKEN" : keyName);
  const bearerMatch = value.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return `Bearer \${${placeholder}}`;
  }
  return `\${${placeholder}}`;
}

export function redactConfigObject(input, insideSensitiveKey = null) {
  if (Array.isArray(input)) {
    return input.map((item) => redactConfigObject(item, insideSensitiveKey));
  }

  if (input && typeof input === "object") {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      const sensitive = isSensitiveKey(k);
      if (typeof v === "string") {
        if (sensitive) {
          out[k] = redactValueForKey(k, v);
        } else {
          out[k] = maskInlineSecretInString(v);
        }
      } else if (Array.isArray(v) || (v && typeof v === "object")) {
        out[k] = redactConfigObject(v, sensitive ? k : insideSensitiveKey);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  if (typeof input === "string") {
    if (insideSensitiveKey) {
      return redactValueForKey(insideSensitiveKey, input);
    }
    return maskInlineSecretInString(input);
  }

  return input;
}

export function redactSecretsFromText(text, extraSecrets = []) {
  if (typeof text !== "string" || text.length === 0) return text;
  let safe = text;

  const candidates = new Set();
  for (const s of extraSecrets) {
    if (typeof s === "string" && s.length >= 6) candidates.add(s);
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (isSensitiveKey(k) && typeof v === "string" && v.length >= 6) {
      candidates.add(v);
    }
  }

  for (const secret of candidates) {
    if (safe.includes(secret)) {
      safe = safe.split(secret).join("[REDACTED]");
    }
  }

  // Also redact common token patterns if leaked in error strings
  safe = safe
    .replace(/\b(Bearer\s+)(?!\$\{)[A-Za-z0-9._\-+/=]{8,}/gi, "$1[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g, "[REDACTED_JWT]")
    .replace(/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{12,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(sk-[A-Za-z0-9_-]{16,})\b/g, "[REDACTED_KEY]");

  return safe;
}

export function assertPathWithinAllowedDirs(targetPath, allowedDirs) {
  if (!targetPath || typeof targetPath !== "string" || targetPath.includes("\0")) {
    throw new Error("Invalid file path.");
  }
  const resolvedTarget = path.resolve(targetPath);
  const normalizedTarget = process.platform === "win32" ? resolvedTarget.toLowerCase() : resolvedTarget;

  const isAllowed = allowedDirs.some((dir) => {
    const resolvedBase = path.resolve(dir);
    const normalizedBase = process.platform === "win32" ? resolvedBase.toLowerCase() : resolvedBase;
    if (normalizedTarget === normalizedBase) return true;
    const prefix = normalizedBase.endsWith(path.sep) ? normalizedBase : normalizedBase + path.sep;
    return normalizedTarget.startsWith(prefix);
  });

  if (!isAllowed) {
    throw new Error(`Path access denied outside allowed directories: ${resolvedTarget}`);
  }
  return resolvedTarget;
}

export function writeFileAtomic(targetPath, content, encoding = "utf8") {
  const resolved = path.resolve(targetPath);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${resolved}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2, 8)}`;
  try {
    fs.writeFileSync(tempPath, content, encoding);
    fs.renameSync(tempPath, resolved);
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }
}

export function backupFile(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) return null;
  const backupPath = `${resolved}.bak.${Date.now()}`;
  const data = fs.readFileSync(resolved);
  writeFileAtomic(backupPath, data, null);
  return backupPath;
}

export function restoreFile(backupPath, targetPath) {
  const resolvedBackup = path.resolve(backupPath);
  const resolvedTarget = path.resolve(targetPath);
  if (!fs.existsSync(resolvedBackup)) {
    throw new Error(`Backup file not found: ${resolvedBackup}`);
  }
  const data = fs.readFileSync(resolvedBackup);
  writeFileAtomic(resolvedTarget, data, null);
  return resolvedTarget;
}

