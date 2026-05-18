import clipboard from 'clipboardy';
import { parseClipboardText } from './parser.js';
import { saveItem } from './db.js';
import { notifySaved } from './notify.js';

export interface WatcherOptions {
  interval?: number;
  notifyDuplicates?: boolean;
}

export function startClipboardWatcher({
  interval = 1000,
  notifyDuplicates = false,
}: WatcherOptions = {}): () => void {
  let lastText = '';
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;

  async function tick(): Promise<void> {
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
      console.error('[watcher:error]', (error as Error).message);
    } finally {
      busy = false;
    }
  }

  timer = setInterval(tick, interval);

  tick();

  return () => {
    if (timer) clearInterval(timer);
  };
}
