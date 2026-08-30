import { Command } from 'commander';
import { execSync, spawnSync } from 'child_process';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';

const PKG_NAME = 'jetic-cli';

function getInstalledVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    }
  } catch {}
  return '0.1.3';
}

async function fetchLatestVersion(pkgName: string, tag: string = 'latest'): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${pkgName}/${tag}`;
    const req = https.get(url, { headers: { 'User-Agent': 'jetic-cli-upgrade' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const json = JSON.parse(data);
            resolve(json.version ?? tag);
          } else {
            reject(new Error(`Registry responded with HTTP ${res.statusCode}`));
          }
        } catch (e: any) {
          reject(e);
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Connection timed out when checking npm registry'));
    });
  });
}

function detectPackageManager(): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  const userAgent = process.env.npm_config_user_agent || '';
  if (userAgent.includes('yarn')) return 'yarn';
  if (userAgent.includes('pnpm')) return 'pnpm';
  if (userAgent.includes('bun')) return 'bun';
  return 'npm';
}

function isInstalledGlobally(): boolean {
  try {
    const execPath = process.execPath.toLowerCase();
    const mainScript = process.argv[1] ? process.argv[1].toLowerCase() : '';
    if (mainScript.includes('npm') || mainScript.includes('global') || mainScript.includes('nvm') || mainScript.includes('npx')) {
      return true;
    }
    // Check npm root -g
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().toLowerCase();
    if (mainScript.includes(globalRoot)) return true;
  } catch {}
  return true; // Default to global for CLI binary execution
}

export const upgradeCommand = new Command('upgrade')
  .description('Upgrade Jetic CLI to the latest version')
  .option('-g, --global', 'Upgrade the global installation of Jetic CLI')
  .option('-t, --tag <tag>', 'Specific version tag or version number to install', 'latest')
  .option('-c, --check', 'Check for available updates without installing')
  .option('-p, --package-manager <pm>', 'Package manager to use (npm, yarn, pnpm, bun)')
  .action(async (options) => {
    const currentVersion = getInstalledVersion();
    console.log(`\x1b[36mJetic CLI Updater\x1b[0m`);
    console.log(`Current version: \x1b[1mv${currentVersion}\x1b[0m\n`);

    console.log('Checking npm registry for updates…');
    let targetVersion = options.tag;
    try {
      targetVersion = await fetchLatestVersion(PKG_NAME, options.tag);
    } catch (e: any) {
      console.warn(`\x1b[33m⚠ Warning:\x1b[0m Could not fetch version from registry (${e.message}).`);
      try {
        const out = execSync(`npm view ${PKG_NAME}@${options.tag} version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (out) targetVersion = out;
      } catch {
        targetVersion = options.tag === 'latest' ? currentVersion : options.tag;
      }
    }

    console.log(`Target version:  \x1b[32mv${targetVersion}\x1b[0m\n`);

    if (options.check) {
      if (currentVersion === targetVersion) {
        console.log(`\x1b[32m✓\x1b[0m You are running the latest version of Jetic CLI (v${currentVersion}).`);
      } else {
        console.log(`\x1b[33m⚡ Update available!\x1b[0m v${currentVersion} → v${targetVersion}`);
        console.log(`Run \x1b[36mjetic upgrade -g\x1b[0m to install.`);
      }
      return;
    }

    if (currentVersion === targetVersion && options.tag === 'latest') {
      console.log(`\x1b[32m✓\x1b[0m Jetic CLI is already up to date (v${currentVersion}).`);
      return;
    }

    const isGlobal = options.global ?? isInstalledGlobally();
    const pm = (options.packageManager as 'npm' | 'yarn' | 'pnpm' | 'bun') || detectPackageManager();

    let cmd = '';
    let args: string[] = [];

    if (pm === 'yarn') {
      cmd = 'yarn';
      args = isGlobal ? ['global', 'add', `${PKG_NAME}@${targetVersion}`] : ['add', `${PKG_NAME}@${targetVersion}`];
    } else if (pm === 'pnpm') {
      cmd = 'pnpm';
      args = isGlobal ? ['add', '-g', `${PKG_NAME}@${targetVersion}`] : ['add', `${PKG_NAME}@${targetVersion}`];
    } else if (pm === 'bun') {
      cmd = 'bun';
      args = isGlobal ? ['add', '-g', `${PKG_NAME}@${targetVersion}`] : ['add', `${PKG_NAME}@${targetVersion}`];
    } else {
      cmd = 'npm';
      args = isGlobal ? ['install', '-g', `${PKG_NAME}@${targetVersion}`] : ['install', `${PKG_NAME}@${targetVersion}`];
    }

    const fullCmdStr = `${cmd} ${args.join(' ')}`;
    console.log(`Upgrading Jetic CLI via \x1b[1m${cmd}\x1b[0m ${isGlobal ? '(global)' : '(local)'}…`);
    console.log(`\x1b[2mRunning: ${fullCmdStr}\x1b[0m\n`);

    try {
      const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
      if (res.status === 0) {
        console.log(`\n\x1b[32m✓ Successfully upgraded Jetic CLI to v${targetVersion}!\x1b[0m`);
      } else {
        console.error(`\n\x1b[31m✗ Upgrade failed with exit code ${res.status}\x1b[0m`);
        console.log(`You can manually upgrade using: \x1b[36m${fullCmdStr}\x1b[0m`);
      }
    } catch (err: any) {
      console.error(`\n\x1b[31m✗ Failed to execute upgrade command:\x1b[0m ${err.message}`);
      console.log(`Try running manually: \x1b[36m${fullCmdStr}\x1b[0m`);
    }
  });
