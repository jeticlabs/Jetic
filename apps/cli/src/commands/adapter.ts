import { Command } from 'commander';
import { loadConfig } from '@jetic/core';
import { AdapterRegistry, createAdapterContext } from '@jetic/scanner-sdk';
import { expressAdapter } from '@jetic/adapter-express';
import { fastifyAdapter } from '@jetic/adapter-fastify';
import { nextjsAdapter } from '@jetic/adapter-nextjs';
import { nestjsAdapter } from '@jetic/adapter-nestjs';
import { honoAdapter } from '@jetic/adapter-hono';

function buildRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(expressAdapter);
  registry.register(fastifyAdapter);
  registry.register(nextjsAdapter);
  registry.register(nestjsAdapter);
  registry.register(honoAdapter);
  return registry;
}

export const adapterCommand = new Command('adapter')
  .description('Manage Jetic framework adapters')
  .addCommand(
    new Command('list')
      .description('List registered adapters and whether they are detected in this project')
      .action(() => {
        const config = loadConfig();
        const ctx = createAdapterContext(config.projectRoot, config.jeticDir);
        const registry = buildRegistry();

        console.log('\nJETIC ADAPTERS\n');
        for (const adapter of registry.list()) {
          const detected = adapter.detect(ctx);
          console.log(`  ${detected ? '\x1b[32m✓\x1b[0m' : '\x1b[2m○\x1b[0m'} ${adapter.id.padEnd(12)} ${adapter.name}`);
        }
        console.log('');
      })
  )
  .addCommand(
    new Command('inspect')
      .argument('<id>', 'Adapter id, e.g. express')
      .description('Show detection result and a scan summary for one adapter')
      .action(async (id: string) => {
        const config = loadConfig();
        const ctx = createAdapterContext(config.projectRoot, config.jeticDir);
        const registry = buildRegistry();
        const adapter = registry.get(id);

        if (!adapter) {
          console.error(`Unknown adapter "${id}". Registered: ${registry.list().map((a) => a.id).join(', ')}`);
          process.exitCode = 2;
          return;
        }

        const detected = adapter.detect(ctx);
        console.log(`\n${adapter.name} (${adapter.id})`);
        console.log(`  detected: ${detected}`);

        if (!detected) return;

        const result = await adapter.scan(ctx);
        console.log(`  endpoints: ${result.endpoints.length}`);
        console.log(`  securitySchemes: ${Object.keys(result.securitySchemes || {}).length}`);
      })
  );
