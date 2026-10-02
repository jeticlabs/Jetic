import { Command } from 'commander';
import { loadConfig, readActivityEvents } from '@jetic/core';

export const activityCommand = new Command('activity')
  .description('Inspect the Jetic activity stream (model changes detected by jetic scan)')
  .addCommand(
    new Command('list')
      .description('List recorded activity events, most recent first')
      .option('--limit <n>', 'Max number of events to show', '50')
      .action((options: { limit: string }) => {
        const config = loadConfig();
        const events = readActivityEvents(config.jeticDir).reverse().slice(0, Number(options.limit));

        if (events.length === 0) {
          console.log('No activity recorded yet. Run "jetic scan" after changing your API to populate this.');
          return;
        }

        console.log('\nJETIC ACTIVITY\n');
        for (const event of events) {
          const label = event.kind === 'endpoint_added' ? '\x1b[32m+\x1b[0m' : event.kind === 'endpoint_removed' ? '\x1b[31m-\x1b[0m' : '~';
          console.log(`  ${label} ${event.ts}  ${event.kind}  ${event.endpointId}`);
        }
        console.log('');
      })
  );
