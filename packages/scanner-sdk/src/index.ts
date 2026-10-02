import { BehavioralModel } from '@jetic/model';

/** Minimal project context handed to adapters for framework detection and scanning. */
export interface AdapterContext {
  projectRoot: string;
  jeticDir: string;
  /** package.json dependency + devDependency names, lowercased. */
  dependencies: Set<string>;
}

/** Partial Jetic IR an adapter contributes; merged into the full BehavioralModel by the caller. */
export interface AdapterScanResult {
  endpoints: BehavioralModel['endpoints'];
  securitySchemes?: BehavioralModel['securitySchemes'];
  environments?: BehavioralModel['environments'];
}

export interface JeticAdapter {
  id: string;
  name: string;
  /** Returns true when this adapter recognizes the project's framework. */
  detect(ctx: AdapterContext): boolean;
  scan(ctx: AdapterContext): Promise<AdapterScanResult>;
}

export function defineAdapter(adapter: JeticAdapter): JeticAdapter {
  return adapter;
}

/** Builds an {@link AdapterContext} by reading package.json dependencies from disk. */
export function createAdapterContext(projectRoot: string, jeticDir: string): AdapterContext {
  const dependencies = new Set<string>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const path = require('path');
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      for (const name of Object.keys(pkg.dependencies || {})) dependencies.add(name.toLowerCase());
      for (const name of Object.keys(pkg.devDependencies || {})) dependencies.add(name.toLowerCase());
    }
  } catch {
    // Missing/unreadable package.json → empty dependency set, detect() handles gracefully.
  }
  return { projectRoot, jeticDir, dependencies };
}

/** Registry of adapters known at runtime; `auto` picks the first whose detect() returns true. */
export class AdapterRegistry {
  private adapters = new Map<string, JeticAdapter>();

  register(adapter: JeticAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  list(): JeticAdapter[] {
    return [...this.adapters.values()];
  }

  get(id: string): JeticAdapter | undefined {
    return this.adapters.get(id);
  }

  detect(ctx: AdapterContext): JeticAdapter | undefined {
    return this.list().find((adapter) => adapter.detect(ctx));
  }

  resolve(adapterId: string, ctx: AdapterContext): JeticAdapter {
    if (adapterId !== 'auto') {
      const adapter = this.get(adapterId);
      if (!adapter) throw new Error(`Unknown adapter "${adapterId}". Registered: ${this.list().map((a) => a.id).join(', ')}`);
      return adapter;
    }
    const detected = this.detect(ctx);
    if (!detected) throw new Error(`Could not auto-detect a framework adapter. Registered: ${this.list().map((a) => a.id).join(', ')}`);
    return detected;
  }
}
