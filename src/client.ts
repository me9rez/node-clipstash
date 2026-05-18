import { parseClipboardText } from './parser.js';
import { startClipboardWatcher } from './watcher.js';
import { notifySaved, notifyDuplicate, notifyError } from './notify.js';

interface ClientOptions {
  serverUrl: string;
  token: string;
  notify?: boolean;
}

export async function startClient({
  serverUrl,
  token,
  notify = true,
}: ClientOptions) {
  const baseUrl = serverUrl.replace(/\/+$/, '');

  console.log(`Connecting to: ${baseUrl}`);

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`);

    if (!healthRes.ok) {
      console.error('Server health check failed');
      process.exit(1);
    }

    console.log('Server is healthy');
  } catch (err) {
    console.error('Cannot reach server:', (err as Error).message);
    process.exit(1);
  }

  try {
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!meRes.ok) {
      const data = await meRes.json().catch(() => ({})) as { error?: string };
      console.error(`Auth failed: ${data.error || meRes.statusText}`);
      process.exit(1);
    }

    const user = await meRes.json() as { username: string };

    console.log(`Authenticated as: ${user.username}`);
  } catch (err) {
    console.error('Auth check failed:', (err as Error).message);
    process.exit(1);
  }

  let stopping = false;

  async function pushItem(parsed: ReturnType<typeof parseClipboardText>) {
    if (!parsed || stopping) return;

    try {
      const res = await fetch(`${baseUrl}/api/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(parsed),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        const msg = data.error || `API error: ${res.status}`;

        console.error(`[push:error] ${parsed.url} — ${msg}`);

        if (notify) {
          notifyError('推送失败', `${parsed.title || parsed.url}: ${msg}`);
        }

        return;
      }

      const result = (await res.json()) as { created: boolean; item: { title: string | null; url: string; type: string } };

      if (result.created) {
        console.log(`[saved] ${parsed.type} ${parsed.url}`);

        if (notify) {
          notifySaved(result.item as unknown as import('./db.js').DbItem);
        }
      } else {
        console.log(`[exists] ${parsed.type} ${parsed.url}`);

        if (notify) {
          notifyDuplicate(result.item as unknown as import('./db.js').DbItem);
        }
      }
    } catch (err) {
      const msg = (err as Error).message;

      console.error(`[push:error] ${parsed.url} — ${msg}`);

      if (notify) {
        notifyError('推送失败', `${parsed.title || parsed.url}: ${msg}`);
      }
    }
  }

  const stop = startClipboardWatcher(pushItem);

  console.log('Watching clipboard... (Ctrl+C to stop)');

  function cleanup() {
    stopping = true;
    stop();
    console.log('\nClipstash client stopped.');
    process.exit(0);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

export async function listRemoteItems({
  serverUrl,
  token,
}: {
  serverUrl: string;
  token: string;
}) {
  const baseUrl = serverUrl.replace(/\/+$/, '');

  try {
    const res = await fetch(`${baseUrl}/api/items?limit=1000`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || `API error: ${res.status}`);
    }

    const result = (await res.json()) as { items: Array<Record<string, unknown>>; total: number };

    if (result.items.length === 0) {
      console.log('No items found.');
    } else {
      console.table(result.items);
    }

    console.log(`Total: ${result.total}`);
  } catch (err) {
    console.error('Failed to list items:', (err as Error).message);
    process.exit(1);
  }
}
