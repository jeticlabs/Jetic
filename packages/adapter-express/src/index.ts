import * as fs from 'fs';
import * as path from 'path';
import { defineAdapter, AdapterContext, AdapterScanResult } from '@jetic/scanner-sdk';
import { ExpressScanner } from '@jetic/scanner';

/** Wraps the existing ts-morph ExpressScanner behind the project.md §9 adapter contract. */
export const expressAdapter = defineAdapter({
  id: 'express',
  name: 'Express',

  detect(ctx: AdapterContext): boolean {
    if (ctx.dependencies.has('express')) return true;
    // No package.json dependency info (e.g. fixtures without one) — fall back to a TS project signal.
    return fs.existsSync(path.join(ctx.projectRoot, 'tsconfig.json'));
  },

  async scan(ctx: AdapterContext): Promise<AdapterScanResult> {
    const scanner = new ExpressScanner({ projectRoot: ctx.projectRoot, jeticDir: ctx.jeticDir } as any);
    const model = await scanner.scan();
    return {
      endpoints: model.endpoints,
      securitySchemes: model.securitySchemes,
      environments: model.environments,
    };
  },
});
