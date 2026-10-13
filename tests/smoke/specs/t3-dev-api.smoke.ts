/**
 * Tier 3 — `jetic dev` HTTP / SSE API.
 * Phase 0 covers boot + the --no-open prerequisite; the full catalog (SMK-302..312) lands in Phase 4.
 */
import * as fs from 'fs';
import * as path from 'path';
import { startDev } from '../harness/dev-server';
import { createProject } from '../harness/project';
import { waitFor } from '../harness/wait';

describe('Tier 3 — jetic dev', () => {
  test('SMK-301 boots, serves the API and the dashboard SPA', async () => {
    const project = createProject();
    const dev = await startDev(project.dir);
    try {
      expect(await (await fetch(`${dev.url}/api/model`)).json()).toBeNull();

      for (const route of ['/', '/model', '/some/unknown/spa/route']) {
        const res = await fetch(`${dev.url}${route}`);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('<title>Jetic Studio</title>');
      }
      expect(dev.output()).toContain(`Jetic Studio is running at http://localhost:${dev.port}`);
    } finally {
      await dev.stop();
    }
  });

  // A fake opener on PATH records whether `jetic dev` tried to launch a browser.
  // Windows uses the cmd builtin `start`, which can't be shimmed, so this runs on POSIX only.
  const posixOnly = process.platform === 'win32' ? describe.skip : describe;
  posixOnly('SMK-313 browser launch (KG-09)', () => {
    const withOpenerShim = () => {
      const project = createProject();
      const binDir = project.path('.shim-bin');
      const marker = project.path('browser-opened.txt');
      fs.mkdirSync(binDir, { recursive: true });
      for (const opener of ['xdg-open', 'open']) {
        const shim = path.join(binDir, opener);
        fs.writeFileSync(shim, `#!/bin/sh\necho "$@" >> "${marker}"\n`);
        fs.chmodSync(shim, 0o755);
      }
      return { project, marker, env: { PATH: `${binDir}${path.delimiter}${process.env.PATH}` } };
    };

    test('opens a browser by default', async () => {
      const { project, marker, env } = withOpenerShim();
      const dev = await startDev(project.dir, { args: [], env: { ...env, JETIC_NO_OPEN: '' } });
      try {
        await waitFor(() => fs.existsSync(marker), { timeoutMs: 5_000, message: 'opener shim was not invoked' });
        expect(fs.readFileSync(marker, 'utf8')).toContain(`http://localhost:${dev.port}`);
      } finally {
        await dev.stop();
      }
    });

    test.each([
      ['--no-open flag', ['--no-open'], { JETIC_NO_OPEN: '' }],
      ['JETIC_NO_OPEN=1', [], { JETIC_NO_OPEN: '1' }],
    ])('does not open a browser with %s', async (_label, args, extraEnv) => {
      const { project, marker, env } = withOpenerShim();
      const dev = await startDev(project.dir, { args, env: { ...env, ...extraEnv } });
      try {
        // Give the listen callback time to run; the opener would fire within a few ms.
        await new Promise((r) => setTimeout(r, 1_000));
        expect(fs.existsSync(marker)).toBe(false);
      } finally {
        await dev.stop();
      }
    });
  });
});
