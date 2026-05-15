import './server.js';

import { initDb } from './db.js';
import { startClipboardWatcher } from './watcher.js';

initDb();

console.log('Clipstash is running...');
console.log('Watching clipboard for GitHub repos and URLs.');

startClipboardWatcher({
  interval: 1000,
  notifyDuplicates: false,
});

process.on('SIGINT', () => {
  console.log('\nClipstash stopped.');
  process.exit(0);
});