import { Command } from 'commander';
import { JeticMemory } from '@jetic/memory';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export const memoryCommand = new Command('memory')
  .description('Manage Jetic memory state')
  .action(() => {
    const allMemory = JeticMemory.getAllMemory();
    
    let sn = 1;
    const tableData: Array<{ 'S/N': number, KEY: string, TEXT: string }> = [];
    
    for (const scope in allMemory) {
      for (const key in allMemory[scope]) {
        const value = allMemory[scope][key];
        const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
        
        tableData.push({
          'S/N': sn++,
          'KEY': `${scope}:${key}`,
          'TEXT': text.length > 50 ? text.substring(0, 47) + '...' : text
        });
      }
    }
    
    if (tableData.length === 0) {
      console.log('Memory is empty.');
    } else {
      console.table(tableData, ['S/N', 'KEY', 'TEXT']);
    }
  });

memoryCommand
  .command('add')
  .description('Add a new entry to memory interactively')
  .action(async () => {
    const rl = readline.createInterface({ input, output });
    
    const keyInput = await rl.question('Key/Identifier: ');
    if (!keyInput.trim()) {
      console.log('Key is required.');
      rl.close();
      return;
    }
    
    const textInput = await rl.question('Text: ');
    rl.close();
    
    const parts = keyInput.trim().split(':');
    let scope = 'global';
    let key = parts[0];
    
    if (parts.length > 1) {
      scope = parts[0];
      key = parts.slice(1).join(':');
    }
    
    const memory = new JeticMemory({ scope });
    await memory.set(key, textInput);
    
    console.log(`\x1b[32m✓\x1b[0m Successfully added ${keyInput.trim()} to memory.`);
  });

memoryCommand
  .command('clear')
  .description('Clear memory')
  .action(() => {
    JeticMemory.clearAllMemory();
    console.log('Memory cleared.');
  });
