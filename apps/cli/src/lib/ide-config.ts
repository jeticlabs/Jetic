import * as fs from 'fs';
import * as path from 'path';

const VSCODE_CONFIG_PATH = path.join('.vscode', 'mcp.json');

const JETIC_SERVER = {
  type: 'stdio',
  command: 'npx',
  args: ['-y', 'jetic-cli', 'mcp'],
  cwd: '${workspaceFolder}',
};

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function addVSCodeMcpServer(existingContent?: string): {
  content: string;
  changed: boolean;
} {
  let config: JsonObject = {};
  if (existingContent?.trim()) {
    const parsed: unknown = JSON.parse(existingContent);
    if (!isJsonObject(parsed)) {
      throw new Error('VS Code MCP configuration must contain a JSON object.');
    }
    config = parsed;
  }

  const existingServers = config.servers ?? {};
  if (!isJsonObject(existingServers)) {
    throw new Error('The "servers" property in VS Code MCP configuration must be an object.');
  }

  if ('jetic' in existingServers) {
    const current = existingServers.jetic;
    if (JSON.stringify(current) !== JSON.stringify(JETIC_SERVER)) {
      throw new Error(
        'A different "jetic" MCP server is already configured; leaving it unchanged.'
      );
    }
    return { content: existingContent ?? `${JSON.stringify(config, null, 2)}\n`, changed: false };
  }

  config.servers = { ...existingServers, jetic: JETIC_SERVER };
  return { content: `${JSON.stringify(config, null, 2)}\n`, changed: true };
}

export function configureVSCodeMcp(projectRoot: string, dryRun = false): {
  filePath: string;
  changed: boolean;
  dryRun: boolean;
} {
  const configPath = path.join(projectRoot, VSCODE_CONFIG_PATH);
  const existingContent = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, 'utf8')
    : undefined;
  const update = addVSCodeMcpServer(existingContent);

  if (update.changed && !dryRun) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const temporaryPath = `${configPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, update.content, { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(temporaryPath, configPath);
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      throw error;
    }
  }

  return {
    filePath: path.relative(projectRoot, configPath),
    changed: update.changed,
    dryRun,
  };
}

export function formatVSCodeMcpDiff(filePath: string): string {
  const addition = JSON.stringify({ jetic: JETIC_SERVER }, null, 2)
    .split('\n')
    .map((line) => `+ ${line}`)
    .join('\n');
  return `--- ${filePath}\n+++ ${filePath}\n${addition}`;
}