import { Command } from 'commander';
import { loadConfig, readJsonSync } from '@jetic/core';
import { BehavioralModel, Environment } from '@jetic/model';
import { EndpointSimulator, SimulationResult } from '@jetic/simulator';
import * as path from 'path';
import * as readline from 'readline';
import { simulateWorkflowCommand } from './simulate-workflow';

// ─── ANSI Helpers ─────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgCyan: '\x1b[46m',
  black: '\x1b[30m',
};

const TICK = `${c.green}✓${c.reset}`;
const CROSS = `${c.red}✗${c.reset}`;
const SKIP = `${c.yellow}⊘${c.reset}`;
const SEPARATOR = `${c.dim}──────────────────────────────────────────────────${c.reset}`;

// ─── Spinner ──────────────────────────────────────────────────────────────────

class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private idx = 0;
  private interval: NodeJS.Timeout | null = null;
  private message: string = '';

  start(message: string) {
    this.message = message;
    this.idx = 0;
    this.interval = setInterval(() => {
      const frame = this.frames[this.idx % this.frames.length];
      process.stdout.write(`\r  ${c.cyan}${frame}${c.reset} ${this.message}`);
      this.idx++;
    }, 80);
  }

  update(message: string) {
    this.message = message;
  }

  stop(finalMessage?: string) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (finalMessage) {
      process.stdout.write(`\r${finalMessage}\x1b[K\n`);
    } else {
      process.stdout.write(`\r\x1b[K`);
    }
  }
}

// ─── Interactive Environment Selector ─────────────────────────────────────────

async function selectEnvironment(environments: Environment[]): Promise<Environment> {
  if (environments.length === 0) {
    console.log(`  ${c.yellow}⚠${c.reset}  No environments defined in model.json`);
    console.log(`  ${c.dim}Using default: http://localhost:3000${c.reset}\n`);
    return { name: 'default', baseUrl: 'http://localhost:3000' };
  }

  if (environments.length === 1) {
    const env = environments[0];
    console.log(`  ${c.cyan}🌍${c.reset} Environment: ${c.bold}${env.name}${c.reset} ${c.dim}→ ${env.baseUrl}${c.reset}\n`);
    return env;
  }

  return new Promise<Environment>((resolve) => {
    let selectedIndex = 0;

    const renderOptions = () => {
      // Move cursor up to overwrite previous render
      if (selectedIndex >= 0) {
        process.stdout.write(`\x1b[${environments.length}A`);
      }

      for (let i = 0; i < environments.length; i++) {
        const env = environments[i];
        const isSelected = i === selectedIndex;
        const radio = isSelected ? `${c.cyan}◉${c.reset}` : `${c.dim}○${c.reset}`;
        const name = isSelected ? `${c.bold}${c.cyan}${env.name}${c.reset}` : `${c.dim}${env.name}${c.reset}`;
        const url = `${c.dim}→ ${env.baseUrl}${c.reset}`;
        process.stdout.write(`\r     ${radio} ${name.padEnd(isSelected ? 30 : 20)} ${url}\x1b[K\n`);
      }
    };

    console.log(`\n  ${c.cyan}🌍${c.reset} Select environment:\n`);

    // Initial render
    for (let i = 0; i < environments.length; i++) {
      const env = environments[i];
      const isSelected = i === selectedIndex;
      const radio = isSelected ? `${c.cyan}◉${c.reset}` : `${c.dim}○${c.reset}`;
      const name = isSelected ? `${c.bold}${c.cyan}${env.name}${c.reset}` : `${c.dim}${env.name}${c.reset}`;
      const url = `${c.dim}→ ${env.baseUrl}${c.reset}`;
      console.log(`     ${radio} ${name.padEnd(isSelected ? 30 : 20)} ${url}`);
    }

    console.log(`\n  ${c.dim}Press ↑/↓ to navigate, Enter to select${c.reset}`);

    // Enable raw mode for key capture
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onKeyPress = (key: string) => {
      // Ctrl+C
      if (key === '\u0003') {
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onKeyPress);
        process.exit(0);
      }

      // Arrow keys are escape sequences
      if (key === '\u001b[A') {
        // Up arrow
        selectedIndex = Math.max(0, selectedIndex - 1);
        // Move back up past the hint line and options
        process.stdout.write(`\x1b[${environments.length + 2}A`);
        // Re-render
        for (let i = 0; i < environments.length; i++) {
          const env = environments[i];
          const isSelected = i === selectedIndex;
          const radio = isSelected ? `${c.cyan}◉${c.reset}` : `${c.dim}○${c.reset}`;
          const name = isSelected ? `${c.bold}${c.cyan}${env.name}${c.reset}` : `${c.dim}${env.name}${c.reset}`;
          const url = `${c.dim}→ ${env.baseUrl}${c.reset}`;
          process.stdout.write(`     ${radio} ${name}  ${url}\x1b[K\n`);
        }
        process.stdout.write(`\n  ${c.dim}Press ↑/↓ to navigate, Enter to select${c.reset}\n`);
      } else if (key === '\u001b[B') {
        // Down arrow
        selectedIndex = Math.min(environments.length - 1, selectedIndex + 1);
        process.stdout.write(`\x1b[${environments.length + 2}A`);
        for (let i = 0; i < environments.length; i++) {
          const env = environments[i];
          const isSelected = i === selectedIndex;
          const radio = isSelected ? `${c.cyan}◉${c.reset}` : `${c.dim}○${c.reset}`;
          const name = isSelected ? `${c.bold}${c.cyan}${env.name}${c.reset}` : `${c.dim}${env.name}${c.reset}`;
          const url = `${c.dim}→ ${env.baseUrl}${c.reset}`;
          process.stdout.write(`     ${radio} ${name}  ${url}\x1b[K\n`);
        }
        process.stdout.write(`\n  ${c.dim}Press ↑/↓ to navigate, Enter to select${c.reset}\n`);
      } else if (key === '\r' || key === '\n') {
        // Enter
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.removeListener('data', onKeyPress);
        process.stdin.pause();

        const selected = environments[selectedIndex];
        // Clear the hint line and show selection
        process.stdout.write(`\r\x1b[K`);
        console.log(`\n  ${c.green}✓${c.reset} Selected: ${c.bold}${selected.name}${c.reset} ${c.dim}→ ${selected.baseUrl}${c.reset}\n`);
        resolve(selected);
      }
    };

    process.stdin.on('data', onKeyPress);
  });
}

// ─── Result Rendering ─────────────────────────────────────────────────────────

function renderSingleResult(result: SimulationResult, verbose: boolean = true): void {
  const methodColor = getMethodColor(result.method);
  const methodStr = `${methodColor}${result.method.padEnd(6)}${c.reset}`;

  if (result.skipped) {
    console.log(`  ${SKIP} ${methodStr} ${result.path} ${c.dim}(skipped: ${result.skipReason})${c.reset}`);
    return;
  }

  if (result.error) {
    console.log(`  ${CROSS} ${methodStr} ${result.path} ${c.red}ERROR${c.reset}`);
    console.log(`  ${c.dim}  └─ ${result.error}${c.reset}`);
    return;
  }

  const statusStr = formatStatus(result.responseStatus);
  const timeStr = `${c.dim}${result.responseTimeMs}ms${c.reset}`;

  if (!verbose) {
    const icon = result.passed ? TICK : CROSS;
    console.log(`  ${icon} ${methodStr} ${result.path.padEnd(25)} ${statusStr}  ${timeStr}`);
    return;
  }

  // ── Verbose single-endpoint output ──────────────────────────────────────
  console.log(`  ${c.cyan}📡${c.reset} ${c.bold}${result.method} ${result.path}${c.reset}`);

  // Request body
  if (result.requestBody && Object.keys(result.requestBody).length > 0) {
    console.log(`  ${c.dim}├─${c.reset} ${c.dim}Generating request data...${c.reset}`);
    const bodyStr = JSON.stringify(result.requestBody, null, 2);
    const lines = bodyStr.split('\n');
    for (const line of lines) {
      console.log(`  ${c.dim}│${c.reset}   ${c.yellow}${line}${c.reset}`);
    }
  }

  // Headers
  const headerKeys = Object.keys(result.requestHeaders);
  if (headerKeys.length > 0) {
    const headerStr = headerKeys.map((k) => {
      let val = result.requestHeaders[k];
      // Truncate long values (like auth tokens)
      if (val.length > 40) val = val.substring(0, 37) + '...';
      return `${k}: ${val}`;
    }).join(', ');
    console.log(`  ${c.dim}├─${c.reset} Headers: ${c.dim}${headerStr}${c.reset}`);
  }

  // Response status
  console.log(`  ${c.dim}├─${c.reset} Response: ${statusStr} ${c.dim}(${result.responseTimeMs}ms)${c.reset}`);

  // ── Response Body ───────────────────────────────────────────────────────
  console.log(`  ${c.dim}├─${c.reset} ${c.bold}Response Body:${c.reset}`);
  if (result.responseBody !== null && result.responseBody !== undefined) {
    const bodyStr = typeof result.responseBody === 'string'
      ? result.responseBody
      : JSON.stringify(result.responseBody, null, 2);
    const bodyLines = bodyStr.split('\n');
    for (const line of bodyLines) {
      console.log(`  ${c.dim}│${c.reset}   ${c.cyan}${line}${c.reset}`);
    }
  } else {
    console.log(`  ${c.dim}│${c.reset}   ${c.dim}(empty response)${c.reset}`);
  }

  // ── Schema Validation ──────────────────────────────────────────────────
  if (result.validation.fieldValidations.length > 0) {
    console.log(`  ${c.dim}├─${c.reset} ${c.bold}Schema Validation:${c.reset} ${c.dim}(${result.validation.passedFields}/${result.validation.totalFields} fields match)${c.reset}`);

    for (const field of result.validation.fieldValidations) {
      if (field.passed) {
        // Field matches
        const valuePreview = formatValuePreview(field.actualValue);
        const resolvedHint = field.resolvedPath
          ? ` ${c.dim}(resolved via ${c.italic}${field.resolvedPath}${c.reset}${c.dim})${c.reset}`
          : '';
        console.log(`  ${c.dim}│${c.reset}   ${TICK} ${c.bold}${field.field}${c.reset}${resolvedHint}`);
        console.log(`  ${c.dim}│${c.reset}       ${c.dim}Type:${c.reset}  ${c.green}${field.actualType}${c.reset} ${c.dim}(expected ${field.expectedType})${c.reset}`);
        console.log(`  ${c.dim}│${c.reset}       ${c.dim}Value:${c.reset} ${c.cyan}${valuePreview}${c.reset}`);
      } else {
        // Field does NOT match
        const valuePreview = formatValuePreview(field.actualValue);
        console.log(`  ${c.dim}│${c.reset}   ${CROSS} ${c.bold}${c.red}${field.field}${c.reset} ${c.red}← MISMATCH${c.reset}`);
        console.log(`  ${c.dim}│${c.reset}       ${c.dim}Expected type:${c.reset} ${c.green}${field.expectedType}${c.reset}`);
        console.log(`  ${c.dim}│${c.reset}       ${c.dim}Actual type:${c.reset}   ${c.red}${field.actualType}${c.reset}`);
        console.log(`  ${c.dim}│${c.reset}       ${c.dim}Actual value:${c.reset}  ${c.red}${valuePreview}${c.reset}`);
        if (field.actualType === 'undefined') {
          console.log(`  ${c.dim}│${c.reset}       ${c.yellow}⚠ Field is missing from the response${c.reset}`);
        } else if (field.actualType === 'null') {
          console.log(`  ${c.dim}│${c.reset}       ${c.yellow}⚠ Field is null, expected ${field.expectedType}${c.reset}`);
        }
      }
    }
  } else {
    console.log(`  ${c.dim}├─${c.reset} ${c.dim}Schema Validation: no schema defined in model for this response${c.reset}`);
  }

  // ── Final Verdict ──────────────────────────────────────────────────────
  const verdictIcon = result.passed ? TICK : CROSS;
  const verdictText = result.passed
    ? `${c.green}${c.bold}PASSED${c.reset}`
    : `${c.red}${c.bold}FAILED${c.reset}`;

  const reasons: string[] = [];
  // if (!result.validation.statusPassed) {
//  reasons.push(`status ${result.responseStatus} ≠ ${result.validation.expectedStatus}`);
  //}
  if (result.validation.failedFields > 0) {
    reasons.push(`${result.validation.failedFields} field(s) mismatched`);
  }

  const reasonStr = reasons.length > 0
    ? ` ${c.dim}(${reasons.join(', ')})${c.reset}`
    : '';
  const fieldSummary = result.validation.totalFields > 0
    ? ` ${c.dim}• ${result.validation.passedFields}/${result.validation.totalFields} fields${c.reset}`
    : '';
  console.log(`  ${c.dim}└─${c.reset} ${verdictIcon} ${verdictText}${fieldSummary}${reasonStr}`);
  console.log('');
}

/**
 * Format a value for display preview — truncate long strings/objects.
 */
function formatValuePreview(value: any): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value.length > 60 ? `"${value.substring(0, 57)}..."` : `"${value}"`;
  }
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > 80 ? str.substring(0, 77) + '...' : str;
  }
  return String(value);
}


function renderSummary(summary: {
  passed: number;
  failed: number;
  skipped: number;
  totalTimeMs: number;
  results: SimulationResult[];
}): void {
  console.log('');
 // console.log(SEPARATOR);

  const elapsed = (summary.totalTimeMs / 1000).toFixed(1);
  const allPassed = summary.failed === 0;
  const icon = allPassed ? `${c.green}✅${c.reset}` : `${c.red}❌${c.reset}`;
  const label = allPassed ? `${c.green}Simulation Complete!${c.reset}` : `${c.red}Simulation Complete (with failures)${c.reset}`;

  console.log(`  ${icon} ${c.bold}${label}${c.reset} ${c.dim}(${elapsed}s)${c.reset}`);
  console.log('');

  // Individual results (compact)
  for (const result of summary.results) {
    renderSingleResult(result, false);
  }

  console.log('');
 // console.log(SEPARATOR);

  const parts: string[] = [];
  if (summary.passed > 0) parts.push(`${c.green}${summary.passed} passed${c.reset}`);
  if (summary.failed > 0) parts.push(`${c.red}${summary.failed} failed${c.reset}`);
  if (summary.skipped > 0) parts.push(`${c.yellow}${summary.skipped} skipped${c.reset}`);

  console.log(`  ${parts.join(`  ${c.dim}│${c.reset}  `)}`);
 // console.log(SEPARATOR);
  console.log('');
}

function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return c.green;
    case 'POST': return c.yellow;
    case 'PUT': return c.cyan;
    case 'PATCH': return c.magenta;
    case 'DELETE': return c.red;
    default: return c.white;
  }
}

function formatStatus(status: number): string {
  if (status >= 200 && status < 300) return `${c.green}${status}${c.reset}`;
  if (status >= 300 && status < 400) return `${c.yellow}${status}${c.reset}`;
  if (status >= 400 && status < 500) return `${c.red}${status}${c.reset}`;
  if (status >= 500) return `${c.bgRed}${c.white} ${status} ${c.reset}`;
  return `${c.dim}${status}${c.reset}`;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function buildProgressBar(current: number, total: number): string {
  const width = 24;
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `${c.magenta}${'━'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
}

// ─── Load Model ───────────────────────────────────────────────────────────────

function loadModel(): BehavioralModel | null {
  const config = loadConfig();
  const modelPath = path.join(config.jeticDir, 'model.json');
  return readJsonSync<BehavioralModel>(modelPath);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export const simulateCommand = new Command('simulate')
  .description('Simulate API endpoints against a live server');

simulateCommand.addCommand(simulateWorkflowCommand);

simulateCommand
  .command('endpoint [method] [endpointPath]')
  .description('Simulate a specific endpoint or all endpoints')
  .option('--all', 'Simulate all endpoints')
  .option('--verbose', 'Show detailed request/response info', false)
  .action(async (method: string | undefined, endpointPath: string | undefined, options: { all?: boolean; verbose?: boolean }) => {
    // Banner
    console.log('');
    console.log(`  ${c.bgCyan}${c.black}${c.bold} JETIC ${c.reset}  ${c.cyan}${c.bold}Endpoint Simulator${c.reset}`);
   // console.log(`  ${SEPARATOR}`);
    console.log('');

    // Load model
    const model = loadModel();
    if (!model) {
      console.log(`  ${c.red}✗${c.reset} No behavioral model found.`);
      console.log(`  ${c.dim}Run \`jetic scan\` first to generate the model.${c.reset}\n`);
      process.exit(1);
    }

    console.log(`  ${c.dim}Model v${model.version} • ${model.endpoints.length} endpoints${c.reset}\n`);

    // Environment selection
    const environments = model.environments || [];
    const selectedEnv = await selectEnvironment(environments);

    // ── Check Backend Health ───────────────────────────────────────────
    const checkSpinner = new Spinner();
    checkSpinner.start(`Checking if backend is active at ${selectedEnv.baseUrl}...`);
    try {
      await fetch(selectedEnv.baseUrl);
      checkSpinner.stop(`  ${c.green}✓${c.reset} Backend is active`);
      console.log('');
    } catch (e) {
      checkSpinner.stop();
      console.log(`  ${c.red}✗${c.reset} Backend is unreachable at ${c.bold}${selectedEnv.baseUrl}${c.reset}`);
      console.log(`  ${c.yellow}⚠${c.reset} Please run/initialize your backend project and try again.\n`);
      process.exit(1);
    }

    // Create simulator
    const simulator = new EndpointSimulator(model, selectedEnv);
    const spinner = new Spinner();

    if (options.all) {
      // ── Simulate ALL endpoints ──────────────────────────────────────
      console.log(`  ${c.magenta}🚀${c.reset} Simulating ${c.bold}${model.endpoints.length}${c.reset} endpoints...\n`);

      const results: SimulationResult[] = [];
      const startTime = Date.now();

      for (let i = 0; i < model.endpoints.length; i++) {
        const ep = model.endpoints[i];
        const label = `${ep.method} ${ep.path}`;
        const progress = buildProgressBar(i, model.endpoints.length);

        spinner.start(`${progress} ${c.dim}${i + 1}/${model.endpoints.length}${c.reset}  ${c.dim}⏳ ${label}${c.reset}`);

        const result = await simulator.simulateEndpoint(ep);
        results.push(result);

        const icon = result.skipped ? SKIP : (result.passed ? TICK : CROSS);
        const statusStr = result.skipped
          ? `${c.dim}skipped${c.reset}`
          : formatStatus(result.responseStatus);
        const timeStr = result.skipped ? '' : `${c.dim}${result.responseTimeMs}ms${c.reset}`;

        spinner.stop(`  ${buildProgressBar(i + 1, model.endpoints.length)} ${c.dim}${i + 1}/${model.endpoints.length}${c.reset}  ${icon} ${label}  ${statusStr}  ${timeStr}`);
      }

      const totalTimeMs = Date.now() - startTime;

      renderSummary({
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed && !r.skipped).length,
        skipped: results.filter((r) => r.skipped).length,
        totalTimeMs,
        results,
      });

    } else if (method && endpointPath) {
      // ── Simulate SINGLE endpoint ────────────────────────────────────
      const ep = model.endpoints.find(
        (e) => e.method.toUpperCase() === method.toUpperCase() && e.path === endpointPath
      );

      if (!ep) {
        console.log(`  ${c.red}✗${c.reset} Endpoint ${c.bold}${method.toUpperCase()} ${endpointPath}${c.reset} not found in model.\n`);
        console.log(`  ${c.dim}Available endpoints:${c.reset}`);
        for (const e of model.endpoints) {
          console.log(`    ${c.dim}•${c.reset} ${getMethodColor(e.method)}${e.method}${c.reset} ${e.path}`);
        }
        console.log('');
        process.exit(1);
      }

      spinner.start(`Simulating ${c.bold}${ep.method} ${ep.path}${c.reset}...`);

      const result = await simulator.simulateEndpoint(ep);

      spinner.stop();
      console.log('');
      renderSingleResult(result, true);

    } else {
      console.log(`  ${c.red}✗${c.reset} Please specify an endpoint or use ${c.bold}--all${c.reset}\n`);
      console.log(`  ${c.dim}Usage:${c.reset}`);
      console.log(`    ${c.cyan}jetic simulate endpoint POST /register${c.reset}`);
      console.log(`    ${c.cyan}jetic simulate endpoint --all${c.reset}`);
      console.log('');
      process.exit(1);
    }
  });
