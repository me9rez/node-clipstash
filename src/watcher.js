import clipboard from 'clipboardy';
import { parseClipboardText } from './parser.js';
import { saveItem } from './db.js';
import { notifySaved } from './notify.js';

export function startClipboardWatcher({
  interval = 1000,
  notifyDuplicates = false,
} = {}) {
  let lastText = '';
  let timer = null;
  let busy = false;

  async function tick() {
    if (busy) return;
    busy = true;

    try {
      const text = await clipboard.read();

      if (!text || text === lastText) return;

      lastText = text;

      const parsed = parseClipboardText(text);
      if (!parsed) return;

      const result = saveItem(parsed);

      if (result.created) {
        console.log(`[saved] ${parsed.type} ${parsed.url}`);
        notifySaved(result.item);
      } else {
        console.log(`[exists] ${parsed.type} ${parsed.url}`);

        if (notifyDuplicates) {
          // 第一版默认不通知重复，避免打扰
          notifySaved(result.item);
        }
      }
    } catch (error) {
      console.error('[watcher:error]', error.message);
    } finally {
      busy = false;
    }
  }

  timer = setInterval(tick, interval);

  tick();

  return () => clearInterval(timer);
}