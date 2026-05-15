import notifier from 'node-notifier';

export function notifySaved(item) {
  notifier.notify({
    title: item.type === 'github-repo' ? '已收藏 GitHub 仓库' : '已收藏链接',
    message: item.title || item.url,
    wait: false,
    sound: false,
  });
}

export function notifyDuplicate(item) {
  notifier.notify({
    title: '已存在',
    message: `${item.title || item.url} 已收藏过`,
    wait: false,
    sound: false,
  });
}