import { initDb, listItems } from './db.js';

const command = process.argv[2];

if (command === 'list') {
  initDb();
  const result = listItems({ limit: 1000 });
  console.table(result.items);
  console.log(`Total: ${result.total}`);
} else {
  console.log('Usage: tsx src/cli.ts list');
  process.exit(1);
}
