import notifier from 'node-notifier';
import type { DbItem } from './db.js';

export function notifySaved(item: DbItem): void {
  notifier.notify({
    title: item.type === 'github-repo' ? '已收藏 GitHub 仓库' : '已收藏链接',
    message: item.title || item.url || '',
    wait: false,
    sound: false,
  });
}

export function notifyDuplicate(item: DbItem): void {
  notifier.notify({
    title: '已存在',
    message: `${item.title || item.url || ''} 已收藏过`,
    wait: false,
    sound: false,
  });
}

export function notifyError(title: string, message: string): void {
  notifier.notify({
    title,
    message,
    wait: false,
    sound: false,
  });
}
