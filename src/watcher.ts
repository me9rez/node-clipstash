import clipboard from 'clipboardy';
import { parseClipboardText } from './parser.js';
import type { ParsedItem } from './parser.js';

export interface WatcherOptions {
  interval?: number;
  notifyDuplicates?: boolean;
}

export function startClipboardWatcher(
  onItem: (parsed: ParsedItem) => void | Promise<void>,
  { interval = 1000 }: WatcherOptions = {}
): () => void {
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

      await onItem(parsed);
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
