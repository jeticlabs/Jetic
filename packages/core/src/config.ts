import * as path from 'path';
import { readJsonSync, writeJsonSync } from './filesystem';

export interface AiConfig {
  provider: string;
  model: string;
  apiKeyEnvVar: string;
}

export interface JeticConfig {
  projectRoot: string;
  jeticDir: string;
  ai?: AiConfig;
}

export function loadConfig(cwd: string = process.cwd()): JeticConfig {
  const jeticDir = path.join(cwd, '.jetic');
  const configPath = path.join(jeticDir, 'config.json');
  
  let userConfig = readJsonSync<{ ai?: AiConfig }>(configPath) || {};
  
  return {
    projectRoot: cwd,
    jeticDir,
    ai: userConfig.ai,
  };
}

export function saveConfig(config: JeticConfig) {
  const configPath = path.join(config.jeticDir, 'config.json');
  writeJsonSync(configPath, { ai: config.ai });
}
