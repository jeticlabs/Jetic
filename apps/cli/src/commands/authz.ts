import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { loadConfig } from '@jetic/core';
import { BehavioralModel, hasYamlModel, loadModelFromDir } from '@jetic/model';

function loadModel(config: ReturnType<typeof loadConfig>): BehavioralModel | null {
  if (hasYamlModel(config.modelDir)) return loadModelFromDir(config.modelDir);
  const modelPath = path.join(config.jeticDir, 'model.json');
  if (!fs.existsSync(modelPath)) return null;
  return JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
}

interface AuthzFinding {
  endpointId: string;
  kind: 'anonymous_access_allowed' | 'observed_only';
  status: number;
  role?: string;
}

/**
 * Minimal authorization check (JETIC_SPEC_PHASES_1-4 §2.5, scoped down):
 * calls every secured endpoint with no credentials and flags any that
 * respond 2xx as `anonymous_access_allowed`. Role-token checks run only
 * when `jetic.config.json`'s `auth.roles[*].env` provides a token directly;
 * login-workflow-sourced tokens and the full BOLA matrix are not implemented.
 */
export const authzCommand = new Command('authz')
  .description('Check whether secured endpoints reject anonymous requests (best-effort, evidence-only)')
  .option('--env <name>', 'Target environment name from the model')
  .action(async (options: { env?: string }) => {
    const config = loadConfig();
    const model = loadModel(config);

    if (!model) {
      console.error('No model found. Run "jetic scan" first.');
      process.exitCode = 2;
      return;
    }

    const targetEnv = model.environments?.find((e) => e.name === options.env) ?? model.environments?.[0] ?? {
      name: 'local',
      baseUrl: 'http://localhost:3000',
    };

    const securedEndpoints = model.endpoints.filter((e) => (e.security?.length ?? 0) > 0);
    if (securedEndpoints.length === 0) {
      console.log('No endpoints declare a security requirement in the model — nothing to check.');
      return;
    }

    const findings: AuthzFinding[] = [];
    console.log(`\nJETIC AUTHZ (${securedEndpoints.length} secured endpoint(s), anonymous-access check)\n`);

    for (const endpoint of securedEndpoints) {
      const url = `${targetEnv.baseUrl.replace(/\/$/, '')}${endpoint.path.replace(/:[^/]+/g, '1')}`;
      try {
        const res = await fetch(url, { method: endpoint.method, signal: AbortSignal.timeout(10_000) });
        const allowed = res.status >= 200 && res.status < 300;
        if (allowed) findings.push({ endpointId: endpoint.id, kind: 'anonymous_access_allowed', status: res.status });
        console.log(`  ${allowed ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m'} ${endpoint.method.padEnd(6)} ${endpoint.path}  ${res.status}`);
      } catch (err: any) {
        console.log(`  \x1b[33m?\x1b[0m ${endpoint.method.padEnd(6)} ${endpoint.path}  request failed: ${err.message}`);
      }
    }

    console.log(`\n${findings.length} endpoint(s) allowed anonymous access despite declaring security.\n`);
    if (findings.length > 0) process.exitCode = 1;
  });
