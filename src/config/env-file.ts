import fs from 'node:fs';
import path from 'node:path';

const ENV_KEY_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/;

interface ParsedEnvLine {
  raw: string;
  key?: string;
}

export interface LoadEnvFileOptions {
  filePath?: string;
  overrideExisting?: boolean;
}

export interface WriteEnvFileOptions {
  filePath?: string;
}

export function getEnvFilePath(): string {
  return path.resolve(process.cwd(), '.env');
}

export function loadEnvFile(options: LoadEnvFileOptions = {}): Record<string, string> {
  const filePath = options.filePath ?? getEnvFilePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed = parseEnvContent(fs.readFileSync(filePath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (options.overrideExisting || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return parsed;
}

export function writeEnvFile(
  updates: Record<string, string>,
  options: WriteEnvFileOptions = {},
): void {
  const filePath = options.filePath ?? getEnvFilePath();
  const existingLines = readEnvLines(filePath);
  const remaining = new Map(Object.entries(updates));
  const outputLines = existingLines.map(line => {
    if (!line.key || !remaining.has(line.key)) {
      return line.raw;
    }

    const value = remaining.get(line.key)!;
    remaining.delete(line.key);
    return `${line.key}=${serializeEnvValue(value)}`;
  });

  for (const [key, value] of remaining) {
    outputLines.push(`${key}=${serializeEnvValue(value)}`);
  }

  fs.writeFileSync(filePath, `${outputLines.join('\n')}\n`, 'utf8');
}

export function parseEnvContent(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(ENV_KEY_RE);
    if (!match) {
      continue;
    }

    parsed[match[1]] = parseEnvValue(match[2]);
  }

  return parsed;
}

function readEnvLines(filePath: string): ParsedEnvLine[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(raw => {
      const match = raw.match(ENV_KEY_RE);
      return {
        raw,
        key: match?.[1],
      };
    });
}

function parseEnvValue(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"');
  }

  if (trimmed.startsWith('\'') && trimmed.endsWith('\'')) {
    return trimmed.slice(1, -1);
  }

  const commentIndex = trimmed.indexOf(' #');
  return (commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex)).trim();
}

function serializeEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }

  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"')}"`;
}
